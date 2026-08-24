using Shifter.Application.Common.Exceptions;
using Shifter.Application.Features.Webhooks.DTOs;
using Shifter.Application.Features.Webhooks.Services;
using Shifter.Application.Features.Webhooks.Services.Interfaces;
using Shifter.Domain.Entities;
using Shifter.Infrastructure.Repositories.Interfaces;

using Xunit;

namespace Shifter.Tests;

/// <summary>
/// The unauthenticated write, end to end: who is allowed to make it, what it
/// is allowed to touch, and what happens when the same night arrives twice.
///
/// The rules being defended are that a delivery can only ever write to the
/// account that made the endpoint, can only write the one kind of thing the
/// endpoint is for, and cannot quietly delete anything the person entered by
/// hand.
/// </summary>
public class WebhookIngestTests
{
    private readonly FakeShifterQuery _query = new();
    private readonly FakeShifterCommand _command;
    private readonly FakeWebhookRepository _webhooks = new();
    private readonly WebhookIngestHandler _handler;

    private const string Token = "endpoint-token";
    private const string Secret = "endpoint-secret";

    public WebhookIngestTests()
    {
        _command = new FakeShifterCommand(_query);
        _handler = new WebhookIngestHandler(_webhooks, _query, _command);
    }

    private WebhookEndpoint Given(
        WebhookKind kind = WebhookKind.Sales,
        string? mapping = null,
        bool active = true,
        int? defaultShiftId = null)
    {
        WebhookEndpoint endpoint = new WebhookEndpoint
        {
            Id = _webhooks.Endpoints.Count + 1,
            UserId = Build.UserId,
            Name = "Till",
            Kind = kind,
            Token = Token,
            Secret = Secret,
            Active = active,
            Mapping = mapping,
            DefaultShiftId = defaultShiftId,
            CreatedAt = DateTime.UtcNow
        };

        _webhooks.Endpoints.Add(endpoint);

        return endpoint;
    }

    private void GivenCatalogue(params (int Id, string Name, decimal Price, decimal Percent)[] items)
    {
        foreach (var (id, name, price, percent) in items)
        {
            _query.Sales.Add(new Sales
            {
                Id = id,
                UserId = Build.UserId,
                Name = name,
                Price = price,
                Percentage = percent
            });
        }
    }

    /// <summary>A delivery signed the way the documentation says to sign one.</summary>
    private Task<IngestResultDto> Post(string body, DateTimeOffset? now = null)
    {
        DateTimeOffset moment = now ?? DateTimeOffset.UtcNow;
        string stamp = moment.ToUnixTimeSeconds().ToString();

        return _handler.ReceiveAsync(
            Token,
            body,
            new DeliveryHeaders(WebhookSignature.Compute(Secret, stamp, body), stamp, null),
            moment,
            CancellationToken.None);
    }

    // ==== Who may write ====

    [Fact]
    public async Task Refuses_a_token_that_names_no_endpoint()
    {
        Given();

        await Assert.ThrowsAsync<NotFoundException>(() => _handler.ReceiveAsync(
            "not-a-token",
            """{ "date": "2026-08-20" }""",
            new DeliveryHeaders(null, null, Secret),
            DateTimeOffset.UtcNow,
            CancellationToken.None));
    }

    /// <summary>
    /// A switched-off endpoint answers exactly as an unknown one does. Any other
    /// answer turns the address into a way of asking which tokens are real.
    /// </summary>
    [Fact]
    public async Task Answers_a_switched_off_endpoint_as_if_it_did_not_exist()
    {
        Given(active: false);

        await Assert.ThrowsAsync<NotFoundException>(
            () => Post("""{ "date": "2026-08-20" }"""));
    }

    [Fact]
    public async Task Refuses_a_body_that_was_not_signed_with_the_endpoints_secret()
    {
        Given();

        string body = """{ "date": "2026-08-20" }""";
        string stamp = DateTimeOffset.UtcNow.ToUnixTimeSeconds().ToString();

        await Assert.ThrowsAsync<UnauthorizedException>(() => _handler.ReceiveAsync(
            Token,
            body,
            new DeliveryHeaders(WebhookSignature.Compute("another-secret", stamp, body), stamp, null),
            DateTimeOffset.UtcNow,
            CancellationToken.None));

        // Written down even though it was refused: a sender still holding last
        // month's key is the commonest failure there is, and the owner can only
        // see it if the attempt is logged.
        WebhookDelivery logged = Assert.Single(_webhooks.Deliveries);

        Assert.Equal(DeliveryStatus.Failed, logged.Status);
        Assert.Contains("signature", logged.Error);
        Assert.Empty(_command.Merges);
    }

