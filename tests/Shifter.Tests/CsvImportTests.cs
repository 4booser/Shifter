using Shifter.Application.Features.Import;

using Xunit;

namespace Shifter.Tests;

/// <summary>
/// Somebody with a year in another tracker will not retype it, and the export
/// they have is whatever that app produced. These are the shapes it comes in.
/// </summary>
public class CsvReaderTests
{
    [Fact]
    public void ItFindsTheSeparatorTheFileActuallyUses()
    {
        // A comma reading of a semicolon file splits every venue name in half
        // and the resulting grid looks plausible enough to import.
        Assert.Equal(';', Csv.Delimiter("Дата;Часы;Сумма\n01.03.2026;8;800"));
        Assert.Equal(',', Csv.Delimiter("date,hours,pay\n2026-03-01,8,800"));
        Assert.Equal('\t', Csv.Delimiter("date\thours\tpay"));
    }

    [Fact]
    public void ACommaInsideAQuotedNameDoesNotVoteForCommas()
    {
        Assert.Equal(';', Csv.Delimiter("\"Bar, The\";Часы;Сумма"));
    }

    [Fact]
    public void ItReadsQuotedFieldsWithTheSeparatorInside()
    {
        var rows = Csv.Parse("place,pay\n\"Bar, The\",800");

        Assert.Equal(["Bar, The", "800"], rows[1]);
    }

    [Fact]
    public void ADoubledQuoteInsideAFieldIsOneQuote()
    {
        var rows = Csv.Parse("place\n\"The \"\"Old\"\" Bar\"");

        Assert.Equal("The \"Old\" Bar", rows[1][0]);
    }

    [Fact]
    public void ItSurvivesWhatExcelPutsAtTheFrontOfAFile()
    {
        // A byte-order mark makes the first header "﻿Дата", which matches
        // nothing, and the import silently loses its date column.
        var rows = Csv.Parse("﻿Дата,Часы\n01.03.2026,8");

        Assert.Equal("Дата", rows[0][0]);
    }

    [Fact]
    public void WindowsLineEndingsAreOneBreakAndTrailingOnesAreNotRows()
    {
        var rows = Csv.Parse("a,b\r\n1,2\r\n");

        Assert.Equal(2, rows.Count);
    }

    [Fact]
    public void ARaggedRowStaysRaggedSoThePreviewCanSaySo()
    {
        // Padding it out would show four confident blanks where the file has
        // a broken row.
        var rows = Csv.Parse("a,b,c\n1,2");

        Assert.Equal(2, rows[1].Length);
    }

    [Fact]
    public void AnEmptyFileIsNoRowsRatherThanOneEmptyOne()
    {
        Assert.Empty(Csv.Parse(""));
        Assert.Empty(Csv.Parse("\n\n\n"));
    }
}

public class CsvGuessTests
{
    [Fact]
    public void ItRecognisesTheUsualHeadingsInEitherLanguage()
    {
        var map = CsvGuess.Map(["Дата", "Часы", "Заработано", "Чаевые", "Заведение"]);

        Assert.Equal(0, map["date"]);
        Assert.Equal(1, map["hours"]);
        Assert.Equal(2, map["earned"]);
        Assert.Equal(3, map["tips"]);
        Assert.Equal(4, map["place"]);
    }

    [Fact]
    public void AColumnCanOnlyBeOneThing()
    {
        // "Сумма чаевых" matches both money words. Letting it be both silently
        // doubles somebody's month, and tips read as wages cannot be told
        // apart afterwards.
        var map = CsvGuess.Map(["Дата", "Сумма чаевых", "Сумма"]);

        Assert.Equal(1, map["tips"]);
        Assert.Equal(2, map["earned"]);
    }

    [Fact]
    public void AColumnItCannotPlaceIsMinusOneRatherThanAGuess()
    {
        var map = CsvGuess.Map(["Дата", "Непонятно"]);

        Assert.Equal(-1, map["tips"]);
        Assert.Equal(-1, map["place"]);
    }

    [Theory]
    [InlineData("2026-03-04", 2026, 3, 4)]
    [InlineData("04.03.2026", 2026, 3, 4)]
    [InlineData("4.3.2026", 2026, 3, 4)]
    [InlineData("04/03/2026", 2026, 3, 4)]
    [InlineData("04.03.26", 2026, 3, 4)]
    public void ItReadsADateDayFirst(string text, int year, int month, int day)
    {
        // Everywhere this app is used writes 03.04 meaning the third of April.
        // The American reading moves a year of shifts by up to eleven months
        // without producing one obviously wrong row.
        Assert.Equal(new DateOnly(year, month, day), CsvGuess.Date(text));
    }

    [Fact]
    public void ADateItCannotReadIsNothing()
    {
        Assert.Null(CsvGuess.Date("вчера"));
        Assert.Null(CsvGuess.Date(""));
    }

    [Theory]
    [InlineData("800", 800)]
    [InlineData("1 250,50", 1250.50)]
    [InlineData("₴800", 800)]
    [InlineData("800 грн", 800)]
    [InlineData("-120", -120)]
    public void ItReadsANumberThroughWhateverIsStuckToIt(string text, double expected)
    {
        Assert.Equal((decimal)expected, CsvGuess.Number(text));
    }

    [Fact]
    public void ANumberItCannotReadIsNullRatherThanZero()
    {
        // A row whose wage could not be read is a row to show somebody, not a
        // day that earned nothing.
        Assert.Null(CsvGuess.Number("много"));
        Assert.Null(CsvGuess.Number("1.234.56"));
        Assert.Null(CsvGuess.Number(""));
    }
}
