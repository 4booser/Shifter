using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Shifter.src.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class TeamRoster : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "Rosters",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    UserId = table.Column<int>(type: "integer", nullable: false),
                    Title = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: false),
                    ShareSlug = table.Column<string>(type: "character varying(12)", maxLength: 12, nullable: true),
                    CreatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Rosters", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Rosters_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "RosterPeople",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    RosterId = table.Column<int>(type: "integer", nullable: false),
                    Name = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    Position = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: true),
                    Colour = table.Column<string>(type: "character varying(7)", maxLength: 7, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_RosterPeople", x => x.Id);
                    table.ForeignKey(
                        name: "FK_RosterPeople_Rosters_RosterId",
                        column: x => x.RosterId,
                        principalTable: "Rosters",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "RosterShifts",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    RosterId = table.Column<int>(type: "integer", nullable: false),
                    RosterPersonId = table.Column<int>(type: "integer", nullable: false),
                    Date = table.Column<DateOnly>(type: "date", nullable: false),
                    StartTime = table.Column<TimeOnly>(type: "time without time zone", nullable: false),
                    EndTime = table.Column<TimeOnly>(type: "time without time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_RosterShifts", x => x.Id);
                    table.ForeignKey(
                        name: "FK_RosterShifts_RosterPeople_RosterPersonId",
                        column: x => x.RosterPersonId,
                        principalTable: "RosterPeople",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_RosterShifts_Rosters_RosterId",
                        column: x => x.RosterId,
                        principalTable: "Rosters",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_RosterPeople_RosterId",
                table: "RosterPeople",
                column: "RosterId");

            migrationBuilder.CreateIndex(
                name: "IX_Rosters_ShareSlug",
                table: "Rosters",
                column: "ShareSlug",
                unique: true,
                filter: "\"ShareSlug\" IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_Rosters_UserId",
                table: "Rosters",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_RosterShifts_RosterId_Date",
                table: "RosterShifts",
                columns: new[] { "RosterId", "Date" });

            migrationBuilder.CreateIndex(
                name: "IX_RosterShifts_RosterPersonId_Date",
                table: "RosterShifts",
                columns: new[] { "RosterPersonId", "Date" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "RosterShifts");

            migrationBuilder.DropTable(
                name: "RosterPeople");

            migrationBuilder.DropTable(
                name: "Rosters");
        }
    }
}
