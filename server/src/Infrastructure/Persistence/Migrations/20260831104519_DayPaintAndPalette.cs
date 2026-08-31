using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Shifter.Migrations.ShifterDb
{
    /// <inheritdoc />
    public partial class DayPaintAndPalette : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "ColourPresets",
                table: "Users",
                type: "text",
                nullable: false,
                // An empty palette is "[]", not "": the column holds JSON, and
                // a blank string is a value the reader would have to forgive
                // rather than one anybody meant.
                defaultValue: "[]");

            migrationBuilder.AddColumn<bool>(
                name: "PaintsDay",
                table: "Shifts",
                type: "boolean",
                nullable: false,
                defaultValue: false);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ColourPresets",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "PaintsDay",
                table: "Shifts");
        }
    }
}
