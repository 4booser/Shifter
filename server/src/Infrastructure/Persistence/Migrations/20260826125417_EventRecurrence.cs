using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Shifter.Migrations.ShifterDb
{
    /// <inheritdoc />
    public partial class EventRecurrence : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateOnly>(
                name: "RepeatUntil",
                table: "Events",
                type: "date",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "RepeatWeekdays",
                table: "Events",
                type: "text",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "RepeatUntil",
                table: "Events");

            migrationBuilder.DropColumn(
                name: "RepeatWeekdays",
                table: "Events");
        }
    }
}
