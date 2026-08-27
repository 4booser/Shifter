using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Shifter.Migrations.ShifterDb
{
    /// <inheritdoc />
    public partial class UserOwnedCascades : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // The shadow column this originally created is gone from here: it
            // was a mistake, the migration after this one removes it, and a
            // database created today should never have it in the first place.
            // Production has it and is cleaned up there.
            // Orphans first, or every AddForeignKey below aborts the whole
            // migration on the first dangling row — and takes the deploy with
            // it, since a failed migration blocks every release after it. These
            // rows exist precisely because the keys were missing: an account
            // deleted before today left its whole calendar behind.
            foreach (var (table, column) in new[]
            {
                ("Days", "UserId"),
                ("DayAudits", "UserId"),
                ("Availabilities", "UserId"),
                ("LeaveRequests", "UserId"),
                ("PlannedAssignments", "UserId"),
                ("CoverOffers", "OwnerUserId"),
                ("CoverOffers", "ClaimantUserId"),
            })
            {
                migrationBuilder.Sql(
                    $"DELETE FROM \"{table}\" WHERE \"{column}\" NOT IN (SELECT \"Id\" FROM \"Users\");");
            }

            // The second person on a row is forgotten rather than deleted.
            migrationBuilder.Sql(
                "UPDATE \"LeaveRequests\" SET \"DecidedByUserId\" = NULL "
                + "WHERE \"DecidedByUserId\" IS NOT NULL "
                + "AND \"DecidedByUserId\" NOT IN (SELECT \"Id\" FROM \"Users\");");

            migrationBuilder.Sql(
                "UPDATE \"PlannedAssignments\" SET \"CreatedByUserId\" = NULL "
                + "WHERE \"CreatedByUserId\" IS NOT NULL "
                + "AND \"CreatedByUserId\" NOT IN (SELECT \"Id\" FROM \"Users\");");

            // A team whose owner is already gone is handed to whoever has been
            // in it longest, or removed when nobody is left.
            migrationBuilder.Sql(
                "UPDATE \"Teams\" t SET \"OwnerUserId\" = m.\"UserId\" "
                + "FROM (SELECT DISTINCT ON (\"TeamId\") \"TeamId\", \"UserId\" FROM \"TeamMembers\" "
                + "ORDER BY \"TeamId\", \"IsManager\" DESC, \"Id\") m "
                + "WHERE m.\"TeamId\" = t.\"Id\" "
                + "AND t.\"OwnerUserId\" NOT IN (SELECT \"Id\" FROM \"Users\");");

            migrationBuilder.Sql(
                "DELETE FROM \"Teams\" WHERE \"OwnerUserId\" NOT IN (SELECT \"Id\" FROM \"Users\");");

            migrationBuilder.AlterColumn<int>(
                name: "CreatedByUserId",
                table: "PlannedAssignments",
                type: "integer",
                nullable: true,
                oldClrType: typeof(int),
                oldType: "integer");


            migrationBuilder.CreateIndex(
                name: "IX_PlannedAssignments_CreatedByUserId",
                table: "PlannedAssignments",
                column: "CreatedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_LeaveRequests_DecidedByUserId",
                table: "LeaveRequests",
                column: "DecidedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_LeaveRequests_UserId",
                table: "LeaveRequests",
                column: "UserId");


            migrationBuilder.CreateIndex(
                name: "IX_CoverOffers_ClaimantUserId",
                table: "CoverOffers",
                column: "ClaimantUserId");

            migrationBuilder.CreateIndex(
                name: "IX_CoverOffers_OwnerUserId",
                table: "CoverOffers",
                column: "OwnerUserId");

            migrationBuilder.CreateIndex(
                name: "IX_Availabilities_UserId",
                table: "Availabilities",
                column: "UserId");

            migrationBuilder.AddForeignKey(
                name: "FK_Availabilities_Users_UserId",
                table: "Availabilities",
                column: "UserId",
                principalTable: "Users",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_CoverOffers_Users_ClaimantUserId",
                table: "CoverOffers",
                column: "ClaimantUserId",
                principalTable: "Users",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_CoverOffers_Users_OwnerUserId",
                table: "CoverOffers",
                column: "OwnerUserId",
                principalTable: "Users",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_DayAudits_Users_UserId",
                table: "DayAudits",
                column: "UserId",
                principalTable: "Users",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);


            migrationBuilder.AddForeignKey(
                name: "FK_LeaveRequests_Users_DecidedByUserId",
                table: "LeaveRequests",
                column: "DecidedByUserId",
                principalTable: "Users",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);

            migrationBuilder.AddForeignKey(
                name: "FK_LeaveRequests_Users_UserId",
                table: "LeaveRequests",
                column: "UserId",
                principalTable: "Users",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_PlannedAssignments_Users_CreatedByUserId",
                table: "PlannedAssignments",
                column: "CreatedByUserId",
                principalTable: "Users",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);

            migrationBuilder.AddForeignKey(
                name: "FK_PlannedAssignments_Users_UserId",
                table: "PlannedAssignments",
                column: "UserId",
                principalTable: "Users",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Availabilities_Users_UserId",
                table: "Availabilities");

            migrationBuilder.DropForeignKey(
                name: "FK_CoverOffers_Users_ClaimantUserId",
                table: "CoverOffers");

            migrationBuilder.DropForeignKey(
                name: "FK_CoverOffers_Users_OwnerUserId",
                table: "CoverOffers");

            migrationBuilder.DropForeignKey(
                name: "FK_DayAudits_Users_UserId",
                table: "DayAudits");


            migrationBuilder.DropForeignKey(
                name: "FK_LeaveRequests_Users_DecidedByUserId",
                table: "LeaveRequests");

            migrationBuilder.DropForeignKey(
                name: "FK_LeaveRequests_Users_UserId",
                table: "LeaveRequests");

            migrationBuilder.DropForeignKey(
                name: "FK_PlannedAssignments_Users_CreatedByUserId",
                table: "PlannedAssignments");

            migrationBuilder.DropForeignKey(
                name: "FK_PlannedAssignments_Users_UserId",
                table: "PlannedAssignments");

            migrationBuilder.DropIndex(
                name: "IX_PlannedAssignments_CreatedByUserId",
                table: "PlannedAssignments");

            migrationBuilder.DropIndex(
                name: "IX_LeaveRequests_DecidedByUserId",
                table: "LeaveRequests");

            migrationBuilder.DropIndex(
                name: "IX_LeaveRequests_UserId",
                table: "LeaveRequests");


            migrationBuilder.DropIndex(
                name: "IX_CoverOffers_ClaimantUserId",
                table: "CoverOffers");

            migrationBuilder.DropIndex(
                name: "IX_CoverOffers_OwnerUserId",
                table: "CoverOffers");

            migrationBuilder.DropIndex(
                name: "IX_Availabilities_UserId",
                table: "Availabilities");


            migrationBuilder.AlterColumn<int>(
                name: "CreatedByUserId",
                table: "PlannedAssignments",
                type: "integer",
                nullable: false,
                defaultValue: 0,
                oldClrType: typeof(int),
                oldType: "integer",
                oldNullable: true);
        }
    }
}
