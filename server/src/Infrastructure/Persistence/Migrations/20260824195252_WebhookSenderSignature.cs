using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Shifter.Migrations.ShifterDb
{
    /// <inheritdoc />
    public partial class WebhookSenderSignature : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "SignatureHeader",
                table: "WebhookEndpoints",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SignatureSecret",
                table: "WebhookEndpoints",
                type: "text",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "SignatureHeader",
                table: "WebhookEndpoints");

            migrationBuilder.DropColumn(
                name: "SignatureSecret",
                table: "WebhookEndpoints");
        }
    }
}
