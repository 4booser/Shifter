using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Shifter.Migrations.ShifterDb
{
    /// <inheritdoc />
    public partial class BriefFreshness : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "EarnedAtWriting",
                table: "DailyBriefs",
                type: "numeric",
                nullable: false,
                defaultValue: 0m);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "EarnedAtWriting",
                table: "DailyBriefs");
        }
    }
}
