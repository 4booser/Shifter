using Shifter.Domain.Entities;

namespace Shifter.Application.Features.business.Services;

/// <summary>When a piece of paper is worth mentioning, and how loudly.</summary>
public static class DocumentRules
{
    /// <summary>A month is the honest warning for a medical book: that is roughly how long the clinic takes if you have to…</summary>
    public const int WarnDays = 30;
    public const int UrgentDays = 7;

    public static string ParseKind(string? value) => value?.ToLowerInvariant() switch
    {
        "medical" => "medical",
        "sanitary" => "sanitary",
        "certificate" => "certificate",
        "licence" => "licence",
        "permit" => "permit",
        _ => "other",
    };

    /// <summary>How a document stands: "expired", "urgent", "soon" or "fine".</summary>
    public static string StateOf(WorkDocument document, DateOnly today)
    {
        int left = document.DaysLeft(today);

        if (left < 0) return "expired";
        if (left <= UrgentDays) return "urgent";
        if (left <= WarnDays) return "soon";

        return "fine";
    }

    /// <summary>The ones worth putting in front of somebody today.</summary>
    public static WorkDocument[] Pressing(IEnumerable<WorkDocument> documents, DateOnly today)
        => documents
            .Where(document => StateOf(document, today) != "fine")
            .OrderBy(document => document.ExpiresOn)
            .ToArray();

    public static string? CleanNote(string? note)
    {
        string? text = note?.Trim();

        if (string.IsNullOrEmpty(text)) return null;

        return text.Length <= WorkDocument.NoteMax ? text : text[..WorkDocument.NoteMax];
    }
}
