using System.Text;
using System.Text.Json;

using Microsoft.Extensions.Options;

using Serilog;

using Shifter.Application.Common.Text;

namespace Shifter.Application.Features.Brief;

/// <summary>
/// Asks Gemini to say our numbers like a person would. Strictly bounded: the
/// facts go in as text, a tiny JSON object comes back, and anything else —
/// a timeout, a refusal, a malformed answer — falls through to the local
/// writer. The model is a stylist here, never an accountant.
/// </summary>
public sealed class GeminiBriefClient
{
    private readonly IHttpClientFactory _http;
    private readonly BriefOptions _options;

    public GeminiBriefClient(IHttpClientFactory http, IOptions<BriefOptions> options)
    {
        _http = http;
        _options = options.Value;
    }

    public bool Enabled => !string.IsNullOrWhiteSpace(_options.ApiKey);

    public async Task<(string Headline, string Body, string Tip, string Mood)?> WriteAsync(
        BriefFacts facts,
        CancellationToken ct,
        string? lang = null)
    {
        var say = Say.In(lang);

        if (!Enabled) return null;

        var prompt = $"""
            Ты — спокойный помощник в приложении учёта смен для работников общепита.
            Ниже готовые факты. НЕ считай ничего сам, не выдумывай цифр и не добавляй тех,
            которых нет. Ответь строго JSON-объектом с полями headline, body, tip, mood.

            headline — одна строка про сегодня (до 60 знаков).
            body — 2–3 коротких предложения про месяц и темп (до 240 знаков).
            tip — один конкретный совет или пожелание на смену (до 120 знаков).
            mood — один эмодзи.

            {say.Of("Пиши по-русски", "Пиши українською")}, на «вы», без восклицаний и без пафоса.

            ФАКТЫ:
            {JsonSerializer.Serialize(facts, new JsonSerializerOptions { WriteIndented = true })}
            """;

        try
        {
            using var client = _http.CreateClient();

            client.Timeout = TimeSpan.FromSeconds(20);

            var url =
                $"https://generativelanguage.googleapis.com/v1beta/models/{_options.Model}:generateContent?key={_options.ApiKey}";
            var payload = new
            {
                contents = new[] { new { parts = new[] { new { text = prompt } } } },
                generationConfig = new { temperature = 0.7, responseMimeType = "application/json" },
            };

            using var response = await client.PostAsync(
                url,
                new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json"),
                ct);

            if (!response.IsSuccessStatusCode)
            {
                Log.Warning("Gemini refused a brief: {Status}", (int)response.StatusCode);

                return null;
            }

            using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync(ct));
            var text = document.RootElement
                .GetProperty("candidates")[0]
                .GetProperty("content")
                .GetProperty("parts")[0]
                .GetProperty("text")
                .GetString();

            if (string.IsNullOrWhiteSpace(text)) return null;

            using var parsed = JsonDocument.Parse(text);
            var root = parsed.RootElement;

            string? Read(string name)
                => root.TryGetProperty(name, out var value) ? value.GetString() : null;

            var headline = Read("headline");
            var body = Read("body");

            // A brief without its two load-bearing lines is not a brief.
            if (string.IsNullOrWhiteSpace(headline) || string.IsNullOrWhiteSpace(body)) return null;

            return (
                Clip(headline, 90),
                Clip(body, 320),
                Clip(Read("tip") ?? "", 160),
                Clip(Read("mood") ?? "💡", 4));
        }
        catch (Exception exception)
        {
            Log.Warning(exception, "A brief could not be written by the model");

            return null;
        }
    }

    private static string Clip(string value, int max)
    {
        var trimmed = value.Trim();

        return trimmed.Length <= max ? trimmed : trimmed[..max];
    }
}
