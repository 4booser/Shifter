using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Shifter.src.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class SalaryPeriod : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "SalaryPerDay",
                table: "Shifts");

            migrationBuilder.DropColumn(
                name: "SalaryPerHour",
                table: "Shifts");

            migrationBuilder.DropColumn(
                name: "SalaryPerMonth",
                table: "Shifts");

            migrationBuilder.RenameColumn(
                name: "SalaryPerWeek",
                table: "Shifts",
                newName: "SalaryAmount");

            migrationBuilder.AddColumn<int>(
                name: "SalaryPeriod",
                table: "Shifts",
                type: "integer",
                nullable: false,
                defaultValue: 0);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "SalaryPeriod",
                table: "Shifts");

            migrationBuilder.RenameColumn(
                name: "SalaryAmount",
                table: "Shifts",
                newName: "SalaryPerWeek");

            migrationBuilder.AddColumn<decimal>(
                name: "SalaryPerDay",
                table: "Shifts",
                type: "numeric",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "SalaryPerHour",
                table: "Shifts",
                type: "numeric",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "SalaryPerMonth",
                table: "Shifts",
                type: "numeric",
                nullable: true);
        }
    }
}
