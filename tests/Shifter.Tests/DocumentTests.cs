using Shifter.Application.Features.business.Services;
using Shifter.Domain.Entities;

using Xunit;

namespace Shifter.Tests;

/// <summary>
/// The papers without which somebody is not allowed on shift.
///
/// An expired медкнижка is not a fine — it is being turned away from a shift
/// you were counting on, and people remember it on the day it is needed, which
/// is the one day it cannot be fixed.
/// </summary>
public class DocumentTests
{
    private static readonly DateOnly Today = new(2026, 6, 1);

    private static WorkDocument Paper(string expires, string name = "Медкнижка")
        => new WorkDocument
        {
            UserId = Build.UserId,
            Kind = "medical",
            Name = name,
            ExpiresOn = DateOnly.Parse(expires),
        };

    [Fact]
    public void APaperThatRanOutYesterdayIsNotTheSameAsOneRunningOutSoon()
    {
        // Four states rather than a flag: "gone" and "going" have different
        // answers, and the first one costs a shift tomorrow.
        Assert.Equal("expired", DocumentRules.StateOf(Paper("2026-05-31"), Today));
        Assert.Equal("urgent", DocumentRules.StateOf(Paper("2026-06-05"), Today));
        Assert.Equal("soon", DocumentRules.StateOf(Paper("2026-06-25"), Today));
        Assert.Equal("fine", DocumentRules.StateOf(Paper("2026-09-01"), Today));
    }

    [Fact]
    public void TheDayItExpiresItStillCounts()
    {
        // A document is valid through its expiry date, not up to it. Getting
        // this backwards would send somebody home from a shift they could have
        // worked.
        Assert.Equal("urgent", DocumentRules.StateOf(Paper("2026-06-01"), Today));
        Assert.Equal(0, Paper("2026-06-01").DaysLeft(Today));
    }

    [Fact]
    public void AMonthIsTheWarningBecauseThatIsHowLongTheClinicTakes()
    {
        Assert.Equal("soon", DocumentRules.StateOf(Paper("2026-07-01"), Today));
        Assert.Equal("fine", DocumentRules.StateOf(Paper("2026-07-02"), Today));
    }

    [Fact]
    public void OnlyThePressingOnesAreShown_SoonestFirst()
    {
        WorkDocument[] pressing = DocumentRules.Pressing(
            [
                Paper("2027-01-01", "Права"),
                Paper("2026-06-20", "Санминимум"),
                Paper("2026-05-20", "Медкнижка"),
            ],
            Today);

        Assert.Equal(["Медкнижка", "Санминимум"], pressing.Select(p => p.Name));
    }

    [Fact]
    public void NothingPressingIsAnEmptyList_NotAReassurance()
    {
        // The screen decides what to say about "everything is fine"; the rule
        // only reports what needs doing.
        Assert.Empty(DocumentRules.Pressing([Paper("2028-01-01")], Today));
    }

    [Fact]
    public void AKindNobodyRecognisesIsRecordedAsSomethingElse()
    {
        Assert.Equal("other", DocumentRules.ParseKind("дозвіл на роботу"));
        Assert.Equal("medical", DocumentRules.ParseKind("MEDICAL"));
    }
}
