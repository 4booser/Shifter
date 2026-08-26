using System.Security.Cryptography;
using MediatR;

using Microsoft.EntityFrameworkCore;
using Shifter.Application.Common.Exceptions;
using Shifter.Application.Features.Teams.DTOs;
using Shifter.Domain.Entities;
using Shifter.Infrastructure.Repositories.Interfaces;

namespace Shifter.Application.Features.Teams.Services;

public static class TeamRules
{
    public const int NameMaxLength = 60;
    public const int MaxMembers = 60;

    /// <summary>
    /// The colours a crew is drawn in, in the order they are handed out.
    ///
    /// Validated for colour blindness rather than chosen by eye: no adjacent
    /// pair separates by less than ΔE 10 under deuteranopia, and every one of
    /// them clears 3:1 against both the light and the dark surface. The order
    /// is the assignment order and must not be shuffled — re-stepping it would
    /// change the CVD separation the list was picked for.
    ///
    /// A name is always drawn beside the colour, so nobody is ever identified
    /// by colour alone; past seven people it wraps, and anyone can pick their
    /// own instead.
    /// </summary>
    public static readonly string[] MemberColours =
    [
        "#6366F1", "#D97706", "#0891B2", "#DB2777", "#65A30D", "#A855F7", "#059669",
    ];

    /// <summary>
    /// The first colour nobody in the team is using, so a crew of four is four
    /// obviously different colours rather than whatever the counter landed on.
    /// </summary>
    public static string NextColour(Team team)
    {
        HashSet<string> taken = (team.Members ?? [])
            .Select(member => member.Colour)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        return MemberColours.FirstOrDefault(colour => !taken.Contains(colour))
            ?? MemberColours[(team.Members?.Count ?? 0) % MemberColours.Length];
    }

    /// <summary>
    /// Six-digit hex only. The value is written into a style attribute on every
    /// other member's screen, so anything else does not get stored.
    /// </summary>
    public static string RequireColour(string? value)
    {
        string colour = (value ?? string.Empty).Trim();

        bool valid = colour.Length == 7
            && colour[0] == '#'
            && colour[1..].All(Uri.IsHexDigit);

        if (!valid) throw new ValidationException("Colour must be a hex value like #6366F1.");

        return colour.ToUpperInvariant();
    }

    /// <summary>
    /// Six characters from an alphabet with no 0/O or 1/I/L in it: the code
    /// gets read aloud across a bar, and those are the pairs people mishear.
    /// </summary>
    private const string CodeAlphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

    public static string NewCode()
    {
        char[] code = new char[6];

        for (int index = 0; index < code.Length; index += 1)
            code[index] = CodeAlphabet[RandomNumberGenerator.GetInt32(CodeAlphabet.Length)];

        return new string(code);
    }

    public static string RequireName(string? value, string field)
    {
        if (string.IsNullOrWhiteSpace(value))
            throw new ValidationException($"{field} is empty.");

        if (value.Trim().Length > NameMaxLength)
            throw new ValidationException($"{field} must be at most {NameMaxLength} characters.");

        return value.Trim();
    }

    public static TeamDto ToDto(Team team, int userId)
    {
        bool owner = team.OwnerUserId == userId;

        return new TeamDto(
            team.Id,
            team.Name,
            owner,
            team.Members?.Count ?? 0,
            // Handing the code to every member would make removing someone
            // pointless: they could walk straight back in.
            owner ? team.InviteCode : null);
    }
}

public class ListTeamsHandler : IRequestHandler<ListTeamsDto, TeamDto[]>
{
    private readonly ITeamRepository _teams;

    public ListTeamsHandler(ITeamRepository teams) => _teams = teams;

    public async Task<TeamDto[]> Handle(ListTeamsDto request, CancellationToken ct)
    {
        Team[] teams = await _teams.GetForUserAsync(request.UserId, ct);

        return teams.Select(team => TeamRules.ToDto(team, request.UserId)).ToArray();
    }
}

