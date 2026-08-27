using Shifter.Domain.Entities;

using Xunit;

namespace Shifter.Tests;

public class NightHoursTests
{
    [Theory]
    // An evening shift ending before the window starts earns nothing.
    [InlineData("11:00", "19:00", 0)]
    // The classic close: 20:00–04:00 is six night hours (22:00→04:00).
    [InlineData("20:00", "04:00", 6)]
    // A shift entirely inside the window.
    [InlineData("23:00", "05:00", 6)]
    // The morning end of the window still counts.
    [InlineData("04:00", "12:00", 2)]
    // A shift that starts before the window and runs to its close.
    [InlineData("18:00", "23:30", 1.5)]
    // Around the clock: the whole window, once.
    [InlineData("12:00", "11:00", 8)]
    public void Counts_only_the_hours_inside_the_window(string start, string end, double expected)
        => Assert.Equal(
            expected,
            PremiumCalculator.NightHours(
                TimeOnly.Parse(start),
                TimeOnly.Parse(end),
                new TimeOnly(22, 0),
                new TimeOnly(6, 0)),
            3);

    [Fact]
    public void A_window_that_does_not_wrap_still_works()
        => Assert.Equal(
            2,
            PremiumCalculator.NightHours(
                new TimeOnly(10, 0),
                new TimeOnly(14, 0),
                new TimeOnly(12, 0),
                new TimeOnly(18, 0)),
            3);
}

public class PremiumExtraTests
{
    [Fact]
    public void Nothing_is_added_when_the_place_pays_no_premium()
        => Assert.Equal(0m, PremiumCalculator.Extra(6, 8, 200m, nightMultiplier: 1m, holidayMultiplier: 1m, isPublicHoliday: false));

    [Fact]
    public void Night_hours_earn_only_the_difference()
        => Assert.Equal(240m, PremiumCalculator.Extra(6, 8, 200m, nightMultiplier: 1.2m, holidayMultiplier: 1m, isPublicHoliday: false));

    [Fact]
    public void A_holiday_pays_on_the_whole_shift_and_replaces_the_night_rule()
    {
        // ×2 on all eight hours, not ×2 on eight plus ×1.2 on six.
        var extra = PremiumCalculator.Extra(6, 8, 200m, nightMultiplier: 1.2m, holidayMultiplier: 2m, isPublicHoliday: true);

        Assert.Equal(1600m, extra);
    }

    [Fact]
    public void A_shift_with_no_hourly_rate_earns_no_premium()
        => Assert.Equal(0m, PremiumCalculator.Extra(6, 8, 0m, 1.5m, 2m, true));
}

public class HolidayTests
{
    [Theory]
    [InlineData(2024, 3, 31)]
    [InlineData(2025, 4, 20)]
    [InlineData(2026, 4, 5)]
    public void Western_Easter_matches_the_almanac(int year, int month, int day)
        => Assert.Equal(new DateOnly(year, month, day), Holidays.GregorianEaster(year));

    [Theory]
    [InlineData(2024, 5, 5)]
    [InlineData(2025, 4, 20)]
    [InlineData(2026, 4, 12)]
    public void Orthodox_Easter_matches_the_almanac(int year, int month, int day)
        => Assert.Equal(new DateOnly(year, month, day), Holidays.JulianEaster(year));

    [Fact]
    public void Ukrainian_dates_a_bartender_would_recognise()
    {
        Assert.True(Holidays.IsPublicHoliday("UA", new DateOnly(2026, 8, 24)));  // Independence Day
        Assert.True(Holidays.IsPublicHoliday("UA", new DateOnly(2026, 12, 25))); // Christmas
        Assert.True(Holidays.IsPublicHoliday("UA", new DateOnly(2026, 4, 12)));  // Orthodox Easter
        Assert.False(Holidays.IsPublicHoliday("UA", new DateOnly(2026, 8, 25)));
    }

    [Fact]
    public void No_calendar_means_no_holidays_at_all()
    {
        Assert.False(Holidays.IsPublicHoliday("", new DateOnly(2026, 1, 1)));
        Assert.False(Holidays.IsPublicHoliday(null, new DateOnly(2026, 1, 1)));
    }

    [Fact]
    public void Every_advertised_country_actually_has_rules()
    {
        foreach (var country in Holidays.Countries)
            Assert.NotEmpty(Holidays.ForYear(country, 2026));
    }
}
