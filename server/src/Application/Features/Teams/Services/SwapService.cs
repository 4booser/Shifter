using Microsoft.EntityFrameworkCore;

using Shifter.Application.Common.Exceptions;
using Shifter.Application.Features.Push;
using Shifter.Application.Features.Teams.DTOs;
using Shifter.Domain.Entities;
using Shifter.Infrastructure.Persistence.DbContexts;

namespace Shifter.Application.Features.Teams.Services;

/// <summary>
/// Swaps: two shifts traded between two people who both said yes. A cover
/// hands a shift one way and needs one agreement; a swap moves two and needs
/// both, so it lives apart rather than being bolted onto covers.
///
/// Accepting removes both placements and asks each person to place the one
/// they took — the same rule covers already follow, and for the same reason:
/// a shift is priced by whoever works it, so nobody's rate can be written
/// into somebody else's calendar.
/// </summary>
public sealed class SwapService
{
    private readonly ShifterDbContext _db;
    private readonly IPushNotifier _push;

    public SwapService(ShifterDbContext db, IPushNotifier push)
    {
        _db = db;
        _push = push;
    }

    public async Task<SwapDto[]> MineAsync(int userId, int teamId, CancellationToken ct)
    {
        await MemberAsync(teamId, userId, ct);

        var swaps = await _db.ShiftSwaps
            .AsNoTracking()
            .Where(swap => swap.TeamId == teamId
                && (swap.ProposerUserId == userId || swap.TargetUserId == userId))
            .OrderByDescending(swap => swap.CreatedAt)
            .Take(50)
            .ToArrayAsync(ct);

        var names = await NamesAsync(teamId, ct);

        return swaps.Select(swap => ToDto(swap, userId, names)).ToArray();
    }

    public async Task<SwapDto> ProposeAsync(int userId, int teamId, SwapProposeDto request, CancellationToken ct)
    {
        if (request is null)
            throw new ValidationException("Nothing to swap.");

        var team = await MemberAsync(teamId, userId, ct);

        var (mine, mineDay) = await PlacementAsync(request.my_day_shift_id, ct);
        var (theirs, theirDay) = await PlacementAsync(request.their_day_shift_id, ct);

        if (mineDay.UserId != userId)
            throw new ForbiddenException("That shift is not yours to trade.");

        var targetUserId = theirDay.UserId;

        if (targetUserId == userId)
            throw new ValidationException("Both shifts are yours — that is a move, not a swap.");

        if ((team.Members ?? []).All(member => member.UserId != targetUserId))
            throw new ValidationException("That person is not in the team.");

        // The shift being asked for has to be one the caller can actually see
        // on the rota. Without this, hiding a shift from the crew stops
        // working the moment somebody walks the ids: the proposal succeeds and
        // hands its name and hours straight back in the reply.
        if (!Visible(theirs, team, targetUserId))
            throw new NotFoundException("That shift does not exist.");

        // A shift already promised elsewhere cannot be promised again.
        var busy = await _db.ShiftSwaps.AnyAsync(
            swap => swap.Status == SwapStatus.Pending
                && (swap.ProposerDayShiftId == mine.Id
                    || swap.TargetDayShiftId == mine.Id
                    || swap.ProposerDayShiftId == theirs.Id
                    || swap.TargetDayShiftId == theirs.Id),
            ct);

        if (busy) throw new ConflictException("One of those shifts is already in a pending swap.");

        var swap = new ShiftSwap
        {
            TeamId = teamId,
            ProposerUserId = userId,
            TargetUserId = targetUserId,
            ProposerDayShiftId = mine.Id,
            TargetDayShiftId = theirs.Id,
            ProposerDate = mineDay.Date,
            ProposerShiftName = mine.Shift?.Name ?? "Смена",
            ProposerStart = mine.StartTime,
            ProposerEnd = mine.EndTime,
            TargetDate = theirDay.Date,
            TargetShiftName = theirs.Shift?.Name ?? "Смена",
            TargetStart = theirs.StartTime,
            TargetEnd = theirs.EndTime,
            Note = CleanNote(request.note),
        };

        _db.ShiftSwaps.Add(swap);
        await _db.SaveChangesAsync(ct);

        var names = await NamesAsync(teamId, ct);

        await _push.NotifyAsync(
            targetUserId,
            language => language switch
            {
                "ru" => ("Предлагают обмен", $"{names.GetValueOrDefault(userId, "Коллега")}: ваша {swap.TargetDate:dd.MM} за их {swap.ProposerDate:dd.MM}."),
                "uk" => ("Пропонують обмін", $"{names.GetValueOrDefault(userId, "Колега")}: ваша {swap.TargetDate:dd.MM} за їхню {swap.ProposerDate:dd.MM}."),
                _ => ("A swap is offered", $"{names.GetValueOrDefault(userId, "A colleague")}: your {swap.TargetDate:dd.MM} for their {swap.ProposerDate:dd.MM}."),
            },
            "/schedule",
            ct);

        return ToDto(swap, userId, names);
    }

