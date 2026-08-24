namespace Shifter.Domain.Entities;

/// <summary>
/// One arrival at an endpoint, kept with its body. The body is the point: when
/// a night's takings land on the wrong date, the only way to find out why is to
/// read what was actually sent, and the sender rarely keeps a copy.
/// </summary>
public sealed class WebhookDelivery
{
    public int Id { get; set; }

    public int EndpointId { get; set; }
    public WebhookEndpoint? Endpoint { get; set; }

    public DateTime ReceivedAt { get; set; }

    public DeliveryStatus Status { get; set; }

    /// <summary>
    /// The sender's own id for this event, when it sends one. Unique per
    /// endpoint, which is what makes a retry after a timeout harmless: the
    /// second copy is recognised rather than added to the first.
    /// </summary>
    public string? ExternalId { get; set; }

    /// <summary>The day this touched, once the payload has been read.</summary>
    public DateOnly? AppliedDate { get; set; }

    /// <summary>Why it did not apply, in the words the sender should see.</summary>
    public string? Error { get; set; }

    /// <summary>
    /// The raw body, truncated. A till that sends a whole day of line items can
    /// send a lot, and the log is for diagnosis, not for storage.
    /// </summary>
    public required string Payload { get; set; }

    /// <summary>Longest body kept. Anything past this is cut with an ellipsis.</summary>
    public const int PayloadMaxLength = 8_000;

    /// <summary>How many deliveries an endpoint keeps before the oldest go.</summary>
    public const int KeepPerEndpoint = 100;

    public static string Truncate(string body)
    {
        if (body.Length <= PayloadMaxLength) return body;

        // Never between the halves of a surrogate pair. An emoji landing on the
        // boundary would otherwise leave a lone surrogate in the string, which
        // is not valid UTF-8 and fails on the way into the column.
        int cut = PayloadMaxLength;

        if (char.IsHighSurrogate(body[cut - 1])) cut -= 1;

        return body[..cut] + "…";
    }
}