public class CreateTeamHandler : IRequestHandler<CreateTeamDto, TeamDto>
{
    private readonly ITeamRepository _teams;
    private readonly IUserQuery _users;

    public CreateTeamHandler(ITeamRepository teams, IUserQuery users)
    {
        _teams = teams;
        _users = users;
    }

    public async Task<TeamDto> Handle(CreateTeamDto request, CancellationToken ct)
    {
        User user = await _users.GetByIdAsync(request.UserId, ct)
            ?? throw new UnauthorizedException("This account no longer exists.");

        string code = await UniqueCodeAsync(_teams, ct);

        Team team = new Team
        {
            Name = TeamRules.RequireName(request.name, "Team name"),
            OwnerUserId = request.UserId,
            InviteCode = code,
        };

        await _teams.AddAsync(team, ct);

        // The creator is a member as well as the owner; a rota with nobody on
        // it is not a useful starting point.
        await _teams.AddMemberAsync(
            new TeamMember
            {
                TeamId = team.Id,
                UserId = request.UserId,
                DisplayName = user.FirstName,
                Colour = TeamRules.MemberColours[0],
            },
            ct);

        // Re-read rather than append in memory: the context is tracking this
        // team, so adding the member already filled its collection, and adding
        // it a second time by hand counted everyone twice.
        Team saved = await _teams.GetForMemberAsync(team.Id, request.UserId, ct) ?? team;

        return TeamRules.ToDto(saved, request.UserId);
    }

    /// <summary>Retries on the rare collision rather than failing the request.</summary>
    internal static async Task<string> UniqueCodeAsync(ITeamRepository teams, CancellationToken ct)
    {
        for (int attempt = 0; attempt < 10; attempt += 1)
        {
            string candidate = TeamRules.NewCode();

            if (!await teams.CodeExistsAsync(candidate, ct)) return candidate;
        }

        throw new ConflictException("Could not allocate an invite code. Try again.");
    }
}

public class JoinTeamHandler : IRequestHandler<JoinTeamDto, TeamDto>
{
    private readonly ITeamRepository _teams;
    private readonly IUserQuery _users;

    public JoinTeamHandler(ITeamRepository teams, IUserQuery users)
    {
        _teams = teams;
        _users = users;
    }

    public async Task<TeamDto> Handle(JoinTeamDto request, CancellationToken ct)
    {
        string code = (request.invite_code ?? string.Empty).Trim().ToUpperInvariant();

        if (code.Length == 0) throw new ValidationException("Invite code is empty.");

        Team team = await _teams.GetByCodeAsync(code, ct)
            ?? throw new NotFoundException("No team with that code.");

        if (team.Members?.Any(member => member.UserId == request.UserId) == true)
            return TeamRules.ToDto(team, request.UserId);

        if ((team.Members?.Count ?? 0) >= TeamRules.MaxMembers)
            throw new ConflictException("This team is full.");

        User user = await _users.GetByIdAsync(request.UserId, ct)
            ?? throw new UnauthorizedException("This account no longer exists.");

        string name = string.IsNullOrWhiteSpace(request.display_name)
            ? user.FirstName
            : TeamRules.RequireName(request.display_name, "Display name");

        await _teams.AddMemberAsync(
            new TeamMember
            {
                TeamId = team.Id,
                UserId = request.UserId,
                DisplayName = name,
                Colour = TeamRules.NextColour(team),
            },
            ct);

        Team joined = await _teams.GetForMemberAsync(team.Id, request.UserId, ct) ?? team;

        return TeamRules.ToDto(joined, request.UserId);
    }
}

public class LeaveTeamHandler : IRequestHandler<LeaveTeamDto, Unit>
{
    private readonly ITeamRepository _teams;

    public LeaveTeamHandler(ITeamRepository teams) => _teams = teams;

