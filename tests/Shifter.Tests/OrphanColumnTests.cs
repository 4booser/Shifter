using System.Reflection;

using Shifter.Domain.Entities;

using Xunit;

namespace Shifter.Tests;

/// <summary>Every column that names a person by id has to say what happens when that person deletes their account.</summary>
public class OrphanColumnTests
{
    /// <summary>A column is answered for when its entity carries a navigation to <see cref="User"/> — that is what makes EF…</summary>
    private static readonly Dictionary<string, string> HandledByHand = new()
    {
        ["TelegramLink.UserId"] = "cleared explicitly before the account row goes",
        ["GigReview.AuthorUserId"] = "cleared explicitly: a review names two people",
        ["GigReview.TargetUserId"] = "cleared explicitly: a review names two people",
        ["ShiftSwap.ProposerUserId"] = "cleared explicitly: a swap names two people",
        ["ShiftSwap.TargetUserId"] = "cleared explicitly: a swap names two people",
        ["Team.OwnerUserId"] = "handed to the longest-standing member, or the team goes",
        ["TeamMember.UserId"] = "the member row is removed with the account",
        ["User.InvitedByUserId"] = "self-referential; a referrer leaving is not the invitee's problem",
        ["JwtToken.UserId"] = "a different database entirely; every session is revoked before the account row goes",
    };

    private static IEnumerable<Type> Entities => typeof(Day).Assembly
        .GetTypes()
        .Where(type => type.Namespace == typeof(Day).Namespace
            && type.IsClass
            && !type.IsAbstract
            && type.GetProperty("Id") is not null);

    [Fact]
    public void EveryColumnNamingAPersonSaysWhatHappensWhenTheyLeave()
    {
        List<string> unanswered = [];

        foreach (Type entity in Entities)
        {
            bool hasNavigation = entity
                .GetProperties(BindingFlags.Public | BindingFlags.Instance)
                .Any(property => property.PropertyType == typeof(User));

            foreach (PropertyInfo property in entity.GetProperties())
            {
                if (!property.Name.EndsWith("UserId", StringComparison.Ordinal)) continue;
                if (property.PropertyType != typeof(int) && property.PropertyType != typeof(int?)) continue;

                string key = $"{entity.Name}.{property.Name}";

                if (HandledByHand.ContainsKey(key) || hasNavigation) continue;

                unanswered.Add(key);
            }
        }

        Assert.Empty(unanswered);
    }

    [Fact]
    public void TheListOfHandledColumnsHasNoLeftovers()
    {
        // A named exception for a column that no longer exists is a comment
        // pretending to be a rule, and the next person reads it as one.
        string[] present = Entities
            .SelectMany(entity => entity.GetProperties()
                .Where(property => property.Name.EndsWith("UserId", StringComparison.Ordinal))
                .Select(property => $"{entity.Name}.{property.Name}"))
            .ToArray();

        foreach (string named in HandledByHand.Keys)
            Assert.Contains(named, present);
    }
}
