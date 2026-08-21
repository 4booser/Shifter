using Shifter.Application.Common.Exceptions;
using Shifter.Application.Features.business.Services;
using Shifter.Domain.Entities;

using Xunit;

namespace Shifter.Tests;

/// <summary>
/// Removing a place of work is destructive in a way that is not obvious: the
/// templates keep working, but the tip-out, meal and tax rules they took from
/// that place are gone, so days already worked stop being worth what they were.
/// These pin down that it cannot happen by accident, and that it can happen at
/// all — the handler used to refuse outright, which left no way to remove a
/// place that was simply typed in wrong.
/// </summary>
public class LocationDeleteTests
{
    private readonly FakeShifterQuery _query = new();
    private readonly FakeShifterCommand _command = new();
    private readonly LocationHandler _handler;

    public LocationDeleteTests()
    {
        _handler = new LocationHandler(_command, _query);
        _query.Locations.Add(Build.Place(1));
    }

    [Fact]
    public async Task APlaceNothingUsesIsDeleted()
    {
        _command.ShiftsAtLocation = 0;

        await _handler.DeleteAsync(Build.UserId, 1, detach: false, CancellationToken.None);

        Assert.Contains(_command.Deleted, item => item is Location);
        Assert.Null(_command.DetachedFrom);
    }

    [Fact]
    public async Task APlaceWithShiftsIsRefusedUntilItIsAskedForTwice()
    {
        _command.ShiftsAtLocation = 3;

        await Assert.ThrowsAsync<ConflictException>(() => _handler.DeleteAsync(
            Build.UserId, 1, detach: false, CancellationToken.None));

        Assert.Empty(_command.Deleted);
    }

    [Fact]
    public async Task DetachingClearsTheTemplatesAndThenDeletes()
    {
        _command.ShiftsAtLocation = 3;

        await _handler.DeleteAsync(Build.UserId, 1, detach: true, CancellationToken.None);

        Assert.Equal(1, _command.DetachedFrom);
        Assert.Contains(_command.Deleted, item => item is Location);
    }

    [Fact]
    public async Task SomebodyElsesPlaceIsNotFound()
    {
        await Assert.ThrowsAsync<NotFoundException>(() => _handler.DeleteAsync(
            Build.UserId + 1, 1, detach: true, CancellationToken.None));
    }
}
