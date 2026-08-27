using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Shifter.Migrations.ShifterDb
{
    /// <inheritdoc />
    public partial class DayUserKey : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Days always had a real key to Users — the collection on the other
            // side was enough for EF to make one, and the review that said
            // otherwise was wrong about this one table. Adding a second
            // navigation without pointing it at that collection made EF build a
            // separate relationship on a shadow column, so every query against
            // a day started selecting a column that is always null and cascades
            // nothing.
            //
            // Written as SQL that checks first, because the column exists only
            // on databases that ran the previous migration before it was
            // corrected — production has it, a database created today does not,
            // and a plain DROP would abort on the second kind.
            migrationBuilder.Sql(
                "ALTER TABLE \"Days\" DROP CONSTRAINT IF EXISTS \"FK_Days_Users_UserId1\";");
            migrationBuilder.Sql("DROP INDEX IF EXISTS \"IX_Days_UserId1\";");
            migrationBuilder.Sql("ALTER TABLE \"Days\" DROP COLUMN IF EXISTS \"UserId1\";");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Nothing. Rolling back should not restore a column that was never
            // meant to exist and that nothing reads.
        }
    }
}
