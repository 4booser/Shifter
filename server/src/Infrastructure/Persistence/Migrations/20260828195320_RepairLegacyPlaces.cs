using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Shifter.Migrations.ShifterDb
{
    /// <inheritdoc />
    public partial class RepairLegacyPlaces : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Three columns were added to rows that already existed with
            // defaults the application itself refuses: an empty colour, a pay
            // day of 0, and 0001-01-01 as the anchor a fortnightly cycle is
            // counted from. Nothing since has repaired them — the migrations
            // that learned the lesson only fixed their own columns.
            //
            // An empty colour is the visible one: it goes straight into a
            // style attribute and paints the place as nothing. The other two
            // are quieter and worse. A pay day of 0 is outside the 1..28 the
            // form accepts, so the place cannot be saved again without
            // somebody noticing and choosing one; and until they do, "when
            // does the money land" is answered from a day that does not
            // exist. The anchor is what a weekly or fortnightly cycle counts
            // from, so two thousand years of fortnights are stepped through
            // to reach this one.
            //
            // Deliberately not a default on the column: this repairs what is
            // there, and new rows already arrive correct.
            migrationBuilder.Sql(
                """
                UPDATE "Locations"
                SET "Colour" = (ARRAY[
                    '#FF5C7A','#FFA53D','#F5C518','#5CD65C','#22C55E','#14B8A6',
                    '#38BDF8','#6366F1','#A855F7','#EC4899','#64748B','#334155'
                ])[("Id" % 12) + 1]
                WHERE "Colour" !~ '^#[0-9A-Fa-f]{6}$';
                """);

            // The palette is the one the app offers, indexed by id so two
            // places repaired at once do not come out the same colour.
            migrationBuilder.Sql(
                """
                UPDATE "TeamMembers"
                SET "Colour" = (ARRAY[
                    '#FF5C7A','#FFA53D','#F5C518','#5CD65C','#22C55E','#14B8A6',
                    '#38BDF8','#6366F1','#A855F7','#EC4899','#64748B','#334155'
                ])[("Id" % 12) + 1]
                WHERE "Colour" !~ '^#[0-9A-Fa-f]{6}$';
                """);

            migrationBuilder.Sql(
                """
                UPDATE "Locations" SET "PayDay" = 1 WHERE "PayDay" < 1 OR "PayDay" > 28;
                UPDATE "Locations" SET "SalesPayDay" = 1 WHERE "SalesPayDay" < 1 OR "SalesPayDay" > 28;
                """);

            // 2020-01-06 is the entity's own default and a Monday, which is
            // what a weekly cycle wants to start on.
            migrationBuilder.Sql(
                """
                UPDATE "Locations"
                SET "PayAnchor" = DATE '2020-01-06'
                WHERE "PayAnchor" < DATE '2000-01-01';

                UPDATE "Locations"
                SET "SalesPayAnchor" = DATE '2020-01-06'
                WHERE "SalesPayAnchor" < DATE '2000-01-01';
                """);

            // And the one that costs money rather than merely looking wrong.
            //
            // Overtime is paid as `hours × rate × (multiplier − 1)`. The
            // column arrived on existing rows as 0, so that factor is −1: every
            // overtime hour at a place created before this rule existed has
            // been *subtracting* an hour's pay, and reporting it as what the
            // overtime brought. The form has always refused anything under 1,
            // so the only way to hold a 0 is to have been there first and never
            // re-saved.
            //
            // 1.5 is the entity's own default and the usual statutory rate.
            // Night and holiday read 0 as "no premium" today because the
            // calculator guards on `> 1`, but a 0 sitting in a multiplier
            // column is a landmine for the next person who does not.
            migrationBuilder.Sql(
                """
                UPDATE "Locations" SET "OvertimeMultiplier" = 1.5 WHERE "OvertimeMultiplier" < 1;

                -- The other half of the same sum. A weekly threshold of 0 makes
                -- the first hour of the week overtime and every hour after it,
                -- so with the multiplier above it cancelled the month outright.
                -- 40 is the entity's default and the ordinary full week.
                UPDATE "Locations" SET "OvertimeWeeklyHours" = 40 WHERE "OvertimeWeeklyHours" <= 0;
                UPDATE "Locations" SET "NightMultiplier" = 1 WHERE "NightMultiplier" < 1;
                UPDATE "Locations" SET "PublicHolidayMultiplier" = 1 WHERE "PublicHolidayMultiplier" < 1;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Nothing to undo. The old values were not a state the application
            // could produce or read; restoring them would be restoring a bug.
        }
    }
}
