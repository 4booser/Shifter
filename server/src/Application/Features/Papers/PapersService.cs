using System.Globalization;
using System.Text;

using Microsoft.EntityFrameworkCore;

using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

using Shifter.Application.Common.Exceptions;
using Shifter.Application.Features.business.Services;
using Shifter.Domain.Entities;
using Shifter.Infrastructure.Persistence.DbContexts;

namespace Shifter.Application.Features.Papers;

/// <summary>
/// The papers: an income statement as a PDF, and a CSV an accountant can take
/// without a conversation.
///
/// A worker without papers is the weak side of every negotiation — with a
/// landlord, a consulate, a bank. This application holds the most complete
/// record of their work that exists, and until now could not turn it into a
/// document.
///
/// The statement never pretends to be an employer's certificate. Its title,
/// its layout and a line in its footer all say the same thing: составлено по
/// записям владельца аккаунта. That honesty is the document's spine, not its
/// small print — a paper that oversells itself gets one use and then poisons
/// the rest.
/// </summary>
public sealed class PapersService
{
    private readonly ShifterDbContext _db;

    static PapersService() => QuestPDF.Settings.License = LicenseType.Community;

    public PapersService(ShifterDbContext db) => _db = db;

    private sealed record MonthRow(
        string Month, int Days, double Hours, decimal Earned, decimal Tips);

    private async Task<(User Who, MonthRow[] Months, Dictionary<string, decimal> Paid)> GatherAsync(
        int userId, DateOnly from, DateOnly to, CancellationToken ct)
    {
        var who = await _db.Users.AsNoTracking()
            .FirstOrDefaultAsync(user => user.Id == userId, ct)
            ?? throw new NotFoundException("No such account.");

        var days = await _db.Days
            .AsNoTracking()
            .Include(day => day.Shifts)!
            .ThenInclude(entry => entry.Shift)
            .Where(day => day.UserId == userId && day.Date >= from.AddDays(-8) && day.Date <= to.AddDays(8))
            .ToArrayAsync(ct);

        var months = days
            .Where(day => day.Date >= from && day.Date <= to)
            .GroupBy(day => day.Date.ToString("yyyy-MM"))
            .OrderBy(group => group.Key)
            .Select(group =>
            {
                var worked = group
                    .Where(day => (day.Shifts ?? []).Any(entry => entry.Worked))
                    .ToArray();

                // The one correct way to count a weekly or monthly wage, run
                // per month with the surrounding days in view — same rule as
                // the tax profile and the letter, same reason.
                var earned = worked.Sum(day =>
                        (day.Tips ?? 0m)
                        + (day.Shifts ?? []).Where(entry => entry.Worked).Sum(entry => entry.Pay))
                    + DayHandler.PeriodSalary(
                        [.. group], workedOnly: true, days);

                return new MonthRow(
                    group.Key,
                    worked.Length,
                    Math.Round(worked.Sum(day =>
                        (day.Shifts ?? []).Where(entry => entry.Worked)
                            .Sum(entry => entry.PaidDuration.TotalHours)), 1),
                    Math.Round(earned, 2),
                    worked.Sum(day => day.Tips ?? 0m));
            })
            .Where(row => row.Days > 0)
            .ToArray();

        var paid = (await _db.Payouts.AsNoTracking()
                .Where(payout => payout.UserId == userId
                    && payout.ReceivedOn >= from && payout.ReceivedOn <= to)
                .ToArrayAsync(ct))
            .GroupBy(payout => payout.ReceivedOn.ToString("yyyy-MM"))
            .ToDictionary(group => group.Key, group => group.Sum(payout => payout.Amount));

        return (who, months, paid);
    }

    /// <summary>
    /// The CSV an accountant takes without a conversation: the most boring
    /// spreadsheet money can be written in. No formulas, no merged cells,
    /// semicolons for the Excel this part of the world runs.
    /// </summary>
    public async Task<string> AccountantCsvAsync(
        int userId, DateOnly from, DateOnly to, CancellationToken ct)
    {
        var (_, months, paid) = await GatherAsync(userId, from, to, ct);
        var sheet = new StringBuilder("Місяць;Днів;Годин;Нараховано;З них чайові;Надійшло\r\n");

        foreach (var row in months)
        {
            sheet
                .Append(row.Month).Append(';')
                .Append(row.Days).Append(';')
                .Append(row.Hours.ToString(CultureInfo.InvariantCulture)).Append(';')
                .Append(row.Earned.ToString(CultureInfo.InvariantCulture)).Append(';')
                .Append(row.Tips.ToString(CultureInfo.InvariantCulture)).Append(';')
                .Append(paid.GetValueOrDefault(row.Month).ToString(CultureInfo.InvariantCulture))
                .Append("\r\n");
        }

        return "﻿" + sheet;
    }