    /// <summary>The target's yes: both placements go, both people are asked to place the other's.</summary>
    public async Task<SwapDto> AcceptAsync(int userId, int teamId, int swapId, CancellationToken ct)
    {
        await MemberAsync(teamId, userId, ct);

        var swap = await Pending(teamId, swapId, ct);

        if (swap.TargetUserId != userId)
            throw new ForbiddenException("Only the person asked can accept a swap.");

        swap.Status = SwapStatus.Accepted;
        swap.RespondedAt = DateTime.UtcNow;

        // Both placements leave their calendars in one write; each person is
        // then asked to place what they took, at their own rate.
        var ids = new[] { swap.ProposerDayShiftId, swap.TargetDayShiftId }
            .Where(id => id is not null)
            .Select(id => id!.Value)
            .ToArray();

        swap.ProposerDayShiftId = null;
        swap.TargetDayShiftId = null;

        await _db.SaveChangesAsync(ct);

        if (ids.Length > 0)
            await _db.DayShifts.Where(entry => ids.Contains(entry.Id)).ExecuteDeleteAsync(ct);

        await _push.NotifyAsync(
            swap.ProposerUserId,
            language => language switch
            {
                "ru" => ("Обмен принят 🤝", $"Ваша {swap.ProposerDate:dd.MM} ушла, поставьте себе {swap.TargetDate:dd.MM} «{swap.TargetShiftName}»."),
                "uk" => ("Обмін прийнято 🤝", $"Ваша {swap.ProposerDate:dd.MM} пішла, поставте собі {swap.TargetDate:dd.MM} «{swap.TargetShiftName}»."),
                _ => ("Swap accepted 🤝", $"Your {swap.ProposerDate:dd.MM} is gone; place {swap.TargetDate:dd.MM} “{swap.TargetShiftName}”."),
            },
            "/dashboard",
            ct);

        await _push.NotifyAsync(
            swap.TargetUserId,
            language => language switch
            {
                "ru" => ("Обмен закрыт 🤝", $"Поставьте себе {swap.ProposerDate:dd.MM} «{swap.ProposerShiftName}»."),
                "uk" => ("Обмін закрито 🤝", $"Поставте собі {swap.ProposerDate:dd.MM} «{swap.ProposerShiftName}»."),
                _ => ("Swap done 🤝", $"Place {swap.ProposerDate:dd.MM} “{swap.ProposerShiftName}” on your calendar."),
            },
            "/dashboard",
            ct);

        return ToDto(swap, userId, await NamesAsync(teamId, ct));
    }

    /// <summary>The target says no, or the proposer takes it back — same row, different word.</summary>
    public async Task<SwapDto> WithdrawAsync(int userId, int teamId, int swapId, CancellationToken ct)
    {
        await MemberAsync(teamId, userId, ct);

        var swap = await Pending(teamId, swapId, ct);

        if (swap.TargetUserId != userId && swap.ProposerUserId != userId)
            throw new ForbiddenException("That swap is not yours.");

        swap.Status = swap.TargetUserId == userId ? SwapStatus.Declined : SwapStatus.Cancelled;
        swap.RespondedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync(ct);

        if (swap.Status == SwapStatus.Declined)
        {
            await _push.NotifyAsync(
                swap.ProposerUserId,
                language => language switch
                {
                    "ru" => ("Обмен отклонён", $"{swap.TargetDate:dd.MM} остаётся у них."),
                    "uk" => ("Обмін відхилено", $"{swap.TargetDate:dd.MM} лишається в них."),
                    _ => ("Swap declined", $"{swap.TargetDate:dd.MM} stays with them."),
                },
                "/schedule",
                ct);
        }

        return ToDto(swap, userId, await NamesAsync(teamId, ct));
    }

