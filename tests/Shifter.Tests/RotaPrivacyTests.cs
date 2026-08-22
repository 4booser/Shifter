using System.Reflection;
using Shifter.Application.Features.Teams.DTOs;
using Shifter.Infrastructure.Repositories.Interfaces;

using Xunit;

namespace Shifter.Tests;

/// <summary>
/// The shared rota shows when people work. What they earn is theirs to publish,
/// and reaches the rota only through the three fields named in
/// <see cref="Earnings"/> — every one of which is null unless its owner
/// switched sharing on for that team.
///
/// These tests read the shape of the contract rather than a sample payload: a
/// field that does not exist cannot leak, and a future edit that adds one fails
/// here instead of in production. The rule they enforce is not "no money on the
/// rota" — it is "no money except the little that was deliberately let in, and
/// never the rate, the tips or the sales behind it".
/// </summary>
public class RotaPrivacyTests
{
    /// <summary>Words that would mean money reached a screen it should not.</summary>
    private static readonly string[] Forbidden =
    [
        "pay", "paid", "earn", "salary", "wage", "rate", "amount", "money",
        "tip", "sale", "price", "deduction", "tax", "net", "gross", "holiday",
        "cost", "total", "percent", "currency", "goal", "payout",
    ];

    /// <summary>
    /// The whole of what a member can choose to publish: a total per shift, a
    /// total per person, a total per day, and the flag saying they agreed to.
    ///
    /// Deliberately short, and deliberately only totals. A rate would say what
    /// somebody is worth per hour rather than what one night came to, and the
    /// server does not read it for anyone. Adding to this list is a decision
    /// about what a whole crew gets to see about each other.
    /// </summary>
    private static readonly string[] Earnings = ["pay", "earned", "shares_earnings"];

    public static TheoryData<Type> RotaTypes =>
    [
        typeof(RotaDto),
        typeof(RotaEntryDto),
        typeof(RotaMemberDto),
        typeof(RotaDayDto),
        typeof(RotaRow),
        typeof(RotaOfferDto),
        typeof(CoverShift),
        typeof(AcceptedCoverDto),
    ];

    /// <summary>Types that may not mention money at all, opt-in or otherwise.</summary>
    public static TheoryData<Type> MoneylessTypes =>
    [
        typeof(RotaDto),
        typeof(RotaOfferDto),
        typeof(CoverShift),
        typeof(AcceptedCoverDto),
    ];

    private static string[] Fields(Type type) => type
        .GetProperties(BindingFlags.Public | BindingFlags.Instance)
        .Select(property => property.Name)
        .OrderBy(name => name)
        .ToArray();

    private static bool IsEarnings(string name) =>
        Earnings.Contains(name, StringComparer.OrdinalIgnoreCase);

    [Theory]
    [MemberData(nameof(RotaTypes))]
    public void NothingOnTheRotaIsNamedAfterMoneyExceptTheOptInTotals(Type type)
    {
        string[] offenders = Fields(type)
            .Where(name => !IsEarnings(name))
            .Where(name => Forbidden.Any(word =>
                name.Contains(word, StringComparison.OrdinalIgnoreCase)))
            .ToArray();

        Assert.True(
            offenders.Length == 0,
            $"{type.Name} exposes {string.Join(", ", offenders)} on the shared rota.");
    }

    /// <summary>
    /// Decimal is the type money is kept in throughout this codebase, so its
    /// presence anywhere on the rota is the strongest single signal that an
    /// amount has crept in. The opt-in totals are decimals by necessity; every
    /// other decimal is a mistake.
    /// </summary>
    [Theory]
    [MemberData(nameof(RotaTypes))]
    public void TheOnlyDecimalsOnTheRotaAreTheOptInTotals(Type type)
    {
        string[] offenders = type
            .GetProperties(BindingFlags.Public | BindingFlags.Instance)
            .Where(property =>
                property.PropertyType == typeof(decimal)
                || property.PropertyType == typeof(decimal?))
            .Select(property => property.Name)
            .Where(name => !IsEarnings(name))
            .ToArray();

        Assert.True(
            offenders.Length == 0,
            $"{type.Name} carries a decimal ({string.Join(", ", offenders)}) on the shared rota.");
    }

