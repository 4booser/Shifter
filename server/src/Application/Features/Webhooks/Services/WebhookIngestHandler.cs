using System.Text.Json;
using Shifter.Application.Common.Exceptions;
using Shifter.Application.Features.Webhooks.DTOs;
using Shifter.Application.Features.Webhooks.Services.Interfaces;
using Shifter.Domain.Entities;
using Shifter.Infrastructure.Repositories.Interfaces;

namespace Shifter.Application.Features.Webhooks.Services;

/// <summary>
/// Everything that happens between a body arriving and a day changing: proving
/// the sender knows the secret, reading the payload through the endpoint's
/// mapping, matching what it names against the account's own catalogue and
/// templates, and writing the result without disturbing anything the person
/// entered by hand.
///
/// Every arrival is recorded, including the ones that go nowhere. A webhook
/// that fails silently is one nobody can fix: the sender sees a 400 and moves
/// on, and the person waiting for their takings has nothing to look at.
/// </summary>
public class WebhookIngestHandler : IWebhookIngestHandler
{
    private const int NoteMaxLength = 500;

    private readonly IWebhookRepository _webhooks;
    private readonly IShifterQuery _shifterQuery;
    private readonly IShifterCommand _shifterCommand;

    public WebhookIngestHandler(
        IWebhookRepository webhooks,
        IShifterQuery shifterQuery,
        IShifterCommand shifterCommand)
    {
        _webhooks = webhooks;
        _shifterQuery = shifterQuery;
        _shifterCommand = shifterCommand;
    }

    public async Task<IngestResultDto> ReceiveAsync(
        string token,
        string body,
        DeliveryHeaders headers,
        DateTimeOffset now,
        CancellationToken ct)
    {
        WebhookEndpoint? endpoint = await _webhooks.GetByTokenAsync(token, ct);

        // Switched off answers exactly as unknown does. Telling the two apart
        // would turn the address into an oracle for which tokens are real.
        if (endpoint is null || !endpoint.Active)
            throw new NotFoundException("No webhook endpoint at this address.");

        string? refused = WebhookSignature.Verify(
            endpoint.Secret,
            headers.Signature,
            headers.Timestamp,
            headers.Secret,
            body,
            now,
            headers.Present);

        if (refused is not null)
        {
            // Logged before it is refused: a sender signing with yesterday's
            // secret is the commonest failure there is, and the owner can only
            // see it if the attempt is written down.
            await LogAsync(endpoint, body, DeliveryStatus.Failed, null, null, refused, ct);

            throw new UnauthorizedException(refused);
        }

        return await RunAsync(endpoint, body, IngestOptions.Delivery, ct);
    }

    public async Task<IngestResultDto> RunAsync(
        WebhookEndpoint endpoint,
        string body,
        IngestOptions options,
        CancellationToken ct)
    {
        JsonDocument document;

        try
        {
            document = JsonDocument.Parse(body);
        }
        catch (JsonException error)
        {
            string message = $"The body is not valid JSON: {error.Message}";

            if (options.Log)
                await LogAsync(endpoint, body, DeliveryStatus.Failed, null, null, message, ct);

            throw new ValidationException(message);
        }

        using (document)
        {
            try
            {
                return await ApplyAsync(endpoint, document.RootElement, body, options, ct);
            }
            catch (Exception error) when (error is ValidationException
                or NotFoundException
                or ConflictException
                or ForbiddenException)
            {
                if (options.Log)
                {
                    await LogAsync(
                        endpoint, body, DeliveryStatus.Rejected, null, null, error.Message, ct);
                }

                throw;
            }
        }
    }

    private async Task<IngestResultDto> ApplyAsync(
        WebhookEndpoint endpoint,
        JsonElement root,
        string body,
        IngestOptions options,
        CancellationToken ct)
    {
        PayloadMapping mapping = PayloadMapping.Parse(endpoint.Mapping);

        return endpoint.Kind switch
        {
            WebhookKind.Sales => await ApplySalesAsync(
                endpoint, PayloadReader.ReadSales(root, mapping), body, options, ct),

            WebhookKind.Hours => await ApplyHoursAsync(
                endpoint, PayloadReader.ReadHours(root, mapping), body, options, ct),

            _ => throw new ValidationException("This endpoint has no kind to read.")
        };
    }

