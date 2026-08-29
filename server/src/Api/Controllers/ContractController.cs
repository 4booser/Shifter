using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

using Shifter.Domain.Entities;

namespace Shifter.Api.Controllers;

/// <summary>
/// What to ask before signing.
///
/// The text never leaves the request. It is not stored, not logged, and not
/// sent anywhere: a contract carries somebody's name, their pay and their
/// employer, and the whole feature is a keyword search that has no reason to
/// keep any of it.
/// </summary>
[Authorize]
[Route("shifter/v1/contract")]
public class ContractController : ControllerBase
{
    /// <summary>Longer than any contract anybody pastes into a phone.</summary>
    private const int MaxLength = 200_000;

    [HttpPost("questions")]
    public IActionResult Questions([FromBody] ContractDto request)
    {
        var text = request.text ?? string.Empty;

        if (text.Length > MaxLength) text = text[..MaxLength];

        var missing = ContractQuestions.Missing(text);
        var read = text.Trim().Length >= ContractQuestions.MinimumLength;

        return Ok(new
        {
            // Whether there was enough text to read at all, said separately
            // from "nothing is missing" — a fragment and a complete contract
            // both produce an empty list and they are not the same answer.
            read,
            missing,
            // Raised whatever the contract says about them: these are the two
            // usually written in a way that is true and incomplete.
            // Empty where there was nothing to read. A fragment produced two
            // questions about a document nobody submitted, and a client that
            // forgot to check `read` would have shown them.
            also = read
                ? ContractQuestions.AlwaysWorthAsking.Where(topic => !missing.Contains(topic)).ToArray()
                : [],
        });
    }
}

public record ContractDto(string? text);
