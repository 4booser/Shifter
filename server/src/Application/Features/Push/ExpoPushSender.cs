using System.Text;
using System.Text.Json;

using Serilog;

namespace Shifter.Application.Features.Push;

/// <summary>
/// Notifications to phones through Expo's push service — one endpoint for
/// both stores, no APNs certificates or FCM projects to keep alive. No key
/// is needed: the token itself is the address, which is why a dead token has
/// to be recognised and dropped rather than retried forever.
/// </summary>
public sealed class ExpoPushSender
{
    private readonly IHttpClientFactory _http;

    public ExpoPushSender(IHttpClientFactory http) => _http = http;

    /// <summary>True while the token is worth keeping; false once Expo disowns it.</summary>
    public async Task<bool> SendAsync(string token, string title, string body, string path, CancellationToken ct)
    {
        try
        {
            using var client = _http.CreateClient();

            client.Timeout = TimeSpan.FromSeconds(15);

            var payload = new[]
            {
                new
                {
                    to = token,
                    title,
                    body,
                    sound = "default",
                    // The phone opens this screen when the notification is tapped.
                    data = new { path },
                },
            };

            using var response = await client.PostAsync(
                "https://exp.host/--/api/v2/push/send",
                new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json"),
                ct);

            if (!response.IsSuccessStatusCode)
            {
                Log.Warning("Expo push refused: {Status}", (int)response.StatusCode);

                // A refusal by the service is not the token's fault; keep it.
                return true;
            }

            using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync(ct));
            var ticket = document.RootElement.GetProperty("data")[0];

            if (ticket.TryGetProperty("status", out var status) && status.GetString() == "error")
            {
                var reason = ticket.TryGetProperty("details", out var details)
                    && details.TryGetProperty("error", out var error)
                        ? error.GetString()
                        : null;

                Log.Warning("Expo push failed: {Reason}", reason ?? "unknown");

                // The one error that means the address itself is gone.
                return reason != "DeviceNotRegistered";
            }

            return true;
        }
        catch (Exception exception)
        {
            Log.Warning(exception, "Expo push threw");

            return true;
        }
    }
}
