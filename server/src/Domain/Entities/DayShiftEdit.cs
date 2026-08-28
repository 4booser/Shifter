using System.Reflection;

namespace Shifter.Domain.Entities;

/// <summary>
/// Applies a saved day's edits onto a placement that is already on that day,
/// without touching the terms it was made under.
///
/// This exists because saving a day used to delete its placements and build
/// new ones from the live template — which made the snapshot on
/// <see cref="DayShift"/> protect nothing at all. Reprice a template in April,
/// open a March day to add a note, and March silently earned more. The raise
/// disappeared from the rate history too, since that history is read out of
/// these very snapshots.
///
/// The split is deliberately stated as "what the client owns", and everything
/// else is a term. A field added to <see cref="DayShift"/> later is then
/// protected by default, which is the safe direction to be wrong in: the worst
/// case is that a new setting needs a line here, not that somebody's pay
/// quietly changes.
/// </summary>
public static class DayShiftEdit
{
    /// <summary>
    /// What a saved day is allowed to change about a placement already on it.
    /// Whether it was worked, whether it needs covering, the clock somebody
    /// actually kept, the break, what the shift took and how many it served.
    ///
    /// The last two belong together and belong here: both are recorded after
    /// the evening, by the person who was there, and neither is a term of the
    /// deal that a re-saved day has any business rewriting.
    /// </summary>
    private static readonly string[] Owned =
    [
        nameof(DayShift.Worked),
        nameof(DayShift.NeedsCover),
        nameof(DayShift.ActualStart),
        nameof(DayShift.ActualEnd),
        nameof(DayShift.BreakMinutes),
        nameof(DayShift.Revenue),
        nameof(DayShift.Guests),
    ];

    private static readonly PropertyInfo[] Fields = typeof(DayShift)
        .GetProperties(BindingFlags.Public | BindingFlags.Instance)
        .Where(property => property.CanWrite && Owned.Contains(property.Name))
        .ToArray();

    /// <summary>Puts the save's edits onto the placement that is already there.</summary>
    public static void ApplyOnto(DayShift existing, DayShift incoming)
    {
        foreach (PropertyInfo property in Fields)
            property.SetValue(existing, property.GetValue(incoming));
    }

    /// <summary>
    /// Pairs a save's placements against the ones already on the day.
    ///
    /// Returns what the day should hold afterwards and what has been taken off
    /// it. Matching is by template, one for one, so the same template placed
    /// twice on a day pairs up rather than collapsing.
    /// </summary>
    public static (List<DayShift> Keep, List<DayShift> Drop) Merge(
        IEnumerable<DayShift>? existing,
        IEnumerable<DayShift>? incoming)
    {
        List<DayShift> spare = existing?.ToList() ?? [];
        List<DayShift> keep = [];

        foreach (DayShift arriving in incoming ?? [])
        {
            DayShift? already = spare.FirstOrDefault(row => row.ShiftId == arriving.ShiftId);

            if (already is null)
            {
                keep.Add(arriving);
                continue;
            }

            spare.Remove(already);
            ApplyOnto(already, arriving);
            keep.Add(already);
        }

        return (keep, spare);
    }

    /// <summary>The fields this carries, so a test can hold it to them.</summary>
    public static IReadOnlyList<PropertyInfo> Editable => Fields;

    /// <summary>
    /// The fields it deliberately does not carry: the terms of the shift, plus
    /// whether the crew can see it, which a different screen owns entirely.
    /// </summary>
    public static IReadOnlyList<string> Terms => typeof(DayShift)
        .GetProperties(BindingFlags.Public | BindingFlags.Instance)
        .Where(property => property.CanWrite
            && !Owned.Contains(property.Name)
            && property.Name is not (nameof(DayShift.Id)
                or nameof(DayShift.DayId)
                or nameof(DayShift.Day)
                or nameof(DayShift.ShiftId)
                or nameof(DayShift.Shift)))
        .Select(property => property.Name)
        .ToArray();
}
