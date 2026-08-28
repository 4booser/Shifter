using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Shifter.Migrations.ShifterDb
{
    /// <inheritdoc />
    public partial class TipJar : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateOnly>(
                name: "TipSaveFrom",
                table: "Users",
                type: "date",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "TipSaveGoal",
                table: "Users",
                type: "numeric",
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<decimal>(
                name: "TipSavePercent",
                table: "Users",
                type: "numeric",
                nullable: false,
                defaultValue: 0m);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "TipSaveFrom",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "TipSaveGoal",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "TipSavePercent",
                table: "Users");
        }
    }
}