    private async Task<IngestResultDto> ApplySalesAsync(
        WebhookEndpoint endpoint,
        SalesPayload payload,
        string body,
        IngestOptions options,
        CancellationToken ct)
    {
        if (await SeenBeforeAsync(endpoint, payload.ExternalId, options, ct))
            return new IngestResultDto("duplicate", payload.Date, null);

        // Written as a pattern rather than a comparison: a null compares false
        // against every bound, so `tips >= 0` would reject the many deliveries
        // that carry no tips at all.
        Require(payload.Tips is null or >= 0m, "Tips cannot be negative.");
        Require(payload.TipsCash is null or >= 0m, "Cash tips cannot be negative.");
        Require(payload.Deductions is null or >= 0m, "Deductions cannot be negative.");

        // Only when the delivery carried both. With one of them the day's own
        // total is the other half, and this is not the place to guess at it.
        if (payload.Tips is decimal total && payload.TipsCash is decimal cash)
            Require(cash <= total, "Cash tips cannot exceed the total.");

        string? note = payload.Note?.Trim();

        // Cut rather than refused: a till with a long order comment should not
        // lose the night's takings over it. Never through a surrogate pair.
        if (note?.Length > NoteMaxLength)
        {
            int cut = NoteMaxLength;

            if (char.IsHighSurrogate(note[cut - 1])) cut -= 1;

            note = note[..cut];
        }

        Sales[] catalogue = await _shifterQuery.GetSalesAsync(endpoint.UserId, true, ct);

        List<DaySale> entries = [];
        List<IngestLineDto> lines = [];

        foreach (ResolvedLine line in ResolveLines(payload.Lines, catalogue))
        {
            DaySale entry = new DaySale
            {
                SalesId = line.Position.Id,
                Quantity = line.Quantity,
                // Snapshots, as everywhere else: repricing the catalogue must
                // not rewrite what a day already earned.
                UnitPrice = line.Position.Price,
                Percentage = line.Position.Percentage ?? 0m

                // The Sales navigation is deliberately left off. The catalogue
                // was read without tracking, and hanging that copy on a day
                // that does not exist yet makes EF add the whole graph — it
                // would try to insert the position a second time and fail on
                // its primary key. The foreign key is all a write needs.
            };

            entries.Add(entry);

            lines.Add(new IngestLineDto(
                entry.SalesId,
                line.Position.Name,
                entry.Quantity,
                entry.UnitPrice,
                entry.Earned));
        }

        IngestPreviewDto preview = new IngestPreviewDto(
            lines.ToArray(),
            payload.Tips,
            payload.TipsCash,
            payload.Deductions,
            note,
            payload.Replace,
            null);

        if (!options.Apply) return new IngestResultDto("preview", payload.Date, preview);

        // A delivery with nothing in it writes nothing — not even the day. The
        // sender's own test button produces exactly this, and creating a blank
        // row for it would put an empty day on the calendar and report success
        // for a night that was never recorded.
        bool carriesNothing = entries.Count == 0
            && payload.Tips is null
            && payload.TipsCash is null
            && payload.Deductions is null
            && note is null;

        if (carriesNothing)
        {
            if (options.Log)
            {
                await LogAsync(
                    endpoint,
                    body,
                    DeliveryStatus.Empty,
                    payload.ExternalId,
                    null,
                    "Read without trouble, and it carried no positions and no amounts.",
                    ct);
            }

            return new IngestResultDto("empty", payload.Date, preview);
        }

        await _shifterCommand.MergeDaySalesAsync(
            endpoint.UserId,
            new DaySalesMerge(
                payload.Date,
                entries,
                payload.Replace,
                payload.Tips,
                payload.TipsCash,
                payload.Deductions,
                note),
            ct);

        if (options.Log)
        {
            await LogAsync(
                endpoint,
                body,
                DeliveryStatus.Applied,
                payload.ExternalId,
                payload.Date,
                null,
                ct);
        }

        return new IngestResultDto("applied", payload.Date, preview);
    }

