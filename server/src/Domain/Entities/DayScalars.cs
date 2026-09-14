using System.Reflection;

namespace Shifter.Domain.Entities;

/// <summary>Copies the plain values of a day from a save onto the row already in the database.</summary>
public static class DayScalars
{
    /// <summary>What identifies the row rather than describing it.</summary>
    private static readonly HashSet<string> Identity =
        [nameof(Day.Id), nameof(Day.UserId), nameof(Day.Date),
        // The version is the row's own history, not part of any save: the
        // incoming day always carries zero, and copying that zero would
        // reset the very counter the conflict check reads.
        nameof(Day.Version)];

    private static readonly PropertyInfo[] Copied = typeof(Day)
        .GetProperties(BindingFlags.Public | BindingFlags.Instance)
        // Shifts and sales are owned collections, replaced row by row rather
        // than assigned: EF tracks them, and handing it a new list would
        // orphan what it is already holding. They are excluded by shape —
        // a generic List<> — rather than by "is enumerable", because a string
        // is enumerable too, and testing for that quietly drops every piece of
        // text on the day, the note and the colour included.
        .Where(property => property.CanWrite
            && !Identity.Contains(property.Name)
            && !IsNavigation(property.PropertyType))
        .ToArray();

    /// <summary>Anything that points at another row rather than holding a value: an owned collection, or a reference to…</summary>
    private static bool IsNavigation(Type type)
        => (type.IsGenericType && type.GetGenericTypeDefinition() == typeof(List<>))
            || type.Namespace == typeof(Day).Namespace;

    /// <summary>Every scalar the save carries, by construction rather than by memory.</summary>
    public static void CopyOnto(Day existing, Day incoming)
    {
        foreach (PropertyInfo property in Copied)
            property.SetValue(existing, property.GetValue(incoming));
    }

    /// <summary>The properties this copies, so a test can hold it to that.</summary>
    public static IReadOnlyList<PropertyInfo> Fields => Copied;
}
