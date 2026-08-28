using Shifter.Application.Features.Assistant;
using Shifter.Application.Features.business.DTOs;
using Shifter.Domain.Entities;

using Xunit;

namespace Shifter.Tests;

/// <summary>
/// The case for a raise, assembled out of somebody's own record.
///
/// People do not fail to ask because they lack nerve. They fail because when
/// the moment comes they have nothing but a feeling, and a feeling loses to
/// "business has been slow" every time. The honesty is the feature: a thin case
/// has to be reported as thin, because an app that talks somebody into a
/// conversation they will lose has done them harm.
/// </summary>
public class RaiseCaseTests
{
    private static readonly DateOnly Today = new(2026, 8, 28);

    private static LocationTotalDto Total(
        int id, string name, double hours, decimal earned, int days)
        => new LocationTotalDto(
            id, name, "#4488CC", hours, earned, days,
            0m, 0m, 0m, 0m, hours == 0 ? 0m : earned / (decimal)hours,
            0m, earned, 0m, string.Empty);

    private static Location Place(int id = 1, string name = "Бар")
        => new Location { Id = id, UserId = Build.UserId, Name = name };

    [Fact]
    public void ANewStarterIsToldToWait_AndWhy()
    {
        // Asking in the first weeks is asking to be told "later", and being
        // told that by an app beforehand is cheaper than being told it by a
        // manager.
        RaiseCaseDto answer = RaiseCase.Build(
            Place(), Total(1, "Бар", 60, 12_000m, 8), [], [], monthsHere: 1,
            coversTaken: 0, Today);

        Assert.False(answer.worth_asking);
        Assert.Null(answer.message);
        Assert.Contains("меньше", answer.weakness);
    }

    [Fact]
    public void OneFactIsNotACase()
    {
        // A single point loses to "business has been slow". Saying so is more
        // useful than handing over a message that will not survive the reply.
        RaiseCaseDto answer = RaiseCase.Build(
            Place(), Total(1, "Бар", 200, 40_000m, 25), [], [], monthsHere: 10,
            coversTaken: 0, Today);

        Assert.Single(answer.points);
        Assert.False(answer.worth_asking);
        Assert.NotNull(answer.weakness);
    }

    [Fact]
    public void TwoFactsAndSomeTimeServedMakeAConversation()
    {
        RaiseCaseDto answer = RaiseCase.Build(
            Place(),
            Total(1, "Бар", 400, 80_000m, 50),
            [Total(1, "Бар", 400, 80_000m, 50), Total(2, "Кафе", 100, 26_000m, 12)],
            [],
            monthsHere: 14,
            coversTaken: 3,
            Today);

        Assert.True(answer.worth_asking);
        Assert.Null(answer.weakness);
        Assert.NotNull(answer.message);
        Assert.Contains("ставки", answer.message);
    }

    [Fact]
    public void ThePlaceThatPaysLessThanYourOtherOneIsNamedAsSuch()
    {
        // Their own comparison, not a market figure: it is the only one they
        // can defend without arguing about somebody else's data.
        RaiseCaseDto answer = RaiseCase.Build(
            Place(),
            Total(1, "Бар", 400, 80_000m, 50),
            [Total(1, "Бар", 400, 80_000m, 50), Total(2, "Кафе", 100, 26_000m, 12)],
            [],
            monthsHere: 14,
            coversTaken: 0,
            Today);

        Assert.Contains(answer.points, point => point.Contains("ниже, чем в другом месте"));
    }

    [Fact]
    public void ASmallGapBetweenPlacesIsNotWorthSaying()
    {
        // Five percent is noise, and putting noise in front of a manager
        // spends the one conversation you get.
        RaiseCaseDto answer = RaiseCase.Build(
            Place(),
            Total(1, "Бар", 400, 80_000m, 50),
            [Total(1, "Бар", 400, 80_000m, 50), Total(2, "Кафе", 100, 21_000m, 12)],
            [],
            monthsHere: 14,
            coversTaken: 0,
            Today);

        Assert.DoesNotContain(answer.points, point => point.Contains("ниже, чем"));
    }

    [Fact]
    public void CoveringForOtherPeopleCounts()
    {
        RaiseCaseDto answer = RaiseCase.Build(
            Place(), Total(1, "Бар", 400, 80_000m, 50), [], [], monthsHere: 14,
            coversTaken: 4, Today);

        Assert.Contains(answer.points, point => point.Contains("4 смены за других"));
    }

    [Fact]
    public void TheDateOfTheLastRaiseIsUsedWhenThereIsOne()
    {
        RaiseDto raise = new RaiseDto(
            1, "Смена", "Бар", new DateOnly(2026, 1, 15), 180m, 200m, "hour", 4_000m, 225);

        RaiseCaseDto answer = RaiseCase.Build(
            Place(), Total(1, "Бар", 400, 80_000m, 50), [], [raise], monthsHere: 20,
            coversTaken: 3, Today);

        Assert.Equal(7, answer.months_since_raise);
        Assert.Contains(answer.points, point => point.Contains("15.01.2026"));
    }
}
