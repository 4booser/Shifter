#!/usr/bin/env bash
# Puts one commit's images live on this box and waits for them to be healthy.
#
#   bash docker/release.sh <commit sha>          # from /opt/shifter
#
# Both ways a release arrives run this file: the Deploy workflow's last step
# and scripts/deploy-by-hand.sh. It used to be eighty lines of YAML that only
# Actions could run, so the day Actions was down there was no way to ship at
# all, and a by-hand copy of those lines would have drifted from them within a
# month.
#
# What both callers have done before this runs: made room
# (docker/make-room.sh), copied compose.prod.yaml and docker/ here, taken the
# release lock (below), and logged in to ghcr.io. The login and the logout are the caller's, because the caller
# holds the token and owns the trap that takes it away again; nothing in here
# ever sees it.
set -euo pipefail

STACK=${STACK:-/opt/shifter}

# Where the images live: the registry and the owner, written below as the
# REGISTRY compose.prod.yaml reads.
IMAGES=${IMAGES:-ghcr.io/4booser}

# The full sha, because that is the tag the images carry: a short one would
# pull nothing and say so only after the stack was already being touched.
if [ "$#" -ne 1 ] || ! [[ "$1" =~ ^[0-9a-f]{40}$ ]]; then
  echo "usage: $0 <full 40-character commit sha>" >&2
  exit 64
fi

TAG=$1

cd "$STACK"

# One release at a time on this box, whichever way it arrives. The Deploy
# job's production group knows nothing of a release started from a laptop,
# and two at once log each other out of the registry mid-pull and bring up
# each other's .env.release. Both callers take this lock on fd 9 before their
# docker login and hold it until after their logout, so here it is already
# held and flock returns at once; run on its own, this takes it itself.
if ! { true >&9; } 2>/dev/null; then
  exec 9>>.release.lock
fi
if ! flock -w 300 9; then
  echo "another release is still running on this box after five minutes" >&2
  exit 75
fi

# Nightly database dumps: the script ships with every release and the crontab
# line is rewritten idempotently, so changing the schedule or the script is
# just another deploy. The deploy user's own crontab, because /etc/cron.d is
# root's and this user is not.
chmod +x docker/backup.sh docker/restore-drill.sh
mkdir -p backups "$HOME/.cache"
# And a weekly restore drill, because a dump nobody has ever restored is a
# hope rather than a backup. It loads the newest one into a scratch database
# and compares row counts against the live one — an empty restore loads
# perfectly and is worth nothing.
( crontab -l 2>/dev/null | grep -v -e shifter-backup -e shifter-restore-drill || true ; \
  echo '17 3 * * * /opt/shifter/docker/backup.sh >> /opt/shifter/backups/backup.log 2>&1 # shifter-backup' ; \
  echo '41 5 * * 1 /opt/shifter/docker/restore-drill.sh >> /opt/shifter/backups/restore-drill.log 2>&1 # shifter-restore-drill' \
) | crontab -

# Written aside and moved into place only once its images are on the box. A
# pull that fails — a mistyped sha by hand, a registry having a bad minute —
# used to leave .env.release naming a release that never started, for the
# nightly backup and the next manual `up` to read.
printf 'REGISTRY=%s\nTAG=%s\n' "$IMAGES" "$TAG" > .env.release.next
docker compose -f compose.prod.yaml --env-file .env --env-file .env.release.next pull
mv .env.release.next .env.release

docker compose -f compose.prod.yaml --env-file .env --env-file .env.release up -d

# A single file bind-mounted into a container is bound by inode, and scp
# replaces the file rather than writing through it — so the host gets the new
# config and the container goes on seeing the old one. Reloading in place is
# therefore useless: Caddy re-reads the same stale bytes and reports the
# config unchanged, which is how this went unnoticed. Comparing what the
# container actually sees against what was just shipped is the only honest
# check, and recreating is what re-resolves the mount.
if ! docker compose -f compose.prod.yaml exec -T proxy \
     cat /etc/caddy/Caddyfile | cmp -s - docker/Caddyfile; then
  echo "proxy config changed; recreating"
  docker compose -f compose.prod.yaml --env-file .env --env-file .env.release \
    up -d --force-recreate proxy
fi

# Wait for the app to report healthy before calling this a success, so a
# broken release fails the run instead of sitting there.
for _ in $(seq 1 30); do
  # The word to match is "(healthy)" with its bracket. Matching
  # 'shifter.*healthy' also matched "(unhealthy)" — the .* spans the "un" — so
  # a release that started but could not reach the database was called green
  # on the very first pass, and the only alarm left was the ten-minute
  # external probe.
  if docker compose -f compose.prod.yaml ps --format '{{.Service}} {{.Status}}' \
     | grep -E '^shifter .*\(healthy\)' >/dev/null; then
    echo "healthy: $TAG"
    # Only what belongs to nothing. Trimming by count happens in
    # make-room.sh, before anything is shipped, where it can refuse to
    # deploy; here the release has just succeeded and taking an image away
    # would only be taking a rollback away.
    docker image prune -f >/dev/null 2>&1 || true
    echo "disk: $(df --output=pcent / | tail -1 | tr -dc '0-9')%"
    exit 0
  fi
  sleep 5
done

echo "did not become healthy in time"
docker compose -f compose.prod.yaml ps
docker compose -f compose.prod.yaml logs --tail 60 shifter
exit 1
