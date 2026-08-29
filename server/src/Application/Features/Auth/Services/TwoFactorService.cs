using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Shifter.Application.Common.Exceptions;
using Shifter.Domain.Entities;
using Shifter.Infrastructure.Persistence.DbContexts;

namespace Shifter.Application.Features.Auth.Services;

/// <summary>
/// The second factor's whole life: setting it up, proving it, standing at
/// the door during sign-in, and the backup codes for the day the phone is
/// gone. Tickets are in-memory — one node, five minutes, nothing worth a
/// table.
/// </summary>
public sealed class TwoFactorService
{
    private static readonly ConcurrentDictionary<string, (int UserId, DateTime Expires)> Tickets = new();
    private static readonly TimeSpan TicketLife = TimeSpan.FromMinutes(5);

    private readonly ShifterDbContext _db;
    private readonly LoginThrottle _throttle;

    public TwoFactorService(ShifterDbContext db, LoginThrottle throttle)
    {
        _db = db;
        _throttle = throttle;
    }

    // Colons cannot appear in logins, so these keys never collide with the
    // front door's own.
    private static string DoorKey(int userId) => $"2fa:{userId}";

    // ==== Setup ====

    public async Task<(string Secret, string Url)> BeginAsync(int userId, CancellationToken ct)
    {
        var user = await UserAsync(userId, ct);

        if (user.TotpEnabledAt is not null)
            throw new ConflictException("Two-factor is already on.");

        user.TotpSecret = Totp.GenerateSecret();
        await _db.SaveChangesAsync(ct);

        return (user.TotpSecret, Totp.OtpauthUrl(user.TotpSecret, user.Login));
    }

    /// <summary>Proving one code turns the secret on and mints the backups.</summary>
    public async Task<string[]> EnableAsync(int userId, string code, CancellationToken ct)
    {
        var user = await UserAsync(userId, ct);

        if (user.TotpSecret is null)
            throw new ValidationException("Set up first.");

        if (user.TotpEnabledAt is not null)
            throw new ConflictException("Two-factor is already on.");

        if (!Totp.Verify(user.TotpSecret, code))
            throw new ValidationException("That code did not match. Codes rotate every 30 seconds.");

        var backups = Enumerable.Range(0, 8)
            .Select(_ => RandomNumberGenerator.GetInt32(0, 100_000_000).ToString("D8"))
            .ToArray();

        user.TotpEnabledAt = DateTime.UtcNow;
        user.BackupCodeHashes = string.Join(';', backups.Select(Hash));
        await _db.SaveChangesAsync(ct);

        return backups;
    }

    public async Task DisableAsync(int userId, string code, CancellationToken ct)
    {
        var user = await UserAsync(userId, ct);

        if (user.TotpEnabledAt is null || user.TotpSecret is null)
            throw new ConflictException("Two-factor is not on.");

        // Turning the lock off is as sensitive as walking through it; the
        // same door count applies.
        _throttle.EnsureOpen(DoorKey(userId));

        if (!Totp.Verify(user.TotpSecret, code) && !BurnBackup(user, code))
        {
            _throttle.RecordFailure(DoorKey(userId));
            throw new ValidationException("That code did not match.");
        }

        _throttle.Reset(DoorKey(userId));

        user.TotpSecret = null;
        user.TotpEnabledAt = null;
        user.BackupCodeHashes = null;
        await _db.SaveChangesAsync(ct);
    }

    // ==== The door ====

    public static bool Required(User user) => user.TotpEnabledAt is not null;

    public static string IssueTicket(int userId)
    {
        var ticket = Convert.ToHexStringLower(RandomNumberGenerator.GetBytes(24));

        Tickets[ticket] = (userId, DateTime.UtcNow + TicketLife);

        // Housekeeping on the way through; the dictionary stays tiny.
        foreach (var (key, value) in Tickets)
        {
            if (value.Expires < DateTime.UtcNow) Tickets.TryRemove(key, out _);
        }

        return ticket;
    }

    /// <summary>Trades a ticket plus a code for the account — or throws.</summary>
    public async Task<(int Id, string Login)> RedeemAsync(string ticket, string code, CancellationToken ct)
    {
        if (!Tickets.TryGetValue(ticket, out var entry) || entry.Expires < DateTime.UtcNow)
            throw new UnauthorizedException("Sign in again — the code window expired.");

        // The lock outlives the ticket: a fresh password sign-in mints a new
        // ticket, and without this the second door could be knocked forever.
        _throttle.EnsureOpen(DoorKey(entry.UserId));

        var user = await UserAsync(entry.UserId, ct);

        var totpOk = user.TotpSecret is not null && Totp.Verify(user.TotpSecret, code);
        var backupOk = !totpOk && BurnBackup(user, code);

        if (!totpOk && !backupOk)
        {
            _throttle.RecordFailure(DoorKey(entry.UserId));
            throw new UnauthorizedException("That code did not match.");
        }

        if (backupOk) await _db.SaveChangesAsync(ct);

        Tickets.TryRemove(ticket, out _);
        _throttle.Reset(DoorKey(entry.UserId));

        return (user.Id, user.Login);
    }

    // ==== Backup codes ====

    private static string Hash(string code)
        => Convert.ToHexStringLower(SHA256.HashData(Encoding.ASCII.GetBytes(code)));

    /// <summary>True burns the code: each one opens the door exactly once.</summary>
    private static bool BurnBackup(User user, string code)
    {
        if (user.BackupCodeHashes is null || code.Length != 8 || !code.All(char.IsAsciiDigit))
            return false;

        var hashes = user.BackupCodeHashes.Split(';', StringSplitOptions.RemoveEmptyEntries).ToList();
        var match = Hash(code);

        if (!hashes.Remove(match)) return false;

        user.BackupCodeHashes = string.Join(';', hashes);

        return true;
    }

    private async Task<User> UserAsync(int userId, CancellationToken ct)
        => await _db.Users.FirstOrDefaultAsync(user => user.Id == userId, ct)
            ?? throw new NotFoundException("User does not exist.");
}
