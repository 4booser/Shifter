using Shifter.Application.Features.Teams.DTOs;
using Shifter.Application.Features.Teams.Services;
using Shifter.Domain.Entities;

using Xunit;

namespace Shifter.Tests;

/// <summary>
/// Which people the rota handler classifies as sharing, and which as hiding by
/// default. The filtering those two lists drive is SQL and is verified against
/// a real database; the classification is a decision made here, and getting it
/// backwards would publish somebody's wages without them touching anything.
/// </summary>
public class RotaSharingTests
{
    private const int Caller = 1;
    private const int Sharer = 2;
    private const int Quiet = 3;
    private const int TeamId = 10;

    private readonly FakeTeamRepository _teams = new();

    public RotaSharingTests()
    {
        _teams.Teams.Add(new Team
        {
            Id = TeamId,
            Name = "Bar",
            OwnerUserId = Caller,
            InviteCode = "ABC234",
            Members =
            [
                new TeamMember
                {
                    Id = 1, TeamId = TeamId, UserId = Caller,
                    DisplayName = "Sam", Colour = "#6366F1",
                    ShareEarnings = false, PrivateByDefault = true,
                },
                new TeamMember
                {
                    Id = 2, TeamId = TeamId, UserId = Sharer,
                    DisplayName = "Alex", Colour = "#D97706",
                    ShareEarnings = true, PrivateByDefault = false,
                },
                new TeamMember
                {
                    Id = 3, TeamId = TeamId, UserId = Quiet,
                    DisplayName = "Robin", Colour = "#0891B2",
                    ShareEarnings = false, PrivateByDefault = false,
                },
            ],
        });
    }

    private async Task Load() => await new GetRotaHandler(_teams).Handle(
        new GetRotaDto(Caller, TeamId, new DateOnly(2026, 9, 1), new DateOnly(2026, 9, 30)),
        CancellationToken.None);

    /// <summary>
    /// You are in the sharing set whether or not you share, because it is your
    /// own money and a rota that hid your totals from you would be a strange
    /// thing to open. Everyone else has to have said yes.
    /// </summary>
    [Fact]
    public async Task PayIsReadForYouAndForWhoeverOptedIn()
    {
        await Load();

        Assert.Equal([Caller, Sharer], [.. _teams.LastSharingUserIds.Order()]);
    }

    [Fact]
    public async Task PayIsNotReadForSomebodyWhoHasNotOptedIn()
    {
        await Load();

        Assert.DoesNotContain(Quiet, _teams.LastSharingUserIds);
    }

    /// <summary>
    /// Switching sharing off has to take the person back out of the set — a
    /// flag read once and cached would keep publishing them.
    /// </summary>
    [Fact]
    public async Task TurningSharingOffClosesTheBooksAgain()
    {
        _teams.Teams[0].Members!.First(m => m.UserId == Sharer).ShareEarnings = false;

        await Load();

        Assert.Equal([Caller], _teams.LastSharingUserIds);
    }

    [Fact]
    public async Task OnlyThePeopleWhoHideByDefaultAreListedAsHiding()
    {
        await Load();

        Assert.Equal([Caller], _teams.LastPrivateUserIds);
    }
}
