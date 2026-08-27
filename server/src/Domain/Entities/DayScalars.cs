using System.Reflection;

namespace Shifter.Domain.Entities;

/// <summary>
/// Copies the plain values of a day from a save onto the row already in the
/// database.
///
/// This exists because the same bug happened three times: a field was added to
/// <see cref="Day"/>, the save built it correctly, the response showed it back,
/// and it was gone by the next reload — because nobody remembered to add a line
/// to the upsert. Cash tips went that way, then deductions, then the tip pool
/// and the fine's reason. Reflection is used deliberately rather than a list of
/// assignments: a list is exactly the thing that was being forgotten.
/// </summary>
public static class DayScalars
{
    /// <summary>
    /// What identifies the row rather than describing it. These belong to the
    /// existing record and must survive the copy, or a save would move a day to
    /// another date, or to another person.
    /// </summary>
    private static readonly HashSet<string> Identity =
        [nameof(Day.Id), nameof(Day.UserId), nameof(Day.Date)];

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

    /// <summary>
    /// Anything that points at another row rather than holding a value: an
    /// owned collection, or a reference to another entity. Copying one of
    /// those would hand EF a second instance of something it is already
    /// tracking. Tested against a shape rather than "is enumerable", because a
    /// string is enumerable too and dropping every string on the day would
    /// silently lose the note and the colour — which is what the first version
    /// of this did.
    /// </summary>
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