    public async Task<Unit> Handle(LeaveTeamDto request, CancellationToken ct)
    {
        Team team = await _teams.GetForMemberAsync(request.TeamId, request.UserId, ct)
            ?? throw new NotFoundException("Team does not exist.");

        // The owner leaving takes the team with it: an ownerless rota nobody
        // can administer is worse than none.
        if (team.OwnerUserId == request.UserId)
        {
            await _teams.RemoveTeamAsync(team, ct);

            return Unit.Value;
        }

        TeamMember member = team.Members!.First(entry => entry.UserId == request.UserId);

        await _teams.RemoveMemberAsync(member, ct);

        return Unit.Value;
    }
}

public class RotateCodeHandler : IRequestHandler<RotateCodeDto, TeamDto>
{
    private readonly ITeamRepository _teams;

    public RotateCodeHandler(ITeamRepository teams) => _teams = teams;

    public async Task<TeamDto> Handle(RotateCodeDto request, CancellationToken ct)
    {
        Team team = await _teams.GetForMemberAsync(request.TeamId, request.UserId, ct)
            ?? throw new NotFoundException("Team does not exist.");

        if (team.OwnerUserId != request.UserId)
            throw new ForbiddenException("Only the owner can change the code.");

        team.InviteCode = await CreateTeamHandler.UniqueCodeAsync(_teams, ct);

        await _teams.SaveAsync(ct);

        return TeamRules.ToDto(team, request.UserId);
    }
}

/// <summary>
/// Your own membership: the name and colour the crew sees you as, and how much
/// of yourself you show them. Nobody can edit anyone else's — not even the
/// owner, who can remove a person but not decide what they share.
/// </summary>
public class UpdateMembershipHandler : IRequestHandler<UpdateMembershipDto, MembershipDto>
{
    private readonly ITeamRepository _teams;

    public UpdateMembershipHandler(ITeamRepository teams) => _teams = teams;

    public async Task<MembershipDto> Handle(UpdateMembershipDto request, CancellationToken ct)
    {
        Team team = await _teams.GetForMemberAsync(request.TeamId, request.UserId, ct)
            ?? throw new NotFoundException("Team does not exist.");

        TeamMember member = team.Members!.First(entry => entry.UserId == request.UserId);

        // Absent means "leave it alone". A screen that only changes the colour
        // sends only the colour, and a stale client cannot silently reset the
        // sharing switches by omitting them.
        if (request.display_name is not null)
            member.DisplayName = TeamRules.RequireName(request.display_name, "Display name");

        if (request.colour is not null)
            member.Colour = TeamRules.RequireColour(request.colour);

        if (request.share_earnings is not null)
            member.ShareEarnings = request.share_earnings.Value;

        if (request.private_by_default is not null)
            member.PrivateByDefault = request.private_by_default.Value;

        await _teams.SaveAsync(ct);

        return new MembershipDto(
            member.Id,
            member.DisplayName,
            member.Colour,
            member.ShareEarnings,
            member.PrivateByDefault);
    }
}

/// <summary>
/// Marking one shift shown or hidden on every rota it appears on. Not scoped to
/// a team on purpose: someone in two crews who hides a shift means it, and
/// asking them to hide it once per team is how it ends up published by mistake.
/// </summary>
public class SetShiftVisibilityHandler : IRequestHandler<SetShiftVisibilityDto, Unit>
{
    private readonly ITeamRepository _teams;

    public SetShiftVisibilityHandler(ITeamRepository teams) => _teams = teams;

    public async Task<Unit> Handle(SetShiftVisibilityDto request, CancellationToken ct)
    {
        DayShift shift = await _teams.GetOwnShiftAsync(request.DayShiftId, request.UserId, ct)
            ?? throw new NotFoundException("That shift does not exist.");

        shift.TeamVisible = request.visible;

        await _teams.SaveAsync(ct);

        return Unit.Value;
    }
}

public class GetRotaHandler : IRequestHandler<GetRotaDto, RotaDto>
{
    private const int MaxRangeDays = 120;

    private readonly ITeamRepository _teams;
    private readonly Shifter.Infrastructure.Persistence.DbContexts.ShifterDbContext? _db;

    // The context is optional the same way the audit writer is: unit tests
    // build this handler on a fake repository and simply get no outings.
    public GetRotaHandler(
        ITeamRepository teams,
        Shifter.Infrastructure.Persistence.DbContexts.ShifterDbContext? db = null)
    {
        _teams = teams;
        _db = db;
    }

