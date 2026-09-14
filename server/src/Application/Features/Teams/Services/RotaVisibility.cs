namespace Shifter.Application.Features.Teams.Services;

/// <summary>Whether the crew may see one placement.</summary>
public static class RotaVisibility
{
    public static bool Allows(bool? teamVisible, bool ownerPrivateByDefault) => teamVisible switch
    {
        true => true,
        false => false,
        _ => !ownerPrivateByDefault,
    };
}
