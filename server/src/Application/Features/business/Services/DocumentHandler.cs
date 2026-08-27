using Shifter.Application.Common.Exceptions;
using Shifter.Application.Common.Time;
using Shifter.Application.Features.business.DTOs;
using Shifter.Domain.Entities;
using Shifter.Infrastructure.Persistence.DbContexts;

using Microsoft.EntityFrameworkCore;

namespace Shifter.Application.Features.business.Services;

/// <summary>
/// The papers without which somebody is not allowed on shift. Small on
/// purpose: a date, a name, and the arithmetic that turns them into a warning
/// a month before it matters rather than on the morning it does.
/// </summary>
public class DocumentHandler
{
    private readonly ShifterDbContext _db;
    private readonly AppClock _clock;

    public DocumentHandler(ShifterDbContext db, AppClock? clock = null)
    {
        _db = db;
        _clock = clock ?? new AppClock();
    }

    public async Task<DocumentDto[]> ListAsync(int userId, CancellationToken ct)
    {
        WorkDocument[] documents = await _db.Documents
            .AsNoTracking()
            .Where(document => document.UserId == userId)
            .OrderBy(document => document.ExpiresOn)
            .ToArrayAsync(ct);

        DateOnly today = _clock.Today;

        return documents.Select(document => ToDto(document, today)).ToArray();
    }

    public async Task<DocumentDto> SaveAsync(
        int userId,
        int? id,
        DocumentSaveDto request,
        CancellationToken ct)
    {
        string name = (request.name ?? string.Empty).Trim();

        if (name.Length is 0 or > WorkDocument.NameMax)
            throw new ValidationException($"A name of 1–{WorkDocument.NameMax} characters, please.");

        // A date fifty years out is a typo, and a typo here means the reminder
        // never comes — which is the one failure this feature exists to avoid.
        if (request.expires_on.Year is < 2000 or > 2100)
            throw new ValidationException("That expiry date does not look right.");

        WorkDocument document = id is int existing
            ? await _db.Documents.FirstOrDefaultAsync(
                  row => row.Id == existing && row.UserId == userId, ct)
              ?? throw new NotFoundException("That document does not exist.")
            : new WorkDocument { UserId = userId, Name = name, ExpiresOn = request.expires_on };

        document.Kind = DocumentRules.ParseKind(request.kind);
        document.Name = name;
        document.ExpiresOn = request.expires_on;
        document.Note = DocumentRules.CleanNote(request.note);

        if (id is null) _db.Documents.Add(document);

        await _db.SaveChangesAsync(ct);

        return ToDto(document, _clock.Today);
    }

    public async Task DeleteAsync(int userId, int id, CancellationToken ct)
    {
        WorkDocument document = await _db.Documents
            .FirstOrDefaultAsync(row => row.Id == id && row.UserId == userId, ct)
            ?? throw new NotFoundException("That document does not exist.");

        _db.Documents.Remove(document);
        await _db.SaveChangesAsync(ct);
    }

    private static DocumentDto ToDto(WorkDocument document, DateOnly today) => new DocumentDto(
        document.Id,
        document.Kind,
        document.Name,
        document.ExpiresOn,
        document.Note,
        document.DaysLeft(today),
        DocumentRules.StateOf(document, today));
}