    public async Task<RotaDto> Handle(GetRotaDto request, CancellationToken ct)
    {
        if (request.From > request.To)
            throw new ValidationException("Range start must not be after its end.");

        if (request.To.DayNumber - request.From.DayNumber > MaxRangeDays)
            throw new ValidationException($"At most {MaxRangeDays} days at a time.");

        // Membership is enforced by the lookup itself: a non-member gets null
        // here and never reaches the rota.
        Team team = await _teams.GetForMemberAsync(request.TeamId, request.UserId, ct)
            ?? throw new NotFoundException("Team does not exist.");

        TeamMember[] members = (team.Members ?? []).OrderBy(m => m.DisplayName).ToArray();

        RotaRow[] rows = await _teams.GetRotaAsync(
            members.Select(member => member.UserId).ToArray(),
            request.UserId,
            // You are in the sharing set whether or not you share: it is your
            // own money, and a rota that hid your totals from you would be a
            // strange thing to open.
            members
                .Where(member => member.ShareEarnings || member.UserId == request.UserId)
                .Select(member => member.UserId)
                .ToArray(),
            members
                .Where(member => member.PrivateByDefault)
                .Select(member => member.UserId)
                .ToArray(),
            request.From,
            request.To,
            ct);

        Dictionary<int, TeamMember> byUser = members.ToDictionary(member => member.UserId);

        CoverOffer[] offers = await _teams.GetOffersAsync(
            team.Id, request.From, request.To, ct);

        // Grouped once rather than filtered per entry: a fortnight of a busy
        // rota is hundreds of entries and the scan would repeat for each.
        Dictionary<int, List<CoverOffer>> offersByShift = offers
            .Where(offer => offer.DayShiftId is not null)
            .GroupBy(offer => offer.DayShiftId!.Value)
            .ToDictionary(group => group.Key, group => group.ToList());

        RotaEntryDto[] entries = rows
            .Where(row => byUser.ContainsKey(row.UserId))
            .Select(row =>
            {
                double hours = PaidHours(row);

                List<CoverOffer> raised = offersByShift.GetValueOrDefault(row.DayShiftId, []);

                bool mine = row.UserId == request.UserId;

                return new RotaEntryDto(
                    row.DayShiftId,
                    byUser[row.UserId].Id,
                    row.Date,
                    row.ShiftName,
                    row.Symbol,
                    row.Colour,
                    byUser[row.UserId].Colour,
                    row.StartTime.ToString("HH:mm"),
                    row.EndTime.ToString("HH:mm"),
                    Math.Round(hours, 2),
                    row.Worked,
                    row.NeedsCover,
                    mine,
                    // What you are keeping back is your business; what somebody
                    // else is keeping back is theirs, and they are not sent it.
                    mine ? Visibility(row.TeamVisible) : null,
                    row.Pay is null ? null : Math.Round(row.Pay.Value, 2),
                    raised
                        .Select(offer => CoverRules.ToDto(
                            offer,
                            byUser.GetValueOrDefault(offer.ClaimantUserId),
                            request.UserId))
                        .ToArray());
            })
            .OrderBy(entry => entry.date)
            .ThenBy(entry => entry.start_time)
            .ToArray();

        RotaMemberDto[] summary = members
            .Select(member =>
            {
                RotaEntryDto[] theirs = entries
                    .Where(entry => entry.member_id == member.Id)
                    .ToArray();

                bool you = member.UserId == request.UserId;

                return new RotaMemberDto(
                    member.Id,
                    member.DisplayName,
                    you,
                    member.Colour,
                    Math.Round(theirs.Sum(entry => entry.hours), 2),
                    theirs.Select(entry => entry.date).Distinct().Count(),
                    theirs.Count(entry => entry.needs_cover),
                    member.ShareEarnings,
                    // Null and zero are different answers: null is "not shared",
                    // zero is "shared, and it was a quiet month".
                    theirs.Any(entry => entry.pay is not null)
                        ? Math.Round(theirs.Sum(entry => entry.pay ?? 0m), 2)
                        : null,
                    you
                        ? theirs.Count(entry => Hidden(entry.visibility, member.PrivateByDefault))
                        : null,
                    you ? member.PrivateByDefault : null);
            })
            .ToArray();

        // A colleague who took a gig that week is a colleague who cannot
        // cover your Saturday: the rota is exactly where that matters.
        var userIds = members.Select(member => member.UserId).ToArray();
        var memberByUser = members.ToDictionary(member => member.UserId, member => member.Id);
        var outings = _db is null ? [] : await _db.GigResponses
            .AsNoTracking()
            .Where(reply => reply.AcceptedAt != null
                && userIds.Contains(reply.UserId)
                && reply.Listing!.Date >= request.From
                && reply.Listing.Date <= request.To
                && reply.Listing.Status != Domain.Entities.GigStatus.Closed)
            .Select(reply => new
            {
                reply.UserId,
                reply.Listing!.Date,
                reply.Listing.Employment,
                reply.Listing.StartTime,
                reply.Listing.EndTime,
            })
            .ToArrayAsync(ct);

        RotaGigDto[] gigOutings = outings
            .Select(outing => new RotaGigDto(
                memberByUser[outing.UserId],
                outing.Date.ToString("yyyy-MM-dd"),
                outing.Employment == Domain.Entities.GigEmployment.Permanent ? "permanent" : "freelance",
                outing.StartTime.ToString("HH:mm"),
                outing.EndTime.ToString("HH:mm")))
            .ToArray();

        return new RotaDto(team.Id, team.Name, summary, entries, Days(request, summary, entries), gigOutings);
    }

