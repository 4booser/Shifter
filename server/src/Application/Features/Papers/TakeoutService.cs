using System.IO.Compression;
using System.Text;
using System.Text.Json;

using Microsoft.EntityFrameworkCore;

using Shifter.Infrastructure.Persistence.DbContexts;

namespace Shifter.Application.Features.Papers;

/// <summary>
/// The whole account, in one archive somebody can walk away with.
///
/// What cannot be exported is not owned, and this application asks people to
/// pour years of their working life into it. The archive is the counterparty
/// to that ask: every day, every shift, every place, every payout, every
/// expense — as JSON for machines and CSV for humans, in one zip, on demand.
///
/// The JSON is shaped to survive: plain field names, ISO dates, no internal
/// ids beyond what links rows to each other. Somebody importing this into a
/// spreadsheet in 2036 should not need this codebase to make sense of it.
/// </summary>
public sealed class TakeoutService
{
    private readonly ShifterDbContext _db;

    public TakeoutService(ShifterDbContext db) => _db = db;

    public async Task<byte[]> BuildAsync(int userId, CancellationToken ct)
    {
        var days = await _db.Days
            .AsNoTracking()
            .Include(day => day.Shifts)!
            .ThenInclude(entry => entry.Shift)
            .Include(day => day.Sales)
            .Where(day => day.UserId == userId)
            .OrderBy(day => day.Date)
            .ToArrayAsync(ct);

        var shifts = await _db.Shifts.AsNoTracking()
            .Where(shift => shift.UserId == userId).OrderBy(shift => shift.Id).ToArrayAsync(ct);
        var places = await _db.Locations.AsNoTracking()
            .Where(place => place.UserId == userId).OrderBy(place => place.Id).ToArrayAsync(ct);
        var payouts = await _db.Payouts.AsNoTracking()
            .Where(payout => payout.UserId == userId).OrderBy(payout => payout.ReceivedOn).ToArrayAsync(ct);
        var expenses = await _db.Expenses.AsNoTracking()
            .Where(expense => expense.UserId == userId).OrderBy(expense => expense.Date).ToArrayAsync(ct);
        var events = await _db.Events.AsNoTracking()
            .Where(item => item.UserId == userId).OrderBy(item => item.StartDate).ToArrayAsync(ct);
        var goals = await _db.Goals.AsNoTracking()
            .Where(goal => goal.UserId == userId).OrderBy(goal => goal.Id).ToArrayAsync(ct);
        var positions = await _db.Sales.AsNoTracking()
            .Where(position => position.UserId == userId).OrderBy(position => position.Id).ToArrayAsync(ct);

        var options = new JsonSerializerOptions
        {
            WriteIndented = true,
            Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
        };

        using var buffer = new MemoryStream();

        using (var zip = new ZipArchive(buffer, ZipArchiveMode.Create, leaveOpen: true))
        {
            async Task WriteAsync(string name, string content)
            {
                var entry = zip.CreateEntry(name, CompressionLevel.Optimal);

                await using var stream = entry.Open();
                await stream.WriteAsync(Encoding.UTF8.GetBytes(content), ct);
            }

            // The machine half: everything, once, with its links intact.
            await WriteAsync("days.json", JsonSerializer.Serialize(days.Select(day => new
            {
                date = day.Date.ToString("yyyy-MM-dd"),
                tips = day.Tips,
                tips_cash = day.TipsCash,
                tip_pool = day.TipPool,
                deductions = day.Deductions,
                deduction_reason = day.DeductionReason,
                note = day.Note,
                colour = day.Colour,
                shifts = (day.Shifts ?? []).Select(entry => new
                {
                    shift = entry.Shift?.Name,
                    worked = entry.Worked,
                    start = entry.StartTime.ToString("HH:mm"),
                    end = entry.EndTime.ToString("HH:mm"),
                    break_minutes = entry.BreakMinutes,
                    salary_period = entry.SalaryPeriod.ToString().ToLowerInvariant(),
                    salary_amount = entry.SalaryAmount,
                    revenue = entry.Revenue,
                    guests = entry.Guests,
                }),
            }), options));

            await WriteAsync("places.json", JsonSerializer.Serialize(places.Select(place => new
            {
                name = place.Name,
                address = place.Address,
                currency = place.Currency,
                pay_period = place.PayPeriod.ToString().ToLowerInvariant(),
                overtime_weekly_hours = place.OvertimeWeeklyHours,
                overtime_multiplier = place.OvertimeMultiplier,
                tax_percent = place.TaxPercent,
                meal_deduction = place.MealDeduction,
            }), options));

            await WriteAsync("shifts.json", JsonSerializer.Serialize(shifts.Select(shift => new
            {
                name = shift.Name,
                symbol = shift.Symbol,
                start = shift.StartTime.ToString("HH:mm"),
                end = shift.EndTime.ToString("HH:mm"),
                salary_period = shift.SalaryPeriod.ToString().ToLowerInvariant(),
                salary_amount = shift.SalaryAmount,
                revenue_percent = shift.RevenuePercent,
                archived = shift.Archived,
            }), options));

            await WriteAsync("payouts.json", JsonSerializer.Serialize(payouts.Select(payout => new
            {
                received_on = payout.ReceivedOn.ToString("yyyy-MM-dd"),
                period_from = payout.PeriodFrom.ToString("yyyy-MM-dd"),
                period_to = payout.PeriodTo.ToString("yyyy-MM-dd"),
                amount = payout.Amount,
                currency = payout.Currency,
                note = payout.Note,
            }), options));

            await WriteAsync("expenses.json", JsonSerializer.Serialize(expenses.Select(expense => new
            {
                spent_on = expense.Date.ToString("yyyy-MM-dd"),
                kind = expense.Kind,
                amount = expense.Amount,
                note = expense.Note,
            }), options));

            await WriteAsync("events.json", JsonSerializer.Serialize(events.Select(item => new
            {
                from = item.StartDate.ToString("yyyy-MM-dd"),
                to = item.EndDate.ToString("yyyy-MM-dd"),
                name = item.Name,
                kind = item.Kind,
                cost = item.Cost,
            }), options));

            // The human half: the days as a spreadsheet, semicolons for the
            // Excel this part of the world actually runs, and importable back
            // through the app's own CSV door — the circle closes.
            var sheet = new StringBuilder("Дата;Смена;Часы;Заработано;Чаевые;Заметка\r\n");

            foreach (var day in days)
            {
                foreach (var entry in day.Shifts ?? [])
                {
                    if (!entry.Worked) continue;

                    var cells = new[]
                    {
                        day.Date.ToString("yyyy-MM-dd"),
                        entry.Shift?.Name ?? "",
                        Math.Round(entry.PaidDuration.TotalHours, 2)
                            .ToString(System.Globalization.CultureInfo.InvariantCulture),
                        entry.Pay.ToString(System.Globalization.CultureInfo.InvariantCulture),
                        (day.Tips ?? 0m).ToString(System.Globalization.CultureInfo.InvariantCulture),
                        day.Note ?? "",
                    };

                    sheet.Append(string.Join(';', cells.Select(Quote))).Append("\r\n");
                }
            }

            await WriteAsync("goals.json", JsonSerializer.Serialize(goals.Select(goal => new
            {
                period = goal.Period.ToString().ToLowerInvariant(),
                amount = goal.Amount,
                anchor = goal.Anchor?.ToString("yyyy-MM-dd"),
                note = goal.Note,
            }), options));

            await WriteAsync("sales.json", JsonSerializer.Serialize(positions.Select(position => new
            {
                id = position.Id,
                name = position.Name,
                price = position.Price,
                percentage = position.Percentage,
                archived = position.Archived,
            }), options));

            await WriteAsync("days.csv", "﻿" + sheet);

            await WriteAsync("README.txt",
                "Ваш аккаунт Shifter, целиком.\r\n\r\n"
                + "JSON — для машин: все записи с настоящими датами в ISO.\r\n"
                + "days.csv — для людей: открывается экселем, импортируется обратно\r\n"
                + "в Shifter через «Перенести записи из другого приложения».\r\n\r\n"
                + $"Собрано {DateTime.UtcNow:yyyy-MM-dd HH:mm} UTC.\r\n");
        }

        return buffer.ToArray();
    }

    private static string Quote(string value)
        => value.Contains(';') || value.Contains('"') || value.Contains('\n')
            ? $"\"{value.Replace("\"", "\"\"")}\""
            : value;
}
