using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Shifter.Migrations.ShifterDb
{
    /// <inheritdoc />
    public partial class TokenRevocation : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Rows that predate the column were issued at some point before
            // now; stamping them with the year 1 would read as corrupt data.
            migrationBuilder.AddColumn<DateTime>(
                name: "CreatedAt",
                table: "Tokens",
                type: "timestamp with time zone",
                nullable: false,
                defaultValueSql: "now()");

            migrationBuilder.AddColumn<DateTime>(
                name: "RevokedAt",
                table: "Tokens",
                type: "timestamp with time zone",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "CreatedAt",
                table: "Tokens");

            migrationBuilder.DropColumn(
                name: "RevokedAt",
                table: "Tokens");
        }
    }
}
