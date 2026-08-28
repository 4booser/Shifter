using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Shifter.Migrations.ShifterDb
{
    /// <inheritdoc />
    public partial class RestHours : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Eleven, not the type's zero. This is a threshold, not a
            // quantity: a rest of "0 hours is enough" is not an answer
            // anybody gave, and every account that existed before today
            // would have held it.
            migrationBuilder.AddColumn<double>(
                name: "RestHours",
                table: "Users",
                type: "double precision",
                nullable: false,
                defaultValue: 11.0);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "RestHours",
                table: "Users");
        }
    }
}
