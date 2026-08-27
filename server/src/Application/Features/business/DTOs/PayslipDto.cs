namespace Shifter.Application.Features.business.DTOs;

/// <summary>
/// One line somebody can check against a payslip: what the app worked out, how
/// it got there, and room for what the paper says.
///
/// The formula is the point. "₴1 440" invites an argument about whose number is
/// right; "6 ч × 200 × 1,2 = ₴1 440" invites a conversation about which of the
/// four figures is wrong, and that is a conversation somebody can win.
/// </summary>
public record PayslipLineDto(
    /// <summary>base, overtime, night, holiday, salary, revenue, tips, tip_out, meals, fines, tax.</summary>
    string kind,
    /// <summary>What the app says this line comes to.</summary>
    decimal amount,
    /// <summary>How it got there, in the units the payslip uses.</summary>
    string formula,
    /// <summary>Hours behind the line, where the line is made of hours.</summary>
    double hours,
    /// <summary>True where the line is taken off rather than added.</summary>
    bool deducted);

/// <summary>
/// A pay period at one place, broken into the lines a payslip has — so the two
/// can be read side by side rather than compared as two single totals.
/// </summary>
public record PayslipCheckDto(
    int location_id,
    string location_name,
    string currency,
    DateOnly period_from,
    DateOnly period_to,
    double hours,
    int days_worked,
    PayslipLineDto[] lines,
    /// <summary>Everything added, before anything is taken off.</summary>
    decimal gross,
    /// <summary>What should reach a pocket.</summary>
    decimal net,
    /// <summary>Holiday accrued over the period, owed later and never part of net.</summary>
    decimal holiday_accrued);
