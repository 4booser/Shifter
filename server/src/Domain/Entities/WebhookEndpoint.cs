namespace Shifter.Domain.Entities;

/// <summary>
/// One address an outside system may post to, and everything needed to decide
/// what its posts mean. A person may hold several: the till at one bar, the
/// rota exporter at another, each with its own key and its own field mapping.
///
/// The address is unauthenticated — the sender has no account here and never
/// will — so the token in the URL says which endpoint, and the secret says
/// whether the sender is really it.
/// </summary>
public sealed class WebhookEndpoint
{
    public int Id { get; set; }

    public int UserId { get; set; }
    public User? User { get; set; }

    /// <summary>What the person calls it, e.g. "Till at the Crown".</summary>
    public required string Name { get; set; }

    public WebhookKind Kind { get; set; }

    /// <summary>
    /// The public half, and the whole of the URL's secrecy budget: it names the
    /// endpoint to a caller holding no account. Unique, and rotatable without
    /// touching anything the endpoint has already written.
    /// </summary>
    public required string Token { get; set; }

    /// <summary>
    /// The shared key the sender signs with. Stored as it was generated rather
    /// than hashed, because verifying an HMAC means recomputing it — there is
    /// no one-way check to make. It is scoped to a single endpoint of a single
    /// account and can be rotated from the UI at any time.
    /// </summary>
    public required string Secret { get; set; }

    /// <summary>
    /// Off means the address answers 404 like any unknown token. Kept rather
    /// than deleted so a noisy integration can be stopped for an hour without
    /// losing its mapping and its history.
    /// </summary>
    public bool Active { get; set; } = true;

    /// <summary>
    /// Which template an hours delivery lands on when the payload does not name
    /// one. Hours have to attach to something that knows the rate, and asking a
    /// till to know the id of a shift template is asking too much.
    /// </summary>
    public int? DefaultShiftId { get; set; }
    public Shift? DefaultShift { get; set; }

    /// <summary>
    /// Optional JSON object rewriting the sender's field names into the ones
    /// this application reads. Null means the sender already speaks the
    /// canonical shape. Held as text rather than modelled: it is configuration
    /// authored by hand, and every provider's is a different shape.
    /// </summary>
    public string? Mapping { get; set; }

    /// <summary>
    /// The header a sender signs under, when it will not be told which one to
    /// use — "X-Syrve-Signature", "Stripe-Signature", "X-Hub-Signature-256".
    /// Null means it speaks ours.
    ///
    /// Senders that offer a webhook feature rarely offer a choice of header,
    /// and refusing them on that alone would make this useless against exactly
    /// the software people need it for.
    /// </summary>
    public string? SignatureHeader { get; set; }

    /// <summary>
    /// The key that sender signs with — its own, generated on its side, which
    /// is why it is stored beside our <see cref="Secret"/> rather than instead
    /// of it. An endpoint may be reachable both ways at once: the sender by its
    /// scheme, a script by ours.
    /// </summary>
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
