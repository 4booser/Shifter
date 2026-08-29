using System.Collections.Concurrent;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Shifter.Application.Common.Exceptions;

namespace Shifter.Application.Features.Import;

/// <summary>
/// Sends the photographed rota to the model and returns the rows it read.
/// One plain HttpClient call — the contract is a page of JSON, and a full
/// SDK would be more moving parts than the feature.
/// </summary>
public sealed class PhotoImportService
{
    private static readonly ConcurrentDictionary<string, int> Spent = new();

    private readonly ImportOptions _options;
    private readonly IHttpClientFactory _http;
    private readonly ILogger<PhotoImportService> _logger;

    public PhotoImportService(
        IOptions<ImportOptions> options,
        IHttpClientFactory http,
        ILogger<PhotoImportService> logger)
    {
        _options = options.Value;
        _http = http;
        _logger = logger;
    }

    public bool Enabled => _options.Enabled;

    public async Task<ParsedShiftDto[]> ReadAsync(
        int userId,
        byte[] image,
        string mediaType,
        string employee,
        int year,
        int month,
        CancellationToken ct)
    {
        Reserve(userId);

        var payload = new
        {
            model = _options.Model,
            max_tokens = 2000,
            messages = new object[]
            {
                new
                {
                    role = "user",
                    content = new object[]
                    {
                        new
                        {
                            type = "image",
                            source = new { type = "base64", media_type = mediaType, data = Convert.ToBase64String(image) },
                        },
                        new { type = "text", text = ScheduleParse.Prompt(employee, year, month) },
                    },
                },
            },
        };

        return ScheduleParse.FromModelText(await AskAsync(payload, ct));
    }

    /// <summary>
    /// Reads a photographed receipt into the beginnings of an expense.
    ///
    /// Shares the daily ledger with the rota reader, because they share the
    /// bill: a per-feature limit would let ten photographs of each cost twice
    /// what a limit of ten was meant to cap.
    /// </summary>
    public async Task<ReceiptParse.Read> ReadReceiptAsync(
        int userId,
        byte[] image,
        string mediaType,
        DateOnly today,
        CancellationToken ct)
    {
        Reserve(userId);

        var payload = new
        {
            model = _options.Model,
            max_tokens = 300,
            messages = new object[]
            {
                new
                {
                    role = "user",
                    content = new object[]
                    {
                        new
                        {
                            type = "image",
                            source = new { type = "base64", media_type = mediaType, data = Convert.ToBase64String(image) },
                        },
                        new { type = "text", text = ReceiptParse.Prompt },
                    },
                },
            },
        };

        return ReceiptParse.FromModelText(await AskAsync(payload, ct), today);
    }

    /// <summary>
    /// Takes today's slot, or refuses.
    ///
    /// Reserved before the call and never counted after it: reading the ledger
    /// at the top and writing it at the bottom is a check-then-act, and a
    /// hundred uploads at once all read zero and all became billed calls.
    /// </summary>
    private void Reserve(int userId)
    {
        var key = $"{userId}:{DateOnly.FromDateTime(DateTime.UtcNow.Date):yyyyMMdd}";

        int spent = Spent.AddOrUpdate(key, 1, (_, count) => count + 1);

        if (spent > _options.DailyLimit)
        {
            Spent.AddOrUpdate(key, 0, (_, count) => Math.Max(0, count - 1));

            throw new ValidationException("Daily limit for reading photos reached. Tomorrow it resets.");
        }

        Forget(key);
    }

    /// <summary>The call itself, which both readers make identically.</summary>
    private async Task<string> AskAsync(object payload, CancellationToken ct)
    {
        using var client = _http.CreateClient();
        using var request = new HttpRequestMessage(HttpMethod.Post, "https://api.anthropic.com/v1/messages");

        request.Headers.Add("x-api-key", _options.ApiKey);
        request.Headers.Add("anthropic-version", "2023-06-01");
        request.Content = new StringContent(
            JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json");

        using var response = await client.SendAsync(request, ct);
        var body = await response.Content.ReadAsStringAsync(ct);

        if (!response.IsSuccessStatusCode)
        {
            _logger.LogWarning(
                "Photo reader upstream said {Status}: {Body}",
                response.StatusCode,
                body[..Math.Min(300, body.Length)]);

            throw new ValidationException("The reader is unavailable right now. Try again in a minute.");
        }

        using var document = JsonDocument.Parse(body);

        return document.RootElement
            .GetProperty("content")
            .EnumerateArray()
            .Where(block => block.GetProperty("type").GetString() == "text")
            .Select(block => block.GetProperty("text").GetString() ?? "")
            .FirstOrDefault("");
    }

    /// <summary>
    /// Drops every key that is not today's. The ledger is a static dictionary
    /// with a process-long life, so without this it accumulates one entry per
    /// person per day until the app restarts.
    /// </summary>
    private static void Forget(string todayKey)
    {
        string today = todayKey[(todayKey.IndexOf(':') + 1)..];

        foreach (string stale in Spent.Keys.Where(key => !key.EndsWith(today, StringComparison.Ordinal)))
            Spent.TryRemove(stale, out _);
    }
}
