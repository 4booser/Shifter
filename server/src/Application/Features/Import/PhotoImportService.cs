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
        // The ledger key rolls with the UTC day; yesterday's spend evaporates.
        var key = $"{userId}:{DateOnly.FromDateTime(DateTime.UtcNow.Date):yyyyMMdd}";

        if (Spent.GetValueOrDefault(key) >= _options.DailyLimit)
            throw new ValidationException("Daily photo-import limit reached. Tomorrow it resets.");

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

        using var client = _http.CreateClient();
        using var request = new HttpRequestMessage(HttpMethod.Post, "https://api.anthropic.com/v1/messages");

        request.Headers.Add("x-api-key", _options.ApiKey);
        request.Headers.Add("anthropic-version", "2023-06-01");
        request.Content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json");

        using var response = await client.SendAsync(request, ct);
        var body = await response.Content.ReadAsStringAsync(ct);

        if (!response.IsSuccessStatusCode)
        {
            _logger.LogWarning("Photo import upstream said {Status}: {Body}", response.StatusCode, body[..Math.Min(300, body.Length)]);
            throw new ValidationException("The reader is unavailable right now. Try again in a minute.");
        }

        Spent.AddOrUpdate(key, 1, (_, count) => count + 1);

        using var document = JsonDocument.Parse(body);
        var text = document.RootElement
            .GetProperty("content")
            .EnumerateArray()
            .Where(block => block.GetProperty("type").GetString() == "text")
            .Select(block => block.GetProperty("text").GetString() ?? "")
            .FirstOrDefault("");

        return ScheduleParse.FromModelText(text);
    }
}
