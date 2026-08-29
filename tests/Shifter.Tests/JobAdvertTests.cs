using Shifter.Domain.Entities;

using Xunit;

namespace Shifter.Tests;

/// <summary>
/// A job advert read into the beginnings of a shift. The rule throughout: what
/// it cannot read it leaves blank, because a blank field is a question and a
/// wrong rate is an answer.
/// </summary>
public class JobAdvertTests
{
    [Fact]
    public void ItReadsTheOrdinaryAdvert()
    {
        var read = JobAdvert.Parse(
            "Шукаємо бармена. Зміни 10:00–22:00, ставка 250 грн/годину, плюс 5% з бару.");

        Assert.Equal(250m, read.PayAmount);
        Assert.Equal("hour", read.PayPeriod);
        Assert.Equal(5m, read.Percent);
        Assert.Equal(new TimeOnly(10, 0), read.Start);
        Assert.Equal(new TimeOnly(22, 0), read.End);
    }

    [Theory]
    [InlineData("1200 грн за зміну", 1200, "shift")]
    [InlineData("оплата 250 грн/год", 250, "hour")]
    [InlineData("18 000 грн в месяц", 18000, "month")]
    [InlineData("1 500 за смену", 1500, "shift")]
    [InlineData("300 грн/день", 300, "shift")]
    public void ItTakesTheUnitFromTheWordsBesideTheNumber(string text, int amount, string period)
    {
        // "300" next to nothing could be an hour or a shift, and picking one
        // turns a five-fold error into a plausible one.
        var read = JobAdvert.Parse(text);

        Assert.Equal(amount, read.PayAmount);
        Assert.Equal(period, read.PayPeriod);
    }

    [Fact]
    public void ANumberWithNoUnitIsNotARate()
    {
        var read = JobAdvert.Parse("Гарний колектив, дзвоніть 0501234567, оплата гідна");

        Assert.Null(read.PayAmount);
        Assert.Null(read.PayPeriod);
    }

    [Fact]
    public void AWageRangeIsNotAShiftFromHalfPastTwo()
    {
        // "250-300 грн" read as a time span would put somebody on a shift
        // starting at two in the morning, which is worse than reading nothing.
        var read = JobAdvert.Parse("Ставка 250-300 грн за годину, домовимось");

        Assert.Null(read.Start);
        Assert.Null(read.End);
        Assert.Equal(250m, read.PayAmount);
    }

    [Theory]
    [InlineData("з 10.00 до 22.00")]
    [InlineData("10:00 - 22:00")]
    [InlineData("работаем 10:00 по 22:00")]
    public void ItReadsTheShapesPeopleActuallyWriteHoursIn(string text)
    {
        var read = JobAdvert.Parse(text);

        Assert.Equal(new TimeOnly(10, 0), read.Start);
        Assert.Equal(new TimeOnly(22, 0), read.End);
    }

    [Fact]
    public void ANightShiftKeepsItsOwnTimes()
    {
        // Ending before it starts is an ordinary close, not a mistake to fix
        // here — the shift itself already knows how to read one.
        var read = JobAdvert.Parse("зміна 18:00–02:00");

        Assert.Equal(new TimeOnly(18, 0), read.Start);
        Assert.Equal(new TimeOnly(2, 0), read.End);
    }

    [Fact]
    public void ATaxRateIsNotAShareOfTheTill()
    {
        // A share of the till in this trade is single digits. Forty per cent
        // in an advert is something else entirely.
        Assert.Null(JobAdvert.Parse("офіційно, ПДВ 20% та 41% ЄСВ").Percent);
        Assert.Equal(7m, JobAdvert.Parse("7% з продажів").Percent);
    }

    [Fact]
    public void ItReadsAStatedBreak()
    {
        Assert.Equal(60, JobAdvert.Parse("перерва 60 хв неоплачувана").BreakMinutes);
        Assert.Equal(30, JobAdvert.Parse("обед 30 мин").BreakMinutes);
    }

    [Fact]
    public void ASplitShiftIsNotABreakItCanRead()
    {
        Assert.Null(JobAdvert.Parse("перерва 300 хв між змінами").BreakMinutes);
    }

    [Fact]
    public void AnEmptyAdvertReadsAsAllBlanks()
    {
        var read = JobAdvert.Parse("");

        Assert.Null(read.PayAmount);
        Assert.Null(read.Percent);
        Assert.Null(read.Start);
        Assert.Null(read.BreakMinutes);
    }

    [Fact]
    public void ItSurvivesAWallOfText()
    {
        // Adverts are pasted whole, formatting and all, and a parser that
        // needs tidy input is a parser nobody uses twice.
        var wall = string.Concat(Enumerable.Repeat("Дружній колектив! ", 500))
            + "Ставка 300 грн/годину. Зміни 12:00–00:00.";

        var read = JobAdvert.Parse(wall);

        Assert.Equal(300m, read.PayAmount);
        Assert.Equal(new TimeOnly(12, 0), read.Start);
    }
}
