using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Shifter.Migrations.ShifterDb
{
    /// <inheritdoc />
    public partial class MonthlyLetter : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "LetterKey",
                table: "Users",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "MonthlyLetter",
                table: "Users",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "MonthlyLetterSent",
                table: "Users",
                type: "text",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "LetterKey",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "MonthlyLetter",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "MonthlyLetterSent",
                table: "Users");
        }
    }
}
