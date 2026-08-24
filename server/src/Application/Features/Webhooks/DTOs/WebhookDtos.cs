namespace Shifter.Application.Features.Webhooks.DTOs;

/// <summary>
/// The one address in the application that answers without a token of ours.
/// Named here rather than written twice, so the URL the manager hands out and
/// the route that receives on it cannot drift apart.
/// </summary>
public static class WebhookRoutes
{
    public const string Hooks = "shifter/v1/hooks";
}

/// <summary>
/// An endpoint as its owner sees it. The secret is included rather than shown
/// once and hidden: it has to be pasted into somebody else's software, often
/// days later and often twice, and an integration nobody can re-configure
/// without deleting it is worse than one whose key is readable by the account
/// that owns it.
/// </summary>
public record WebhookDto(
    int id,
    string name,
    /// <summary>"sales" or "hours".</summary>
    string kind,
    /// <summary>Where the sender posts, relative to this server's origin.</summary>
    string url_path,
    string token,
    string secret,
    bool active,
    int? default_shift_id,
    string? default_shift_name,
    string? mapping,
    DateTime created_at,
    DateTime? last_delivery_at,
    /// <summary>How the last few arrivals went; the quickest read on health.</summary>
    int recent_applied,
    int recent_failed);

/// <summary>
/// The whole endpoint, sent on create and on edit alike. There is no partial
/// update: the screen holds every field, so a patch would only add a way for
/// one form to silently reset another's work.
/// </summary>
public record WebhookSaveDto(
    string name,
    string kind,
    bool active,
    /// <summary>Which template hours land on when the payload names none.</summary>
    int? default_shift_id,
    /// <summary>Null or empty means the sender already speaks the canonical shape.</summary>
    string? mapping);

/// <summary>One arrival, with the body that arrived.</summary>
public record DeliveryDto(
    int id,
    DateTime received_at,
    /// <summary>applied, duplicate, rejected or failed.</summary>
    string status,
    string? external_id,
    DateOnly? applied_date,
    string? error,
    string payload);

/// <summary>What a delivery turned into. The preview is filled in for the
/// owner's own test runs and replays, and left off the sender's response —
/// it holds catalogue prices, and the sender has no business with those.</summary>
public record IngestResultDto(
    /// <summary>applied, duplicate or preview.</summary>
    string status,
    DateOnly? date,
    IngestPreviewDto? preview);

public record IngestPreviewDto(
    IngestLineDto[] sales,
    decimal? tips,
    decimal? tips_cash,
    decimal? deductions,
    string? note,
    /// <summary>The delivery clears positions it does not mention.</summary>
    bool replace,
    IngestShiftDto? shift);

public record IngestLineDto(
    int sales_id,
    string name,
    int quantity,
    decimal unit_price,
    decimal earned);

public record IngestShiftDto(
    int shift_id,
    string name,
    string start_time,
    string end_time,
    int break_minutes,
    double hours,
    bool worked);
