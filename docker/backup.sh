#!/bin/bash
# Nightly dumps of both databases, run by /etc/cron.d/shifter-backup.
# Each night gets its own gzipped pair; anything older than 14 days goes.
# The dumps are verified by gzip integrity and by a non-empty table count —
# a backup that was never checked is a hope, not a backup.
set -euo pipefail

STACK=/opt/shifter
KEEP_DAYS=14
STAMP=$(date +%F)
DIR="$STACK/backups/$STAMP"

mkdir -p "$DIR"

compose() {
  docker compose -f "$STACK/compose.prod.yaml" \
    --env-file "$STACK/.env" --env-file "$STACK/.env.release" "$@"
}

for db in shifter tokens; do
  compose exec -T db pg_dump -U shifter_user --no-owner "$db" | gzip > "$DIR/$db.sql.gz"
  gzip -t "$DIR/$db.sql.gz"
done

# The dump must actually contain the schema it claims to.
tables=$(zcat "$DIR/shifter.sql.gz" | grep -c '^CREATE TABLE' || true)

if [ "$tables" -lt 5 ]; then
  echo "backup sanity failed: only $tables tables in shifter dump" >&2
  exit 1
fi

find "$STACK/backups" -mindepth 1 -maxdepth 1 -type d -mtime +"$KEEP_DAYS" -exec rm -rf {} +

# Hook for an offsite copy: set OFFSITE_CMD in /opt/shifter/.env to something
# like `rclone copy` and the nightly run carries the dumps off the box.
if [ -n "${OFFSITE_CMD:-}" ]; then
  $OFFSITE_CMD "$DIR"
fi

echo "backup ok: $DIR ($tables tables)"
