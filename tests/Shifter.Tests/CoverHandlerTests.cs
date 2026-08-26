using Shifter.Application.Common.Exceptions;
using Shifter.Application.Features.Teams.DTOs;
using Shifter.Application.Features.Teams.Services;
using Shifter.Domain.Entities;
using Shifter.Infrastructure.Repositories.Interfaces;

using Xunit;

namespace Shifter.Tests;

/// <summary>
/// Handing a shift to somebody else. Almost everything here is a question of
/// who is allowed to do what: the person offering is not the person who decides,
/// and a shift can only be given away once.
/// </summary>
/// <summary>Push that goes nowhere; the tests are about the swap itself.</summary>
file sealed class SilentPush : Shifter.Application.Features.Push.IPushNotifier
{
    public Task NotifyAsync(
        int userId,
        Func<string, (string Title, string Body)> text,
        string url,
        CancellationToken ct) => Task.CompletedTask;
}

public class CoverHandlerTests
{
    private const int Owner = 1;
    private const int Claimant = 2;
    private const int Stranger = 3;
    private const int TeamId = 10;
    private const int ShiftId = 100;

    private readonly FakeTeamRepository _teams = new();

    public CoverHandlerTests()
    {
        _teams.Teams.Add(new Team
        {
            Id = TeamId,
            Name = "Bar",
            OwnerUserId = Owner,
            InviteCode = "ABC234",
            Members =
            [
                new TeamMember
                {
                    Id = 1, TeamId = TeamId, UserId = Owner,
                    DisplayName = "Sam", Colour = "#6366F1",
                },
                new TeamMember
                {
                    Id = 2, TeamId = TeamId, UserId = Claimant,
                    DisplayName = "Alex", Colour = "#D97706",
                },
            ],
        });

        _teams.Shifts.Add(new CoverShift(
            ShiftId,
            Owner,
            DateOnly.Parse("2026-03-10"),
            "Evening",
            new TimeOnly(17, 0),
            new TimeOnly(23, 0),
            NeedsCover: true,
            Worked: false));
    }

    private Task<RotaOfferDto> Offer(int userId = Claimant, int shiftId = ShiftId)
        => new OfferCoverHandler(_teams, new SilentPush()).Handle(
            new OfferCoverDto(userId, TeamId, shiftId), CancellationToken.None);

    private Task<AcceptedCoverDto> Accept(int userId, int offerId = 1)
        => new AcceptCoverHandler(_teams, new SilentPush()).Handle(
            new AcceptCoverDto(userId, TeamId, offerId), CancellationToken.None);

    private Task Withdraw(int userId, int offerId = 1)
        => new WithdrawCoverHandler(_teams).Handle(
            new WithdrawCoverDto(userId, TeamId, offerId), CancellationToken.None);

    // ==== Offering ====

    [Fact]
    public async Task AMemberCanOfferToTakeAShiftPutUpForCover()
    {
        RotaOfferDto offer = await Offer();

        Assert.Equal("Alex", offer.display_name);
        Assert.True(offer.is_you);
        Assert.False(offer.accepted);
    }

    [Fact]
    public async Task TheOfferCopiesTheShiftRatherThanPointingAtItAlone()
    {
        await Offer();

        CoverOffer stored = Assert.Single(_teams.Offers);

        // Accepting deletes the placement, and an offer that only referenced it
        // would disappear with it, taking the record of who took what.
        Assert.Equal("Evening", stored.ShiftName);
        Assert.Equal(DateOnly.Parse("2026-03-10"), stored.Date);
    }

    [Fact]
    public async Task NobodyCanOfferToTakeTheirOwnShift()
    {
        await Assert.ThrowsAsync<ValidationException>(() => Offer(Owner));
    }