    [Fact]
    public async Task Refuses_a_request_that_presents_nothing_at_all()
    {
        Given();

        await Assert.ThrowsAsync<UnauthorizedException>(() => _handler.ReceiveAsync(
            Token,
            """{ "date": "2026-08-20" }""",
            new DeliveryHeaders(null, null, null),
            DateTimeOffset.UtcNow,
            CancellationToken.None));
    }

    /// <summary>
    /// The plain secret header, for software that cannot be made to sign
    /// anything. Weaker, and deliberately still allowed.
    /// </summary>
    [Fact]
    public async Task Accepts_the_secret_presented_in_a_header()
    {
        Given();
        GivenCatalogue((1, "Wine", 10m, 10m));

        IngestResultDto result = await _handler.ReceiveAsync(
            Token,
            """{ "date": "2026-08-20", "sales": [{ "name": "Wine", "quantity": 2 }] }""",
            new DeliveryHeaders(null, null, Secret),
            DateTimeOffset.UtcNow,
            CancellationToken.None);

        Assert.Equal("applied", result.status);
    }

    [Fact]
    public async Task Refuses_a_signature_that_is_older_than_the_window()
    {
        Given();

        DateTimeOffset now = DateTimeOffset.UtcNow;
        string body = """{ "date": "2026-08-20" }""";
        string stale = now.Add(-WebhookSignature.Window - TimeSpan.FromMinutes(1))
            .ToUnixTimeSeconds()
            .ToString();

        UnauthorizedException error = await Assert.ThrowsAsync<UnauthorizedException>(
            () => _handler.ReceiveAsync(
                Token,
                body,
                new DeliveryHeaders(WebhookSignature.Compute(Secret, stale, body), stale, null),
                now,
                CancellationToken.None));

        Assert.Contains("window", error.Message);
    }

    /// <summary>
    /// A sender signing under its own header names is refused exactly like one
    /// that sent nothing, and from the outside the two are identical. The names
    /// that did arrive go into the answer — and so into the log the owner
    /// reads — because that is the whole diagnosis.
    /// </summary>
    [Fact]
    public async Task Names_the_credentials_the_sender_did_send()
    {
        Given();

        UnauthorizedException error = await Assert.ThrowsAsync<UnauthorizedException>(
            () => _handler.ReceiveAsync(
                Token,
                """{ "date": "2026-08-20" }""",
                new DeliveryHeaders(null, null, null, ["svix-id", "svix-signature"]),
                DateTimeOffset.UtcNow,
                CancellationToken.None));

        Assert.Contains("svix-signature", error.Message);
        Assert.Contains("does not read those", error.Message);
        Assert.Contains("svix-signature", Assert.Single(_webhooks.Deliveries).Error);
    }

    /// <summary>
    /// What a sender's own "test" button produces: a well-formed report of a
    /// day on which nothing was sold. Writing it would put a blank day on the
    /// calendar and call it a success, which is worse than saying plainly that
    /// the delivery was empty.
    /// </summary>
    [Fact]
    public async Task Reports_a_delivery_that_carries_nothing_and_writes_nothing()
    {
        Given();

        IngestResultDto result = await Post("""
            { "date": "2026-08-24", "sales": [] }
            """);

        Assert.Equal("empty", result.status);
        Assert.Equal(new DateOnly(2026, 8, 24), result.date);

        Assert.Empty(_command.Merges);
        Assert.Empty(_query.Days);

        WebhookDelivery logged = Assert.Single(_webhooks.Deliveries);

        Assert.Equal(DeliveryStatus.Empty, logged.Status);
        Assert.Null(logged.AppliedDate);
    }

