using Shifter.Application.Common.Exceptions;
using Shifter.Application.Features.business.DTOs;
using Shifter.Application.Features.business.Services;
using Shifter.Domain.Entities;

using Xunit;

namespace Shifter.Tests;

/// <summary>
/// A shift's colour used to come from its place of work and nowhere else,
/// which was fine while one place meant one kind of work and useless the
/// moment a bar had an opening shift and a close worth telling apart. The
/// precedence is the whole feature: own colour first, the place's as a
/// fallback, and one answer for every screen rather than one per screen.
/// </summary>
public class ShiftColourTests
{
    private readonly FakeShifterQuery _query = new();
    private readonly FakeShifterCommand _command;
    private readonly ShiftHandler _handler;

    public ShiftColourTests()
    {
        // One store behind both sides, because the handler writes a template
        // and then reads it back to pick up the place it belongs to.
        _command = new FakeShifterCommand(_query);
        _handler = new ShiftHandler(_command, _query);
        _query.Locations.Add(Build.Place(1, name: "Bar"));
    }

    private static ShiftCreateDto Create(string? colour, int? locationId = 1)
        => new ShiftCreateDto(
            "Evening",
            null,
            locationId,
            "17:00",
            "23:00",
            "hour",
            100m,
            0,
            colour);

    private Task<ShiftDto> Save(string? colour, int? locationId = 1)
        => _handler.CreateAsync(Create(colour, locationId), Build.UserId, CancellationToken.None);

    [Fact]
    public async Task ATemplateKeepsTheColourItWasGiven()
    {
        ShiftDto saved = await Save("#FF5C7A");

        Assert.Equal("#FF5C7A", saved.colour);
    }

    [Fact]
    public async Task ItsOwnColourWinsOverThePlaces()
    {
        _query.Locations[0].Colour = "#111111";

        ShiftDto saved = await Save("#FF5C7A");

        Assert.Equal("#FF5C7A", saved.effective_colour);
    }

    [Fact]
    public async Task WithoutOneItBorrowsThePlaces()
    {
        _query.Locations[0].Colour = "#111111";

        ShiftDto saved = await Save(null);

        Assert.Null(saved.colour);
        Assert.Equal("#111111", saved.effective_colour);
    }

    [Fact]
    public async Task WithNeitherThereIsNoColourToDraw()
    {
        ShiftDto saved = await Save(null, locationId: null);

        Assert.Null(saved.effective_colour);
    }

    [Fact]
    public async Task AnEmptyValueClearsRatherThanStoresBlank()
    {
        ShiftDto saved = await Save("   ");

        Assert.Null(saved.colour);
    }

    [Fact]
    public async Task ShorthandIsNormalisedSoTwoShiftsSetAlikeCompareEqual()
    {
        ShiftDto saved = await Save("#ff5c7a");

        Assert.Equal("#FF5C7A", saved.colour);
    }

    [Fact]
    public async Task SomethingThatIsNotAColourIsRejected()
    {
        await Assert.ThrowsAsync<ValidationException>(() => Save("bright pink"));
    }
}
