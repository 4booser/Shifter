using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Shifter.src.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class Overtime : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "OvertimeMultiplier",
                table: "Locations",
                type: "numeric",
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<double>(
                name: "OvertimeWeeklyHours",
                table: "Locations",
                type: "double precision",
                nullable: false,
                defaultValue: 0.0);

            migrationBuilder.Sql("""
                UPDATE "Locations"
                SET "OvertimeWeeklyHours" = 40, "OvertimeMultiplier" = 1.5
                WHERE "OvertimeWeeklyHours" = 0;
                """);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "OvertimeMultiplier",
                table: "Locations");

            migrationBuilder.DropColumn(
                name: "OvertimeWeeklyHours",
                table: "Locations");
        }
    }
}