    /// <summary>
    /// Day by day across the whole team: how many are on, who is free, and how
    /// many shifts are looking for cover.
    ///
    /// "Who is free" is the question a rota is actually opened to answer —
    /// somebody dropped out, and the alternative is ringing round the group.
    /// It names only people, never anything about them.
    /// </summary>
    private static RotaDayDto[] Days(
        GetRotaDto request,
        RotaMemberDto[] members,
        RotaEntryDto[] entries)
    {
        List<RotaDayDto> days = [];

        for (DateOnly date = request.From; date <= request.To; date = date.AddDays(1))
        {
            RotaEntryDto[] onDate = entries.Where(entry => entry.date == date).ToArray();
            int[] working = onDate.Select(entry => entry.member_id).Distinct().ToArray();

            days.Add(new RotaDayDto(
                date,
                working.Length,
                members
                    .Where(member => !working.Contains(member.member_id))
                    .Select(member => member.display_name)
                    .ToArray(),
                Math.Round(onDate.Sum(entry => entry.hours), 2),
                onDate.Count(entry => entry.needs_cover),
                onDate.Any(entry => entry.pay is not null)
                    ? Math.Round(onDate.Sum(entry => entry.pay ?? 0m), 2)
                    : null));
        }

        return [.. days];
    }

    /// <summary>The three states as a word, because true/false/null is not one.</summary>
    private static string Visibility(bool? visible) => visible switch
    {
        true => "shown",
        false => "hidden",
        _ => "default",
    };

    /// <summary>Whether the crew is missing this one, default included.</summary>
    private static bool Hidden(string? visibility, bool privateByDefault) => visibility switch
    {
        "hidden" => true,
        "default" => privateByDefault,
        _ => false,
    };

    /// <summary>
    /// The same arithmetic DayShift uses, applied to the projected row: clock
    /// time wrapping past midnight, less the unpaid break.
    /// </summary>
    private static double PaidHours(RotaRow row)
    {
        TimeSpan span = row.EndTime - row.StartTime;

        if (span < TimeSpan.Zero) span += TimeSpan.FromDays(1);

        TimeSpan paid = span - TimeSpan.FromMinutes(row.BreakMinutes);

        return paid < TimeSpan.Zero ? 0 : paid.TotalHours;
    }
}
