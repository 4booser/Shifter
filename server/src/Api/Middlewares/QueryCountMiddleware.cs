using Shifter.Infrastructure;

namespace Shifter.Api.Middlewares;

/// <summary>Measures a request's SQL on demand: ask with X-Count-Queries and the response carries X-Query-Count.</summary>
public sealed class QueryCountMiddleware
{
    public const string Ask = "X-Count-Queries";
    public const string Answer = "X-Query-Count";

    private readonly RequestDelegate _next;

    public QueryCountMiddleware(RequestDelegate next) => _next = next;

    public async Task InvokeAsync(HttpContext context)
    {
        if (!context.Request.Headers.ContainsKey(Ask))
        {
            await _next(context);

            return;
        }

        QueryCounter.Start();

        // The headers freeze when the body starts, which is before this
        // method gets control back — so the answer is written at that edge,
        // with whatever has been counted by then.
        context.Response.OnStarting(() =>
        {
            context.Response.Headers[Answer] = QueryCounter.Peek().ToString();

            return Task.CompletedTask;
        });

        try
        {
            await _next(context);
        }
        finally
        {
            QueryCounter.Stop();
        }
    }
}
