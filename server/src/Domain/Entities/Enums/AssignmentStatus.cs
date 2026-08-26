namespace Shifter.Domain.Entities.Enums;

/// <summary>
/// The life of a planned assignment. Draft is the manager thinking out loud;
/// Published is the question put to the person; the last two are their
/// answer, and only they can give it.
/// </summary>
public enum AssignmentStatus
{
    Draft = 0,
    Published = 1,
    Accepted = 2,
    Declined = 3,
}
