namespace Shifter.Application.Features.business.DTOs;

public record DayDto(
    int[]? shifts_ids,
    int? sales,
    decimal? tips,
    string? note,
    DateOnly date
    );