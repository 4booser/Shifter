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
        => new DaySaveDto(null, null, null, null, null, null, null, colour: colour);

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

    // ==== Painting a stretch at once ====

    private Task<DayDto[]> Colour(params (string date, string? colour)[] days)
        => _handler.ColourAsync(
            new BulkColourDto(days
                .Select(entry => new DayColourDto(DateOnly.Parse(entry.date), entry.colour))
                .ToArray()),
            Build.UserId,
            CancellationToken.None);

    [Fact]
    public async Task AStretchIsColouredInOneCall()
    {
        DayDto[] painted = await Colour(
            ("2026-03-10", "#FF5C7A"),
            ("2026-03-11", "#FF5C7A"),
            ("2026-03-12", "#FF5C7A"));

        Assert.Equal(3, painted.Length);
        Assert.All(painted, day => Assert.Equal("#FF5C7A", day.colour));
    }

    [Fact]
    public async Task EachDayCanTakeItsOwnColour()
    {
        // A pattern that alternates is the reason this takes a value per date
        // rather than one colour and a list of days.
        DayDto[] painted = await Colour(
            ("2026-03-10", "#FF5C7A"),
            ("2026-03-11", "#22C55E"));

        Assert.Equal("#FF5C7A", painted[0].colour);
        Assert.Equal("#22C55E", painted[1].colour);
    }

    [Fact]
    public async Task ARepeatedDateTakesTheLastValueRatherThanFailing()
    {
        await Colour(("2026-03-10", "#FF5C7A"), ("2026-03-10", "#22C55E"));

        KeyValuePair<DateOnly, string?> only = Assert.Single(_command.Coloured);

        Assert.Equal("#22C55E", only.Value);
    }

    [Fact]
    public async Task ColoursAreNormalisedInBulkToo()
    {
        await Colour(("2026-03-10", "#ff5c7a"));

        Assert.Equal("#FF5C7A", Assert.Single(_command.Coloured).Value);
    }

    [Fact]
    public async Task ClearingIsSentAsNothingRatherThanAsAColour()
    {
        await Colour(("2026-03-10", null));

        Assert.Null(Assert.Single(_command.Coloured).Value);
    }

    [Fact]
    public async Task ABadColourAnywhereInTheBatchIsRejected()
    {
        await Assert.ThrowsAsync<ValidationException>(() => Colour(
            ("2026-03-10", "#FF5C7A"),
            ("2026-03-11", "greenish")));
    }

    [Fact]
    public async Task AnEmptyBatchIsRejectedRatherThanSilentlyDoingNothing()
    {
        await Assert.ThrowsAsync<ValidationException>(() => Colour());
    }

    [Fact]
    public async Task ARunawayRangeIsRefused()
    {
        (string, string?)[] tooMany = Enumerable
            .Range(0, 401)
            .Select(offset => (
                DateOnly.Parse("2026-01-01").AddDays(offset).ToString("yyyy-MM-dd"),
                (string?)"#FF5C7A"))
            .ToArray();

        await Assert.ThrowsAsync<ValidationException>(() => Colour(tooMany));
    }
}
