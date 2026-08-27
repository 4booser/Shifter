using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Shifter.Migrations.ShifterDb
{
    /// <inheritdoc />
    public partial class PayConstructor : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "RevenuePercent",
                table: "Shifts",
                type: "numeric",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "TipPoolPercent",
                table: "Shifts",
                type: "numeric",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "TipSource",
                table: "Shifts",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<decimal>(
                name: "Revenue",
                table: "DayShifts",
                type: "numeric",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "RevenuePercent",
                table: "DayShifts",
                type: "numeric",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "TipPoolPercent",
                table: "DayShifts",
                type: "numeric",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "TipSource",
                table: "DayShifts",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<decimal>(
                name: "TipPool",
                table: "Days",
                type: "numeric",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "RevenuePercent",
                table: "Shifts");

            migrationBuilder.DropColumn(
                name: "TipPoolPercent",
                table: "Shifts");

            migrationBuilder.DropColumn(
                name: "TipSource",
                table: "Shifts");

            migrationBuilder.DropColumn(
                name: "Revenue",
                table: "DayShifts");

            migrationBuilder.DropColumn(
                name: "RevenuePercent",
                table: "DayShifts");

            migrationBuilder.DropColumn(
                name: "TipPoolPercent",
                table: "DayShifts");

            migrationBuilder.DropColumn(
                name: "TipSource",
                table: "DayShifts");

            migrationBuilder.DropColumn(
                name: "TipPool",
                table: "Days");
        }
    }
}
