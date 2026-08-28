using Shifter.Application.Features.business.DTOs;
using Shifter.Application.Features.business.Services;
using Shifter.Domain.Entities;

using Xunit;

namespace Shifter.Tests;

/// <summary>
/// Takings on their own do not describe an evening. Twelve thousand off forty
/// covers is a different night from twelve thousand off a hundred and twenty,
/// and the average cheque — not the total — is the language a manager and a
/// bartender actually argue in.
/// </summary>
public class AverageChequeTests
{
    private readonly FakeShifterQuery _query = new();
    private readonly DayHandler _handler;

    public AverageChequeTests()
    {
        _handler = new DayHandler(new FakeShifterCommand(_query), _query);
    }

    private Task<DaysDto> Range()
        => _handler.ListAsync(
            Build.UserId, new DateOnly(2026, 3, 1), new DateOnly(2026, 3, 31), CancellationToken.None);

    private void Evening(string date, decimal? revenue, int? guests)
    {
        var place = Build.Place(1);

        if (_query.Locations.All(existing => existing.Id != place.Id)) _query.Locations.Add(place);

        var day = Build.WorkedDay(date, Build.Template(1, location: place, amount: 100m));

        day.Shifts![0].Revenue = revenue;
        day.Shifts![0].Guests = guests;

        _query.Days.Add(day);
    }

    [Fact]
    public async Task Takings_over_covers_is_the_average_cheque()
    {
        Evening("2026-03-02", 12_000m, 40);

        var result = await Range();

        Assert.Equal(40, result.guests_counted);
        Assert.Equal(300m, result.average_cheque);
    }

    [Fact]
    public async Task Two_evenings_are_one_average_over_the_whole_range()
    {
        Evening("2026-03-02", 12_000m, 40);
        Evening("2026-03-03", 8_000m, 60);

        var result = await Range();

        Assert.Equal(100, result.guests_counted);
        Assert.Equal(200m, result.average_cheque);
    }

    [Fact]
    public async Task An_evening_that_recorded_only_half_of_it_is_left_out()
    {
        // Takings from one night over covers from another describes neither,
        // and it is exactly the figure somebody would quote back.
        Evening("2026-03-02", 12_000m, 40);
        Evening("2026-03-03", 8_000m, null);
        Evening("2026-03-04", null, 60);

        var result = await Range();

        Assert.Equal(40, result.guests_counted);
        Assert.Equal(300m, result.average_cheque);
    }

    [Fact]
    public async Task Nobody_counting_is_not_an_average_of_nothing()
    {
        Evening("2026-03-02", 12_000m, null);

        var result = await Range();

        Assert.Equal(0, result.guests_counted);
        Assert.Null(result.average_cheque);
    }

    [Fact]
    public async Task An_evening_with_no_guests_is_not_the_same_as_no_tally()
    {
        // Zero covers is a real and dreadful evening. It is not an average.
        Evening("2026-03-02", 0m, 0);

        var result = await Range();

        Assert.Equal(0, result.guests_counted);
        Assert.Null(result.average_cheque);
    }
}