    private async Task<Team> MemberAsync(int teamId, int userId, CancellationToken ct)
    {
        var team = await _db.Teams
            .Include(row => row.Members)
            .FirstOrDefaultAsync(row => row.Id == teamId, ct)
            ?? throw new NotFoundException("Team does not exist.");

        if ((team.Members ?? []).All(member => member.UserId != userId))
            throw new NotFoundException("Team does not exist.");

        return team;
    }

    private async Task<ShiftSwap> Pending(int teamId, int swapId, CancellationToken ct)
    {
        var swap = await _db.ShiftSwaps.FirstOrDefaultAsync(row => row.Id == swapId && row.TeamId == teamId, ct)
            ?? throw new NotFoundException("Swap does not exist.");

        if (swap.Status != SwapStatus.Pending)
            throw new ConflictException("That swap has already been answered.");

        return swap;
    }

    /// <summary>
    /// The placement and the day it sits on. The day is fetched by its own
    /// id rather than through the navigation: the graph does not always
    /// arrive populated here, and a swap that guesses whose shift it is
    /// would be a swap that trades the wrong person's Friday.
    /// </summary>
    private static bool Visible(DayShift placement, Team team, int ownerUserId)
    {
        var owner = (team.Members ?? []).FirstOrDefault(member => member.UserId == ownerUserId);

        return owner is not null
            && RotaVisibility.Allows(placement.TeamVisible, owner.PrivateByDefault);
    }

    private async Task<(DayShift Placement, Day Day)> PlacementAsync(int dayShiftId, CancellationToken ct)
    {
        var placement = await _db.DayShifts
            .Include(entry => entry.Shift)
            .FirstOrDefaultAsync(entry => entry.Id == dayShiftId, ct)
            ?? throw new NotFoundException("That shift does not exist.");

        var day = await _db.Days.FirstOrDefaultAsync(row => row.Id == placement.DayId, ct)
            ?? throw new NotFoundException("That shift does not exist.");

        return (placement, day);
    }

    private static string? CleanNote(string? note)
    {
        var cleaned = note?.Trim();

        if (string.IsNullOrEmpty(cleaned)) return null;

        return cleaned.Length <= 200 ? cleaned : cleaned[..200];
    }

    private async Task<Dictionary<int, string>> NamesAsync(int teamId, CancellationToken ct)
        => await _db.TeamMembers
            .AsNoTracking()
            .Where(member => member.TeamId == teamId)
            .ToDictionaryAsync(member => member.UserId, member => member.DisplayName, ct);

    private static SwapDto ToDto(ShiftSwap swap, int userId, Dictionary<int, string> names) => new(
        swap.Id,
        swap.ProposerUserId == userId,
        names.GetValueOrDefault(swap.ProposerUserId, ""),
        names.GetValueOrDefault(swap.TargetUserId, ""),
        swap.ProposerDate.ToString("yyyy-MM-dd"),
        swap.ProposerShiftName,
        swap.ProposerStart.ToString("HH:mm"),
        swap.ProposerEnd.ToString("HH:mm"),
        swap.TargetDate.ToString("yyyy-MM-dd"),
        swap.TargetShiftName,
        swap.TargetStart.ToString("HH:mm"),
        swap.TargetEnd.ToString("HH:mm"),
        swap.Note,
        swap.Status switch
        {
            SwapStatus.Accepted => "accepted",
            SwapStatus.Declined => "declined",
            SwapStatus.Cancelled => "cancelled",
            _ => "pending",
        },
        swap.CreatedAt.ToString("O"));
}
