using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

using Xunit;

namespace Shifter.Api.Tests;

/// <summary>
/// The board that knows who can: the day's cast in three piles, and the
/// collision a manager cannot make silently.
/// </summary>
[Collection("api")]
public sealed class RotaWhoOverHttpTests(Api api)
{
    private static async Task<JsonElement> Read(HttpResponseMessage response)
    {
        response.EnsureSuccessStatusCode();

        return JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;
    }

    [Fact]
    public async Task The_day_answers_who_is_free_who_stands_and_who_said_no()
    {
        var (manager, _) = await api.SignInAsync("boss");
        var (waiter, _) = await api.SignInAsync("kelner");
        var (busy, _) = await api.SignInAsync("busy");

        var team = await Read(await manager.PostAsJsonAsync("/shifter/v1/teams", new { name = "Смена" }));
        var teamId = team.GetProperty("id").GetInt32();
        var code = team.GetProperty("invite_code").GetString();

        foreach (var (client, name) in new[] { (waiter, "Олег"), (busy, "Ира") })
        {
            (await client.PostAsJsonAsync("/shifter/v1/teams/join", new
            {
                invite_code = code,
                display_name = name,
            })).EnsureSuccessStatusCode();
        }

        // The manager declares themself a trainee — self-service, wave 65 —
        // and the who-panel should say so on their free chip.
        (await manager.PatchAsJsonAsync($"/shifter/v1/teams/{teamId}/me", new
        {
            trainee = true,
        })).EnsureSuccessStatusCode();

        // Member ids come off the board, which is where the manager reads them.
        var board = await Read(await manager.GetAsync(
            $"/shifter/v1/teams/{teamId}/planner?from=2026-09-07&to=2026-09-13"));
        var busyId = board.GetProperty("members").EnumerateArray()
            .Single(member => member.GetProperty("display_name").GetString() == "Ира")
            .GetProperty("user_id").GetInt32();

        // Ира already stands on the 12th; Олег said he cannot.
        (await manager.PostAsJsonAsync($"/shifter/v1/teams/{teamId}/planner/assignments", new
        {
            user_id = busyId,
            date = "2026-09-12",
            title = "Бар",
            start = "16:00",
            end = "23:00",
            note = (string?)null,
        })).EnsureSuccessStatusCode();

        (await waiter.PostAsJsonAsync($"/shifter/v1/teams/{teamId}/planner/availability", new
        {
            date = "2026-09-12",
            reason = "экзамен",
        })).EnsureSuccessStatusCode();

        var who = await Read(await manager.GetAsync(
            $"/shifter/v1/teams/{teamId}/planner/who?date=2026-09-12"));

        var free = who.GetProperty("free").EnumerateArray().Select(row => row.GetProperty("name").GetString()).ToArray();
        var standing = who.GetProperty("busy").EnumerateArray().ToArray();
        var away = who.GetProperty("away").EnumerateArray().ToArray();

        // The manager themself is free; Ира stands with her shift named;
        // Олег is away with his own words.
        Assert.DoesNotContain("Ира", free);
        Assert.DoesNotContain("Олег", free);
        Assert.Contains(who.GetProperty("free").EnumerateArray(),
            row => row.GetProperty("trainee").GetBoolean());
        Assert.Contains(standing, row => row.GetProperty("name").GetString() == "Ира"
            && row.GetProperty("detail").GetString()!.Contains("Бар"));
        Assert.Contains(away, row => row.GetProperty("name").GetString() == "Олег"
            && row.GetProperty("detail").GetString() == "экзамен");
    }

    [Fact]
    public async Task One_person_cannot_stand_on_two_overlapping_shifts()
    {
        var (manager, _) = await api.SignInAsync("boss2");
        var (worker, _) = await api.SignInAsync("worker2");

        var team = await Read(await manager.PostAsJsonAsync("/shifter/v1/teams", new { name = "Смена" }));
        var teamId = team.GetProperty("id").GetInt32();

        (await worker.PostAsJsonAsync("/shifter/v1/teams/join", new
        {
            invite_code = team.GetProperty("invite_code").GetString(),
            display_name = "Ваня",
        })).EnsureSuccessStatusCode();

        var board2 = await Read(await manager.GetAsync(
            $"/shifter/v1/teams/{teamId}/planner?from=2026-09-14&to=2026-09-14"));
        var workerId = board2.GetProperty("members").EnumerateArray()
            .Single(member => member.GetProperty("display_name").GetString() == "Ваня")
            .GetProperty("user_id").GetInt32();

        (await manager.PostAsJsonAsync($"/shifter/v1/teams/{teamId}/planner/assignments", new
        {
            user_id = workerId,
            date = "2026-09-14",
            title = "Бар",
            start = "16:00",
            end = "23:00",
            note = (string?)null,
        })).EnsureSuccessStatusCode();

        // 22:00 overlaps the 16–23 bar shift: refused with both names.
        var clash = await manager.PostAsJsonAsync($"/shifter/v1/teams/{teamId}/planner/assignments", new
        {
            user_id = workerId,
            date = "2026-09-14",
            title = "Зал",
            start = "22:00",
            end = "02:00",
            note = (string?)null,
        });

        Assert.Equal(HttpStatusCode.Conflict, clash.StatusCode);

        var говорит = JsonDocument.Parse(await clash.Content.ReadAsStringAsync())
            .RootElement.GetProperty("message").GetString()!;

        Assert.Contains("Бар", говорит);
        Assert.Contains("Зал", говорит);

        // Back-to-back is not a clash: 23:00 starts where the bar ends.
        (await manager.PostAsJsonAsync($"/shifter/v1/teams/{teamId}/planner/assignments", new
        {
            user_id = workerId,
            date = "2026-09-14",
            title = "Закрытие",
            start = "23:00",
            end = "01:00",
            note = (string?)null,
        })).EnsureSuccessStatusCode();
    }
}
