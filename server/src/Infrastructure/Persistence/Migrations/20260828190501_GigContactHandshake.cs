using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Shifter.Migrations.ShifterDb
{
    /// <inheritdoc />
    public partial class GigContactHandshake : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "OpenedAt",
                table: "GigResponses",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "VenuePhone",
                table: "GigResponses",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "VenueTelegram",
                table: "GigResponses",
                type: "text",
                nullable: true);

            // Every reply already in the table was made in the only flow that
            // existed, where answering meant handing the phone over. Leaving
            // OpenedAt null would hide those contacts from the venues they
            // were given to — the past rewritten as a privacy improvement,
            // and no way for either side to get it back.
            migrationBuilder.Sql(
                """
                UPDATE "GigResponses"
                SET "OpenedAt" = "CreatedAt"
                WHERE "Phone" IS NOT NULL OR "Telegram" IS NOT NULL;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "OpenedAt",
                table: "GigResponses");

            migrationBuilder.DropColumn(
                name: "VenuePhone",
                table: "GigResponses");

            migrationBuilder.DropColumn(
                name: "VenueTelegram",
                table: "GigResponses");
        }
    }
}
