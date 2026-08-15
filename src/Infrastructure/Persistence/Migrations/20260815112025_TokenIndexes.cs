using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Shifter.src.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class TokenIndexes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateIndex(
                name: "IX_Tokens_Token",
                table: "Tokens",
                column: "Token",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Tokens_UserId_ExpiresAt",
                table: "Tokens",
                columns: new[] { "UserId", "ExpiresAt" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Tokens_Token",
                table: "Tokens");

            migrationBuilder.DropIndex(
                name: "IX_Tokens_UserId_ExpiresAt",
                table: "Tokens");
        }
    }
}