    /// <summary>The statement, as a file a landlord or a consulate will accept looking at.</summary>
    public async Task<byte[]> IncomeStatementAsync(
        int userId, DateOnly from, DateOnly to, string lang, CancellationToken ct)
    {
        var (who, months, paid) = await GatherAsync(userId, from, to, ct);

        if (months.Length == 0)
            throw new ValidationException("Nothing recorded in that period.");

        var uk = lang == "uk";

        string T(string ru, string ua) => uk ? ua : ru;

        var total = months.Sum(row => row.Earned);
        var culture = CultureInfo.GetCultureInfo(uk ? "uk-UA" : "ru-RU");

        string Money(decimal value) => value.ToString("#,##0.00", culture);

        string MonthName(string key)
        {
            var date = DateOnly.Parse($"{key}-01");

            return date.ToString("MMMM yyyy", culture);
        }

        var document = Document.Create(container =>
        {
            container.Page(page =>
            {
                page.Size(PageSizes.A4);
                page.Margin(46);
                page.DefaultTextStyle(style => style.FontSize(10.5f).FontColor("#1C1B18"));

                page.Header().Column(column =>
                {
                    column.Item().Text(T("Выписка о доходах", "Виписка про доходи"))
                        .FontSize(20).Bold();
                    column.Item().PaddingTop(2).Text(
                            $"{who.FirstName} {who.LastName}".Trim()
                            + $" · {from:dd.MM.yyyy} — {to:dd.MM.yyyy}")
                        .FontSize(11).FontColor("#6D6A61");

                    // The honesty line, at the top rather than the bottom:
                    // this paper works because of what it admits, not despite.
                    column.Item().PaddingTop(6).Text(T(
                            "Составлено по записям владельца аккаунта в приложении Shifter.",
                            "Складено за записами власника акаунта в застосунку Shifter."))
                        .FontSize(9).FontColor("#9C988C");

                    column.Item().PaddingTop(10).LineHorizontal(0.8f).LineColor("#E2DED4");
                });

                page.Content().PaddingVertical(14).Column(column =>
                {
                    column.Item().Table(table =>
                    {
                        table.ColumnsDefinition(columns =>
                        {
                            columns.RelativeColumn(3);
                            columns.RelativeColumn(1.2f);
                            columns.RelativeColumn(1.2f);
                            columns.RelativeColumn(2);
                            columns.RelativeColumn(2);
                        });

                        void Head(string text) => table.Cell()
                            .BorderBottom(0.8f).BorderColor("#C9C4B6").PaddingBottom(4)
                            .Text(text).FontSize(9).Bold().FontColor("#6D6A61");

                        Head(T("Месяц", "Місяць"));
                        Head(T("Дней", "Днів"));
                        Head(T("Часов", "Годин"));
                        Head(T("Начислено", "Нараховано"));
                        Head(T("Поступило", "Надійшло"));

                        foreach (var row in months)
                        {
                            table.Cell().PaddingVertical(4).Text(MonthName(row.Month));
                            table.Cell().PaddingVertical(4).Text($"{row.Days}");
                            table.Cell().PaddingVertical(4).Text(
                                row.Hours.ToString("0.#", culture));
                            table.Cell().PaddingVertical(4).Text(Money(row.Earned));
                            table.Cell().PaddingVertical(4).Text(
                                paid.TryGetValue(row.Month, out var came)
                                    ? Money(came)
                                    : "—");
                        }
                    });

                    column.Item().PaddingTop(12).AlignRight().Text(text =>
                    {
                        text.Span(T("Итого начислено: ", "Разом нараховано: "))
                            .FontSize(11);
                        text.Span(Money(total)).FontSize(13).Bold();
                    });
                });

                page.Footer().Column(column =>
                {
                    column.Item().LineHorizontal(0.5f).LineColor("#E2DED4");
                    column.Item().PaddingTop(6).Text(T(
                            $"Сформировано {DateTime.UtcNow:dd.MM.yyyy} · shifter.ink · Документ не является справкой работодателя.",
                            $"Сформовано {DateTime.UtcNow:dd.MM.yyyy} · shifter.ink · Документ не є довідкою роботодавця."))
                        .FontSize(8).FontColor("#9C988C");
                });
            });
        });

        return document.GeneratePdf();
    }
}
