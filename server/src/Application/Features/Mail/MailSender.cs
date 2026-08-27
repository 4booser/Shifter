using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;

using Microsoft.Extensions.Options;

using Serilog;

namespace Shifter.Application.Features.Mail;

/// <summary>
/// Sends the handful of letters this product ever needs, through Resend's
/// REST API. Failures are logged and swallowed: a letter that did not go
/// out must never take a request down with it, and the caller is told
/// nothing either way — an attacker learns nothing from timing.
/// </summary>
public sealed class MailSender
{
    private readonly IHttpClientFactory _http;
    private readonly MailOptions _options;

    public MailSender(IHttpClientFactory http, IOptions<MailOptions> options)
    {
        _http = http;
        _options = options.Value;
    }

    public bool Enabled => !string.IsNullOrWhiteSpace(_options.ApiKey);

    public string Origin => _options.Origin.TrimEnd('/');

    public async Task<bool> SendAsync(string to, string subject, string html, CancellationToken ct)
    {
        if (!Enabled)
        {
            Log.Warning("Mail is not configured; dropping the letter to {To}", Mask(to));

            return false;
        }

        try
        {
            using var client = _http.CreateClient();
            using var request = new HttpRequestMessage(HttpMethod.Post, "https://api.resend.com/emails");

            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _options.ApiKey);
            request.Content = new StringContent(
                JsonSerializer.Serialize(new { from = _options.From, to = new[] { to }, subject, html }),
                Encoding.UTF8,
                "application/json");

            var response = await client.SendAsync(request, ct);

            if (response.IsSuccessStatusCode) return true;

            Log.Warning(
                "Mail provider refused the letter to {To}: {Status}",
                Mask(to),
                (int)response.StatusCode);

            return false;
        }
        catch (Exception exception)
        {
            Log.Warning(exception, "Mail to {To} failed", Mask(to));

            return false;
        }
    }

    /// <summary>Logs never carry whole addresses.</summary>
    private static string Mask(string address)
    {
        var at = address.IndexOf('@');

        return at <= 1 ? "***" : $"{address[0]}***{address[at..]}";
    }
}
