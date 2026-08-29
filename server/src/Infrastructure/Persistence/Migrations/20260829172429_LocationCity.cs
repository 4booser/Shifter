using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Shifter.Migrations.ShifterDb
{
    /// <inheritdoc />
    public partial class LocationCity : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "City",
                table: "Locations",
                type: "text",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "City",
                table: "Locations");
        }
    }
}
