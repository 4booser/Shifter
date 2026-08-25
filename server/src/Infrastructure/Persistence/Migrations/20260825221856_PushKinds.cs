using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Shifter.Migrations.ShifterDb
{
    /// <inheritdoc />
    public partial class PushKinds : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateOnly>(
                name: "DigestSentOn",
                table: "PushSubscriptions",
                type: "date",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "NotifyDigest",
                table: "PushSubscriptions",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "NotifyPayday",
                table: "PushSubscriptions",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<DateOnly>(
                name: "PaydaySentOn",
                table: "PushSubscriptions",
                type: "date",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "DigestSentOn",
                table: "PushSubscriptions");

            migrationBuilder.DropColumn(
                name: "NotifyDigest",
                table: "PushSubscriptions");

            migrationBuilder.DropColumn(
                name: "NotifyPayday",
                table: "PushSubscriptions");

            migrationBuilder.DropColumn(
                name: "PaydaySentOn",
                table: "PushSubscriptions");
        }
    }
}
