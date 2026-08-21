using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Shifter.Migrations.ShifterDb
{
    /// <inheritdoc />
    public partial class Goals : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "Goals",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    UserId = table.Column<int>(type: "integer", nullable: false),
                    Period = table.Column<int>(type: "integer", nullable: false),
                    Amount = table.Column<decimal>(type: "numeric", nullable: false),
                    Anchor = table.Column<DateOnly>(type: "date", nullable: true),
                    Note = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Goals", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Goals_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Goals_UserId_Period",
                table: "Goals",
                columns: new[] { "UserId", "Period" },
                unique: true,
                filter: "\"Anchor\" IS NULL");

            migrationBuilder.CreateIndex(
                name: "IX_Goals_UserId_Period_Anchor",
                table: "Goals",
                columns: new[] { "UserId", "Period", "Anchor" },
                unique: true,
                filter: "\"Anchor\" IS NOT NULL");

            // Everyone who had set the old single figure keeps it, as the
            // standing monthly goal — which is exactly what it meant. Without
            // this the new page opens empty for every existing account and the
            // number looks lost rather than moved. Period 2 is Month.
            migrationBuilder.Sql("""
                INSERT INTO "Goals" ("UserId", "Period", "Amount", "Anchor", "Note")
                SELECT "Id", 2, "MonthlyGoal", NULL, NULL
                FROM "Users"
                WHERE "MonthlyGoal" IS NOT NULL AND "MonthlyGoal" > 0;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "Goals");
        }
    }
}
