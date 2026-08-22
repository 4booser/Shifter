using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Shifter.Migrations.ShifterDb
{
    /// <inheritdoc />
    public partial class TeamVisibility : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Colour",
                table: "TeamMembers",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<bool>(
                name: "PrivateByDefault",
                table: "TeamMembers",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "ShareEarnings",
                table: "TeamMembers",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "TeamVisible",
                table: "DayShifts",
                type: "boolean",
                nullable: true);

            // Everyone who joined before colours existed has "" for one, which
            // would go into a style attribute on their crewmates' screens and
            // draw them as nothing at all. Hand them the palette in join order,
            // per team, which is what NextColour would have given them.
            //
            // The list here is TeamRules.MemberColours and has to stay in step
            // with it; it is duplicated rather than referenced because a
            // migration has to keep describing the change it made even after
            // the code it came from has moved on.
            migrationBuilder.Sql("""
                WITH ordered AS (
                    SELECT
                        "Id",
                        ROW_NUMBER() OVER (
                            PARTITION BY "TeamId" ORDER BY "JoinedAt", "Id"
                        ) - 1 AS seat
                    FROM "TeamMembers"
                )
                UPDATE "TeamMembers" AS m
                SET "Colour" = (ARRAY[
                    '#6366F1', '#D97706', '#0891B2', '#DB2777',
                    '#65A30D', '#A855F7', '#059669'
                ])[(ordered.seat % 7) + 1]
                FROM ordered
                WHERE ordered."Id" = m."Id" AND m."Colour" = '';
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Colour",
                table: "TeamMembers");

            migrationBuilder.DropColumn(
                name: "PrivateByDefault",
                table: "TeamMembers");

            migrationBuilder.DropColumn(
                name: "ShareEarnings",
                table: "TeamMembers");

            migrationBuilder.DropColumn(
                name: "TeamVisible",
                table: "DayShifts");
        }
    }
}