    /// <summary>A day of zero takings is still a day: an amount of zero is a
    /// figure somebody sent, not an absence of one.</summary>
    [Fact]
    public async Task Writes_a_day_whose_takings_really_were_zero()
    {
        Given();

        IngestResultDto result = await Post("""
            { "date": "2026-08-24", "tips": 0, "sales": [] }
            """);

        Assert.Equal("applied", result.status);
        Assert.Equal(0m, Assert.Single(_command.Merges).Tips);
    }

    // ==== Sales ====

    [Fact]
    public async Task Writes_a_nights_takings_against_the_catalogue()
    {
        Given();
        GivenCatalogue((1, "Wine", 12m, 10m), (2, "Coffee", 3m, 5m));

        IngestResultDto result = await Post("""
            {
              "date": "2026-08-20",
              "tips": 40,
              "tips_cash": 15,
              "sales": [
                { "name": "wine", "quantity": 3 },
                { "name": "Coffee", "quantity": 10 }
              ]
            }
            """);

        Assert.Equal("applied", result.status);
        Assert.Equal(new DateOnly(2026, 8, 20), result.date);

        DaySalesMerge merge = Assert.Single(_command.Merges);

        Assert.Equal(40m, merge.Tips);
        Assert.Equal(15m, merge.TipsCash);

        // The price and the share are copied off the catalogue as it stands, so
        // repricing it later cannot rewrite what this night earned.
        DaySale wine = merge.Sales.Single(entry => entry.SalesId == 1);

        Assert.Equal(3, wine.Quantity);
        Assert.Equal(12m, wine.UnitPrice);
        Assert.Equal(10m, wine.Percentage);
    }

    /// <summary>
    /// A till lists an item once per order, not once per night, so the same
    /// name arriving three times is one position sold three times over.
    /// </summary>
    [Fact]
    public async Task Adds_up_a_position_the_delivery_lists_more_than_once()
    {
        Given();
        GivenCatalogue((1, "Wine", 12m, 10m));

        await Post("""
            {
              "date": "2026-08-20",
              "sales": [
                { "name": "Wine", "quantity": 2 },
                { "name": "Wine", "quantity": 3 }
              ]
            }
            """);

        DaySale wine = Assert.Single(Assert.Single(_command.Merges).Sales);

        Assert.Equal(5, wine.Quantity);
    }

    [Fact]
    public async Task Refuses_a_position_the_account_does_not_have()
    {
        Given();
        GivenCatalogue((1, "Wine", 12m, 10m));

        NotFoundException error = await Assert.ThrowsAsync<NotFoundException>(() => Post("""
            { "date": "2026-08-20", "sales": [{ "name": "Absinthe", "quantity": 1 }] }
            """));

        Assert.Contains("Absinthe", error.Message);

        WebhookDelivery logged = Assert.Single(_webhooks.Deliveries);

        Assert.Equal(DeliveryStatus.Rejected, logged.Status);
        Assert.Empty(_command.Merges);
    }

    /// <summary>
    /// Nothing said is not nothing meant. A payload of tips alone must reach the
    /// merge with every other field still null, or a note somebody typed would
    /// be erased by a till that has never heard of notes.
    /// </summary>
    [Fact]
    public async Task Carries_only_the_fields_the_delivery_actually_sent()
    {
        Given();

        await Post("""{ "date": "2026-08-20", "tips": 25 }""");

        DaySalesMerge merge = Assert.Single(_command.Merges);

        Assert.Equal(25m, merge.Tips);
        Assert.Null(merge.TipsCash);
        Assert.Null(merge.Deductions);
        Assert.Null(merge.Note);
        Assert.False(merge.Replace);
        Assert.Empty(merge.Sales);
    }

    [Fact]
    public async Task Passes_on_the_delivery_that_asks_to_own_the_whole_day()
    {
        Given();
        GivenCatalogue((1, "Wine", 12m, 10m));

        await Post("""
            {
              "date": "2026-08-20",
              "replace": true,
              "sales": [{ "name": "Wine", "quantity": 1 }]
            }
            """);

        Assert.True(Assert.Single(_command.Merges).Replace);
    }

    [Fact]
    public async Task Refuses_cash_tips_larger_than_the_total()
    {
        Given();

        await Assert.ThrowsAsync<ValidationException>(
            () => Post("""{ "date": "2026-08-20", "tips": 10, "tips_cash": 30 }"""));
    }

    // ==== The same night twice ====

