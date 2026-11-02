using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Shifter.src.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class WeekdayHoursAndAutoClock : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "AutoClock",
                table: "Shifts",
                type: "boolean",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<string>(
                name: "WeekHours",
                table: "Shifts",
                type: "jsonb",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "AutoClosedAtUtc",
                table: "DayShifts",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Days_Date",
                table: "Days",
                column: "Date");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Days_Date",
                table: "Days");

            migrationBuilder.DropColumn(
                name: "AutoClock",
                table: "Shifts");

            migrationBuilder.DropColumn(
                name: "WeekHours",
                table: "Shifts");

            migrationBuilder.DropColumn(
                name: "AutoClosedAtUtc",
                table: "DayShifts");
        }
    }
}
