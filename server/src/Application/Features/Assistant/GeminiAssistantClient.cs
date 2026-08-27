using System.Text;
using System.Text.Json;

using Microsoft.Extensions.Options;

using Serilog;

using Shifter.Application.Features.Brief;

namespace Shifter.Application.Features.Assistant;

/// <summary>
/// The model, on the same short leash as the brief's: our finished figures go
/// in as text, prose comes back, and every failure — a timeout, a refusal, a
/// blocked key — falls through to the local writer. It is a stylist, never an
/// accountant, and it is told so in as many words.
/// </summary>
public sealed class GeminiAssistantClient
{
    private readonly IHttpClientFactory _http;
    private readonly BriefOptions _options;

    public GeminiAssistantClient(IHttpClientFactory http, IOptions<BriefOptions> options)
    {
        _http = http;
        _options = options.Value;
    }

    public bool Enabled => !string.IsNullOrWhiteSpace(_options.ApiKey);

    /// <summary>An answer to one question, or null to fall back.</summary>
    public Task<string?> AnswerAsync(string question, AssistantFacts facts, string fallback, CancellationToken ct)
        => AskAsync($"""
            Ты — спокойный помощник в приложении учёта смен для работников общепита.
            Ниже готовые факты за период и вопрос человека.

            Правила, без исключений:
            — НЕ считай ничего сам и не выводи новых чисел. Разрешено называть только те
              суммы, часы и проценты, которые есть в фактах.
            — Если в фактах нет ответа, так и скажи и предложи, что отметить в приложении.
            — По-русски, на «вы», 2–4 коротких предложения, без восклицаний и без пафоса.
            — Никаких советов про инвестиции, налоговое планирование или смену работы.

            ФАКТЫ:
            {Facts(facts)}

            ВОПРОС: {question}

            Для ориентира — вот как на этот вопрос отвечает наш собственный счётчик,
            его цифры верны: {fallback}
            """, 900, ct);

    /// <summary>The report's prose, or null to fall back.</summary>
    public Task<string?> ReportAsync(AssistantFacts facts, string fallback, CancellationToken ct)
        => AskAsync($"""
            Ты — спокойный помощник в приложении учёта смен для работников общепита.
            Напиши короткий разбор периода по готовым фактам.

            Правила, без исключений:
            — НЕ считай ничего сам. Только те числа, что есть в фактах.
            — 3–5 абзацев по 1–2 предложения, разделённых пустой строкой.
            — По-русски, на «вы», спокойно и по делу, без восклицаний.
            — Последний абзац — одно практическое наблюдение о том, что стоит отметить
              или на что посмотреть в приложении.

            ФАКТЫ:
            {Facts(facts)}

            Для ориентира — наш собственный разбор тех же фактов, его цифры верны:
            {fallback}
            """, 2_000, ct);

    private static string Facts(AssistantFacts facts) =>
        JsonSerializer.Serialize(facts, new JsonSerializerOptions { WriteIndented = true });

    private async Task<string?> AskAsync(string prompt, int cap, CancellationToken ct)
    {
        if (!Enabled) return null;

        try
        {
            using var client = _http.CreateClient();

            client.Timeout = TimeSpan.FromSeconds(25);

            var url =
                $"https://generativelanguage.googleapis.com/v1beta/models/{_options.Model}:generateContent?key={_options.ApiKey}";
            var payload = new
            {
                contents = new[] { new { parts = new[] { new { text = prompt } } } },
                generationConfig = new { temperature = 0.6 },
            };

            using var response = await client.PostAsync(
                url,
                new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json"),
                ct);

            if (!response.IsSuccessStatusCode)
            {
                Log.Warning("Gemini refused an assistant answer: {Status}", (int)response.StatusCode);

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

            var trimmed = text.Trim();

            return trimmed.Length <= cap ? trimmed : trimmed[..cap];
        }
        catch (Exception exception)
        {
            Log.Warning(exception, "The assistant could not reach the model");

            return null;
        }
    }
}
