using Shifter.Application.Features.business.DTOs;
using Shifter.Domain.Entities;

namespace Shifter.Application.Features.business.Services;

/// <summary>What a place costs to get to, folded back into the hourly rate.</summary>
public static class CommuteMath
{
    /// <summary>The place's hourly rate once the journey is counted as part of the job: take-home less the fares, over hours…</summary>
    public static CommuteDto? For(Location place, LocationTotalDto total)
    {
        if (place.CommuteMinutes <= 0 && place.CommuteCost <= 0m) return null;
        if (total.days_worked == 0) return null;

        // Both ways, once per day worked rather than once per shift: a split
        // shift at the same restaurant is usually one journey there and one
        // back, and counting it twice would flatter every other place.
        double travelHours = total.days_worked * 2 * place.CommuteMinutes / 60d;
        decimal fares = total.days_worked * 2 * place.CommuteCost;

        double hours = total.hours + travelHours;
        decimal net = total.net - fares;

        return new CommuteDto(
            place.CommuteMinutes,
            place.CommuteCost,
            Math.Round(travelHours, 2),
            fares,
            Math.Round(hours, 2),
            net,
            hours <= 0 ? 0m : Math.Round(net / (decimal)hours, 2));
    }
}
