using Shifter.Domain.Entities;
using Shifter.Domain.Entities.Enums;
using Shifter.Infrastructure.Persistence.DbContexts;

namespace Shifter.Application.Features.Demo;

/// <summary>
/// Half a year of somebody's work, invented.
///
/// The point of a demonstration account is that a stranger can see what the
/// application does before typing anything into it, and every screen here is
/// worth nothing against an empty month: the calendar has no shape, the
/// statistics have no shape, and the report says «в этом месяце ничего не
/// записано», which is exactly the picture the screenshots were defending
/// for months without anybody noticing.
///
/// It is seeded on the server rather than invented in the browser, and that
/// is the whole design decision. Every figure a visitor sees — the hourly
/// rate, the overtime, the night multiplier, the tax withheld, what the
/// payday owes — is worked out by the same code that works it out for a
/// paying person. A generator in the client would have had to reproduce that
/// arithmetic, which is the fault this codebase has spent its time removing,
/// not adding.
///
/// Deterministic from a seed so two visitors are looking at the same thing
/// when one of them asks a question about it.
/// </summary>
public static class DemoWorld
{
    /// <summary>How long a demonstration account is allowed to exist.</summary>
    public static readonly TimeSpan Lifetime = TimeSpan.FromDays(2);

    /// <summary>Months of history behind today. Enough for a year view to have a shape.</summary>
    private const int Months = 7;

    /// <summary>A small seeded generator: Math.Random would redraw the demo every visit.</summary>
    private sealed class Dice
    {
        private uint _state;

        public Dice(uint seed) => _state = seed == 0 ? 1 : seed;

        public double Next()
        {
            _state = unchecked(_state * 1664525 + 1013904223);

            return _state / 4294967296d;
        }

        public int Between(int low, int high) => low + (int)(Next() * (high - low + 1));
    }

