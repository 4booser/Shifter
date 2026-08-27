using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Shifter.Migrations.ShifterDb
{
    /// <inheritdoc />
    public partial class Referrals : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "InvitedByUserId",
                table: "Users",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ReferralCode",
                table: "Users",
                type: "text",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Users_ReferralCode",
                table: "Users",
                column: "ReferralCode",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Users_ReferralCode",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "InvitedByUserId",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "ReferralCode",
                table: "Users");
        }
    }
}
