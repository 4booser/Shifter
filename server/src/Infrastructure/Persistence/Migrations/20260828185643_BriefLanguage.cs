using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Shifter.Migrations.ShifterDb
{
    /// <inheritdoc />
    public partial class BriefLanguage : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Every row already here was written in Russian, and the cache is
            // keyed on this column — so a wrong default would not be a blank
            // field, it would be a Russian paragraph served to somebody who
            // asked for Ukrainian, until the month's total moved.
            migrationBuilder.AddColumn<string>(
                name: "Language",
                table: "DailyBriefs",
                type: "text",
                nullable: false,
                defaultValue: "ru");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Language",
                table: "DailyBriefs");
        }
    }
}
