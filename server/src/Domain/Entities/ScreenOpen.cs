namespace Shifter.Domain.Entities;

/// <summary>
/// How often a screen was opened on a day. Nothing else.
///
/// Decisions about what to build next have been made by guessing, because
/// nobody knows which screens people actually use. The usual answer is an
/// analytics SDK, which means shipping somebody else's code that watches
/// everything and reports to a third party — for an application whose whole
/// argument is that it does not do that.
///
/// So: a counter per screen per day, on this server, with no identifier of any
/// kind. Not a user id, not a session, not a device, not an address. The row
/// says "the calendar was opened four thousand times on Tuesday", and there is
/// no query that turns it back into a person, because the data to do it with
/// was never written.
///
/// The cost is real and accepted: this can never answer "how many people",
/// only "how many opens". That is the trade, and it is the right way round.
/// </summary>
public sealed class ScreenOpen
{
    public const int NameMax = 40;

    public int Id { get; set; }

    /// <summary>The day, on the server's own clock.</summary>
    public required DateOnly Day { get; set; }

    /// <summary>A short name from a fixed list — never a path, never a query.</summary>
    public required string Screen { get; set; }

    public int Count { get; set; }
}