    [Fact]
    public async Task Recognises_a_retry_by_the_senders_own_id()
    {
        Given();
        GivenCatalogue((1, "Wine", 12m, 10m));

        const string body = """
            {
              "external_id": "till-991",
              "date": "2026-08-20",
              "sales": [{ "name": "Wine", "quantity": 2 }]
            }
            """;

        Assert.Equal("applied", (await Post(body)).status);

        IngestResultDto again = await Post(body);

        Assert.Equal("duplicate", again.status);

        // One write and one log line: the second arrival changed nothing.
        Assert.Single(_command.Merges);
        Assert.Single(_webhooks.Deliveries);
    }

    /// <summary>
    /// Without an id of the sender's own there is nothing to recognise, and a
    /// correction is far likelier than a retry — so the second one is applied.
    /// </summary>
    [Fact]
    public async Task Applies_a_repeated_delivery_that_carries_no_id()
    {
        Given();
        GivenCatalogue((1, "Wine", 12m, 10m));

        const string body = """
            { "date": "2026-08-20", "sales": [{ "name": "Wine", "quantity": 2 }] }
            """;

        await Post(body);
        await Post(body);

        Assert.Equal(2, _command.Merges.Count);
    }

    // ==== Hours ====

    [Fact]
    public async Task Places_hours_on_the_template_the_payload_names()
    {
        _query.Shifts.Add(Build.Template(7, name: "Evening", start: "17:00", end: "23:00"));
        Given(WebhookKind.Hours);

        IngestResultDto result = await Post("""
            {
              "date": "2026-08-20",
              "shift": "evening",
              "start": "17:30",
              "end": "23:45",
              "break_minutes": 30
            }
            """);

        Assert.Equal("applied", result.status);

        var (date, placement) = Assert.Single(_command.Placed);

        Assert.Equal(new DateOnly(2026, 8, 20), date);
        Assert.Equal(7, placement.ShiftId);
        Assert.Equal(new TimeOnly(17, 30), placement.StartTime);
        Assert.Equal(new TimeOnly(23, 45), placement.EndTime);
        Assert.Equal(30, placement.BreakMinutes);
        Assert.True(placement.Worked);

        // The rate is the template's, copied at placement: a timesheet says how
        // long, never how much.
        Assert.Equal(100m, placement.SalaryAmount);
    }

    /// <summary>
    /// A count of hours says how long, not when. The break is added back on so
    /// the paid time comes out as the sender meant it — six paid hours after a
    /// half-hour break is a shift of six and a half.
    /// </summary>
    [Fact]
    public async Task Turns_a_count_of_hours_into_paid_time_from_the_templates_start()
    {
        _query.Shifts.Add(Build.Template(7, name: "Evening", start: "17:00", end: "23:00"));
        Given(WebhookKind.Hours);

        await Post("""
            { "date": "2026-08-20", "shift": "Evening", "hours": 6, "break_minutes": 30 }
            """);

        DayShift placement = Assert.Single(_command.Placed).Placement;

        Assert.Equal(new TimeOnly(17, 0), placement.StartTime);
        Assert.Equal(new TimeOnly(23, 30), placement.EndTime);
        Assert.Equal(6, placement.PaidDuration.TotalHours);
    }

    [Fact]
    public async Task Falls_back_to_the_endpoints_default_template()
    {
        _query.Shifts.Add(Build.Template(7, name: "Evening"));
        Given(WebhookKind.Hours, defaultShiftId: 7);

        await Post("""{ "date": "2026-08-20", "hours": 5 }""");

        Assert.Equal(7, Assert.Single(_command.Placed).Placement.ShiftId);
    }

    /// <summary>
    /// Strict even with a default sitting there: a name that matches nothing is
    /// a typo or a template nobody has made, and filing those hours under the
    /// fallback would look like it worked.
    /// </summary>
    [Fact]
    public async Task Refuses_a_named_template_that_does_not_exist()
    {
        _query.Shifts.Add(Build.Template(7, name: "Evening"));
        Given(WebhookKind.Hours, defaultShiftId: 7);

        NotFoundException error = await Assert.ThrowsAsync<NotFoundException>(
            () => Post("""{ "date": "2026-08-20", "shift": "Brunch", "hours": 5 }"""));

        Assert.Contains("Brunch", error.Message);
        Assert.Empty(_command.Placed);
    }

