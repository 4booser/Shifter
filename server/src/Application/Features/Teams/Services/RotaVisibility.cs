namespace Shifter.Application.Features.Teams.Services;

/// <summary>
/// Whether the crew may see one placement. Written once because the rule
/// existed twice: the rota filtered by it and the swap proposal did not, so
/// hiding a shift stopped working the moment somebody walked the ids — the
/// proposal succeeded and handed the shift's name and hours back in the reply.
///
/// Three states, not two. "I have not said" is the honest answer for almost
/// every shift, and collapsing it into a yes or a no makes changing the
/// default rewrite history.
/// </summary>
public static class RotaVisibility
{
    public static bool Allows(bool? teamVisible, bool ownerPrivateByDefault) => teamVisible switch
    {
        true => true,
        false => false,
        _ => !ownerPrivateByDefault,
    };
}
