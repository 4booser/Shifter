using Shifter.Application.Features.business.DTOs;
using Shifter.Application.Features.business.Services;
using Shifter.Domain.Entities;

using Xunit;

namespace Shifter.Tests;

/// <summary>
/// Fines split by what caused them. Five broken glasses and one till shortfall
/// add up the same and mean completely different things — the first is the job,
/// the second is a question for somebody.
/// </summary>
public class DeductionReasonTests
{
    private static Day Cost(string date, decimal amount, string? reason)
        => new Day
        {
            UserId = Build.UserId,
            Date = DateOnly.Parse(date),
            Deductions = amount,
            DeductionReason = reason,
        };

    [Fact]
    public void FinesAreGroupedByCauseLargestFirst()
    {
        DeductionReasonDto[] split = DayHandler.ByReason([
            Cost("2026-03-01", 100m, "breakage"),
            Cost("2026-03-04", 900m, "shortfall"),
            Cost("2026-03-09", 200m, "breakage"),
        ]);

        Assert.Equal(2, split.Length);
        Assert.Equal("shortfall", split[0].reason);
        Assert.Equal(900m, split[0].amount);
        Assert.Equal(1, split[0].days);
        Assert.Equal("breakage", split[1].reason);
        Assert.Equal(300m, split[1].amount);
        Assert.Equal(2, split[1].days);
    }

    [Fact]
    public void ADayThatCostNothingIsNotAFine()
    {
        // Zero is an answer to "how much", not a fine worth naming.
        Assert.Empty(DayHandler.ByReason([Cost("2026-03-01", 0m, null)]));
    }

    [Fact]
    public void AFineWithNoReasonGivenIsStillCounted()
    {
        // Everything recorded before the reason existed lands here, and so does
        // everyone who could not be bothered. Dropping it would make the split
        // add up to less than the total on the same page.
        DeductionReasonDto[] split = DayHandler.ByReason([Cost("2026-03-01", 250m, null)]);

        Assert.Equal("unsaid", Assert.Single(split).reason);
        Assert.Equal(250m, split[0].amount);
    }
}