    /// <summary>
    /// Sharing is per shift and per person. A cover offer, a handover receipt
    /// and the rota envelope itself have no owner to have agreed to anything,
    /// so nothing about money belongs on them under any setting.
    /// </summary>
    [Theory]
    [MemberData(nameof(MoneylessTypes))]
    public void SomeTypesMayNotMentionMoneyAtAll(Type type)
    {
        string[] offenders = Fields(type)
            .Where(name => Forbidden.Any(word =>
                name.Contains(word, StringComparison.OrdinalIgnoreCase)))
            .ToArray();

        Assert.True(
            offenders.Length == 0,
            $"{type.Name} mentions {string.Join(", ", offenders)} and may not.");
    }

    /// <summary>
    /// Every opt-in total is nullable, because null is how "not shared" is
    /// said. A non-nullable decimal would have to carry zero instead, and zero
    /// is a real answer — a quiet month — not the absence of one.
    /// </summary>
    [Fact]
    public void EveryOptInTotalCanBeNull()
    {
        (Type Type, string Field)[] totals =
        [
            (typeof(RotaEntryDto), "pay"),
            (typeof(RotaMemberDto), "earned"),
            (typeof(RotaDayDto), "earned"),
            (typeof(RotaRow), "Pay"),
        ];

        foreach ((Type type, string field) in totals)
        {
            PropertyInfo property = type.GetProperty(field)!;

            Assert.True(
                Nullable.GetUnderlyingType(property.PropertyType) is not null,
                $"{type.Name}.{field} must be nullable so it can say 'not shared'.");
        }
    }

    [Fact]
    public void ARotaEntryCarriesOnlyTheFactsOfTheShift()
    {
        // Pinned deliberately: widening this list is a decision about what the
        // whole team gets to see, and it should take a conscious edit here.
        // needs_cover was added knowingly — it is a fact about the schedule,
        // like the start time, and asking the team to take a shift is the
        // whole reason the shared rota exists.
        //
        // day_shift_id, is_mine and offers were added for the same reason: an
        // offer has to name which shift it is for, the owner has to be told
        // which shifts are theirs to hand over, and the answers to a cover
        // request are as much a fact about the schedule as the request itself.
        //
        // member_colour is how a crew tells each other apart down a column.
        // visibility and pay are the two that carry a decision rather than a
        // fact: visibility is only ever populated on the caller's own shifts,
        // and pay only for people who agreed to publish it.
        Assert.Equal(
            [
                "colour", "date", "day_shift_id", "end_time", "hours", "is_mine",
                "member_colour", "member_id", "needs_cover", "offers", "pay",
                "shift_name", "start_time", "symbol", "visibility", "worked",
            ],
            Fields(typeof(RotaEntryDto)));
    }

    [Fact]
    public void AMemberSummaryReportsHoursDaysAndWhatTheyChoseToShare()
    {
        // hidden and private_by_default are about you and are sent to nobody
        // else; shares_earnings is about them and is what makes earned's null
        // readable — without it a closed book and an empty one look alike.
        Assert.Equal(
            [
                "colour", "cover_requests", "days", "display_name", "earned",
                "hidden", "hours", "is_you", "member_id", "private_by_default",
                "shares_earnings",
            ],
            Fields(typeof(RotaMemberDto)));
    }

    /// <summary>
    /// The per-day view names who is free so a gap can be filled. Names only —
    /// nothing about what any of them would be paid for taking it. Its one
    /// total is the sum across whoever opted in, and null when nobody has.
    /// </summary>
    [Fact]
    public void ADayReportsCoverageSpareHandsAndSharedTakings()
    {
        Assert.Equal(
            ["cover_requests", "date", "earned", "free", "hours", "on_shift"],
            Fields(typeof(RotaDayDto)));
    }

    /// <summary>
    /// The row the database hands back. It may carry a total but never the rate
    /// it came from: the multiplication happens in the repository and the rate
    /// does not leave it, so no widening of a DTO can reach one.
    /// </summary>
    [Fact]
    public void TheDatabaseRowCarriesNoRate()
    {
        Assert.Equal(
            [
                "BreakMinutes", "Colour", "Date", "DayShiftId", "EndTime",
                "NeedsCover", "Pay", "ShiftName", "StartTime", "Symbol",
                "TeamVisible", "UserId", "Worked",
            ],
            Fields(typeof(RotaRow)));
    }
}