    [Fact]
    public async Task AShiftNobodyAskedAboutCannotBeTaken()
    {
        _teams.Shifts.Clear();
        _teams.Shifts.Add(new CoverShift(
            ShiftId, Owner, DateOnly.Parse("2026-03-10"), "Evening",
            new TimeOnly(17, 0), new TimeOnly(23, 0), NeedsCover: false, Worked: false));

        await Assert.ThrowsAsync<ValidationException>(() => Offer());
    }

    [Fact]
    public async Task AShiftAlreadyWorkedCannotBeTaken()
    {
        _teams.Shifts.Clear();
        _teams.Shifts.Add(new CoverShift(
            ShiftId, Owner, DateOnly.Parse("2026-03-10"), "Evening",
            new TimeOnly(17, 0), new TimeOnly(23, 0), NeedsCover: true, Worked: true));

        await Assert.ThrowsAsync<ValidationException>(() => Offer());
    }

    [Fact]
    public async Task OfferingTwiceSaysNothingNew()
    {
        await Offer();

        await Assert.ThrowsAsync<ConflictException>(() => Offer());
    }

    [Fact]
    public async Task SomebodyOutsideTheTeamSeesNoTeamAtAll()
    {
        await Assert.ThrowsAsync<NotFoundException>(() => Offer(Stranger));
    }

    // ==== Accepting ====

    [Fact]
    public async Task OnlyTheOwnerCanHandTheShiftOver()
    {
        await Offer();

        await Assert.ThrowsAsync<ForbiddenException>(() => Accept(Claimant));
    }

    [Fact]
    public async Task AcceptingRemovesTheShiftFromTheOwnersCalendar()
    {
        await Offer();

        AcceptedCoverDto result = await Accept(Owner);

        Assert.Equal("Alex", result.taken_by);
        Assert.Equal("17:00", result.start_time);
        Assert.Contains(ShiftId, _teams.DeletedShifts);
    }

    [Fact]
    public async Task TheOfferSurvivesAcceptanceSoBothSidesSeeWhatWasAgreed()
    {
        await Offer();
        await Accept(Owner);

        CoverOffer stored = Assert.Single(_teams.Offers);

        Assert.True(stored.Accepted);
        Assert.Null(stored.DayShiftId);
    }

    [Fact]
    public async Task AShiftCannotBeHandedOverTwice()
    {
        await Offer();
        await Accept(Owner);

        await Assert.ThrowsAsync<ConflictException>(() => Accept(Owner));
    }

    [Fact]
    public async Task AcceptingOneOfferDropsTheOthersOnThatShift()
    {
        _teams.Teams[0].Members!.Add(
            new TeamMember
            {
                Id = 3, TeamId = TeamId, UserId = 4,
                DisplayName = "Robin", Colour = "#0891B2",
            });

        await Offer();
        await Offer(4);

        await Accept(Owner);

        // The shift is gone; an offer to take something that no longer exists
        // is only confusing.
        Assert.Single(_teams.Offers);
    }

    [Fact]
    public async Task AnOfferFromSomebodyWhoHasLeftIsDroppedRatherThanAccepted()
    {
        await Offer();

        _teams.Teams[0].Members!.RemoveAll(member => member.UserId == Claimant);

        await Assert.ThrowsAsync<ValidationException>(() => Accept(Owner));
        Assert.Empty(_teams.Offers);
    }

    // ==== Withdrawing ====

    [Fact]
    public async Task ThePersonWhoOfferedCanTakeItBack()
    {
        await Offer();
        await Withdraw(Claimant);

        Assert.Empty(_teams.Offers);
    }

    [Fact]
    public async Task NobodyElseCanWithdrawSomebodysOffer()
    {
        await Offer();

        await Assert.ThrowsAsync<ForbiddenException>(() => Withdraw(Owner));
    }

    [Fact]
    public async Task AnOfferAlreadyAcceptedCannotBeTakenBack()
    {
        await Offer();
        await Accept(Owner);

        await Assert.ThrowsAsync<ValidationException>(() => Withdraw(Claimant));
    }
}
