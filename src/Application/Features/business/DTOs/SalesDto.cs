namespace Shifter.Application.Features.business.DTOs;

/// <summary>A catalogue position: price per unit and the worker's percentage.</summary>
public record SalesDto(
    int id,
    string name,
    decimal price,
    decimal? percentage,
    bool archived
    );

public record SalesCreateDto(
    string name,
    decimal price,
    decimal? percentage
    );
