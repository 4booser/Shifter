using System.Data.Common;

using Microsoft.EntityFrameworkCore.Diagnostics;

namespace Shifter.Infrastructure;

/// <summary>Counts the SQL commands a request actually runs.</summary>
public sealed class QueryCounter : DbCommandInterceptor
{
    private static readonly AsyncLocal<Box?> Current = new();

    private sealed class Box
    {
        public int Count;
    }

    /// <summary>Starts counting for the current async flow.</summary>
    public static void Start() => Current.Value = new Box();

    /// <summary>How many commands ran since Start, without stopping.</summary>
    public static int Peek() => Current.Value?.Count ?? 0;

    /// <summary>How many commands ran since Start, and stops counting.</summary>
    public static int Stop()
    {
        var box = Current.Value;

        Current.Value = null;

        return box?.Count ?? 0;
    }

    private static void Bump() => Interlocked.Increment(ref (Current.Value ?? Missing).Count);

    // A sink for commands outside any measurement, so Bump never branches.
    private static readonly Box Missing = new();

    public override InterceptionResult<DbDataReader> ReaderExecuting(
        DbCommand command, CommandEventData eventData, InterceptionResult<DbDataReader> result)
    {
        Bump();

        return base.ReaderExecuting(command, eventData, result);
    }

    public override ValueTask<InterceptionResult<DbDataReader>> ReaderExecutingAsync(
        DbCommand command, CommandEventData eventData, InterceptionResult<DbDataReader> result,
        CancellationToken cancellationToken = default)
    {
        Bump();

        return base.ReaderExecutingAsync(command, eventData, result, cancellationToken);
    }

    public override InterceptionResult<int> NonQueryExecuting(
        DbCommand command, CommandEventData eventData, InterceptionResult<int> result)
    {
        Bump();

        return base.NonQueryExecuting(command, eventData, result);
    }

    public override ValueTask<InterceptionResult<int>> NonQueryExecutingAsync(
        DbCommand command, CommandEventData eventData, InterceptionResult<int> result,
        CancellationToken cancellationToken = default)
    {
        Bump();

        return base.NonQueryExecutingAsync(command, eventData, result, cancellationToken);
    }

    public override InterceptionResult<object> ScalarExecuting(
        DbCommand command, CommandEventData eventData, InterceptionResult<object> result)
    {
        Bump();

        return base.ScalarExecuting(command, eventData, result);
    }

    public override ValueTask<InterceptionResult<object>> ScalarExecutingAsync(
        DbCommand command, CommandEventData eventData, InterceptionResult<object> result,
        CancellationToken cancellationToken = default)
    {
        Bump();

        return base.ScalarExecutingAsync(command, eventData, result, cancellationToken);
    }
}
