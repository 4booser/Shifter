#!/usr/bin/env bash
# Frees disk on the production box before a release is copied to it, and
# refuses the release when it cannot.
#
#   IMAGES=ghcr.io/4booser bash -s < docker/make-room.sh      # over ssh
#
# It runs before anything is shipped, so it is never run from the box's own
# copy of docker/: the Deploy job hands this file to ssh-action as its
# script_path, read on the runner and executed on the server, and
# scripts/deploy-by-hand.sh pipes it over ssh the same way. One file, so the
# two ways of releasing cannot make room differently.
#
# Before anything is copied anywhere. The old cleanup ran on the success path
# of the release script — after the pull, after the health loop — which made
# freeing disk space conditional on having enough disk space to get there.
# Once the box filled, every deploy failed at the very first step, the cleanup
# was never reached, and it stayed full: 182 images, 52 GB, and a database
# that aborted mid-checkpoint with the site behind it. Making room is a
# precondition for a deploy, not a reward.
set -euo pipefail

# Where the images live: the registry and the owner, the same value
# compose.prod.yaml takes as REGISTRY.
IMAGES=${IMAGES:-ghcr.io/4booser}

used() { df --output=pcent / | tail -1 | tr -dc '0-9'; }

echo "disk before: $(used)%"

# By count, not by age. An age window answers "how old is too old", which is
# not the question — the question is "can I still go back", and the answer
# has to be yes on a quiet Tuesday and after six deploys in an afternoon
# alike. 48h gave neither: a busy day left nine images and a fortnight of
# silence left none to roll back to.
#
# Newest first by the timestamp, deduplicated — one image usually carries
# both its commit tag and :latest, and counting it twice would keep half as
# many releases as it says.
keep_last() {
  repo="$1"
  keep="$2"

  # A space rather than a tab: the timestamp itself contains spaces, so the
  # id is simply the last field, and nothing here depends on how docker
  # handles an escape in a format string.
  docker image ls "$repo" --format '{{.CreatedAt}} {{.ID}}' \
    | sort -r \
    | awk '{ print $NF }' \
    | awk '!seen[$0]++' \
    | awk -v keep="$keep" 'NR > keep' \
    | while read -r id; do
        # Never the running one: it is referenced, so this fails and the
        # image stays. Losing it would be losing the site.
        docker image rm "$id" >/dev/null 2>&1 || true
      done
}

keep_last "$IMAGES/shifter" 4
keep_last "$IMAGES/shifter-migrate" 4

# Dangling layers belong to nothing and are always safe.
docker image prune -f >/dev/null 2>&1 || true

# Still tight: keep the running release and one to go back to.
if [ "$(used)" -ge 80 ]; then
  echo "still $(used)% — keeping fewer"
  keep_last "$IMAGES/shifter" 2
  keep_last "$IMAGES/shifter-migrate" 2
  docker builder prune -af >/dev/null 2>&1 || true
fi

echo "disk after: $(used)%"

# Refusing here is the point. A deploy that starts without room does not fail
# cleanly — it half-copies files, aborts a pull, and takes the database down
# with it.
if [ "$(used)" -ge 90 ]; then
  echo "less than 10% free after pruning; refusing to deploy"
  df -h /
  du -xh --max-depth=2 / 2>/dev/null | sort -rh | head -10
  exit 1
fi
