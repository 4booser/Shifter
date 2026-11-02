using Shifter.Domain.Entities;

using Xunit;

namespace Shifter.Tests;

/// <summary>Saving a day must not reprice it.</summary>
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

    // ==== A save that never saw the close ====

    private static readonly DateTime Closed = new(2026, 11, 3, 0, 1, 0, DateTimeKind.Utc);

    /// <summary>What the close job leaves behind on a 09:00 to 17:00 shift.</summary>
    private static DayShift ClosedByTheServer()
    {
        DayShift placed = DayShift.From(Template(100m), worked: true);

        placed.ActualStart = new TimeOnly(9, 0);
        placed.ActualEnd = new TimeOnly(17, 0);
        placed.AutoClosedAtUtc = Closed;

        return placed;
    }

    /// <summary>What a client sends when it last looked before the close.</summary>
    private static DayShift Unseen(bool worked)
        => DayShift.From(Template(100m), worked);

    [Fact]
    public void AStalePlannedSaveCannotUndoTheClose()
    {
        DayShift placed = ClosedByTheServer();

        DayShiftEdit.ApplyOnto(placed, Unseen(worked: false));

        Assert.True(placed.Worked);
        Assert.Equal(new TimeOnly(9, 0), placed.ActualStart);
        Assert.Equal(new TimeOnly(17, 0), placed.ActualEnd);
        Assert.Equal(Closed, placed.AutoClosedAtUtc);
    }

    [Fact]
    public void TheRestOfAStaleSaveStillGoesThrough()
    {
        DayShift placed = ClosedByTheServer();
        DayShift stale = Unseen(worked: false);

        stale.Revenue = 9_000m;
        stale.Guests = 40;
        stale.BreakMinutes = 30;
        stale.Zone = ShiftZone.Bar;

        DayShiftEdit.ApplyOnto(placed, stale);

        Assert.Equal(9_000m, placed.Revenue);
        Assert.Equal(40, placed.Guests);
        Assert.Equal(30, placed.BreakMinutes);
        Assert.Equal(ShiftZone.Bar, placed.Zone);
    }

    [Fact]
    public void AStaleAskForCoverDoesNotLandOnAShiftAlreadyWorked()
    {
        DayShift placed = ClosedByTheServer();
        DayShift stale = Unseen(worked: false);

        stale.NeedsCover = true;

        DayShiftEdit.ApplyOnto(placed, stale);

        Assert.False(placed.NeedsCover);
    }

    [Fact]
    public void AStaleWorkedSaveBringsTheRealTimesOfALiveClock()
    {
        DayShift placed = ClosedByTheServer();
        DayShift finishing = Unseen(worked: true);

        finishing.ActualStart = new TimeOnly(9, 20);
        finishing.ActualEnd = new TimeOnly(18, 5);

        DayShiftEdit.ApplyOnto(placed, finishing);

        Assert.True(placed.Worked);
        Assert.Equal(new TimeOnly(9, 20), placed.ActualStart);
        Assert.Equal(new TimeOnly(18, 5), placed.ActualEnd);
        Assert.Equal(Closed, placed.AutoClosedAtUtc);
    }

    [Fact]
    public void AStaleWorkedSaveWithNoTimesKeepsTheOnesTheCloseWrote()
    {
        DayShift placed = ClosedByTheServer();

        DayShiftEdit.ApplyOnto(placed, Unseen(worked: true));

        Assert.Equal(new TimeOnly(9, 0), placed.ActualStart);
        Assert.Equal(new TimeOnly(17, 0), placed.ActualEnd);
    }

    [Fact]
    public void AStaleWorkedSaveWithOneTimeKeepsTheOtherTheCloseWrote()
    {
        DayShift placed = ClosedByTheServer();
        DayShift finishing = Unseen(worked: true);

        finishing.ActualEnd = new TimeOnly(18, 5);

        DayShiftEdit.ApplyOnto(placed, finishing);

        Assert.Equal(new TimeOnly(9, 0), placed.ActualStart);
        Assert.Equal(new TimeOnly(18, 5), placed.ActualEnd);
    }

    [Fact]
    public void AStaleSaveOnAShiftToldToStayPlannedLeavesItPlanned()
    {
        // Stamped by a Discard, so the stamp is there and nothing was closed.
        DayShift placed = DayShift.From(Template(100m), worked: false);

        placed.AutoClosedAtUtc = Closed;

        DayShiftEdit.ApplyOnto(placed, Unseen(worked: false));

        Assert.False(placed.Worked);
        Assert.Null(placed.ActualStart);
        Assert.Equal(Closed, placed.AutoClosedAtUtc);
    }

    [Fact]
    public void AClientThatSawTheCloseCanFlipItBackAndTheStampStays()
    {
        DayShift placed = ClosedByTheServer();
        DayShift seen = DayShift.From(Template(100m), worked: false);

        seen.AutoClosedAtUtc = Closed.AddHours(1);

        DayShiftEdit.ApplyOnto(placed, seen);

        Assert.False(placed.Worked);
        Assert.Null(placed.ActualStart);
        Assert.Null(placed.ActualEnd);

        // The first word stands, which is what keeps the job from closing it
        // again, and a later echo does not rewrite when that was.
        Assert.Equal(Closed, placed.AutoClosedAtUtc);
    }

    [Fact]
    public void AnEchoOnAnUnclosedShiftStampsIt()
    {
        // This is the Discard: planned, no edges, and the job told to stay out.
        DayShift placed = DayShift.From(Template(100m), worked: false);

        placed.ActualStart = new TimeOnly(9, 10);

        DayShift discard = DayShift.From(Template(100m), worked: false);

        discard.AutoClosedAtUtc = Closed;

        DayShiftEdit.ApplyOnto(placed, discard);

        Assert.False(placed.Worked);
        Assert.Null(placed.ActualStart);
        Assert.Equal(Closed, placed.AutoClosedAtUtc);
    }

    [Fact]
    public void AnOrdinarySaveOnAnUntouchedShiftIsNotStale()
    {
        DayShift placed = DayShift.From(Template(100m), worked: true);

        placed.ActualStart = new TimeOnly(9, 10);
        placed.ActualEnd = new TimeOnly(17, 10);

        DayShiftEdit.ApplyOnto(placed, DayShift.From(Template(100m), worked: false));

        Assert.False(placed.Worked);
        Assert.Null(placed.ActualStart);
        Assert.Null(placed.AutoClosedAtUtc);
    }

    [Fact]
    public void WhatASaveWouldLeaveIsWorkedOutWithoutTouchingTheRow()
    {
        DayShift placed = ClosedByTheServer();

        placed.StartTime = new TimeOnly(10, 0);
        placed.EndTime = new TimeOnly(15, 0);

        // A save that never saw the close leaves its edges where they are.
        DayShift after = DayShiftEdit.AfterSave(placed, Unseen(worked: false));

        Assert.True(after.Worked);
        Assert.Equal(new TimeOnly(10, 0), after.StartTime);
        Assert.Equal(new TimeOnly(15, 0), after.EndTime);
        Assert.Equal(new TimeOnly(9, 0), after.ActualStart);
        Assert.Equal(new TimeOnly(17, 0), after.ActualEnd);

        // One that answers it clears them.
        DayShift seen = Unseen(worked: false);

        seen.AutoClosedAtUtc = Closed;

        DayShift answered = DayShiftEdit.AfterSave(placed, seen);

        Assert.False(answered.Worked);
        Assert.Null(answered.ActualEnd);

        // A look ahead, not the save: the row is as it was.
        Assert.True(placed.Worked);
        Assert.Equal(new TimeOnly(9, 0), placed.ActualStart);
        Assert.Equal(new TimeOnly(17, 0), placed.ActualEnd);
        Assert.Equal(Closed, placed.AutoClosedAtUtc);
    }

    [Fact]
    public void TheCloseStampIsAccountedForRatherThanLeftOverAsATerm()
        => Assert.Contains(DayShiftEdit.Editable, property => property.Name == nameof(DayShift.AutoClosedAtUtc));

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
