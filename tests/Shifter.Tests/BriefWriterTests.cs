using Shifter.Application.Features.Brief;

using Xunit;

namespace Shifter.Tests;

public class BriefWriterTests
{
    private static BriefFacts Facts(
        string? shift = "Бар",
        decimal earned = 12000,
        int shifts = 9,
        double hours = 72,
        decimal? goal = null,
        double? progress = null,
        int streak = 0,
        decimal tipsShare = 0m,
        string[]? highlights = null)
        => new(
            "2026-08-27", "Thursday", shift, shift is null ? null : "11:00", shift is null ? null : "19:00",
            earned, shifts, hours, goal, progress, 18000, streak, 2600, "14.08", tipsShare, 3, null,
            highlights ?? []);

    [Fact]
    public void A_working_day_leads_with_the_shift()
    {
        var (headline, body, tip, mood) = BriefWriter.Compose(Facts());

        Assert.Contains("Бар", headline);
        Assert.Contains("11:00", headline);
        Assert.Contains("9 смен", body);
        Assert.NotEmpty(tip);
        Assert.NotEmpty(mood);
    }

    [Fact]
    public void A_day_off_says_so_instead_of_inventing_a_shift()
    {
        var (headline, _, tip, _) = BriefWriter.Compose(Facts(shift: null));

        Assert.Equal("Сегодня выходной", headline);
        Assert.Contains("Выходной", tip);
    }

    [Fact]
    public void A_goal_in_reach_is_counted_down_not_celebrated_early()
    {
        var (_, body, _, _) = BriefWriter.Compose(Facts(earned: 12000, goal: 30000, progress: 0.4));

        Assert.Contains("До цели", body);
        Assert.Contains("40%", body);
    }

    [Fact]
    public void A_goal_already_taken_is_said_plainly()
    {
        var (_, body, _, _) = BriefWriter.Compose(Facts(earned: 31000, goal: 30000, progress: 1.03));

        Assert.Contains("уже взята", body);
    }

    [Fact]
    public void A_streak_is_mentioned_only_once_it_is_a_streak()
    {
        Assert.DoesNotContain("Серия", BriefWriter.Compose(Facts(streak: 2)).Body);
        Assert.Contains("Серия: 4", BriefWriter.Compose(Facts(streak: 4)).Body);
    }

    [Fact]
    public void An_insight_wins_over_the_generic_advice()
    {
        var (_, _, tip, _) = BriefWriter.Compose(Facts(highlights: ["Пятницы платят на 24% больше"]));

        Assert.Equal("Пятницы платят на 24% больше", tip);
    }

    [Fact]
    public void Heavy_tips_earn_their_own_reminder()
    {
        var (_, _, tip, _) = BriefWriter.Compose(Facts(tipsShare: 0.25m));

        Assert.Contains("Чаевые", tip);
        Assert.Contains("25%", tip);
    }
}
