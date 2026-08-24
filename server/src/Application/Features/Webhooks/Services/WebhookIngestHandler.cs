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

        string? refused = Refuse(endpoint, headers, body, now);

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

    /// <summary>
    /// Null when the sender may write. An endpoint can be reachable two ways at
    /// once: by the sender's own scheme, where one is configured and the sender
    /// used it, and by ours for everything else — a script, a curl, a second
    /// integration that can be told what to send. The sender's own comes first
    /// so that a configured integration is never silently judged by rules it
    /// was never given.
    /// </summary>
    private static string? Refuse(
        WebhookEndpoint endpoint,
        DeliveryHeaders headers,
        string body,
        DateTimeOffset now)
    {
        if (!string.IsNullOrWhiteSpace(endpoint.SignatureHeader)
            && !string.IsNullOrWhiteSpace(endpoint.SignatureSecret))
        {
            string? presented = headers.Named(endpoint.SignatureHeader);

            if (!string.IsNullOrWhiteSpace(presented))
            {
                return WebhookSignature.VerifySender(
                    endpoint.SignatureSecret, presented, body, now);
            }
        }

        return WebhookSignature.Verify(
            endpoint.Secret,
            headers.Signature,
            headers.Timestamp,
            headers.Secret,
            body,
            now,
            headers.Present);
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

    /// <summary>
    /// Reads whichever halves this endpoint is for out of the one body, and
    /// writes the ones the payload actually carried. A nightly report names
    /// both the takings and the length of the shift; splitting that across two
    /// addresses means two keys and two schedules for one report.
    /// </summary>
    private async Task<IngestResultDto> ApplyAsync(
        WebhookEndpoint endpoint,
        JsonElement root,
        string body,
        IngestOptions options,
        CancellationToken ct)
    {
        PayloadMapping mapping = PayloadMapping.Parse(endpoint.Mapping);

        bool readsSales = endpoint.Kind is WebhookKind.Sales or WebhookKind.Both;
        bool readsHours = endpoint.Kind is WebhookKind.Hours or WebhookKind.Both;

        if (!readsSales && !readsHours)
            throw new ValidationException("This endpoint has no kind to read.");

        SalesPayload? sales = readsSales ? PayloadReader.ReadSales(root, mapping) : null;
        HoursPayload? hours = readsHours ? PayloadReader.ReadHours(root, mapping) : null;

        DateOnly date = sales?.Date ?? hours!.Date;
        string? externalId = sales?.ExternalId ?? hours?.ExternalId;

        if (await SeenBeforeAsync(endpoint, externalId, options, ct))
            return new IngestResultDto("duplicate", date, null);

        SalesWrite? salesWrite = sales is null ? null : await PrepareSalesAsync(endpoint, sales, ct);

        // An hours-only endpoint may place the template as it stands: "I worked
        // today, the usual shift" is a complete statement. One that also brings
        // the takings may not — a report of a night's sales would otherwise
        // invent a shift out of a template nobody worked.
        bool placeHours = hours is not null
            && (endpoint.Kind == WebhookKind.Hours || hours.SawTime);

        HoursWrite? hoursWrite = placeHours
            ? await PrepareHoursAsync(endpoint, hours!, ct)
            : null;

        IngestPreviewDto preview = new IngestPreviewDto(
            salesWrite?.Lines ?? [],
            sales?.Tips,
            sales?.TipsCash,
            sales?.Deductions,
            salesWrite?.Note,
            sales?.Replace ?? false,
            hoursWrite?.Shift);

        // Whether anything was understood, as opposed to whether anything is
        // worth writing. A day off reads perfectly and writes nothing; a
        // mapping pointing at the wrong names reads nothing at all. Only the
        // second is an error.
        bool understood = salesWrite is { Blind: false }
            || (hours?.SawTime ?? false)
            || endpoint.Kind == WebhookKind.Hours;

        // The sender's fields are not the ones this endpoint reads. Answered as
        // an error rather than as an empty day, because the sender shows a 2xx
        // as "delivered" — which is how a misconfigured mapping goes unnoticed
        // for a week while the dashboard says everything is fine.
        if (!understood)
        {
            throw new ValidationException(
                "Nothing here matched: no positions, no amounts and no hours were found. "
                + "If the sender does send them, they are under names this endpoint was "
                + "not told about — name them in the endpoint's mapping.");
        }

        if (!options.Apply) return new IngestResultDto("preview", date, preview);

        // A delivery with nothing in it writes nothing — not even the day. The
        // sender's own test button produces exactly this, and creating a blank
        // row for it would put an empty day on the calendar and report success
        // for a night that was never recorded.
        if (hoursWrite is null && (salesWrite is null || salesWrite.Empty))
        {
            if (options.Log)
            {
                await LogAsync(
                    endpoint,
                    body,
                    DeliveryStatus.Empty,
                    externalId,
                    null,
                    "Read without trouble, and it carried no positions and no amounts.",
                    ct);
            }

            return new IngestResultDto("empty", date, preview);
        }

        if (salesWrite is { Empty: false })
            await _shifterCommand.MergeDaySalesAsync(endpoint.UserId, salesWrite.Merge, ct);

        if (hoursWrite is not null)
            await _shifterCommand.MergeDayShiftAsync(endpoint.UserId, date, hoursWrite.Placement, ct);

        if (options.Log)
            await LogAsync(endpoint, body, DeliveryStatus.Applied, externalId, date, null, ct);

        return new IngestResultDto("applied", date, preview);
    }

    /// <summary>
    /// What a delivery's takings would write, and what to call it on screen.
    /// <paramref name="Blind"/> means the payload had no positions field at all
    /// and no amounts either — nothing was read, as opposed to a day on which
    /// nothing was sold.
    /// </summary>
    private sealed record SalesWrite(
        DaySalesMerge Merge,
        IngestLineDto[] Lines,
        string? Note,
        bool Empty,
        bool Blind);

    private sealed record HoursWrite(DayShift Placement, IngestShiftDto Shift);

    private async Task<SalesWrite> PrepareSalesAsync(
        WebhookEndpoint endpoint,
        SalesPayload payload,
        CancellationToken ct)
    {
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

        // A position listed as zero says it was not sold, which is what a
        // scheduled report says about every position on a day off. It is not
        // content: a delivery of nothing but zeroes writes nothing and does not
        // bring a day into being. Clearing a day that does have entries is what
        // replace is for, and that counts as content precisely because it says
        // so out loud.
        bool empty = !entries.Any(entry => entry.Quantity > 0)
            && !payload.Replace
            && payload.Tips is null
            && payload.TipsCash is null
            && payload.Deductions is null
            && note is null;

        return new SalesWrite(
            new DaySalesMerge(
                payload.Date,
                entries,
                payload.Replace,
                payload.Tips,
                payload.TipsCash,
                payload.Deductions,
                note),
            lines.ToArray(),
            note,
            empty,
            empty && !payload.SawPositions);
    }

    /// <summary>
    /// Null when the payload says no shift was worked. A report on a schedule
    /// arrives every day, including the days off, and on those it says zero —
    /// which is a statement about the day, not a mistake in the delivery.
    /// </summary>
    private async Task<HoursWrite?> PrepareHoursAsync(
        WebhookEndpoint endpoint,
        HoursPayload payload,
        CancellationToken ct)
    {
        // Nothing was worked. Said before the template is even looked up, so a
        // day off does not need one configured to be reported.
        if (payload.Hours is 0) return null;

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

        TimeSpan paid = placement.Duration - TimeSpan.FromMinutes(placement.BreakMinutes);

        Require(paid >= TimeSpan.Zero, "The break is longer than the shift.");

        // A shift that starts and ends at the same moment is the same statement
        // as zero hours: there was no shift.
        if (paid == TimeSpan.Zero) return null;

        return new HoursWrite(
            placement,
            new IngestShiftDto(
                template.Id,
                template.Name,
                placement.StartTime.ToString("HH:mm"),
                placement.EndTime.ToString("HH:mm"),
                placement.BreakMinutes,
                Math.Round(placement.PaidDuration.TotalHours, 2),
                placement.Worked));
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

        // Gathered rather than thrown on sight. A nightly report names
        // everything sold, and half of it may be missing from the catalogue the
        // first time: reporting one name per attempt turns that into an evening
        // of add-one, replay, read the next name.
        List<string> unknown = [];

        foreach (SalesLine line in lines)
        {
            Sales? position = null;

            if (line.SalesId is int id && !byId.TryGetValue(id, out position))
            {
                unknown.Add($"#{id}");

                continue;
            }

            if (position is null && line.Name is not null)
            {
                if (!byName.TryGetValue(line.Name, out position))
                {
                    unknown.Add($"'{line.Name}'");

                    continue;
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

        if (unknown.Count > 0)
        {
            throw new NotFoundException(
                $"The catalogue has nothing called {string.Join(", ", unknown.Distinct())}. "
                + "Add them, or map the field to names that are there. The body is kept, "
                + "so this delivery can be replayed once it is.");
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