    [Fact]
    public async Task Refuses_hours_when_there_is_no_template_to_put_them_on()
    {
        Given(WebhookKind.Hours);

        await Assert.ThrowsAsync<ValidationException>(
            () => Post("""{ "date": "2026-08-20", "hours": 5 }"""));
    }

    [Fact]
    public async Task Refuses_a_break_that_swallows_the_shift()
    {
        _query.Shifts.Add(Build.Template(7, name: "Evening"));
        Given(WebhookKind.Hours, defaultShiftId: 7);

        await Assert.ThrowsAsync<ValidationException>(() => Post("""
            { "date": "2026-08-20", "start": "17:00", "end": "19:00", "break_minutes": 150 }
            """));
    }

    /// <summary>
    /// Regression: the catalogue and the templates are read without tracking,
    /// and a day a delivery creates is added to the context as a whole graph.
    /// A navigation pointing at one of those read-only copies makes EF insert
    /// it a second time, which fails on the primary key — every delivery to a
    /// day that did not exist yet came back a 500. What a write needs is the
    /// foreign key and the copied terms, so that is all it is given.
    /// </summary>
    [Fact]
    public async Task Writes_bare_foreign_keys_rather_than_the_rows_it_read()
    {
        _query.Shifts.Add(Build.Template(7, name: "Evening"));
        GivenCatalogue((1, "Wine", 12m, 10m));

        Given();

        await Post("""
            { "date": "2026-08-20", "sales": [{ "name": "Wine", "quantity": 2 }] }
            """);

        DaySale sold = Assert.Single(Assert.Single(_command.Merges).Sales);

        Assert.Equal(1, sold.SalesId);
        Assert.Null(sold.Sales);

        _webhooks.Endpoints.Clear();
        Given(WebhookKind.Hours, defaultShiftId: 7);

        await Post("""{ "date": "2026-08-20", "hours": 5 }""");

        DayShift placement = Assert.Single(_command.Placed).Placement;

        Assert.Equal(7, placement.ShiftId);
        Assert.Null(placement.Shift);
    }

    // ==== Trying one out ====

    [Fact]
    public async Task A_dry_run_reports_what_would_be_written_and_writes_nothing()
    {
        WebhookEndpoint endpoint = Given();
        GivenCatalogue((1, "Wine", 12m, 10m));

        IngestResultDto result = await _handler.RunAsync(
            endpoint,
            """{ "date": "2026-08-20", "sales": [{ "name": "Wine", "quantity": 3 }] }""",
            IngestOptions.DryRun,
            CancellationToken.None);

        Assert.Equal("preview", result.status);

        IngestLineDto line = Assert.Single(result.preview!.sales);

        Assert.Equal("Wine", line.name);
        Assert.Equal(3, line.quantity);
        Assert.Equal(3 * 12m * 10m / 100m, line.earned);

        Assert.Empty(_command.Merges);
        Assert.Empty(_webhooks.Deliveries);
    }

    [Fact]
    public async Task Logs_a_body_that_is_not_json_at_all()
    {
        WebhookEndpoint endpoint = Given();

        await Assert.ThrowsAsync<ValidationException>(() => _handler.RunAsync(
            endpoint,
            "<xml>not for us</xml>",
            IngestOptions.Delivery,
            CancellationToken.None));

        Assert.Equal(DeliveryStatus.Failed, Assert.Single(_webhooks.Deliveries).Status);
    }

    /// <summary>
    /// The reason the bodies are kept at all: a mapping corrected the next
    /// morning turns yesterday's rejection into yesterday's takings.
    /// </summary>
    [Fact]
    public async Task A_replay_ignores_the_id_it_has_already_seen()
    {
        WebhookEndpoint endpoint = Given();
        GivenCatalogue((1, "Wine", 12m, 10m));

        const string body = """
            {
              "external_id": "till-991",
              "date": "2026-08-20",
              "sales": [{ "name": "Wine", "quantity": 2 }]
            }
            """;

        await Post(body);

        IngestResultDto replayed = await _handler.RunAsync(
            endpoint, body, IngestOptions.Replay, CancellationToken.None);

        Assert.Equal("applied", replayed.status);
        Assert.Equal(2, _command.Merges.Count);
    }
}
