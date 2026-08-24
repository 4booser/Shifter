using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Shifter.Migrations.ShifterDb
{
    /// <inheritdoc />
    public partial class Webhooks : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "WebhookEndpoints",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    UserId = table.Column<int>(type: "integer", nullable: false),
                    Name = table.Column<string>(type: "text", nullable: false),
                    Kind = table.Column<int>(type: "integer", nullable: false),
                    Token = table.Column<string>(type: "text", nullable: false),
                    Secret = table.Column<string>(type: "text", nullable: false),
                    Active = table.Column<bool>(type: "boolean", nullable: false),
                    DefaultShiftId = table.Column<int>(type: "integer", nullable: true),
                    Mapping = table.Column<string>(type: "text", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    LastDeliveryAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_WebhookEndpoints", x => x.Id);
                    table.ForeignKey(
                        name: "FK_WebhookEndpoints_Shifts_DefaultShiftId",
                        column: x => x.DefaultShiftId,
                        principalTable: "Shifts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_WebhookEndpoints_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "WebhookDeliveries",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    EndpointId = table.Column<int>(type: "integer", nullable: false),
                    ReceivedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    Status = table.Column<int>(type: "integer", nullable: false),
                    ExternalId = table.Column<string>(type: "text", nullable: true),
                    AppliedDate = table.Column<DateOnly>(type: "date", nullable: true),
                    Error = table.Column<string>(type: "text", nullable: true),
                    Payload = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_WebhookDeliveries", x => x.Id);
                    table.ForeignKey(
                        name: "FK_WebhookDeliveries_WebhookEndpoints_EndpointId",
                        column: x => x.EndpointId,
                        principalTable: "WebhookEndpoints",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_WebhookDeliveries_EndpointId_ExternalId",
                table: "WebhookDeliveries",
                columns: new[] { "EndpointId", "ExternalId" },
                unique: true,
                filter: "\"ExternalId\" IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_WebhookDeliveries_EndpointId_ReceivedAt",
                table: "WebhookDeliveries",
                columns: new[] { "EndpointId", "ReceivedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_WebhookEndpoints_DefaultShiftId",
                table: "WebhookEndpoints",
                column: "DefaultShiftId");

            migrationBuilder.CreateIndex(
                name: "IX_WebhookEndpoints_Token",
                table: "WebhookEndpoints",
                column: "Token",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_WebhookEndpoints_UserId",
                table: "WebhookEndpoints",
                column: "UserId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "WebhookDeliveries");

            migrationBuilder.DropTable(
                name: "WebhookEndpoints");
        }
    }
}
