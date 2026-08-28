using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Shifter.Migrations.ShifterDb
{
    /// <inheritdoc />
    public partial class DeviceSchedule : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // The defaults matter more than usual here. A property initialiser
            // only applies to a row this code creates; every phone already
            // registered gets whatever the column default says — and the
            // generated ones were "" and false, which would have left every
            // existing device silently opted out of both nudges with a time
            // nothing can parse.
            migrationBuilder.AddColumn<string>(
                name: "NotifyAt",
                table: "DeviceTokens",
                type: "text",
                nullable: false,
                defaultValue: "19:00");

            migrationBuilder.AddColumn<bool>(
                name: "NotifyPayday",
                table: "DeviceTokens",
                type: "boolean",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<bool>(
                name: "NotifyTomorrow",
                table: "DeviceTokens",
                type: "boolean",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<DateOnly>(
                name: "PaydaySentOn",
                table: "DeviceTokens",
                type: "date",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "TimeZone",
                table: "DeviceTokens",
                type: "text",
                nullable: false,
                defaultValue: "Europe/Kyiv");

            migrationBuilder.AddColumn<DateOnly>(
                name: "TomorrowSentOn",
                table: "DeviceTokens",
                type: "date",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "NotifyAt",
                table: "DeviceTokens");

            migrationBuilder.DropColumn(
                name: "NotifyPayday",
                table: "DeviceTokens");

            migrationBuilder.DropColumn(
                name: "NotifyTomorrow",
                table: "DeviceTokens");

            migrationBuilder.DropColumn(
                name: "PaydaySentOn",
                table: "DeviceTokens");

            migrationBuilder.DropColumn(
                name: "TimeZone",
                table: "DeviceTokens");

            migrationBuilder.DropColumn(
                name: "TomorrowSentOn",
                table: "DeviceTokens");
        }
    }
}
