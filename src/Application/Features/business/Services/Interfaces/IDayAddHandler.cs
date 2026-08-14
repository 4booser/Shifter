using Shifter.Application.Features.business.DTOs;

namespace Shifter.Application.Features;

public interface IDayAddHandler
{
    public Task Handle(DayDto day, CancellationToken ct);
}