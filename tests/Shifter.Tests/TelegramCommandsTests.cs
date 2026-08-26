using Shifter.Application.Features.Telegram;

using Xunit;

namespace Shifter.Tests;

public class TelegramCommandsTests
{
    [Theory]
    [InlineData("сегодня", TelegramCommand.Today)]
    [InlineData("/today", TelegramCommand.Today)]
    [InlineData("Завтра", TelegramCommand.Tomorrow)]
    [InlineData("місяць", TelegramCommand.Month)]
    [InlineData("Неделя", TelegramCommand.Week)]
    [InlineData("тиждень", TelegramCommand.Week)]
    [InlineData("/week", TelegramCommand.Week)]
    [InlineData("начал", TelegramCommand.ClockIn)]
    [InlineData("закончила", TelegramCommand.ClockOut)]
    [InlineData("/help", TelegramCommand.Help)]
    [InlineData("что-то левое", TelegramCommand.None)]
    public void ReadsThePhrasebook(string text, TelegramCommand expected)
        => Assert.Equal(expected, TelegramCommands.Parse(text).Command);

    [Fact]
    public void ASixDigitNumberIsALinkCode()
    {
        var (command, argument) = TelegramCommands.Parse("482913");

        Assert.Equal(TelegramCommand.Link, command);
        Assert.Equal("482913", argument);
    }

    [Fact]
    public void StartCarriesItsPayload()
    {
        var (command, argument) = TelegramCommands.Parse("/start 482913");

        Assert.Equal(TelegramCommand.Link, command);
        Assert.Equal("482913", argument);
    }

    [Fact]
    public void TimeZoneKeepsTheArgumentCase()
    {
        var (command, argument) = TelegramCommands.Parse("/tz Europe/Warsaw");

        Assert.Equal(TelegramCommand.TimeZone, command);
        Assert.Equal("Europe/Warsaw", argument);
    }

    [Theory]
    [InlineData(1, "смена")]
    [InlineData(2, "смены")]
    [InlineData(5, "смен")]
    [InlineData(11, "смен")]
    [InlineData(14, "смен")]
    [InlineData(21, "смена")]
    [InlineData(102, "смены")]
    [InlineData(111, "смен")]
    public void Bends_the_counted_word(int count, string expected)
        => Assert.Equal(expected, TelegramCommands.Plural(count, "смена", "смены", "смен"));
}

