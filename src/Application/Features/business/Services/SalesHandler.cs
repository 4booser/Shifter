using Shifter.Application.Common.Exceptions;
using Shifter.Application.Features.business.DTOs;
using Shifter.Application.Features.business.Services.Interfaces;
using Shifter.Domain.Entities;
using Shifter.Infrastructure.Repositories.Interfaces;

namespace Shifter.Application.Features.business.Services;

public class SalesHandler : ISalesHandler
{
    private const int NameMaxLength = 60;

    private readonly IShifterCommand _shifterCommand;
    private readonly IShifterQuery _shifterQuery;

    public SalesHandler(IShifterCommand shifterCommand, IShifterQuery shifterQuery)
    {
        _shifterCommand = shifterCommand;
        _shifterQuery = shifterQuery;
    }

    public async Task<SalesDto[]> ListAsync(
        int userId,
        bool includeArchived,
        CancellationToken ct)
    {
        Sales[] sales = await _shifterQuery.GetSalesAsync(userId, includeArchived, ct);

        return sales.Select(ToDto).ToArray();
    }

    public async Task<SalesDto> CreateAsync(
        SalesCreateDto request,
        int userId,
        CancellationToken ct)
    {
        Sales sales = new Sales()
        {
            UserId = userId,
            Name = string.Empty,
            Price = 0m
        };

        Apply(request, sales);

        if (! await _shifterCommand.AddSalesAsync(sales, ct))
            throw new ForbiddenException("Can`t add sales position.");

        return ToDto(sales);
    }

    public async Task<SalesDto> UpdateAsync(
        SalesCreateDto request,
        int userId,
        int id,
        CancellationToken ct)
    {
        Sales sales = await _shifterQuery.GetSalesItemAsync(userId, id, ct)
            ?? throw new NotFoundException("Sales position does not exist.");

        // Safe to reprice: days copied the price and percentage when they were
        // recorded, so past earnings do not move.
        Apply(request, sales);

        await _shifterCommand.SaveAsync(ct);

        return ToDto(sales);
    }

    public async Task<SalesDto> SetArchivedAsync(
        int userId,
        int id,
        bool archived,
        CancellationToken ct)
    {
        Sales sales = await _shifterQuery.GetSalesItemAsync(userId, id, ct)
            ?? throw new NotFoundException("Sales position does not exist.");

        if (archived) sales.ToArchive();
        else sales.Restore();

        await _shifterCommand.SaveAsync(ct);

        return ToDto(sales);
    }

    public async Task DeleteAsync(int userId, int id, CancellationToken ct)
    {
        Sales sales = await _shifterQuery.GetSalesItemAsync(userId, id, ct)
            ?? throw new NotFoundException("Sales position does not exist.");

        int used = await _shifterCommand.CountSalesUsageAsync(id, ct);

        // The recorded days hold their own copy of the price, but the rows
        // themselves would cascade away and take the earnings with them.
        if (used > 0)
        {
            throw new ConflictException(
                $"{used} recorded days use this position. Archive it instead.");
        }

        await _shifterCommand.DeleteSalesAsync(sales, ct);
    }

    private static void Apply(SalesCreateDto request, Sales sales)
    {
        if (string.IsNullOrWhiteSpace(request.name))
            throw new ValidationException("Name is empty.");

        if (request.name.Length > NameMaxLength)
            throw new ValidationException($"Name must be at most {NameMaxLength} characters.");

        if (request.price < 0)
            throw new ValidationException("Price cannot be negative.");

        // A share of the price, so anything outside 0-100 is a typo rather than
        // a rate: 750 instead of 7.5 would quietly inflate every total.
        if (request.percentage is < 0 or > 100)
            throw new ValidationException("Percentage must be between 0 and 100.");

        sales.Name = request.name.Trim();
        sales.Price = request.price;
        sales.Percentage = request.percentage;
    }

    internal static SalesDto ToDto(Sales sales) => new SalesDto(
        sales.Id,
        sales.Name,
        sales.Price,
        sales.Percentage,
        sales.Archived
    );
}
