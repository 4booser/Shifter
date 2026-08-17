using System.Reflection;
using Shifter.Application.Features.Teams.DTOs;
using Shifter.Infrastructure.Repositories.Interfaces;

using Xunit;

namespace Shifter.Tests;

/// <summary>
/// The shared rota shows when people work. It must never show what they earn.
/// These tests read the shape of the contract rather than a sample payload:
/// a field that does not exist cannot leak, and a future edit that adds one
/// fails here instead of in production.
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

    public static TheoryData<Type> RotaTypes =>
    [
        typeof(RotaDto),
        typeof(RotaEntryDto),
        typeof(RotaMemberDto),
        typeof(RotaDayDto),
        typeof(RotaRow),
    ];

    [Theory]
    [MemberData(nameof(RotaTypes))]
    public void NothingOnTheRotaIsNamedAfterMoney(Type type)
    {
        string[] offenders = type
            .GetProperties(BindingFlags.Public | BindingFlags.Instance)
            .Select(property => property.Name)
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
    /// amount has crept in.
    /// </summary>
    [Theory]
    [MemberData(nameof(RotaTypes))]
    public void NothingOnTheRotaIsADecimal(Type type)
    {
        string[] offenders = type
            .GetProperties(BindingFlags.Public | BindingFlags.Instance)
            .Where(property =>
                property.PropertyType == typeof(decimal)
                || property.PropertyType == typeof(decimal?))
            .Select(property => property.Name)
            .ToArray();

        Assert.True(
            offenders.Length == 0,
            $"{type.Name} carries a decimal ({string.Join(", ", offenders)}) on the shared rota.");
    }

    [Fact]
    public void ARotaEntryCarriesOnlyTheFactsOfTheShift()
    {
        string[] fields = typeof(RotaEntryDto)
            .GetProperties(BindingFlags.Public | BindingFlags.Instance)
            .Select(property => property.Name)
            .OrderBy(name => name)
            .ToArray();

        // Pinned deliberately: widening this list is a decision about what the
        // whole team gets to see, and it should take a conscious edit here.
        // needs_cover was added knowingly — it is a fact about the schedule,
        // like the start time, and asking the team to take a shift is the
        // whole reason the shared rota exists.
        Assert.Equal(
            [
                "colour", "date", "end_time", "hours", "member_id",
                "needs_cover", "shift_name", "start_time", "symbol", "worked",
            ],
            fields);
    }

    [Fact]
    public void AMemberSummaryReportsHoursAndDaysOnly()
    {
        string[] fields = typeof(RotaMemberDto)
            .GetProperties(BindingFlags.Public | BindingFlags.Instance)
            .Select(property => property.Name)
            .OrderBy(name => name)
            .ToArray();

        Assert.Equal(
            ["cover_requests", "days", "display_name", "hours", "is_you", "member_id"],
            fields);
    }

    /// <summary>
    /// The per-day view names who is free so a gap can be filled. Names only —
    /// nothing about what any of them would be paid for taking it.
    /// </summary>
    [Fact]
    public void ADayReportsCoverageAndSpareHandsOnly()
    {
        string[] fields = typeof(RotaDayDto)
            .GetProperties(BindingFlags.Public | BindingFlags.Instance)
            .Select(property => property.Name)
            .OrderBy(name => name)
            .ToArray();

        Assert.Equal(["cover_requests", "date", "free", "hours", "on_shift"], fields);
    }
}
