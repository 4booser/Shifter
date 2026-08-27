using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Shifter.Migrations.ShifterDb
{
    /// <inheritdoc />
    public partial class NightAndHolidayPremiums : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "HolidayCountry",
                table: "Locations",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<TimeOnly>(
                name: "NightFrom",
                table: "Locations",
                type: "time without time zone",
                nullable: false,
                defaultValue: new TimeOnly(0, 0, 0));

            migrationBuilder.AddColumn<decimal>(
                name: "NightMultiplier",
                table: "Locations",
                type: "numeric",
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<TimeOnly>(
                name: "NightTo",
                table: "Locations",
                type: "time without time zone",
                nullable: false,
                defaultValue: new TimeOnly(0, 0, 0));

            migrationBuilder.AddColumn<decimal>(
                name: "PublicHolidayMultiplier",
                table: "Locations",
                type: "numeric",
                nullable: false,
                defaultValue: 0m);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "HolidayCountry",
                table: "Locations");

            migrationBuilder.DropColumn(
                name: "NightFrom",
                table: "Locations");

            migrationBuilder.DropColumn(
                name: "NightMultiplier",
                table: "Locations");

            migrationBuilder.DropColumn(
                name: "NightTo",
                table: "Locations");

            migrationBuilder.DropColumn(
                name: "PublicHolidayMultiplier",
                table: "Locations");
        }
    }
}
