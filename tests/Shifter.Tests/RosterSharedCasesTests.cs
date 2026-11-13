using System.Globalization;
using System.Text.Json;

using Shifter.Application.Features.business.DTOs;
using Shifter.Application.Features.Rosters;
using Shifter.Domain.Entities;

using Xunit;

namespace Shifter.Tests;

/// <summary>The roster's rule against the cases the web and the phone run too. Hours, usual days and weekdays are read through the same parsers a save goes through, so the cases hold the parse as well as the rule.</summary>
public class RosterSharedCasesTests
{
    private const string Fixture = "shared/roster/roster-rules.cases.json";

    private static readonly string[] Sections =
        ["venues", "positions", "default_hours", "works_on", "open_on", "venue_line", "order", "restamp", "fill"];

    private static readonly Lazy<JsonElement> Cases = new(() =>
        JsonDocument.Parse(File.ReadAllText(Path.Combine(RepositoryRoot(), Fixture))).RootElement.Clone());

    private static string RepositoryRoot()
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);

        while (directory is not null && !File.Exists(Path.Combine(directory.FullName, "Shifter.sln")))
            directory = directory.Parent;

        Assert.NotNull(directory);

        return directory!.FullName;
    }

    // ==== Reading a case ====

    private static IEnumerable<string> Names(string section)
        => Cases.Value.GetProperty(section).EnumerateArray().Select(entry => entry.GetProperty("name").GetString()!);

    private static JsonElement Case(string section, string name)
        => Cases.Value.GetProperty(section).EnumerateArray()
            .Single(entry => entry.GetProperty("name").GetString() == name);

    private static T Read<T>(JsonElement element) => element.Deserialize<T>()!;

    private static DateOnly Date(JsonElement element)
        => DateOnly.ParseExact(element.GetString()!, "yyyy-MM-dd", CultureInfo.InvariantCulture);

    private static List<WeekdayHours> Venue(string key)
        => RosterRules.ReadWeek(Read<WeekHoursDto[]>(Cases.Value.GetProperty("venues").GetProperty(key)));

    private static RosterPosition[] Positions(JsonElement list)
        => list.EnumerateArray()
            .Select(entry =>
            {
                var position = new RosterPosition
                {
                    Id = entry.GetProperty("id").GetInt32(),
                    Name = RosterRules.ReadPositionName(entry.GetProperty("name").GetString()),
                };

                RosterRules.ApplyPositionHours(position, Read<RosterHoursDto>(entry.GetProperty("hours")));

                return position;
            })
            .ToArray();

    private static RosterPosition[] SharedPositions() => Positions(Cases.Value.GetProperty("positions"));

    private static RosterPerson Blank(int id) => new() { Id = id, Name = "Толик", Colour = "#4488cc" };

    private static RosterPerson Person(JsonElement entry, int id = 0)
    {
        var person = Blank(entry.TryGetProperty("id", out var known) ? known.GetInt32() : id);

        if (entry.TryGetProperty("position_id", out var position) && position.ValueKind == JsonValueKind.Number)
            person.RosterPositionId = position.GetInt32();

        if (entry.TryGetProperty("hours", out var hours))
            RosterRules.ApplyPersonHours(person, Read<RosterHoursDto>(hours));

        if (entry.TryGetProperty("pattern", out var pattern))
            RosterRules.ApplyPattern(person, Read<RosterPatternDto>(pattern));

        return person;
    }

    private static RosterDefaults Side(JsonElement side)
        => new(
            Venue(side.GetProperty("venue").GetString()!),
            side.TryGetProperty("positions", out var positions) ? Positions(positions) : SharedPositions(),
            side.GetProperty("people").EnumerateArray().Select(entry => Person(entry)).ToArray());

    private static RosterShift Shift(JsonElement entry)
        => new()
        {
            RosterPersonId = entry.GetProperty("person_id").GetInt32(),
            Date = Date(entry.GetProperty("date")),
            StartTime = Time(entry.GetProperty("start_time")),
            EndTime = Time(entry.GetProperty("end_time")),
        };

    private static TimeOnly? Time(JsonElement element)
        => element.ValueKind == JsonValueKind.Null
            ? null
            : TimeOnly.ParseExact(element.GetString()!, "HH:mm", CultureInfo.InvariantCulture);

    /// <summary>A shift the way the cases write one, so a mismatch reads as the fixture does.</summary>
    private static string Said(RosterShift shift)
        => $"{shift.RosterPersonId} {shift.Date:yyyy-MM-dd} {Said(shift.StartTime)}-{Said(shift.EndTime)}";

    private static string Said(TimeOnly? time) => time is TimeOnly known ? RosterRules.Time(known) : "null";

    private static string[] Said(IEnumerable<RosterShift> shifts) => shifts.Select(Said).ToArray();

    private static string[] Said(JsonElement shifts) => Said(shifts.EnumerateArray().Select(Shift));

    public static TheoryData<string> DefaultHoursCases => [.. Names("default_hours")];
    public static TheoryData<string> WorksOnCases => [.. Names("works_on")];
    public static TheoryData<string> OpenOnCases => [.. Names("open_on")];
    public static TheoryData<string> VenueLineCases => [.. Names("venue_line")];
    public static TheoryData<string> OrderCases => [.. Names("order")];
    public static TheoryData<string> RestampCases => [.. Names("restamp")];
    public static TheoryData<string> FillCases => [.. Names("fill")];

    // ==== The cases ====

    [Theory]
    [MemberData(nameof(DefaultHoursCases))]
    public void Default_hours_match_the_shared_cases(string name)
    {
        var entry = Case("default_hours", name);
        var expect = entry.GetProperty("expect");

        var hours = RosterRules.DefaultHours(
            Person(entry.GetProperty("person"), id: 1),
            SharedPositions(),
            Venue(entry.GetProperty("venue").GetString()!),
            Date(entry.GetProperty("date")));

        Assert.Equal(
            expect.ValueKind == JsonValueKind.Null
                ? "none"
                : $"{expect.GetProperty("start_time").GetString()}–{expect.GetProperty("end_time").GetString()}",
            hours is { } known ? $"{RosterRules.Time(known.Start)}–{RosterRules.Time(known.End)}" : "none");
    }

    [Theory]
    [MemberData(nameof(WorksOnCases))]
    public void Usual_days_match_the_shared_cases(string name)
    {
        var entry = Case("works_on", name);
        var person = Blank(1);

        RosterRules.ApplyPattern(person, Read<RosterPatternDto>(entry.GetProperty("pattern")));

        DateOnly month = RosterRules.RequireMonth(entry.GetProperty("month").GetString());

        var worked = Enumerable.Range(0, RosterRules.LastDay(month).Day)
            .Select(month.AddDays)
            .Where(date => RosterRules.WorksOn(person, date))
            .Select(date => date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture));

        Assert.Equal(entry.GetProperty("expect").EnumerateArray().Select(day => day.GetString()), worked);
    }

    [Theory]
    [MemberData(nameof(OpenOnCases))]
    public void Open_days_match_the_shared_cases(string name)
    {
        var entry = Case("open_on", name);

        Assert.Equal(
            entry.GetProperty("expect").GetBoolean(),
            RosterRules.OpenOn(Venue(entry.GetProperty("venue").GetString()!), Date(entry.GetProperty("date"))));
    }

    [Theory]
    [MemberData(nameof(VenueLineCases))]
    public void The_venue_line_matches_the_shared_cases(string name)
    {
        var entry = Case("venue_line", name);
        var venue = Venue(entry.GetProperty("venue").GetString()!);

        Assert.Equal(entry.GetProperty("ru").GetString(), RosterRules.VenueLine(venue, uk: false));
        Assert.Equal(entry.GetProperty("uk").GetString(), RosterRules.VenueLine(venue, uk: true));
    }

    [Theory]
    [MemberData(nameof(OrderCases))]
    public void People_are_ordered_as_the_shared_cases_say(string name)
    {
        var entry = Case("order", name);
        var people = entry.GetProperty("people").EnumerateArray().Select(person => Person(person)).ToArray();
        var expect = entry.GetProperty("expect").EnumerateArray().Select(id => id.GetInt32()).ToArray();

        Assert.Equal(expect, RosterRules.ByPosition(people, SharedPositions()).Select(person => person.Id));

        // The groups are the same order cut, with the people of no position, a
        // gone one's included, last.
        var groups = RosterRules.Grouped(people, SharedPositions());

        Assert.Equal(expect, groups.SelectMany(group => group.People).Select(person => person.Id));
        Assert.Equal(groups.Length, groups.Select(group => group.Position?.Id).Distinct().Count());
        Assert.All(groups.SkipLast(1), group => Assert.NotNull(group.Position));
    }

    [Theory]
    [MemberData(nameof(RestampCases))]
    public void A_restamp_matches_the_shared_cases(string name)
    {
        var entry = Case("restamp", name);
        var expect = entry.GetProperty("expect");
        DateOnly today = Date(entry.GetProperty("today"));

        RosterRestamp[] restamps = RosterRules.Restamps(
            Side(entry.GetProperty("before")), Side(entry.GetProperty("after")));

        var shifts = entry.GetProperty("shifts").EnumerateArray().Select(Shift).ToArray();
        int restamped = 0;

        foreach (RosterShift shift in shifts)
        {
            if (RosterRules.RestampOf(shift, restamps, today) is not { } moved) continue;

            (shift.StartTime, shift.EndTime) = moved;
            restamped++;
        }

        Assert.Equal(Said(expect.GetProperty("shifts")), Said(shifts));
        Assert.Equal(expect.GetProperty("restamped").GetInt32(), restamped);
    }

    [Theory]
    [MemberData(nameof(FillCases))]
    public void A_fill_plan_matches_the_shared_cases(string name)
    {
        var entry = Case("fill", name);
        var expect = entry.GetProperty("expect");

        RosterFillPlan plan = Plan(entry, entry.GetProperty("existing").EnumerateArray().Select(Shift));

        Assert.Equal(Said(expect.GetProperty("shifts")), Said(plan.Add));
        Assert.Equal(expect.GetProperty("added").GetInt32(), plan.Add.Length);
        Assert.Equal(expect.GetProperty("kept").GetInt32(), plan.Kept);
        Assert.Equal(expect.GetProperty("skipped").GetInt32(), plan.Skipped);
    }

    [Fact]
    public void A_second_fill_over_the_first_adds_nothing()
    {
        var entry = Cases.Value.GetProperty("fill")[0];

        RosterFillPlan first = Plan(entry, []);
        RosterFillPlan second = Plan(entry, first.Add);

        Assert.Equal((0, 8, 5), (second.Add.Length, second.Kept, second.Skipped));
    }

    [Fact]
    public void The_fixture_is_where_all_three_look()
    {
        string path = Path.Combine(RepositoryRoot(), Fixture);

        Assert.True(File.Exists(path), $"{Fixture} is gone, and every theory above would quietly run nothing.");

        foreach (string section in Sections)
        {
            Assert.True(Cases.Value.TryGetProperty(section, out var cases), $"The fixture has no {section}.");
            Assert.True(
                cases.ValueKind == JsonValueKind.Object ? cases.EnumerateObject().Any() : cases.GetArrayLength() > 0,
                $"The fixture's {section} is empty.");
        }
    }

    private static RosterFillPlan Plan(JsonElement entry, IEnumerable<RosterShift> existing)
        => RosterRules.PlanFill(
            entry.GetProperty("people").EnumerateArray().Select(person => Person(person)).ToArray(),
            SharedPositions(),
            Venue(entry.GetProperty("venue").GetString()!),
            RosterRules.RequireMonth(entry.GetProperty("month").GetString()),
            Date(entry.GetProperty("today")),
            existing.Select(shift => (shift.RosterPersonId, shift.Date)).ToHashSet());
}
