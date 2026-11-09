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
        nameof(DayShift.AutoClosedAtUtc),
    ];

    private static readonly PropertyInfo[] Fields = typeof(DayShift)
        .GetProperties(BindingFlags.Public | BindingFlags.Instance)
        .Where(property => property.CanWrite && Owned.Contains(property.Name))
        .ToArray();

    /// <summary>Puts the save's edits onto the placement that is already there.</summary>
    public static void ApplyOnto(DayShift existing, DayShift incoming)
    {
        // A stamp the save does not echo: the server closed this shift after
        // the client last looked, so its worked flag and edges describe a
        // shift that had not been closed yet. Saving them as they came would
        // quietly undo the close on a panel nobody touched.
        bool stale = existing.AutoClosedAtUtc is not null && incoming.AutoClosedAtUtc is null;

        (bool worked, TimeOnly? start, TimeOnly? end, DateTime? stamp) = (
            existing.Worked,
            existing.ActualStart,
            existing.ActualEnd,
            existing.AutoClosedAtUtc);

        foreach (PropertyInfo property in Fields)
            property.SetValue(existing, property.GetValue(incoming));

        // Once said it stays said, or the job would close a shift somebody
        // flipped back the moment the next save came through.
        existing.AutoClosedAtUtc = stamp ?? incoming.AutoClosedAtUtc;

        if (!stale) return;

        if (incoming.Worked)
        {
            // A live clock finishing late has the real times, which beat the
            // plan the close filled in.
            existing.ActualStart = incoming.ActualStart ?? start;
            existing.ActualEnd = incoming.ActualEnd ?? end;

            return;
        }

        existing.Worked = worked;
        existing.ActualStart = start;
        existing.ActualEnd = end;

        // A shift already worked has nothing left to hand over.
        existing.NeedsCover = !worked && incoming.NeedsCover;
    }

    /// <summary>The placement as a save would leave it, worked out on a copy so the row itself stays as it is.</summary>
    public static DayShift AfterSave(DayShift existing, DayShift incoming)
    {
        DayShift after = new()
        {
            StartTime = existing.StartTime,
            EndTime = existing.EndTime,
            Worked = existing.Worked,
            ActualStart = existing.ActualStart,
            ActualEnd = existing.ActualEnd,
            AutoClosedAtUtc = existing.AutoClosedAtUtc,
        };

        ApplyOnto(after, incoming);

        return after;
    }

    /// <summary>The break a save leaves on a placement already on the day, under its place's rule.</summary>
    public static int BreakAfterSave(DayShift existing, DayShift incoming, Location? place)
    {
        DayShift after = AfterSave(existing, incoming);

        // Nothing the rule weighs has moved, so it has no new word on the row:
        // one added or raised since would otherwise reach back and take pay off
        // an old day the moment a tip was typed on it. Only what the row already
        // holds is defended, so a shorter break somebody timed can still come
        // down, as far as a rule the row is under allows.
        if (after.Duration == existing.Duration && (existing.Worked || !after.Worked))
            return Math.Max(after.BreakMinutes, Math.Min(existing.BreakMinutes, after.BreakUnder(place)));

        // The hours moved, or the shift has just been finished, and the rule's
        // minutes go with the hours that earned them. A save repeating the
        // row's break has said nothing about it: an unpaused clock sends the
        // echo. One naming another figure is somebody's and stands.
        if (after.BreakMinutes == existing.BreakMinutes)
            after.BreakMinutes = existing.OwnBreak(place);

        return after.BreakUnder(place);
    }

    /// <summary>Moves a placement still waiting to happen onto its template's new hours, reporting whether it moved.</summary>
    public static bool FollowHours(
        DayShift entry,
        DateOnly date,
        DateOnly today,
        Shift before,
        Shift after)
    {
        if (date < today
            || entry.Worked
            || entry.ActualStart is not null
            || entry.ActualEnd is not null
            || entry.AutoClosedAtUtc is not null)
            return false;

        // Sitting on anything but the old hours means somebody timed it on
        // purpose, a rota entry for one, and a template edit has no say there.
        if (before.HoursOn(date) != (entry.StartTime, entry.EndTime)) return false;

        (TimeOnly start, TimeOnly end) = after.HoursOn(date);

        if ((start, end) == (entry.StartTime, entry.EndTime)) return false;

        entry.StartTime = start;
        entry.EndTime = end;

        return true;
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
