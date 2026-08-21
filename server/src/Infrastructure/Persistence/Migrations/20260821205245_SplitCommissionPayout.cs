using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Shifter.Migrations.ShifterDb
{
    /// <inheritdoc />
    public partial class SplitCommissionPayout : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Every payment recorded before the split covered whatever the place
            // owed, so it is "all" — not the empty string EF infers from the
            // column type. A blank here would match no reconciliation row and
            // every past period would reopen as unpaid.
            migrationBuilder.AddColumn<string>(
                name: "Stream",
                table: "Payouts",
                type: "text",
                nullable: false,
                defaultValue: "all");

            // The entity's own defaults, so a place that never sets a second
            // schedule still holds a usable day and anchor if it later does.
            // EF's inferred 0001-01-01 and 0 would both be rejected on save.
            migrationBuilder.AddColumn<DateOnly>(
                name: "SalesPayAnchor",
                table: "Locations",
                type: "date",
                nullable: false,
                defaultValue: new DateOnly(2020, 1, 6));

            migrationBuilder.AddColumn<int>(
                name: "SalesPayDay",
                table: "Locations",
                type: "integer",
                nullable: false,
                defaultValue: 1);

            migrationBuilder.AddColumn<int>(
                name: "SalesPayPeriod",
                table: "Locations",
                type: "integer",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Stream",
                table: "Payouts");

            migrationBuilder.DropColumn(
                name: "SalesPayAnchor",
                table: "Locations");

            migrationBuilder.DropColumn(
                name: "SalesPayDay",
                table: "Locations");

            migrationBuilder.DropColumn(
                name: "SalesPayPeriod",
                table: "Locations");
        }
    }
}
