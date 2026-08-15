using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Shifter.src.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class ExplicitDayShiftAndPayouts : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "DayShifts",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    DayId = table.Column<int>(type: "integer", nullable: false),
                    ShiftId = table.Column<int>(type: "integer", nullable: false),
                    SalaryPeriod = table.Column<int>(type: "integer", nullable: false),
                    SalaryAmount = table.Column<decimal>(type: "numeric", nullable: true),
                    StartTime = table.Column<TimeOnly>(type: "time without time zone", nullable: false),
                    EndTime = table.Column<TimeOnly>(type: "time without time zone", nullable: false),
                    BreakMinutes = table.Column<int>(type: "integer", nullable: false),
                    Worked = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DayShifts", x => x.Id);
                    table.ForeignKey(
                        name: "FK_DayShifts_Days_DayId",
                        column: x => x.DayId,
                        principalTable: "Days",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_DayShifts_Shifts_ShiftId",
                        column: x => x.ShiftId,
                        principalTable: "Shifts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "Payouts",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    UserId = table.Column<int>(type: "integer", nullable: false),
                    PeriodFrom = table.Column<DateOnly>(type: "date", nullable: false),
                    PeriodTo = table.Column<DateOnly>(type: "date", nullable: false),
                    Amount = table.Column<decimal>(type: "numeric", nullable: false),
                    ReceivedOn = table.Column<DateOnly>(type: "date", nullable: false),
                    Note = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Payouts", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Payouts_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_DayShifts_DayId_ShiftId",
                table: "DayShifts",
                columns: new[] { "DayId", "ShiftId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_DayShifts_ShiftId",
                table: "DayShifts",
                column: "ShiftId");

            migrationBuilder.CreateIndex(
                name: "IX_Payouts_UserId_PeriodFrom_PeriodTo",
                table: "Payouts",
                columns: new[] { "UserId", "PeriodFrom", "PeriodTo" });

            // Carry the existing links into the new table. The snapshot columns
            // take the template's current terms, which is the best available
            // approximation for rows placed before snapshots existed. Worked is
            // inferred from the date: anything already past is treated as done.
            migrationBuilder.Sql("""
                INSERT INTO "DayShifts"
                    ("DayId", "ShiftId", "SalaryPeriod", "SalaryAmount",
                     "StartTime", "EndTime", "BreakMinutes", "Worked")
                SELECT link."DaysId", link."ShiftsId", shift."SalaryPeriod",
                       shift."SalaryAmount", shift."StartTime", shift."EndTime",
                       0, (day."Date" <= CURRENT_DATE)
                FROM "DayShift" AS link
                JOIN "Shifts" AS shift ON shift."Id" = link."ShiftsId"
                JOIN "Days" AS day ON day."Id" = link."DaysId";
                """);

            migrationBuilder.DropTable(
                name: "DayShift");
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "DayShifts");

            migrationBuilder.DropTable(
                name: "Payouts");

            migrationBuilder.CreateTable(
                name: "DayShift",
                columns: table => new
                {
                    DaysId = table.Column<int>(type: "integer", nullable: false),
                    ShiftsId = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DayShift", x => new { x.DaysId, x.ShiftsId });
                    table.ForeignKey(
                        name: "FK_DayShift_Days_DaysId",
                        column: x => x.DaysId,
                        principalTable: "Days",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_DayShift_Shifts_ShiftsId",
                        column: x => x.ShiftsId,
                        principalTable: "Shifts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_DayShift_ShiftsId",
                table: "DayShift",
                column: "ShiftsId");
        }
    }
}
