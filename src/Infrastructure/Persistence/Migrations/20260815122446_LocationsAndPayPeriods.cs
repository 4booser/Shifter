using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Shifter.src.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class LocationsAndPayPeriods : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Location_Users_UserId",
                table: "Location");

            migrationBuilder.DropForeignKey(
                name: "FK_Shifts_Location_LocationId",
                table: "Shifts");

            migrationBuilder.DropPrimaryKey(
                name: "PK_Location",
                table: "Location");

            migrationBuilder.RenameTable(
                name: "Location",
                newName: "Locations");

            migrationBuilder.RenameIndex(
                name: "IX_Location_UserId",
                table: "Locations",
                newName: "IX_Locations_UserId");

            migrationBuilder.AlterColumn<string>(
                name: "Symbol",
                table: "Shifts",
                type: "text",
                nullable: true,
                oldClrType: typeof(char),
                oldType: "character(1)",
                oldNullable: true);

            migrationBuilder.AlterColumn<string>(
                name: "Address",
                table: "Locations",
                type: "text",
                nullable: true,
                oldClrType: typeof(string),
                oldType: "text");

            migrationBuilder.AddColumn<bool>(
                name: "Archived",
                table: "Locations",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "Colour",
                table: "Locations",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<DateOnly>(
                name: "PayAnchor",
                table: "Locations",
                type: "date",
                nullable: false,
                defaultValue: new DateOnly(1, 1, 1));

            migrationBuilder.AddColumn<int>(
                name: "PayDay",
                table: "Locations",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "PayPeriod",
                table: "Locations",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddPrimaryKey(
                name: "PK_Locations",
                table: "Locations",
                column: "Id");

            migrationBuilder.AddForeignKey(
                name: "FK_Locations_Users_UserId",
                table: "Locations",
                column: "UserId",
                principalTable: "Users",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_Shifts_Locations_LocationId",
                table: "Shifts",
                column: "LocationId",
                principalTable: "Locations",
                principalColumn: "Id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Locations_Users_UserId",
                table: "Locations");

            migrationBuilder.DropForeignKey(
                name: "FK_Shifts_Locations_LocationId",
                table: "Shifts");

            migrationBuilder.DropPrimaryKey(
                name: "PK_Locations",
                table: "Locations");

            migrationBuilder.DropColumn(
                name: "Archived",
                table: "Locations");

            migrationBuilder.DropColumn(
                name: "Colour",
                table: "Locations");

            migrationBuilder.DropColumn(
                name: "PayAnchor",
                table: "Locations");

            migrationBuilder.DropColumn(
                name: "PayDay",
                table: "Locations");

            migrationBuilder.DropColumn(
                name: "PayPeriod",
                table: "Locations");

            migrationBuilder.RenameTable(
                name: "Locations",
                newName: "Location");

            migrationBuilder.RenameIndex(
                name: "IX_Locations_UserId",
                table: "Location",
                newName: "IX_Location_UserId");

            migrationBuilder.AlterColumn<char>(
                name: "Symbol",
                table: "Shifts",
                type: "character(1)",
                nullable: true,
                oldClrType: typeof(string),
                oldType: "text",
                oldNullable: true);

            migrationBuilder.AlterColumn<string>(
                name: "Address",
                table: "Location",
                type: "text",
                nullable: false,
                defaultValue: "",
                oldClrType: typeof(string),
                oldType: "text",
                oldNullable: true);

            migrationBuilder.AddPrimaryKey(
                name: "PK_Location",
                table: "Location",
                column: "Id");

            migrationBuilder.AddForeignKey(
                name: "FK_Location_Users_UserId",
                table: "Location",
                column: "UserId",
                principalTable: "Users",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_Shifts_Location_LocationId",
                table: "Shifts",
                column: "LocationId",
                principalTable: "Location",
                principalColumn: "Id");
        }
    }
}
