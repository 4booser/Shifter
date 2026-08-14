using Shifter.Application.Common.Exceptions;
using Shifter.Application.Features.business.DTOs;
using Shifter.Domain.Entities;
using Shifter.Infrastructure.Repositories.Interfaces;
using ValidationException = System.ComponentModel.DataAnnotations.ValidationException;

namespace Shifter.Application.Features.business.Services;

public class DayAddHandler : IDayAddHandler
{
    private readonly IShifterCommand _shifterCommand;
    private readonly IShifterQuery _shifterQuery;

    public DayAddHandler(
        IShifterCommand shifterCommand,
        IShifterQuery shifterQuery)
    {
        _shifterCommand = shifterCommand;
        _shifterQuery = shifterQuery;
    }

    
    public async Task Handle(DayDto request, CancellationToken ct)
    {
        if (request.date.GetType() != typeof(DateOnly))
            throw new ValidationException("Date must be a DateOnly object.");
        
        Day Day = new Day()
            { Date = request.date };

        if (request.shifts_ids.GetType() != typeof(int[]))
         throw new ValidationException("Shifts ids must be an array of integers.");
        else
         foreach (int shiftId in request.shifts_ids)
            {
                Shift shift = await _shifterQuery.GetShiftByIdAsync(shiftId, ct);
                
                if (shift is not null)
                   Day.Shifts.Add(shift); 
                
                else
                    throw new ValidationException("Shift with this id does not exist."); } 
        
        if (request.sales.GetType() != typeof(int))
            throw new ValidationException("Sales must be an integer.");
        
        if (request.tips is not null)
        { if (request.tips?.GetType() != typeof(int))
                throw new ValidationException("Tips must be an integer."); }
        
        Day.Tips = request.tips;
        
        if (request.note is not null)
        { if (request.note?.Length > 500)
                throw new ValidationException("Note length must be less than 500 characters."); }
        
        Day.Note = request.note;

        if (!await _shifterCommand.AddDayAsync(Day, ct))
            throw new ForbiddenException("Can`t add day.");
    }
}