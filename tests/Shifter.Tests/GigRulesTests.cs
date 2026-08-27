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
        => Assert.Throws<ValidationException>(() => GigRules.ParsePayPeriod("year"));

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

    [Theory]
    [InlineData("chef", GigCategory.Chef)]
    [InlineData("sous-chef", GigCategory.SousChef)]
    [InlineData("busser", GigCategory.Busser)]
    [InlineData("storekeeper", GigCategory.Storekeeper)]
    public void The_widened_taxonomy_parses_too(string wire, GigCategory expected)
        => Assert.Equal(expected, GigRules.ParseCategory(wire));

    [Fact]
    public void Employment_defaults_to_freelance_and_reads_both_words()
    {
        Assert.Equal(GigEmployment.Freelance, GigRules.ParseEmployment(null));
        Assert.Equal(GigEmployment.Freelance, GigRules.ParseEmployment("freelance"));
        Assert.Equal(GigEmployment.Permanent, GigRules.ParseEmployment("Permanent"));
        Assert.Throws<ValidationException>(() => GigRules.ParseEmployment("intern"));
    }

    [Fact]
    public void Month_pay_joins_the_vocabulary()
        => Assert.Equal("month", GigRules.ParsePayPeriod("month"));

    private static string Photo(int size = 100)
        => "data:image/jpeg;base64," + new string('A', size);

    [Fact]
    public void Fewer_than_three_photos_is_no_listing()
        => Assert.Throws<ValidationException>(() => GigRules.CleanPhotos([Photo(), Photo()]));

    [Fact]
    public void Three_good_photos_serialise()
    {
        var json = GigRules.CleanPhotos([Photo(), Photo(), Photo()]);

        Assert.StartsWith("[", json);
        Assert.Contains("data:image/jpeg;base64,", json);
    }

    [Fact]
    public void A_png_or_an_oversized_photo_is_refused()
    {
        var png = "data:image/png;base64," + new string('A', 100);

        Assert.Throws<ValidationException>(() => GigRules.CleanPhotos([png, Photo(), Photo()]));
        Assert.Throws<ValidationException>(
            () => GigRules.CleanPhotos([Photo(300_000), Photo(), Photo()]));
    }

    [Fact]
    public void Chips_keep_only_their_directions_vocabulary()
    {
        Assert.Equal("punctual,fast", GigRules.CleanChips(["punctual", "fast", "pays-on-time", "made-up"], byEmployer: true));
        Assert.Equal("pays-on-time", GigRules.CleanChips(["pays-on-time", "punctual"], byEmployer: false));
        Assert.Null(GigRules.CleanChips(["nonsense"], byEmployer: true));
        Assert.Null(GigRules.CleanChips(null, byEmployer: false));
    }

    [Fact]
    public void Pay_is_a_base_a_percent_or_both_but_never_neither()
    {
        Assert.Null(GigRules.ValidatePay(250, null));
        Assert.Equal(5m, GigRules.ValidatePay(25_000, 5m));
        Assert.Equal(7.5m, GigRules.ValidatePay(0, 7.46m));
        Assert.Throws<ValidationException>(() => GigRules.ValidatePay(0, null));
        Assert.Throws<ValidationException>(() => GigRules.ValidatePay(-1, 5m));
        Assert.Throws<ValidationException>(() => GigRules.ValidatePay(100, 0m));
        Assert.Throws<ValidationException>(() => GigRules.ValidatePay(100, 101m));
    }
}

