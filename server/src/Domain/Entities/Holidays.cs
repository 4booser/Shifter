namespace Shifter.Domain.Entities;

/// <summary>
/// Public holidays, computed rather than tabled — the same rules the client
/// draws the calendar with, so a holiday premium and a red day in the grid
/// can never disagree. Only the countries the product actually serves.
/// </summary>
public static class Holidays
{
    public static readonly string[] Countries = ["UA", "PL", "DE", "GB", "US", "CA"];

    /// <summary>Gauss's algorithm: Western Easter.</summary>
    public static DateOnly GregorianEaster(int year)
    {
        var a = year % 19;
        var b = year / 100;
        var c = year % 100;
        var d = b / 4;
        var e = b % 4;
        var f = (b + 8) / 25;
        var g = (b - f + 1) / 3;
        var h = (19 * a + b - d - g + 15) % 30;
        var i = c / 4;
        var k = c % 4;
        var l = (32 + 2 * e + 2 * i - h - k) % 7;
        var m = (a + 11 * h + 22 * l) / 451;

        return new DateOnly(year, (h + l - 7 * m + 114) / 31, ((h + l - 7 * m + 114) % 31) + 1);
    }

    /// <summary>
    /// Julian (Orthodox) Easter mapped onto the Gregorian calendar — the date
    /// Ukrainian holidays hang off. The thirteen-day offset holds for the
    /// whole of this century, which is as far as this needs to be right.
    /// </summary>
    public static DateOnly JulianEaster(int year)
    {
        var a = year % 4;
        var b = year % 7;
        var c = year % 19;
        var d = (19 * c + 15) % 30;
        var e = (2 * a + 4 * b - d + 34) % 7;

        return new DateOnly(year, (d + e + 114) / 31, ((d + e + 114) % 31) + 1).AddDays(13);
    }

    /// <summary>Is this date a public holiday in that country? Empty code means "no calendar".</summary>
    public static bool IsPublicHoliday(string? country, DateOnly date)
        => !string.IsNullOrWhiteSpace(country) && ForYear(country, date.Year).Contains(date);

    public static IReadOnlySet<DateOnly> ForYear(string country, int year)
    {
        var days = new HashSet<DateOnly>();

        void Fixed(int month, int day) => days.Add(new DateOnly(year, month, day));
        void FromEaster(DateOnly easter, int offset) => days.Add(easter.AddDays(offset));

        switch (country.ToUpperInvariant())
        {
            case "UA":
                Fixed(1, 1); Fixed(12, 25); Fixed(3, 8); Fixed(5, 1); Fixed(5, 8);
                Fixed(6, 28); Fixed(7, 15); Fixed(8, 24); Fixed(10, 1);
                FromEaster(JulianEaster(year), 0);
                FromEaster(JulianEaster(year), 49);
                break;

            case "PL":
                Fixed(1, 1); Fixed(1, 6); Fixed(5, 1); Fixed(5, 3);
                Fixed(8, 15); Fixed(11, 1); Fixed(11, 11); Fixed(12, 25); Fixed(12, 26);
                FromEaster(GregorianEaster(year), 0);
                FromEaster(GregorianEaster(year), 1);
                FromEaster(GregorianEaster(year), 49);
                FromEaster(GregorianEaster(year), 60);
                break;

            case "DE":
                Fixed(1, 1); Fixed(5, 1); Fixed(10, 3); Fixed(12, 25); Fixed(12, 26);
                FromEaster(GregorianEaster(year), -2);
                FromEaster(GregorianEaster(year), 1);
                FromEaster(GregorianEaster(year), 39);
                FromEaster(GregorianEaster(year), 50);
                break;

            case "GB":
                Fixed(1, 1); Fixed(12, 25); Fixed(12, 26);
                FromEaster(GregorianEaster(year), -2);
                FromEaster(GregorianEaster(year), 1);
                days.Add(Nth(year, 5, DayOfWeek.Monday, 1));
                days.Add(Nth(year, 5, DayOfWeek.Monday, -1));
                days.Add(Nth(year, 8, DayOfWeek.Monday, -1));
                break;

            case "US":
                Fixed(1, 1); Fixed(6, 19); Fixed(7, 4); Fixed(11, 11); Fixed(12, 25);
                days.Add(Nth(year, 1, DayOfWeek.Monday, 3));
                days.Add(Nth(year, 2, DayOfWeek.Monday, 3));
                days.Add(Nth(year, 5, DayOfWeek.Monday, -1));
                days.Add(Nth(year, 9, DayOfWeek.Monday, 1));
                days.Add(Nth(year, 10, DayOfWeek.Monday, 2));
                days.Add(Nth(year, 11, DayOfWeek.Thursday, 4));
                break;

            case "CA":
                Fixed(1, 1); Fixed(7, 1); Fixed(12, 25); Fixed(12, 26);
                FromEaster(GregorianEaster(year), -2);
                days.Add(Nth(year, 9, DayOfWeek.Monday, 1));
                days.Add(Nth(year, 10, DayOfWeek.Monday, 2));
                break;
        }

        return days;
    }

    /// <summary>"Third Monday in January"; a negative index counts back from the end.</summary>
    private static DateOnly Nth(int year, int month, DayOfWeek weekday, int index)
    {
        if (index > 0)
        {
            var first = new DateOnly(year, month, 1);
            var offset = ((int)weekday - (int)first.DayOfWeek + 7) % 7;

            return first.AddDays(offset + (index - 1) * 7);
        }

        var last = new DateOnly(year, month, DateTime.DaysInMonth(year, month));

        return last.AddDays(-(((int)last.DayOfWeek - (int)weekday + 7) % 7));
    }
}
