using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Shifter.Migrations.ShifterDb
{
    /// <inheritdoc />
    public partial class ContactAudit : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "ContactSeenAt",
                table: "GigResponses",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "ContactSeenCount",
                table: "GigResponses",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<DateTime>(
                name: "ContactSeenLastAt",
                table: "GigResponses",
                type: "timestamp with time zone",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ContactSeenAt",
                table: "GigResponses");

            migrationBuilder.DropColumn(
                name: "ContactSeenCount",
                table: "GigResponses");

            migrationBuilder.DropColumn(
                name: "ContactSeenLastAt",
                table: "GigResponses");
        }
    }
}