    private async Task<IngestResultDto> ApplyHoursAsync(
        WebhookEndpoint endpoint,
        HoursPayload payload,
        string body,
        IngestOptions options,
        CancellationToken ct)
    {
        if (await SeenBeforeAsync(endpoint, payload.ExternalId, options, ct))
            return new IngestResultDto("duplicate", payload.Date, null);

        Shift template = await ResolveShiftAsync(endpoint, payload.Shift, ct);

        DayShift placement = DayShift.From(template, payload.Worked);

        // Same reason as the sold positions: From copies the template's terms
        // and then points at the template itself, and that instance came from a
        // read this context may not be tracking. The placement needs the id and
        // the copied terms, nothing more.
        placement.Shift = null;

        if (payload.BreakMinutes is int rest)
        {
            Require(rest >= 0, "A break cannot be negative.");

            placement.BreakMinutes = rest;
        }

        if (payload.Start is TimeOnly start && payload.End is TimeOnly end)
        {
            placement.StartTime = start;
            placement.EndTime = end;
        }
        else if (payload.Hours is double hours)
        {
            Require(hours > 0, "Hours must be more than zero.");
            Require(hours <= 24, "A day holds at most 24 hours.");

            // A count of hours says how long, never when. The template's start
            // is the only honest guess at that, and the break is added back on
            // so the paid time comes out as the sender meant it.
            placement.StartTime = template.StartTime;
            placement.EndTime = placement.StartTime
                .AddHours(hours)
                .AddMinutes(placement.BreakMinutes);
        }
        else if (payload.Start is TimeOnly only)
        {
            // Half a pair: the shift started when it says and ran the
            // template's length, which beats refusing a clock-in.
            placement.StartTime = only;
            placement.EndTime = only.Add(template.Duration);
        }

        Require(
            placement.PaidDuration > TimeSpan.Zero,
            "The break is at least as long as the shift.");

        IngestPreviewDto preview = new IngestPreviewDto(
            [],
            null,
            null,
            null,
            null,
            false,
            new IngestShiftDto(
                template.Id,
                template.Name,
                placement.StartTime.ToString("HH:mm"),
                placement.EndTime.ToString("HH:mm"),
                placement.BreakMinutes,
                Math.Round(placement.PaidDuration.TotalHours, 2),
                placement.Worked));

        if (!options.Apply) return new IngestResultDto("preview", payload.Date, preview);

        await _shifterCommand.MergeDayShiftAsync(endpoint.UserId, payload.Date, placement, ct);

        if (options.Log)
        {
            await LogAsync(
                endpoint,
                body,
                DeliveryStatus.Applied,
                payload.ExternalId,
                payload.Date,
                null,
                ct);
        }

        return new IngestResultDto("applied", payload.Date, preview);
    }

    /// <summary>One catalogue position and how much of it the delivery sold.</summary>
    private sealed record ResolvedLine(Sales Position, int Quantity)
    {
        public int Quantity { get; set; } = Quantity;
    }

