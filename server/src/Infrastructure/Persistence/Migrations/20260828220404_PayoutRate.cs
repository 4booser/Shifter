using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Shifter.Migrations.ShifterDb
{
    /// <inheritdoc />
    public partial class PayoutRate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Currency",
                table: "Payouts",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<DateOnly>(
                name: "RateOn",
                table: "Payouts",
                type: "date",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "RateToBase",
                table: "Payouts",
                type: "numeric",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Currency",
                table: "Payouts");

            migrationBuilder.DropColumn(
                name: "RateOn",
                table: "Payouts");

            migrationBuilder.DropColumn(
                name: "RateToBase",
                table: "Payouts");
        }
    }
}
