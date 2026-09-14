using System.Reflection;

namespace Shifter.Domain.Entities;

/// <summary>Applies a saved day's edits onto a placement that is already on that day, without touching the terms it was…</summary>
public static class DayShiftEdit
{
    /// <summary>What a saved day is allowed to change about a placement already on it.</summary>
    private static readonly string[] Owned =
    [
        nameof(DayShift.Worked),
        nameof(DayShift.NeedsCover),
        nameof(DayShift.ActualStart),
        nameof(DayShift.ActualEnd),
        nameof(DayShift.BreakMinutes),
        nameof(DayShift.Revenue),
        nameof(DayShift.Guests),
        nameof(DayShift.Zone),
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

    /// <summary>Pairs a save's placements against the ones already on the day.</summary>
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

    /// <summary>The fields it deliberately does not carry: the terms of the shift, plus whether the crew can see it, which a…</summary>
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
