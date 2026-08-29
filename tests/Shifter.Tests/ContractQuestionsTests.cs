using Shifter.Domain.Entities;

using Xunit;

namespace Shifter.Tests;

/// <summary>
/// What to ask before signing. Every test here is about the feature staying a
/// list of questions and never becoming an opinion.
/// </summary>
public class ContractQuestionsTests
{
    /// <summary>A contract long enough to be one, saying nothing useful.</summary>
    private static string Padding(string body = "")
        => body + new string('я', ContractQuestions.MinimumLength);

    [Fact]
    public void ItAsksAboutWhatTheContractDoesNotMention()
    {
        var missing = ContractQuestions.Missing(Padding());

        Assert.Contains("tips", missing);
        Assert.Contains("overtime", missing);
        Assert.Contains("deductions", missing);
    }

    [Fact]
    public void ItLeavesAloneWhatTheContractDoesMention()
    {
        // Reading the clause is the person's job. Telling them what it means
        // is the thing this deliberately refuses to do.
        var missing = ContractQuestions.Missing(
            Padding("Чаевые остаются у работника. Сверхурочные оплачиваются в двойном размере."));

        Assert.DoesNotContain("tips", missing);
        Assert.DoesNotContain("overtime", missing);
    }

    [Fact]
    public void ItReadsUkrainianAndEnglishToo()
    {
        // A crew in this trade signs contracts in all three, often in the same
        // year, and a checklist that only reads one would report ten omissions
        // in a complete document.
        Assert.DoesNotContain("tips", ContractQuestions.Missing(Padding("Чайові належать працівнику.")));
        Assert.DoesNotContain("holiday", ContractQuestions.Missing(Padding("Annual holiday of 24 days.")));
    }

    [Fact]
    public void ItSurvivesTheWayTheseLanguagesDecline()
    {
        // "удержание" would miss "удержаний" in the very sentence that matters,
        // which is the sentence about money being taken off somebody's pay.
        Assert.DoesNotContain(
            "deductions",
            ContractQuestions.Missing(Padding("Сумма удержаний не может превышать 20%.")));
    }

    [Fact]
    public void AFragmentIsNotAContractWithTenOmissions()
    {
        // A heading, or somebody testing the box. Ten findings on it would
        // make the feature look like it says the same thing about everything.
        Assert.Empty(ContractQuestions.Missing("Трудовой договор"));
        Assert.Empty(ContractQuestions.Missing(""));
    }

    [Fact]
    public void ACompleteContractProducesNothing()
    {
        var complete = Padding(
            "Ставка 150 грн/год. Выплачивается 10 числа каждого месяца, аванс 25. "
            + "Графік роботи: 40 годин на тиждень. Сверхурочные оплачиваются отдельно. "
            + "Чаевые остаются у работника. Удержания только по закону. "
            + "Перерыв 60 минут. Испытательный срок 1 месяц. "
            + "Расторжение с предупреждением за 14 дней. Отпуск 24 дня.");

        Assert.Empty(ContractQuestions.Missing(complete));
    }

    [Fact]
    public void TheListIsShortEnoughToBeRead()
    {
        // A checklist long enough to cover every contract is long enough that
        // nobody reads the output, and then the two that mattered are lost.
        Assert.InRange(ContractQuestions.Topics.Length, 6, 12);
    }

    [Fact]
    public void EveryTopicHasWordsInMoreThanOneLanguage()
    {
        // A topic with one spelling is a topic that will report a false
        // omission for two thirds of the contracts this app sees.
        Assert.All(ContractQuestions.Topics, topic => Assert.True(topic.Words.Length >= 3));
    }

    [Fact]
    public void TheTwoWorthAskingAboutAnywayAreTheTwoAboutMoneyLeavingThePocket()
    {
        Assert.Equal(["deductions", "tips"], ContractQuestions.AlwaysWorthAsking);
    }
}
