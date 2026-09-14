namespace Shifter.Domain.Entities;

/// <summary>One address an outside system may post to, and everything needed to decide what its posts mean.</summary>
public sealed class WebhookEndpoint
{
    public int Id { get; set; }

    public int UserId { get; set; }
    public User? User { get; set; }

    /// <summary>What the person calls it, e.g. "Till at the Crown".</summary>
    public required string Name { get; set; }

    public WebhookKind Kind { get; set; }

    /// <summary>The public half, and the whole of the URL's secrecy budget: it names the endpoint to a caller holding no…</summary>
    public required string Token { get; set; }

    /// <summary>The shared key the sender signs with.</summary>
    public required string Secret { get; set; }

    /// <summary>Off means the address answers 404 like any unknown token.</summary>
    public bool Active { get; set; } = true;

    /// <summary>Which template an hours delivery lands on when the payload does not name one.</summary>
    public int? DefaultShiftId { get; set; }
    public Shift? DefaultShift { get; set; }

    /// <summary>Optional JSON object rewriting the sender's field names into the ones this application reads.</summary>
    public string? Mapping { get; set; }

    /// <summary>The header a sender signs under, when it will not be told which one to use — "X-Syrve-Signature"…</summary>
    public string? SignatureHeader { get; set; }

    /// <summary>The key that sender signs with — its own, generated on its side, which is why it is stored beside our <see…</summary>
    public string? SignatureSecret { get; set; }

    public DateTime CreatedAt { get; set; }

    /// <summary>When something last arrived, successful or not — the first
    /// thing anyone asks when an integration goes quiet.</summary>
    public DateTime? LastDeliveryAt { get; set; }

    public List<WebhookDelivery>? Deliveries { get; set; }

    /// <summary>Replaces both halves of the credential at once. Rotating only
    /// the secret would leave the old URL working for anyone who kept it.</summary>
    public void Rotate(string token, string secret)
    {
        Token = token;
        Secret = secret;
    }
}
