using Shifter.Domain.Entities;

using Xunit;

namespace Shifter.Tests;

/// <summary>
/// Saving a day must not reprice it.
///
/// A placement snapshots the terms it was made under — that is the whole
/// reason it is an entity rather than a join row. But every save used to
/// delete the placements and build new ones off the live template, so the
/// snapshot protected nothing: reprice a template in April, open a March day
/// to add a note, and March silently earned more. The raise vanished from the
/// rate history at the same moment, because that history is read out of these
/// very snapshots.
/// </summary>
public class DayShiftEditTests
{
    private static Shift Template(decimal rate, string start = "09:00", string end = "17:00")
        => new Shift
        {
            Id = 1,
            UserId = Build.UserId,
            Name = "Смена",
            SalaryPeriod = SalaryPeriod.Hour,
            SalaryAmount = rate,
            StartTime = TimeOnly.Parse(start),
            EndTime = TimeOnly.Parse(end),
        };

    [Fact]
    public void ADayResavedAfterARaiseKeepsWhatItWasPaid()
    {
        DayShift march = DayShift.From(Template(100m), worked: true);

        // April: the template is repriced, and the client resends March whole.
        DayShift resent = DayShift.From(Template(150m), worked: true);

        var (keep, drop) = DayShiftEdit.Merge([march], [resent]);

        Assert.Empty(drop);
        Assert.Equal(100m, Assert.Single(keep).SalaryAmount);
        Assert.Equal(800m, keep[0].Pay);
    }

    [Fact]
    public void TheHoursItWasAgreedForSurviveToo()
    {
        DayShift placed = DayShift.From(Template(100m, "09:00", "17:00"), worked: true);
        DayShift resent = DayShift.From(Template(100m, "09:00", "21:00"), worked: true);

        var (keep, _) = DayShiftEdit.Merge([placed], [resent]);

        Assert.Equal(new TimeOnly(17, 0), keep[0].EndTime);
    }

    [Fact]
    public void WhatTheSaveActuallyOwnsStillGetsThrough()
    {
        DayShift placed = DayShift.From(Template(100m), worked: false);

        DayShift resent = DayShift.From(Template(150m), worked: true);
        resent.NeedsCover = false;
        resent.ActualStart = new TimeOnly(9, 30);
        resent.ActualEnd = new TimeOnly(18, 0);
        resent.BreakMinutes = 45;
        resent.Revenue = 12_000m;

        var (keep, _) = DayShiftEdit.Merge([placed], [resent]);
        DayShift after = Assert.Single(keep);

        Assert.True(after.Worked);
        Assert.Equal(new TimeOnly(9, 30), after.ActualStart);
        Assert.Equal(new TimeOnly(18, 0), after.ActualEnd);
        Assert.Equal(45, after.BreakMinutes);
        Assert.Equal(12_000m, after.Revenue);
        // …and the rate is still the one it was placed at.
        Assert.Equal(100m, after.SalaryAmount);
    }

    [Fact]
    public void AShiftHiddenFromTheCrewStaysHiddenAcrossASave()
    {
        // Visibility is owned by a different screen entirely. Rebuilding the
        // placement cleared it, so saving a day un-hid every shift on it.
        DayShift placed = DayShift.From(Template(100m), worked: true);
        placed.TeamVisible = false;

        var (keep, _) = DayShiftEdit.Merge([placed], [DayShift.From(Template(100m), worked: true)]);

        Assert.False(keep[0].TeamVisible);
    }

    [Fact]
    public void AShiftTakenOffTheDayIsReported()
    {
        DayShift one = DayShift.From(Template(100m), worked: true);
        DayShift two = DayShift.From(new Shift
        {
            Id = 2,
            UserId = Build.UserId,
            Name = "Вторая",
            SalaryPeriod = SalaryPeriod.Hour,
            SalaryAmount = 100m,
            StartTime = new TimeOnly(18, 0),
            EndTime = new TimeOnly(23, 0),
        }, worked: true);

        var (keep, drop) = DayShiftEdit.Merge([one, two], [DayShift.From(Template(100m), true)]);

        Assert.Single(keep);
        Assert.Equal(2, Assert.Single(drop).ShiftId);
    }

    [Fact]
    public void ANewPlacementComesInAtTodaysTerms()
    {
        // Nothing to protect: a shift placed now is agreed now.
        var (keep, _) = DayShiftEdit.Merge([], [DayShift.From(Template(150m), worked: true)]);

        Assert.Equal(150m, Assert.Single(keep).SalaryAmount);
    }

    [Fact]
    public void TheSameTemplateTwiceOnOneDayPairsUpOneForOne()
    {
        DayShift morning = DayShift.From(Template(100m), worked: true);
        DayShift evening = DayShift.From(Template(100m), worked: true);

        var (keep, drop) = DayShiftEdit.Merge(
            [morning, evening],
            [DayShift.From(Template(150m), true), DayShift.From(Template(150m), true)]);

        Assert.Equal(2, keep.Count);
        Assert.Empty(drop);
        Assert.All(keep, entry => Assert.Equal(100m, entry.SalaryAmount));
    }

    [Fact]
    public void TheTermsItRefusesToTouchAreNamed()
    {
        // Named rather than derived: the split is stated as "what the client
        // owns", so a field added later is protected by default — and this
        // test fails when somebody adds one, which is the point.
        Assert.Equal(
            new[]
            {
                nameof(DayShift.EndTime),
                nameof(DayShift.RevenuePercent),
                nameof(DayShift.SalaryAmount),
                nameof(DayShift.SalaryPeriod),
                nameof(DayShift.StartTime),
                nameof(DayShift.TeamVisible),
                nameof(DayShift.TipPoolPercent),
                nameof(DayShift.TipSource),
            }.Order(),
            DayShiftEdit.Terms.Order());
    }
}
