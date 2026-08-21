using MediatR;
using Shifter.Application.Common.Exceptions;
using Shifter.Application.Features.Teams.DTOs;
using Shifter.Domain.Entities;
using Shifter.Infrastructure.Repositories.Interfaces;

namespace Shifter.Application.Features.Teams.Services;

/// <summary>
/// The other half of a cover request. Someone could already raise a hand and
/// say "I need this taken"; nobody could answer. These three handlers are the
/// answer, the retraction of it, and the handover.
///
/// The handover deliberately does not place the shift on the other person's
/// calendar. It could copy the times across, but the rate travels with a
/// placement, and the rate is exactly what a team is not allowed to see about
/// its members. So the shift leaves the owner's calendar and the person who
/// took it puts it on their own, where their own terms apply.
/// </summary>
public static class CoverRules
{
    /// <summary>
    /// Members of the team the caller belongs to. Membership is the boundary
    /// for every operation here: a shift belonging to someone outside it is not
    /// refused, it is not found.
    /// </summary>
    public static async Task<(Team team, TeamMember caller, int[] userIds)> ContextAsync(
        ITeamRepository teams,
        int teamId,
        int userId,
        CancellationToken ct)
    {
        Team team = await teams.GetForMemberAsync(teamId, userId, ct)
            ?? throw new NotFoundException("Team does not exist.");

        List<TeamMember> members = team.Members ?? [];
        TeamMember caller = members.First(member => member.UserId == userId);

        return (team, caller, members.Select(member => member.UserId).ToArray());
    }

    public static RotaOfferDto ToDto(CoverOffer offer, TeamMember? claimant, int callerUserId)
        => new RotaOfferDto(
            offer.Id,
            claimant?.Id ?? 0,
            claimant?.DisplayName ?? string.Empty,
            offer.ClaimantUserId == callerUserId,
            offer.Accepted);
}

public class OfferCoverHandler : IRequestHandler<OfferCoverDto, RotaOfferDto>
{
    private readonly ITeamRepository _teams;

    public OfferCoverHandler(ITeamRepository teams) => _teams = teams;

    public async Task<RotaOfferDto> Handle(OfferCoverDto request, CancellationToken ct)
    {
        var (team, caller, userIds) =
            await CoverRules.ContextAsync(_teams, request.TeamId, request.UserId, ct);

        CoverShift shift = await _teams.GetCoverShiftAsync(request.DayShiftId, userIds, ct)
            ?? throw new NotFoundException("Shift does not exist.");

        if (shift.OwnerUserId == request.UserId)
            throw new ValidationException("You cannot take your own shift.");

        // Only shifts whose owner asked. Offering to take one nobody put up
        // would be a message they never invited.
        if (!shift.NeedsCover)
            throw new ValidationException("Nobody is looking to have this shift covered.");

        if (shift.Worked)
            throw new ValidationException("That shift has already been worked.");

        CoverOffer[] existing = await _teams.GetOffersForShiftAsync(shift.DayShiftId, ct);

        if (existing.Any(offer => offer.ClaimantUserId == request.UserId))
            throw new ConflictException("You have already offered to take this shift.");

        CoverOffer offer = new CoverOffer
        {
            TeamId = team.Id,
            OwnerUserId = shift.OwnerUserId,
            ClaimantUserId = request.UserId,
            DayShiftId = shift.DayShiftId,
            Date = shift.Date,
            ShiftName = shift.ShiftName,
            StartTime = shift.StartTime,
            EndTime = shift.EndTime
        };

        await _teams.AddOfferAsync(offer, ct);

        return CoverRules.ToDto(offer, caller, request.UserId);
    }
}

public class WithdrawCoverHandler : IRequestHandler<WithdrawCoverDto, Unit>
{
    private readonly ITeamRepository _teams;

    public WithdrawCoverHandler(ITeamRepository teams) => _teams = teams;

    public async Task<Unit> Handle(WithdrawCoverDto request, CancellationToken ct)
    {
        _ = await CoverRules.ContextAsync(_teams, request.TeamId, request.UserId, ct);

        CoverOffer offer = await _teams.GetOfferAsync(request.OfferId, request.TeamId, ct)
            ?? throw new NotFoundException("Offer does not exist.");

        // Only the person who made it. The owner declining is a different thing
        // and is not modelled: they simply do not accept.
        if (offer.ClaimantUserId != request.UserId)
            throw new ForbiddenException("That offer is not yours to withdraw.");

        if (offer.Accepted)
            throw new ValidationException("That shift has already been handed over.");

        await _teams.RemoveOfferAsync(offer, ct);

        return Unit.Value;
    }
}

public class AcceptCoverHandler : IRequestHandler<AcceptCoverDto, AcceptedCoverDto>
{
    private readonly ITeamRepository _teams;

    public AcceptCoverHandler(ITeamRepository teams) => _teams = teams;

    public async Task<AcceptedCoverDto> Handle(AcceptCoverDto request, CancellationToken ct)
    {
        var (team, _, _) =
            await CoverRules.ContextAsync(_teams, request.TeamId, request.UserId, ct);

        CoverOffer offer = await _teams.GetOfferAsync(request.OfferId, request.TeamId, ct)
            ?? throw new NotFoundException("Offer does not exist.");

        // Whose shift it is decides who may give it away.
        if (offer.OwnerUserId != request.UserId)
            throw new ForbiddenException("That shift is not yours to hand over.");

        if (offer.Accepted)
            throw new ConflictException("That shift has already been handed over.");

        TeamMember? claimant = (team.Members ?? [])
            .FirstOrDefault(member => member.UserId == offer.ClaimantUserId);

        // Someone who left the team between offering and being accepted is no
        // longer party to the rota, and their offer goes with them.
        if (claimant is null)
        {
            await _teams.RemoveOfferAsync(offer, ct);

            throw new ValidationException("That person has left the team.");
        }

        await _teams.AcceptOfferAsync(offer, ct);

        return new AcceptedCoverDto(
            offer.Date,
            offer.ShiftName,
            offer.StartTime.ToString("HH:mm"),
            offer.EndTime.ToString("HH:mm"),
            claimant.DisplayName);
    }
}
