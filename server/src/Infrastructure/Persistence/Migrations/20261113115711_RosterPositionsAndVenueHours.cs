using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Shifter.src.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class RosterPositionsAndVenueHours : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // The release before this one is still serving while this runs. Up
            // takes exclusive locks on three roster tables; rather than queue
            // every request behind a lock it cannot get, it gives up after five
            // seconds, the whole migration rolls back, and the deploy stops with
            // the old release still up. Running it again is safe.
            migrationBuilder.Sql("SET LOCAL lock_timeout = '5s';");

            migrationBuilder.AlterColumn<TimeOnly>(
                name: "StartTime",
                table: "RosterShifts",
                type: "time without time zone",
                nullable: true,
                oldClrType: typeof(TimeOnly),
                oldType: "time without time zone");

            migrationBuilder.AlterColumn<TimeOnly>(
                name: "EndTime",
                table: "RosterShifts",
                type: "time without time zone",
                nullable: true,
                oldClrType: typeof(TimeOnly),
                oldType: "time without time zone");

            migrationBuilder.AddColumn<string>(
                name: "VenueHours",
                table: "Rosters",
                type: "jsonb",
                nullable: true);

            migrationBuilder.AddColumn<DateOnly>(
                name: "CycleFrom",
                table: "RosterPeople",
                type: "date",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "CycleOff",
                table: "RosterPeople",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "CycleOn",
                table: "RosterPeople",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<TimeOnly>(
                name: "EndTime",
                table: "RosterPeople",
                type: "time without time zone",
                nullable: true);

            migrationBuilder.AddColumn<int[]>(
                name: "PatternWeekdays",
                table: "RosterPeople",
                type: "integer[]",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "RosterPositionId",
                table: "RosterPeople",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<TimeOnly>(
                name: "StartTime",
                table: "RosterPeople",
                type: "time without time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "WeekHours",
                table: "RosterPeople",
                type: "jsonb",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "RosterPositions",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    RosterId = table.Column<int>(type: "integer", nullable: false),
                    Name = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    HoursMode = table.Column<int>(type: "integer", nullable: false),
                    StartTime = table.Column<TimeOnly>(type: "time without time zone", nullable: true),
                    EndTime = table.Column<TimeOnly>(type: "time without time zone", nullable: true),
                    WeekHours = table.Column<string>(type: "jsonb", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_RosterPositions", x => x.Id);
                    table.CheckConstraint("CK_RosterPositions_Hours", "(\"StartTime\" IS NULL) = (\"EndTime\" IS NULL) AND (\"HoursMode\" = 1) = (\"StartTime\" IS NOT NULL)");
                    table.ForeignKey(
                        name: "FK_RosterPositions_Rosters_RosterId",
                        column: x => x.RosterId,
                        principalTable: "Rosters",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.AddCheckConstraint(
                name: "CK_RosterShifts_Hours",
                table: "RosterShifts",
                sql: "(\"StartTime\" IS NULL) = (\"EndTime\" IS NULL)");

            migrationBuilder.CreateIndex(
                name: "IX_RosterPeople_RosterPositionId",
                table: "RosterPeople",
                column: "RosterPositionId");

            migrationBuilder.AddCheckConstraint(
                name: "CK_RosterPeople_Hours",
                table: "RosterPeople",
                sql: "(\"StartTime\" IS NULL) = (\"EndTime\" IS NULL)");

            migrationBuilder.AddCheckConstraint(
                name: "CK_RosterPeople_Pattern",
                table: "RosterPeople",
                sql: "(\"CycleOn\" IS NULL) = (\"CycleOff\" IS NULL) AND (\"CycleOn\" IS NULL) = (\"CycleFrom\" IS NULL) AND (\"PatternWeekdays\" IS NULL OR \"CycleOn\" IS NULL)");

            migrationBuilder.CreateIndex(
                name: "IX_RosterPositions_RosterId_Name",
                table: "RosterPositions",
                columns: new[] { "RosterId", "Name" },
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_RosterPeople_RosterPositions_RosterPositionId",
                table: "RosterPeople",
                column: "RosterPositionId",
                principalTable: "RosterPositions",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);

            // Every word somebody typed as a position becomes a position of its
            // own roster, once however it was spelt: «Кальяны», «кальяны » and
            // «КАЛЬЯНЫ» are one job, and the spelling written first names it.
            // Ids follow first appearance, so the list reads in the order the
            // crew was entered. A converted position has no set time: nobody
            // said when that job comes in, and opening hours are not that.
            // Nothing is lost: everybody who had a word gets the link, and the
            // old column is set to the name they now share, which is what the
            // release before this one goes on reading.
            migrationBuilder.Sql(
                """
                INSERT INTO "RosterPositions" ("RosterId", "Name", "HoursMode", "WeekHours")
                SELECT first."RosterId", first."Name", 0, '[]'
                FROM (
                    SELECT DISTINCT ON (p."RosterId", lower(btrim(p."Position")))
                           p."RosterId", btrim(p."Position") AS "Name", p."Id" AS "FirstId"
                    FROM "RosterPeople" p
                    WHERE p."Position" IS NOT NULL AND btrim(p."Position") <> ''
                    ORDER BY p."RosterId", lower(btrim(p."Position")), p."Id"
                ) first
                ORDER BY first."FirstId";

                UPDATE "RosterPeople" p
                SET "RosterPositionId" = pos."Id", "Position" = pos."Name"
                FROM "RosterPositions" pos
                WHERE pos."RosterId" = p."RosterId"
                  AND p."Position" IS NOT NULL
                  AND lower(pos."Name") = lower(btrim(p."Position"));

                UPDATE "RosterPeople" SET "Position" = NULL
                WHERE "RosterPositionId" IS NULL AND "Position" IS NOT NULL;
                """);

            // No JSON column is left NULL. EF reads NULL as the empty list only
            // when it loads a whole row; a projection gets null, and the link
            // page would fall over on every roster made before today.
            migrationBuilder.Sql(
                """
                UPDATE "Rosters" SET "VenueHours" = '[]' WHERE "VenueHours" IS NULL;
                UPDATE "RosterPeople" SET "WeekHours" = '[]' WHERE "WeekHours" IS NULL;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Back to free text: whatever a person's position is called now is what the old release reads.
            migrationBuilder.Sql(
                """
                UPDATE "RosterPeople" p SET "Position" = pos."Name"
                FROM "RosterPositions" pos WHERE pos."Id" = p."RosterPositionId";
                """);

            // The old schema has no way to hold a day with no hours, so those days go.
            migrationBuilder.Sql("""DELETE FROM "RosterShifts" WHERE "StartTime" IS NULL;""");

            migrationBuilder.DropForeignKey(
                name: "FK_RosterPeople_RosterPositions_RosterPositionId",
                table: "RosterPeople");

            migrationBuilder.DropTable(
                name: "RosterPositions");

            migrationBuilder.DropCheckConstraint(
                name: "CK_RosterShifts_Hours",
                table: "RosterShifts");

            migrationBuilder.DropIndex(
                name: "IX_RosterPeople_RosterPositionId",
                table: "RosterPeople");

            migrationBuilder.DropCheckConstraint(
                name: "CK_RosterPeople_Hours",
                table: "RosterPeople");

            migrationBuilder.DropCheckConstraint(
                name: "CK_RosterPeople_Pattern",
                table: "RosterPeople");

            migrationBuilder.DropColumn(
                name: "VenueHours",
                table: "Rosters");

            migrationBuilder.DropColumn(
                name: "CycleFrom",
                table: "RosterPeople");

            migrationBuilder.DropColumn(
                name: "CycleOff",
                table: "RosterPeople");

            migrationBuilder.DropColumn(
                name: "CycleOn",
                table: "RosterPeople");

            migrationBuilder.DropColumn(
                name: "EndTime",
                table: "RosterPeople");

            migrationBuilder.DropColumn(
                name: "PatternWeekdays",
                table: "RosterPeople");

            migrationBuilder.DropColumn(
                name: "RosterPositionId",
                table: "RosterPeople");

            migrationBuilder.DropColumn(
                name: "StartTime",
                table: "RosterPeople");

            migrationBuilder.DropColumn(
                name: "WeekHours",
                table: "RosterPeople");

            // No default: the day with no hours is gone already, and a midnight
            // default left behind would be a column TeamRoster never had.
            migrationBuilder.AlterColumn<TimeOnly>(
                name: "StartTime",
                table: "RosterShifts",
                type: "time without time zone",
                nullable: false,
                oldClrType: typeof(TimeOnly),
                oldType: "time without time zone",
                oldNullable: true);

            migrationBuilder.AlterColumn<TimeOnly>(
                name: "EndTime",
                table: "RosterShifts",
                type: "time without time zone",
                nullable: false,
                oldClrType: typeof(TimeOnly),
                oldType: "time without time zone",
                oldNullable: true);
        }
    }
}
