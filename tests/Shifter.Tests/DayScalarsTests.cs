using Shifter.Domain.Entities;

using Xunit;

namespace Shifter.Tests;

/// <summary>
/// Saving a day that already exists must carry every value it holds. This has
/// gone wrong three separate times — cash tips, then deductions, then the tip
/// pool and the fine's reason — each in the same way: the number came back
/// correct in the response and was gone by the next reload, because a line was
/// missing from the upsert. These tests fail the moment a fourth one is added
/// without being carried.
/// </summary>
public class DayScalarsTests
{
    /// <summary>
    /// Named rather than derived, on purpose. The copy works out its own field
    /// list by reflection, so a test that also derives one would agree with it
    /// even when both are wrong — which is exactly what happened when "not a
    /// collection" was written as "not enumerable" and silently dropped every
    /// string on the day, the note and the colour included.
    /// </summary>
    private static readonly string[] Expected =
    [
        nameof(Day.Tips),
        nameof(Day.TipsCash),
        nameof(Day.TipPool),
        nameof(Day.Deductions),
        nameof(Day.DeductionReason),
        nameof(Day.Note),
        nameof(Day.Colour),
    ];

    [Fact]
    public void TheFieldsCarriedAreTheOnesADayActuallyHolds()
    {
        Assert.Equal(
            Expected.Order(),
            DayScalars.Fields.Select(field => field.Name).Order());
    }

    [Fact]
    public void EveryValueOnADayIsCarriedOntoTheRowThatAlreadyExists()
    {
        Day incoming = new Day
        {
            UserId = 7,
            Date = new DateOnly(2026, 3, 10),
            Tips = 500m,
            TipsCash = 200m,
            TipPool = 4_000m,
            Deductions = 900m,
            DeductionReason = "shortfall",
            Note = "the till was 900 down",
            Colour = "#FF5C7A",
        };

        Day existing = new Day { Id = 42, UserId = 7, Date = new DateOnly(2026, 3, 10) };

        DayScalars.CopyOnto(existing, incoming);

        foreach (var field in DayScalars.Fields)
        {
            Assert.Equal(field.GetValue(incoming), field.GetValue(existing));

            // A field left at its default proves nothing: it would match even
            // if the copy did nothing at all. Every value above is deliberately
            // non-default, so an unset one means the test stopped covering it.
            Assert.NotNull(field.GetValue(incoming));
        }
    }

    [Fact]
    public void WhoseDayItIsAndWhichDayItIsAreNotOverwritten()
    {
        // The save says what the day contains, not where it lives. Copying the
        // identity across would let one save move a day to another date — or,
        // far worse, onto another person's calendar.
        Day existing = new Day { Id = 42, UserId = 7, Date = new DateOnly(2026, 3, 10) };

        DayScalars.CopyOnto(existing, new Day { UserId = 99, Date = new DateOnly(1999, 1, 1) });

        Assert.Equal(42, existing.Id);
        Assert.Equal(7, existing.UserId);
        Assert.Equal(new DateOnly(2026, 3, 10), existing.Date);
    }

    [Fact]
    public void TheShiftsAndSalesAreLeftToTheRepositoryToReplace()
    {
        // They are owned collections that EF is already tracking; assigning a
        // new list here would orphan what it holds. The upsert replaces them
        // row by row, so the copy must not touch them.
        Day existing = new Day
        {
            Date = new DateOnly(2026, 3, 10),
            Shifts = [],
            Sales = [],
        };

        DayScalars.CopyOnto(existing, new Day { Date = new DateOnly(2026, 3, 10) });

        Assert.NotNull(existing.Shifts);
        Assert.NotNull(existing.Sales);
    }
}
