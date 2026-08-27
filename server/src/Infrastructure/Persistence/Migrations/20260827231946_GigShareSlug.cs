using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Shifter.Migrations.ShifterDb
{
    /// <inheritdoc />
    public partial class GigShareSlug : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "ShareSlug",
                table: "GigListings",
                type: "text",
                nullable: false,
                defaultValue: "");

            // Every existing row would otherwise carry the same empty string,
            // and the unique index below would abort the whole migration on
            // the second listing — taking the deploy with it. The id is mixed
            // into the hash so no two rows can land on the same slug.
            migrationBuilder.Sql(
                "UPDATE \"GigListings\" SET \"ShareSlug\" = "
                + "substr(md5(random()::text || '-' || \"Id\"::text), 1, 12) "
                + "WHERE \"ShareSlug\" = '';");

            migrationBuilder.CreateIndex(
                name: "IX_GigListings_ShareSlug",
                table: "GigListings",
                column: "ShareSlug",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_GigListings_ShareSlug",
                table: "GigListings");

            migrationBuilder.DropColumn(
                name: "ShareSlug",
                table: "GigListings");
        }
    }
}
