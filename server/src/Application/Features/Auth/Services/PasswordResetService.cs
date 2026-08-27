using System.Security.Cryptography;
using Shifter.Infrastructure.Repositories.Interfaces;
using System.Text;

using Microsoft.EntityFrameworkCore;

using Shifter.Application.Common.Exceptions;
using Shifter.Application.Features.Mail;
using Shifter.Domain.Entities;
using Shifter.Infrastructure.Persistence.DbContexts;

namespace Shifter.Application.Features.Auth.Services;

/// <summary>
/// Losing a password stops meaning losing the account. A request always
/// answers the same way whether or not the address is known — the letter is
/// the only channel that reveals anything — and the ticket it carries is
/// single-use, hour-long and stored only as a hash.
/// </summary>
public sealed class PasswordResetService
{
    public const int MinPasswordLength = 8;

    private readonly ShifterDbContext _db;
    private readonly MailSender _mail;
    private readonly ITokenCommand _tokens;

    public PasswordResetService(ShifterDbContext db, MailSender mail, ITokenCommand tokens)
    {
        _db = db;
        _mail = mail;
        _tokens = tokens;
    }

    /// <summary>Hex SHA-256 — the same shape the backup codes use.</summary>
    public static string HashToken(string token)
        => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token))).ToLowerInvariant();

    public static string NewToken()
        => Convert.ToHexString(RandomNumberGenerator.GetBytes(32)).ToLowerInvariant();

    /// <summary>
    /// Always succeeds from the caller's point of view. Returns the token
    /// only when the environment asked for it (development), never in
    /// production, where the letter is the only way to learn it.
    /// </summary>
    public async Task<string?> RequestAsync(string? email, bool revealToken, CancellationToken ct)
    {
        var address = email?.Trim().ToLowerInvariant();

        if (string.IsNullOrEmpty(address)) return null;

        var user = await _db.Users.FirstOrDefaultAsync(row => row.Email == address, ct);

        if (user is null) return null;

        // One live ticket per account: asking twice invalidates the first,
        // so a forwarded old letter cannot be used behind the person's back.
        var live = await _db.PasswordResets
            .Where(reset => reset.UserId == user.Id && reset.UsedAt == null)
            .ToArrayAsync(ct);

        foreach (var reset in live) reset.UsedAt = DateTime.UtcNow;

        var token = NewToken();

        _db.PasswordResets.Add(new PasswordReset { UserId = user.Id, TokenHash = HashToken(token) });
        await _db.SaveChangesAsync(ct);

        var link = $"{_mail.Origin}/reset?token={token}";

        await _mail.SendAsync(
            address,
            "Shifter: восстановление пароля",
            $"""
             <p>Кто-то — надеемся, вы — попросил сбросить пароль в Shifter.</p>
             <p><a href="{link}">Задать новый пароль</a></p>
             <p>Ссылка живёт час и срабатывает один раз. Если это были не вы, просто удалите письмо: пароль останется прежним.</p>
             """,
            ct);

        return revealToken ? token : null;
    }

    /// <summary>Spends the ticket and sets the new password.</summary>
    public async Task RedeemAsync(string? token, string? password, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(password) || password.Length < MinPasswordLength)
            throw new ValidationException($"The password must be at least {MinPasswordLength} characters.");

        if (string.IsNullOrWhiteSpace(token))
            throw new ValidationException("The link is incomplete.");

        var hash = HashToken(token.Trim());
        var reset = await _db.PasswordResets
            .Include(row => row.User)
            .FirstOrDefaultAsync(row => row.TokenHash == hash, ct)
            ?? throw new ValidationException("This link is no longer valid — ask for a new one.");

        if (reset.UsedAt is not null || reset.ExpiresAt <= DateTime.UtcNow)
            throw new ValidationException("This link is no longer valid — ask for a new one.");

        if (reset.User is null)
            throw new NotFoundException("No such account.");

        reset.User.PasswordHash = BCrypt.Net.BCrypt.HashPassword(password);
        reset.UsedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync(ct);

        // A reset is the same situation as a deliberate change: somebody
        // believes another person is in their account. Changing the password
        // from inside already revokes every session; the reset link did not,
        // so whoever had the old password kept refreshing their way back in
        // for the full life of their refresh token.
        await _tokens.RevokeAllAsync(reset.User.Id, ct);
    }
}
