using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Shifter.Migrations.ShifterDb
{
    /// <inheritdoc />
    public partial class PayoutLocation : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "LocationId",
                table: "Payouts",
                type: "integer",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Payouts_LocationId",
                table: "Payouts",
                column: "LocationId");

            migrationBuilder.AddForeignKey(
                name: "FK_Payouts_Locations_LocationId",
                table: "Payouts",
                column: "LocationId",
                principalTable: "Locations",
                principalColumn: "Id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Payouts_Locations_LocationId",
                table: "Payouts");

            migrationBuilder.DropIndex(
                name: "IX_Payouts_LocationId",
                table: "Payouts");

            migrationBuilder.DropColumn(
                name: "LocationId",
                table: "Payouts");
        }
    }
}
