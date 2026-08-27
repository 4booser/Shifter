#!/bin/sh
# Restores the latest dump into a scratch database and checks it is a database.
#
# A backup that has never been restored is not a backup, it is a hope. The
# nightly script already proves the file is well-formed gzip containing at
# least five CREATE TABLE lines — which proves the file is a file. It does not
# prove that pg_restore produces something with anybody's shifts in it, and
# nothing anywhere did until this.
#
# Run weekly from the deploy user's crontab, same as the dump itself.
set -eu

STACK=${STACK:-/opt/shifter}
SCRATCH=${SCRATCH:-restore_drill}
LOG="$STACK/backups/restore-drill.log"

compose() {
  docker compose -f "$STACK/compose.prod.yaml" --env-file "$STACK/.env" "$@"
}

say() {
  echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) $*" | tee -a "$LOG"
}

LATEST=$(find "$STACK/backups" -mindepth 1 -maxdepth 1 -type d | sort | tail -n 1)

if [ -z "$LATEST" ] || [ ! -f "$LATEST/shifter.sql.gz" ]; then
  say "FAIL no dump to restore"
  exit 1
fi

say "restoring $LATEST"

# A dump from a machine that is on fire is worth nothing, so the drill also
# reports how old the newest one is. Anything past two days means the nightly
# job has been failing quietly.
AGE_DAYS=$(( ( $(date +%s) - $(date -r "$LATEST/shifter.sql.gz" +%s) ) / 86400 ))

if [ "$AGE_DAYS" -gt 2 ]; then
  say "FAIL newest dump is $AGE_DAYS days old"
  exit 1
fi

compose exec -T db psql -U shifter_user -d postgres -c "DROP DATABASE IF EXISTS $SCRATCH;" >/dev/null
compose exec -T db psql -U shifter_user -d postgres -c "CREATE DATABASE $SCRATCH;" >/dev/null

if ! zcat "$LATEST/shifter.sql.gz" | compose exec -T db psql -U shifter_user -d "$SCRATCH" -q >/dev/null 2>&1; then
  say "FAIL the dump would not load"
  compose exec -T db psql -U shifter_user -d postgres -c "DROP DATABASE IF EXISTS $SCRATCH;" >/dev/null
  exit 1
fi

# Counts, not existence. A restore that produces empty tables loads perfectly
# and is worth nothing, which is the failure this drill exists to catch.
for table in Users Days DayShifts Locations Shifts; do
  live=$(compose exec -T db psql -U shifter_user -d shifter -tAc "SELECT count(*) FROM \"$table\";")
  copy=$(compose exec -T db psql -U shifter_user -d "$SCRATCH" -tAc "SELECT count(*) FROM \"$table\";")

  # The dump is from last night, so the copy may be a little behind — never
  # ahead, and never empty when the live table is not.
  if [ "$copy" -gt "$live" ] || { [ "$live" -gt 0 ] && [ "$copy" -eq 0 ]; }; then
    say "FAIL $table: live $live, restored $copy"
    compose exec -T db psql -U shifter_user -d postgres -c "DROP DATABASE IF EXISTS $SCRATCH;" >/dev/null
    exit 1
  fi

  say "ok $table: live $live, restored $copy"
done

compose exec -T db psql -U shifter_user -d postgres -c "DROP DATABASE IF EXISTS $SCRATCH;" >/dev/null

say "PASS restore drill"
