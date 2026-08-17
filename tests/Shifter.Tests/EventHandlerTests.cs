using Shifter.Application.Common.Exceptions;
using Shifter.Application.Features.business.DTOs;
using Shifter.Domain.Entities;

using Xunit;

using EventHandler = Shifter.Application.Features.business.Services.EventHandler;

namespace Shifter.Tests;

/// <summary>
/// Events mark time and never pay for it. These cover the range arithmetic —
/// which is where an off-by-one turns a fortnight of leave into thirteen days —
/// and the validation that stops a bad record reaching the calendar at all.
/// </summary>
public class EventHandlerTests
{
    private readonly FakeShifterQuery _query = new();
    private readonly FakeShifterCommand _command = new();
    private readonly EventHandler _handler;

    public EventHandlerTests()
    {
        _handler = new EventHandler(_command, _query);
    }

    private static EventSaveDto Save(
        string from = "2026-03-10",
        string to = "2026-03-10",
        string name = "Leave",
        string colour = "#FF5C7A",
        string? startTime = null,
        string? endTime = null)
        => new EventSaveDto(
            name,
            null,
            colour,
            DateOnly.Parse(from),
            DateOnly.Parse(to),
            startTime,
            endTime,
            null);

    private void Given(string from, string to, string name = "Leave")
        => _query.Events.Add(new Event
        {
            Id = _query.Events.Count + 1,
            UserId = Build.UserId,
            Name = name,
            Colour = "#FF5C7A",
            StartDate = DateOnly.Parse(from),
            EndDate = DateOnly.Parse(to)
        });

    private Task<EventDto[]> Range(string from = "2026-03-01", string to = "2026-03-31")
        => _handler.ListAsync(
            Build.UserId, DateOnly.Parse(from), DateOnly.Parse(to), CancellationToken.None);

    // ==== Ranges ====

    [Fact]
    public async Task ASingleDayEventSpansOneDay()
    {
        EventDto created = await _handler.CreateAsync(
            Save("2026-03-10", "2026-03-10"), Build.UserId, CancellationToken.None);

        Assert.Equal(1, created.days);
    }

    [Fact]
    public async Task BothEndsCountTowardsTheLength()
    {
        EventDto created = await _handler.CreateAsync(
            Save("2026-03-10", "2026-03-23"), Build.UserId, CancellationToken.None);

        // The tenth to the twenty-third inclusive is a fortnight, not thirteen
        // days: both ends are days off.
        Assert.Equal(14, created.days);
    }

    [Fact]
    public async Task AnEventRunningThroughTheRangeIsReturned()
    {
        // Starts in February, ends in April: it belongs on March's calendar
        // even though neither end is inside it.
        Given("2026-02-20", "2026-04-05");

        EventDto[] found = await Range();

        Assert.Single(found);
    }

    [Fact]
    public async Task AnEventOutsideTheRangeIsNotReturned()
    {
        Given("2026-04-01", "2026-04-03");

        Assert.Empty(await Range());
    }

    [Fact]
    public async Task EventsTouchingEitherEdgeAreIncluded()
    {
        Given("2026-02-25", "2026-03-01", "starts before");
        Given("2026-03-31", "2026-04-04", "ends after");

        Assert.Equal(2, (await Range()).Length);
    }

    // ==== Validation ====

    [Fact]
    public async Task AnEventEndingBeforeItStartsIsRejected()
    {
        await Assert.ThrowsAsync<ValidationException>(() => _handler.CreateAsync(
            Save("2026-03-10", "2026-03-01"), Build.UserId, CancellationToken.None));
    }

    [Fact]
    public async Task AnEventWithoutANameIsRejected()
    {
        await Assert.ThrowsAsync<ValidationException>(() => _handler.CreateAsync(
            Save(name: "   "), Build.UserId, CancellationToken.None));
    }

    [Fact]
    public async Task AColourThatIsNotHexIsRejected()
    {
        await Assert.ThrowsAsync<ValidationException>(() => _handler.CreateAsync(
            Save(colour: "red"), Build.UserId, CancellationToken.None));
    }

    [Fact]
    public async Task AnEndTimeWithoutAStartIsRejected()
    {
        await Assert.ThrowsAsync<ValidationException>(() => _handler.CreateAsync(
            Save(endTime: "18:00"), Build.UserId, CancellationToken.None));
    }

    [Fact]
    public async Task AnUnreadableTimeIsRejectedRatherThanDropped()
    {
        await Assert.ThrowsAsync<ValidationException>(() => _handler.CreateAsync(
            Save(startTime: "half nine"), Build.UserId, CancellationToken.None));
    }

    [Fact]
    public async Task TimesSurviveTheRoundTrip()
    {
        EventDto created = await _handler.CreateAsync(
            Save(startTime: "09:00", endTime: "17:30"), Build.UserId, CancellationToken.None);

        Assert.Equal("09:00", created.start_time);
        Assert.Equal("17:30", created.end_time);
    }

    [Fact]
    public async Task AnAllDayEventKeepsNoTimes()
    {
        EventDto created = await _handler.CreateAsync(
            Save(), Build.UserId, CancellationToken.None);

        Assert.Null(created.start_time);
        Assert.Null(created.end_time);
    }

    // ==== Ownership ====

    [Fact]
    public async Task SomebodyElsesEventIsNotFound()
    {
        Given("2026-03-10", "2026-03-10");

        await Assert.ThrowsAsync<NotFoundException>(() => _handler.DeleteAsync(
            Build.UserId + 1, 1, CancellationToken.None));
    }

    [Fact]
    public async Task DeletingRemovesTheEvent()
    {
        Given("2026-03-10", "2026-03-10");

        await _handler.DeleteAsync(Build.UserId, 1, CancellationToken.None);

        Assert.Contains(_command.Deleted, item => item is Event);
    }
}