    /// <summary>
    /// Matches what the delivery names against the account's catalogue. Names
    /// are how a till identifies its own items, so they are matched first and
    /// case-insensitively; an id is honoured when one is sent, and has to be a
    /// position of this account's.
    /// </summary>
    private static List<ResolvedLine> ResolveLines(SalesLine[] lines, Sales[] catalogue)
    {
        Dictionary<int, Sales> byId = catalogue.ToDictionary(position => position.Id);

        // Live positions win a name collision with a retired one: a name reused
        // after archiving means the new one.
        Dictionary<string, Sales> byName = catalogue
            .OrderBy(position => position.Archived)
            .GroupBy(position => position.Name.Trim(), StringComparer.OrdinalIgnoreCase)
            .ToDictionary(group => group.Key, group => group.First(), StringComparer.OrdinalIgnoreCase);

        Dictionary<int, ResolvedLine> resolved = [];

        foreach (SalesLine line in lines)
        {
            Sales? position = null;

            if (line.SalesId is int id && !byId.TryGetValue(id, out position))
                throw new NotFoundException($"No sales position with id {id}.");

            if (position is null && line.Name is not null)
            {
                if (!byName.TryGetValue(line.Name, out position))
                {
                    throw new NotFoundException(
                        $"No sales position called '{line.Name}'. Add it to the catalogue, "
                        + "or map this field to one that is there.");
                }
            }

            if (position is null)
                throw new ValidationException("A sold position names nothing to match.");

            // A till lists the same item once per order, not once per day, so
            // repeated lines are added up rather than fought over.
            if (resolved.TryGetValue(position.Id, out ResolvedLine? already))
            {
                already.Quantity += line.Quantity;

                continue;
            }

            resolved[position.Id] = new ResolvedLine(position, line.Quantity);
        }

        return resolved.Values.ToList();
    }

    /// <summary>
    /// The template the hours attach to: the one the payload names, else the
    /// endpoint's default. Hours cannot stand on their own — the rate lives on
    /// the template, and a placement without one would earn nothing.
    /// </summary>
    private async Task<Shift> ResolveShiftAsync(
        WebhookEndpoint endpoint,
        string? named,
        CancellationToken ct)
    {
        if (!string.IsNullOrWhiteSpace(named))
        {
            Shift[] templates = await _shifterQuery.GetShiftsAsync(endpoint.UserId, false, ct);

            Shift? match = templates.FirstOrDefault(shift =>
                string.Equals(shift.Name.Trim(), named.Trim(), StringComparison.OrdinalIgnoreCase));

            if (match is not null) return match;

            // Strict on purpose, default or no default: a name that matches
            // nothing is a typo or a template nobody made yet, and quietly
            // filing those hours under the fallback would look like it worked.
            throw new NotFoundException(
                $"No shift template called '{named.Trim()}'. Create it, or map this "
                + "field to a template that exists.");
        }

        if (endpoint.DefaultShiftId is not int fallback)
        {
            throw new ValidationException(
                "The payload names no shift and this endpoint has no default template.");
        }

        return await _shifterQuery.GetShiftAsync(endpoint.UserId, fallback, ct)
            ?? throw new NotFoundException("The endpoint's default shift template is gone.");
    }

    /// <summary>
    /// Whether this exact event already landed. Senders retry on a timeout, and
    /// without this the retry would add a second night's takings to the first.
    /// </summary>
    private async Task<bool> SeenBeforeAsync(
        WebhookEndpoint endpoint,
        string? externalId,
        IngestOptions options,
        CancellationToken ct)
    {
        if (!options.Deduplicate || string.IsNullOrWhiteSpace(externalId)) return false;

        if (!await _webhooks.DeliveryExistsAsync(endpoint.Id, externalId, ct)) return false;

        // Not logged again: the first arrival is already the record of it, and
        // the endpoint's unique index would refuse the second row anyway.
        endpoint.LastDeliveryAt = DateTime.UtcNow;

        await _webhooks.SaveAsync(ct);

        return true;
    }

    private async Task LogAsync(
        WebhookEndpoint endpoint,
        string body,
        DeliveryStatus status,
        string? externalId,
        DateOnly? date,
        string? error,
        CancellationToken ct)
    {
        endpoint.LastDeliveryAt = DateTime.UtcNow;

        await _webhooks.AddDeliveryAsync(
            new WebhookDelivery
            {
                EndpointId = endpoint.Id,
                ReceivedAt = DateTime.UtcNow,
                Status = status,
                ExternalId = string.IsNullOrWhiteSpace(externalId) ? null : externalId,
                AppliedDate = date,
                Error = error,
                Payload = WebhookDelivery.Truncate(body)
            },
            ct);
    }

    private static void Require(bool condition, string message)
    {
        if (!condition) throw new ValidationException(message);
    }
}
