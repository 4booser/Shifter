using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Shifter.Migrations.ShifterDb
{
    /// <inheritdoc />
    public partial class DayUserKey : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Days always had a real key to Users — the collection on the other
            // side was enough for EF to make one, and the review that said
            // otherwise was wrong about this one table. Adding a second
            // navigation without pointing it at that collection made EF build
            // a *separate* relationship on a shadow column, so every query
            // against a day started selecting a column that is always null and
            // cascades nothing. Removed; the real key is untouched.
            migrationBuilder.DropForeignKey(
                name: "FK_Days_Users_UserId1",
                table: "Days");

            migrationBuilder.DropIndex(
                name: "IX_Days_UserId1",
                table: "Days");

            migrationBuilder.DropColumn(
                name: "UserId1",
                table: "Days");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "UserId1",
                table: "Days",
                type: "integer",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Days_UserId1",
                table: "Days",
                column: "UserId1");

            migrationBuilder.AddForeignKey(
                name: "FK_Days_Users_UserId1",
                table: "Days",
                column: "UserId1",
                principalTable: "Users",
                principalColumn: "Id");
        }
    }
}
