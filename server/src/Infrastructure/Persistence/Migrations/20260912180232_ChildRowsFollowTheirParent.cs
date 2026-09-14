using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Shifter.src.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class ChildRowsFollowTheirParent : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            /* The residue of the rule that was missing. */
            migrationBuilder.Sql(@"DELETE FROM ""Break"" WHERE ""ShiftId"" IS NULL;");

            migrationBuilder.DropForeignKey(
                name: "FK_Break_Shifts_ShiftId",
                table: "Break");

            migrationBuilder.DropForeignKey(
                name: "FK_ExpenseRules_Locations_LocationId",
                table: "ExpenseRules");

            migrationBuilder.DropForeignKey(
                name: "FK_Payouts_Locations_LocationId",
                table: "Payouts");

            migrationBuilder.DropForeignKey(
                name: "FK_Shifts_Locations_LocationId",
                table: "Shifts");

            migrationBuilder.AddForeignKey(
                name: "FK_Break_Shifts_ShiftId",
                table: "Break",
                column: "ShiftId",
                principalTable: "Shifts",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_ExpenseRules_Locations_LocationId",
                table: "ExpenseRules",
                column: "LocationId",
                principalTable: "Locations",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_Payouts_Locations_LocationId",
                table: "Payouts",
                column: "LocationId",
                principalTable: "Locations",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);

            migrationBuilder.AddForeignKey(
                name: "FK_Shifts_Locations_LocationId",
                table: "Shifts",
                column: "LocationId",
                principalTable: "Locations",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Break_Shifts_ShiftId",
                table: "Break");

            migrationBuilder.DropForeignKey(
                name: "FK_ExpenseRules_Locations_LocationId",
                table: "ExpenseRules");

            migrationBuilder.DropForeignKey(
                name: "FK_Payouts_Locations_LocationId",
                table: "Payouts");

            migrationBuilder.DropForeignKey(
                name: "FK_Shifts_Locations_LocationId",
                table: "Shifts");

            migrationBuilder.AddForeignKey(
                name: "FK_Break_Shifts_ShiftId",
                table: "Break",
                column: "ShiftId",
                principalTable: "Shifts",
                principalColumn: "Id");

            migrationBuilder.AddForeignKey(
                name: "FK_ExpenseRules_Locations_LocationId",
                table: "ExpenseRules",
                column: "LocationId",
                principalTable: "Locations",
                principalColumn: "Id");

            migrationBuilder.AddForeignKey(
                name: "FK_Payouts_Locations_LocationId",
                table: "Payouts",
                column: "LocationId",
                principalTable: "Locations",
                principalColumn: "Id");

            migrationBuilder.AddForeignKey(
                name: "FK_Shifts_Locations_LocationId",
                table: "Shifts",
                column: "LocationId",
                principalTable: "Locations",
                principalColumn: "Id");
        }
    }
}