    public static async Task SeedAsync(ShifterDbContext db, User user, DateOnly today, CancellationToken ct)
    {
        var dice = new Dice((uint)(user.Id * 2654435761L % uint.MaxValue));

        // Two places, because one place teaches nothing about a screen whose
        // whole job is telling two apart. A café that pays by the hour twice a
        // month, and a bar that pays monthly, pools its tips and takes a meal
        // out of every shift.
        var cafe = new Location
        {
            UserId = user.Id,
            Name = "Кофейня на Прорезной",
            City = "Киев",
            Colour = "#4C6EF5",
            PayPeriod = PayPeriod.SemiMonthly,
            PayDay = 5,
            OvertimeWeeklyHours = 40,
            OvertimeMultiplier = 1.5m,
            NightMultiplier = 1m,
            HolidayCountry = "UA",
            Currency = "UAH",
            MinimumHourly = 150m,
        };

        var bar = new Location
        {
            UserId = user.Id,
            Name = "Бар «Дым»",
            City = "Киев",
            Colour = "#7048E8",
            PayPeriod = PayPeriod.Monthly,
            PayDay = 10,
            OvertimeWeeklyHours = 40,
            OvertimeMultiplier = 1.5m,
            // A bar's evening is most of the night, so the night rate is the
            // one figure on this place that actually moves the money.
            NightMultiplier = 1.3m,
            NightFrom = new TimeOnly(22, 0),
            NightTo = new TimeOnly(6, 0),
            MealDeduction = 80m,
            TipOutOfTipsPercent = 10m,
            HolidayCountry = "UA",
            Currency = "UAH",
            MinimumHourly = 150m,
            TaxPercent = 5m,
        };

        db.Locations.AddRange(cafe, bar);
        await db.SaveChangesAsync(ct);

        var morning = new Shift
        {
            UserId = user.Id,
            Name = "Утро",
            Symbol = "☕",
            Colour = "#4C6EF5",
            LocationId = cafe.Id,
            SalaryPeriod = SalaryPeriod.Hour,
            SalaryAmount = 180m,
            TipSource = TipSource.Personal,
            StartTime = new TimeOnly(8, 0),
            EndTime = new TimeOnly(16, 0),
            Breaks = [new Break { Duration = TimeSpan.FromMinutes(30) }],
        };

        var evening = new Shift
        {
            UserId = user.Id,
            Name = "Вечер",
            Symbol = "🌙",
            Colour = "#7048E8",
            PaintsDay = true,
            LocationId = bar.Id,
            SalaryPeriod = SalaryPeriod.Hour,
            SalaryAmount = 210m,
            TipSource = TipSource.Pool,
            TipPoolPercent = 35m,
            StartTime = new TimeOnly(16, 0),
            EndTime = new TimeOnly(0, 0),
            Breaks = [new Break { Duration = TimeSpan.FromMinutes(30) }],
        };

        var friday = new Shift
        {
            UserId = user.Id,
            Name = "Пятница",
            Symbol = "🔥",
            Colour = "#F76707",
            LocationId = bar.Id,
            SalaryPeriod = SalaryPeriod.Hour,
            SalaryAmount = 210m,
            TipSource = TipSource.Pool,
            TipPoolPercent = 35m,
            StartTime = new TimeOnly(18, 0),
            EndTime = new TimeOnly(3, 0),
            Breaks = [new Break { Duration = TimeSpan.FromMinutes(30) }],
        };

        db.Shifts.AddRange(morning, evening, friday);
        await db.SaveChangesAsync(ct);

        var from = today.AddMonths(-Months);
        var days = new List<Day>();

        for (var date = from; date <= today.AddDays(14); date = date.AddDays(1))
        {
            // Four or five shifts a week, and never seven: an invented week
            // that never rests reads as invented.
            var weekday = (int)date.DayOfWeek;
            var rest = weekday == 1 || (weekday == 2 && dice.Next() < 0.6);

            if (rest) continue;

            Shift shift = weekday switch
            {
                5 => friday,
                0 or 6 => evening,
                _ => dice.Next() < 0.55 ? morning : evening,
            };

            // Ahead of today is a plan, not a record. The calendar draws the
            // two differently and the difference is half of what it is for.
            bool worked = date <= today;

            var day = new Day
            {
                UserId = user.Id,
                Date = date,
                Tips = worked && shift.TipSource == TipSource.Personal ? dice.Between(120, 480) : null,
                TipPool = worked && shift.TipSource == TipSource.Pool ? dice.Between(900, 3_400) : null,
                TipsCash = worked && dice.Next() < 0.4 ? dice.Between(50, 300) : null,
                // A fine is rare and always has a reason; a meal is the
                // place's own rule and does not belong here.
                Deductions = worked && dice.Next() < 0.06 ? 200 : null,
                DeductionReason = worked && dice.Next() < 0.06 ? "late" : null,
                Shifts =
                [
                    new DayShift
                    {
                        ShiftId = shift.Id,
                        Worked = worked,
                        SalaryPeriod = shift.SalaryPeriod,
                        SalaryAmount = shift.SalaryAmount,
                        TipSource = shift.TipSource,
                        TipPoolPercent = shift.TipPoolPercent,
                        StartTime = shift.StartTime,
                        EndTime = shift.EndTime,
                        BreakMinutes = 30,
                        Zone = shift.Id == morning.Id ? ShiftZone.Hall : ShiftZone.Bar,
                        // The bar counts covers and the morning does not, so
                        // the example shows both what a counted room looks
                        // like and what «nobody counted» looks like — which
                        // is the honest pair, and the second half of it is a
                        // «·» rather than a zero.
                        Guests = worked && shift.Id != morning.Id ? dice.Between(40, 120) : null,
                        // Somebody who stays late most Fridays is the kind of
                        // fact this application exists to make visible.
                        ActualEnd = worked && shift.Id == friday.Id && dice.Next() < 0.5
                            ? shift.EndTime.AddMinutes(dice.Between(20, 70))
                            : null,
                        ActualStart = worked && shift.Id == friday.Id && dice.Next() < 0.5
                            ? shift.StartTime
                            : null,
                    },
                ],
            };

            days.Add(day);
        }

        db.Days.AddRange(days);
        await db.SaveChangesAsync(ct);

        // Payments that actually landed, up to last month. The current month
        // stays unpaid on purpose: «сколько мне должны» is the question the
        // payday screen answers, and it cannot answer it if everything is
        // settled.
        var payouts = new List<Payout>();

        for (int back = Months; back >= 1; back--)
        {
            var month = new DateOnly(today.Year, today.Month, 1).AddMonths(-back);
            var end = month.AddMonths(1).AddDays(-1);

            payouts.Add(new Payout
            {
                UserId = user.Id,
                LocationId = bar.Id,
                PeriodFrom = month,
                PeriodTo = end,
                Amount = dice.Between(14_000, 21_000),
                ReceivedOn = month.AddMonths(1).AddDays(9),
                Currency = "UAH",
            });

            payouts.Add(new Payout
            {
                UserId = user.Id,
                LocationId = cafe.Id,
                PeriodFrom = month,
                PeriodTo = month.AddDays(14),
                Amount = dice.Between(5_000, 8_000),
                ReceivedOn = month.AddDays(19),
                Currency = "UAH",
            });
        }

        db.Payouts.AddRange(payouts);

        db.Goals.Add(new Goal
        {
            UserId = user.Id,
            Period = GoalPeriod.Month,
            Amount = 32_000m,
            Note = "Аренда и курс",
        });

        await db.SaveChangesAsync(ct);
    }
}
