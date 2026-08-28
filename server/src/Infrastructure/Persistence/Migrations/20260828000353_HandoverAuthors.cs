using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Shifter.Migrations.ShifterDb
{
    /// <inheritdoc />
    public partial class HandoverAuthors : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<int>(
                name: "RaisedByUserId",
                table: "StopItems",
                type: "integer",
                nullable: true,
                oldClrType: typeof(int),
                oldType: "integer");

            migrationBuilder.AlterColumn<int>(
                name: "UpdatedByUserId",
                table: "Handovers",
                type: "integer",
                nullable: true,
                oldClrType: typeof(int),
                oldType: "integer");

            migrationBuilder.CreateIndex(
                name: "IX_StopItems_ClearedByUserId",
                table: "StopItems",
                column: "ClearedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_StopItems_RaisedByUserId",
                table: "StopItems",
                column: "RaisedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_Handovers_UpdatedByUserId",
                table: "Handovers",
                column: "UpdatedByUserId");

            migrationBuilder.AddForeignKey(
                name: "FK_Handovers_Users_UpdatedByUserId",
                table: "Handovers",
                column: "UpdatedByUserId",
                principalTable: "Users",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);

            migrationBuilder.AddForeignKey(
                name: "FK_StopItems_Users_ClearedByUserId",
                table: "StopItems",
                column: "ClearedByUserId",
                principalTable: "Users",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);

            migrationBuilder.AddForeignKey(
                name: "FK_StopItems_Users_RaisedByUserId",
                table: "StopItems",
                column: "RaisedByUserId",
                principalTable: "Users",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Handovers_Users_UpdatedByUserId",
                table: "Handovers");

            migrationBuilder.DropForeignKey(
                name: "FK_StopItems_Users_ClearedByUserId",
                table: "StopItems");

            migrationBuilder.DropForeignKey(
                name: "FK_StopItems_Users_RaisedByUserId",
                table: "StopItems");

            migrationBuilder.DropIndex(
                name: "IX_StopItems_ClearedByUserId",
                table: "StopItems");

            migrationBuilder.DropIndex(
                name: "IX_StopItems_RaisedByUserId",
                table: "StopItems");

            migrationBuilder.DropIndex(
                name: "IX_Handovers_UpdatedByUserId",
                table: "Handovers");

            migrationBuilder.AlterColumn<int>(
                name: "RaisedByUserId",
                table: "StopItems",
                type: "integer",
                nullable: false,
                defaultValue: 0,
                oldClrType: typeof(int),
                oldType: "integer",
                oldNullable: true);

            migrationBuilder.AlterColumn<int>(
                name: "UpdatedByUserId",
                table: "Handovers",
                type: "integer",
                nullable: false,
                defaultValue: 0,
                oldClrType: typeof(int),
                oldType: "integer",
                oldNullable: true);
        }
    }
}
