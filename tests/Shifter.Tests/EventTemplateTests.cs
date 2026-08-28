using Shifter.Application.Common.Exceptions;
using Shifter.Application.Features.business.DTOs;
using Shifter.Application.Features.business.Services;
using Shifter.Domain.Entities;

using Xunit;

namespace Shifter.Tests;

/// <summary>
/// The palette for everything on the calendar that is not work — «английский»,
/// «вождение», the gym — and the one thing it must never do, which is let the
/// money it carries anywhere near the money a week earned.
/// </summary>
public class EventTemplateTests
{
    private static (EventTemplateHandler Handler, FakeShifterQuery Query, FakeShifterCommand Command) Made()
    {
        var query = new FakeShifterQuery();
        var command = new FakeShifterCommand(query);

        return (new EventTemplateHandler(command, query), query, command);
    }

    private static EventTemplateSaveDto English(decimal? cost = 400m) =>
        new("Английский", "🇬🇧", "#3B82F6", "ordinary", "19:00", "20:30", cost);

    [Fact]
    public async Task A_lesson_keeps_its_hours_and_what_it_costs()
    {
        var (handler, _, _) = Made();

        var made = await handler.CreateAsync(English(), userId: 1, CancellationToken.None);

        Assert.Equal("Английский", made.name);
        Assert.Equal("19:00", made.start_time);
        Assert.Equal(1.5, made.hours);
        Assert.Equal(400m, made.cost);
    }

    [Fact]
    public async Task An_evening_that_runs_past_midnight_is_not_a_negative_one()
    {
        var (handler, _, _) = Made();

        var made = await handler.CreateAsync(
            new EventTemplateSaveDto("Смена в клубе", null, "#3B82F6", null, "22:00", "04:00"),
            userId: 1, CancellationToken.None);

        Assert.Equal(6, made.hours);
    }

    [Fact]
    public async Task Costing_nothing_and_not_being_counted_are_different_answers()
    {
        var (handler, _, _) = Made();

        var free = await handler.CreateAsync(English(cost: 0m), userId: 1, CancellationToken.None);
        var unpriced = await handler.CreateAsync(English(cost: null), userId: 1, CancellationToken.None);

        Assert.Equal(0m, free.cost);
        Assert.Null(unpriced.cost);
    }

    [Fact]
    public async Task Money_cannot_run_the_wrong_way()
    {
        var (handler, _, _) = Made();

        await Assert.ThrowsAsync<ValidationException>(() =>
            handler.CreateAsync(English(cost: -50m), userId: 1, CancellationToken.None));
    }

    [Fact]
    public async Task An_end_time_on_its_own_says_nothing_about_when_anything_happens()
    {
        var (handler, _, _) = Made();

        await Assert.ThrowsAsync<ValidationException>(() =>
            handler.CreateAsync(
                new EventTemplateSaveDto("Вождение", null, "#3B82F6", null, null, "20:30"),
                userId: 1, CancellationToken.None));
    }

    [Fact]
    public async Task The_palette_is_the_callers_own()
    {
        var (handler, query, _) = Made();

        query.EventTemplates.Add(new EventTemplate
        {
            Id = 7, UserId = 2, Name = "Чужое", Colour = "#000000",
        });

        var mine = await handler.ListAsync(userId: 1, includeArchived: true, CancellationToken.None);

        Assert.Empty(mine);
        await Assert.ThrowsAsync<NotFoundException>(() =>
            handler.UpdateAsync(English(), userId: 1, id: 7, CancellationToken.None));
    }

    [Fact]
    public async Task Archiving_takes_the_choice_away_without_touching_the_year()
    {
        var (handler, query, _) = Made();

        var made = await handler.CreateAsync(English(), userId: 1, CancellationToken.None);

        await handler.ArchiveAsync(userId: 1, made.id, archived: true, CancellationToken.None);

        Assert.Empty(await handler.ListAsync(1, includeArchived: false, CancellationToken.None));
        Assert.Single(await handler.ListAsync(1, includeArchived: true, CancellationToken.None));
    }

    [Fact]
    public async Task Deleting_the_palette_entry_leaves_the_days_it_made()
    {
        var (handler, query, command) = Made();

        var made = await handler.CreateAsync(English(), userId: 1, CancellationToken.None);

        command.Events.Add(new Event
        {
            Id = 1,
            UserId = 1,
            Name = "Английский",
            Colour = "#3B82F6",
            StartDate = new DateOnly(2026, 3, 2),
            EndDate = new DateOnly(2026, 3, 2),
            Cost = 400m,
            TemplateId = made.id,
        });

        await handler.DeleteAsync(userId: 1, made.id, CancellationToken.None);

        var kept = Assert.Single(command.Events);
        Assert.Equal(400m, kept.Cost);
        Assert.Equal("Английский", kept.Name);
        Assert.Null(kept.TemplateId);
    }
}
