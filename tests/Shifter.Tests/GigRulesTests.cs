using Shifter.Application.Common.Exceptions;
using Shifter.Application.Features.Gigs;
using Shifter.Domain.Entities;

using Xunit;

namespace Shifter.Tests;

public class GigRulesTests
{
    [Theory]
    [InlineData("bartender", GigCategory.Bartender)]
    [InlineData("cook-hot", GigCategory.CookHot)]
    [InlineData("  Pizzaiolo ", GigCategory.Pizzaiolo)]
    [InlineData("floor-manager", GigCategory.FloorManager)]
    public void Categories_parse_by_wire_name(string wire, GigCategory expected)
        => Assert.Equal(expected, GigRules.ParseCategory(wire));

    [Fact]
    public void An_unknown_trade_is_refused_not_guessed()
        => Assert.Throws<ValidationException>(() => GigRules.ParseCategory("astronaut"));

    [Fact]
    public void Every_category_has_a_wire_name()
    {
        foreach (GigCategory category in Enum.GetValues<GigCategory>())
            Assert.True(GigRules.CategoryNames.ContainsKey(category), category.ToString());
    }

    [Theory]
    [InlineData("hour")]
    [InlineData("SHIFT")]
    public void Pay_period_accepts_its_two_words(string value)
        => Assert.Equal(value.ToLowerInvariant(), GigRules.ParsePayPeriod(value));

    [Fact]
    public void Pay_period_refuses_anything_else()
        => Assert.Throws<ValidationException>(() => GigRules.ParsePayPeriod("month"));

    [Fact]
    public void A_slot_keeps_its_edges_and_refuses_a_zero_minute_gig()
    {
        var (start, end) = GigRules.ParseSlot("18:00", "02:00");

        Assert.Equal(new TimeOnly(18, 0), start);
        Assert.Equal(new TimeOnly(2, 0), end);
        Assert.Throws<ValidationException>(() => GigRules.ParseSlot("12:00", "12:00"));
    }

    [Fact]
    public void A_reply_without_any_contact_is_refused()
        => Assert.Throws<ValidationException>(() => GigRules.CleanContacts("  ", null));

    [Fact]
    public void One_contact_is_enough_and_gets_trimmed()
    {
        var (phone, telegram) = GigRules.CleanContacts(null, " @vania ");

        Assert.Null(phone);
        Assert.Equal("@vania", telegram);
    }
}
