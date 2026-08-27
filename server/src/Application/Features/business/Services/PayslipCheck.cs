using System.Globalization;

using Shifter.Application.Features.business.DTOs;
using Shifter.Domain.Entities;

namespace Shifter.Application.Features.business.Services;

/// <summary>
/// A pay period at one place, taken apart into the lines a payslip has.
///
/// The reconciliation already says whether a period came up short. This says
/// *where*, which is a different and more useful thing: a total that disagrees
/// by ₴1 440 is an argument, and "the night hours were not paid: 6 × 200 × 0,2"
/// is a question with an answer. Every line carries its own arithmetic in the
/// units a payslip uses, so the two documents can be read side by side.
/// </summary>
public static class PayslipCheck
{
    public static PayslipCheckDto For(
        Location place,
        Day[] period,
        DateOnly from,
        DateOnly to,
        LocationTotalDto total,
        Dictionary<int, Location> locations)
    {
        DayShift[] worked = period
            .SelectMany(day => (day.Shifts ?? []).Where(entry => entry.Worked))
            .Where(entry => (entry.Shift?.LocationId ?? 0) == place.Id)
            .ToArray();

        List<PayslipLineDto> lines = [];

        // ---- the wage, at each rate it was actually paid ----
        foreach (var band in worked
            .Where(entry => entry.SalaryPeriod == SalaryPeriod.Hour && entry.SalaryAmount > 0m)
            .GroupBy(entry => entry.SalaryAmount ?? 0m)
            .OrderByDescending(band => band.Key))
        {
            double hours = band.Sum(entry => entry.PaidDuration.TotalHours);

            lines.Add(new PayslipLineDto(
                "base",
                Math.Round((decimal)hours * band.Key, 2),
                $"{Hours(hours)} × {Money(band.Key)}",
                Math.Round(hours, 2),
                false));
        }

        // ---- shifts priced by the day ----
        DayShift[] daily = worked.Where(entry => entry.SalaryPeriod == SalaryPeriod.Day).ToArray();

        if (daily.Length > 0)
        {
            decimal amount = daily.Sum(entry => entry.SalaryAmount ?? 0m);

            lines.Add(new PayslipLineDto(
                "base",
                amount,
                $"{daily.Length} × {Money(daily.Length == 0 ? 0m : amount / daily.Length)}",
                Math.Round(daily.Sum(entry => entry.PaidDuration.TotalHours), 2),
                false));
        }

        return Finish(place, period, from, to, total, lines, worked);
    }

    private static PayslipCheckDto Finish(
        Location place,
        Day[] period,
        DateOnly from,
        DateOnly to,
        LocationTotalDto total,
        List<PayslipLineDto> lines,
        DayShift[] worked)
    {
        double hours = worked.Sum(entry => entry.PaidDuration.TotalHours);
        decimal counted = lines.Sum(line => line.amount);

        // Whatever the place's own totals hold that the rate bands above do
        // not: the weekly or monthly salary, the overtime, the premiums, the
        // percentage of takings. Reported as one line rather than guessed at,
        // because guessing which is which would be inventing a payslip.
        decimal rest = total.earned - total.tips + total.tip_out + total.deductions - total.sales - counted;

        if (Math.Abs(rest) > 0.01m)
        {
            lines.Add(new PayslipLineDto(
                "extras",
                Math.Round(rest, 2),
                "оклад, переработки и надбавки",
                0,
                false));
        }

        if (total.sales > 0m)
        {
            lines.Add(new PayslipLineDto("revenue", total.sales, "процент с продаж", 0, false));
        }

        if (total.tips > 0m)
        {
            lines.Add(new PayslipLineDto("tips", total.tips, "чаевые, как их записали", 0, false));
        }

        if (total.tip_out > 0m)
        {
            lines.Add(new PayslipLineDto(
                "tip_out",
                total.tip_out,
                Percent(place.TipOutOfTipsPercent, place.TipOutOfSalesPercent),
                0,
                true));
        }

        // Meals and fines are separated here even though the totals pool them:
        // a payslip lists them apart, and half the point of this screen is
        // reading the two documents line against line.
        decimal meals = place.MealDeduction * total.days_worked;
        decimal fines = Math.Max(0m, total.deductions - meals);

        if (meals > 0m)
        {
            lines.Add(new PayslipLineDto(
                "meals",
                meals,
                $"{total.days_worked} × {Money(place.MealDeduction)}",
                0,
                true));
        }

        if (fines > 0m)
        {
            lines.Add(new PayslipLineDto("fines", fines, "штрафы и недостачи", 0, true));
        }

        if (total.tax > 0m)
        {
            lines.Add(new PayslipLineDto(
                "tax",
                total.tax,
                $"{Trim(place.TaxPercent)}% удержания",
                0,
                true));
        }

        // Rounded once, at the end. A payslip is written to the kopeck and an
        // unrounded tail beside it reads as a different number rather than the
        // same one.
        PayslipLineDto[] rounded = lines
            .Select(line => line with { amount = Math.Round(line.amount, 2) })
            .ToArray();

        decimal gross = rounded.Where(line => !line.deducted).Sum(line => line.amount);

        return new PayslipCheckDto(
            place.Id,
            place.Name,
            place.Currency,
            from,
            to,
            Math.Round(hours, 2),
            total.days_worked,
            rounded,
            Math.Round(gross, 2),
            Math.Round(total.net, 2),
            Math.Round(total.holiday, 2));
    }

    private static string Percent(decimal ofTips, decimal ofSales)
    {
        List<string> parts = [];

        if (ofTips > 0m) parts.Add($"{Trim(ofTips)}% с чаевых");
        if (ofSales > 0m) parts.Add($"{Trim(ofSales)}% с выручки");

        return parts.Count == 0 ? "отдано в общак" : string.Join(" + ", parts);
    }

    private static string Hours(double hours)
        => $"{Math.Round(hours, 2).ToString("0.##", CultureInfo.InvariantCulture)} ч";

    private static string Money(decimal amount)
        => amount.ToString("0.##", CultureInfo.InvariantCulture);

    private static string Trim(decimal value)
        => value.ToString("0.##", CultureInfo.InvariantCulture);
}
