using Shifter.Application.Features.Import;

using Xunit;

namespace Shifter.Tests;

public class ScheduleParseTests
{
    [Fact]
    public void ReadsCleanJson()
    {
        var rows = ScheduleParse.FromModelText(
            """{"days":[{"date":"2026-03-02","name":"Будний","start":"11:00","end":"22:00"}]}""");

        Assert.Single(rows);
        Assert.Equal("2026-03-02", rows[0].Date);
        Assert.Equal("11:00", rows[0].Start);
    }

    [Fact]
    public void DigsJsonOutOfProseAndFences()
    {
        var rows = ScheduleParse.FromModelText(
            "Here is the schedule you asked for:\n```json\n" +
            """{"days":[{"date":"2026-03-02","name":"Д","start":"09:00","end":"18:00"}]}""" +
            "\n```\nLet me know if you need anything else!");

        Assert.Single(rows);
    }

    [Fact]
    public void DropsRowsWithBrokenDatesOrTimes()
    {
        var rows = ScheduleParse.FromModelText(
            """
            {"days":[
              {"date":"2026-03-02","name":"ok","start":"11:00","end":"22:00"},
              {"date":"march 3rd","name":"bad date","start":"11:00","end":"22:00"},
              {"date":"2026-03-04","name":"bad time","start":"25:99","end":"22:00"},
              {"date":"2026-03-05","name":"zero span","start":"11:00","end":"11:00"}
            ]}
            """);

        Assert.Single(rows);
        Assert.Equal("2026-03-02", rows[0].Date);
    }

    [Fact]
    public void OneRowPerDateAndSortedByDate()
    {
        var rows = ScheduleParse.FromModelText(
            """
            {"days":[
              {"date":"2026-03-09","name":"b","start":"11:00","end":"22:00"},
              {"date":"2026-03-02","name":"a","start":"11:00","end":"22:00"},
              {"date":"2026-03-02","name":"duplicate","start":"12:00","end":"20:00"}
            ]}
            """);

        Assert.Equal(2, rows.Length);
        Assert.Equal("2026-03-02", rows[0].Date);
        Assert.Equal("a", rows[0].Name);
    }

    [Fact]
    public void GarbageComesBackEmptyRatherThanThrowing()
    {
        Assert.Empty(ScheduleParse.FromModelText("I could not find that employee."));
        Assert.Empty(ScheduleParse.FromModelText("{not json at all"));
        Assert.Empty(ScheduleParse.FromModelText(""));
    }
}
