using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Shifter.Migrations.ShifterDb
{
    /// <inheritdoc />
    public partial class GigListingCascade : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_GigListings_Users_OwnerId",
                table: "GigListings");

            migrationBuilder.DropIndex(
                name: "IX_GigListings_OwnerId",
                table: "GigListings");

            migrationBuilder.DropColumn(
                name: "OwnerId",
                table: "GigListings");

            migrationBuilder.AddForeignKey(
                name: "FK_GigListings_Users_OwnerUserId",
                table: "GigListings",
                column: "OwnerUserId",
                principalTable: "Users",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_GigListings_Users_OwnerUserId",
                table: "GigListings");

            migrationBuilder.AddColumn<int>(
                name: "OwnerId",
                table: "GigListings",
                type: "integer",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_GigListings_OwnerId",
                table: "GigListings",
                column: "OwnerId");

            migrationBuilder.AddForeignKey(
                name: "FK_GigListings_Users_OwnerId",
                table: "GigListings",
                column: "OwnerId",
                principalTable: "Users",
                principalColumn: "Id");
        }
    }
}
