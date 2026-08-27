using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Shifter.Migrations.ShifterDb
{
    /// <inheritdoc />
    public partial class DocumentReminders : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateOnly>(
                name: "DocumentsSentOn",
                table: "PushSubscriptions",
                type: "date",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "NotifyDocuments",
                table: "PushSubscriptions",
                type: "boolean",
                nullable: false,
                defaultValue: false);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "DocumentsSentOn",
                table: "PushSubscriptions");

            migrationBuilder.DropColumn(
                name: "NotifyDocuments",
                table: "PushSubscriptions");
        }
    }
}
