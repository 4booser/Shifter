using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Shifter.Migrations.ShifterDb
{
    /// <inheritdoc />
    public partial class ShiftSwaps : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ShiftSwaps",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    TeamId = table.Column<int>(type: "integer", nullable: false),
                    ProposerUserId = table.Column<int>(type: "integer", nullable: false),
                    TargetUserId = table.Column<int>(type: "integer", nullable: false),
                    ProposerDayShiftId = table.Column<int>(type: "integer", nullable: true),
                    TargetDayShiftId = table.Column<int>(type: "integer", nullable: true),
                    ProposerDate = table.Column<DateOnly>(type: "date", nullable: false),
                    ProposerShiftName = table.Column<string>(type: "text", nullable: false),
                    ProposerStart = table.Column<TimeOnly>(type: "time without time zone", nullable: false),
                    ProposerEnd = table.Column<TimeOnly>(type: "time without time zone", nullable: false),
                    TargetDate = table.Column<DateOnly>(type: "date", nullable: false),
                    TargetShiftName = table.Column<string>(type: "text", nullable: false),
                    TargetStart = table.Column<TimeOnly>(type: "time without time zone", nullable: false),
                    TargetEnd = table.Column<TimeOnly>(type: "time without time zone", nullable: false),
                    Note = table.Column<string>(type: "text", nullable: true),
                    Status = table.Column<int>(type: "integer", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    RespondedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ShiftSwaps", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ShiftSwaps_Teams_TeamId",
                        column: x => x.TeamId,
                        principalTable: "Teams",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ShiftSwaps_ProposerUserId",
                table: "ShiftSwaps",
                column: "ProposerUserId");

            migrationBuilder.CreateIndex(
                name: "IX_ShiftSwaps_TargetUserId",
                table: "ShiftSwaps",
                column: "TargetUserId");

            migrationBuilder.CreateIndex(
                name: "IX_ShiftSwaps_TeamId_Status",
                table: "ShiftSwaps",
                columns: new[] { "TeamId", "Status" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ShiftSwaps");
        }
    }
}
