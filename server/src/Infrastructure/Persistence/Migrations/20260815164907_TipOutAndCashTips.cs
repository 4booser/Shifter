using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Shifter.Migrations.ShifterDb
{
    /// <inheritdoc />
    public partial class TipOutAndCashTips : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "TipOutOfSalesPercent",
                table: "Locations",
                type: "numeric",
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<decimal>(
                name: "TipOutOfTipsPercent",
                table: "Locations",
                type: "numeric",
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<decimal>(
                name: "TipsCash",
                table: "Days",
                type: "numeric",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "TipOutOfSalesPercent",
                table: "Locations");

            migrationBuilder.DropColumn(
                name: "TipOutOfTipsPercent",
                table: "Locations");

            migrationBuilder.DropColumn(
                name: "TipsCash",
                table: "Days");
        }
    }
}
