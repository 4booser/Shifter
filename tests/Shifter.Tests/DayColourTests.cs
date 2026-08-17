using Shifter.Application.Common.Exceptions;
using Shifter.Application.Features.business.DTOs;
using Shifter.Application.Features.business.Services;
using Shifter.Domain.Entities;

using Xunit;

namespace Shifter.Tests;

/// <summary>
/// The colour a person puts on a day by hand. It carries no meaning the totals
/// care about, which is exactly why it needs guarding: nothing downstream would
/// notice a malformed value until it reached a stylesheet.
/// </summary>
public class DayColourTests
{
    private readonly FakeShifterQuery _query = new();
    private readonly FakeShifterCommand _command = new();
    private readonly DayHandler _handler;

    public DayColourTests()
    {
        _handler = new DayHandler(_command, _query);
    }

    private static DaySaveDto Save(string? colour)
        => new DaySaveDto(null, null, null, null, null, null, colour);

    private Task<DayDto> SaveDay(string? colour)
        => _handler.SaveAsync(
            Save(colour), Build.UserId, DateOnly.Parse("2026-03-10"), CancellationToken.None);

    [Fact]
    public async Task AColourIsKeptOnTheDay()
    {
        DayDto saved = await SaveDay("#FF5C7A");

        Assert.Equal("#FF5C7A", saved.colour);
    }

    [Fact]
    public async Task ShorthandIsNormalisedToUpperCase()
    {
        DayDto saved = await SaveDay("#ff5c7a");

        // Stored one way so two days set to the same colour compare equal.
        Assert.Equal("#FF5C7A", saved.colour);
    }

    [Fact]
    public async Task NoColourLeavesTheDayUncoloured()
    {
        DayDto saved = await SaveDay(null);

        Assert.Null(saved.colour);
    }

    [Fact]
    public async Task AnEmptyStringClearsRatherThanStoresBlank()
    {
        DayDto saved = await SaveDay("   ");

        Assert.Null(saved.colour);
    }

    [Fact]
    public async Task SomethingThatIsNotAColourIsRejected()
    {
        await Assert.ThrowsAsync<ValidationException>(() => SaveDay("hot pink"));
    }

    [Fact]
    public async Task AColourReachesTheRepositoryRatherThanOnlyTheResponse()
    {
        await SaveDay("#22C55E");

        Day written = Assert.Single(_command.Saved);

        Assert.Equal("#22C55E", written.Colour);
    }

    [Fact]
    public async Task TheRangeReportsTheColourItStored()
    {
        _query.Days.Add(new Day
        {
            UserId = Build.UserId,
            Date = DateOnly.Parse("2026-03-10"),
            Colour = "#22C55E"
        });

        DaysDto range = await _handler.ListAsync(
            Build.UserId,
            DateOnly.Parse("2026-03-01"),
            DateOnly.Parse("2026-03-31"),
            CancellationToken.None);

        Assert.Equal("#22C55E", Assert.Single(range.days).colour);
    }
}
