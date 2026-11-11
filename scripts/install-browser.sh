#!/usr/bin/env bash
# Chromium for Playwright. With --fonts, also the fonts the screen baselines
# were shot with.
#
# The runner image already carries every library Chromium needs: on a clean
# ubuntu-24.04 runner, --with-deps added nine font packages and nothing else.
# Fonts change how a page is drawn, not whether it works, so the walk-through
# that stands between a commit and production takes the browser alone and
# never touches apt. Only the screens, compared pixel by pixel against
# baselines shot with those fonts, ask for them.
#
# apt goes to Ubuntu's mirrors, and on 11 November runners could not resolve
# them for over half an hour: every browser job sat through seven minutes of
# DNS timeouts and failed, and the deploy's own check would have held back a
# release over fonts it does not use. Hence the quick look before apt, and
# the attempts with a pause between them.
set -euo pipefail

cd "$(dirname "$0")/../web"

for attempt in 1 2 3; do
  if npx playwright install chromium; then
    break
  fi

  if [ "$attempt" -eq 3 ]; then
    echo "Chromium would not download from Playwright in three attempts" >&2
    exit 1
  fi

  echo "downloading Chromium failed (attempt $attempt of 3); trying again in 30 seconds" >&2
  sleep 30
done

[ "${1:-}" = --fonts ] || exit 0

for attempt in 1 2 3; do
  if ! timeout 15 getent hosts archive.ubuntu.com >/dev/null; then
    echo "archive.ubuntu.com does not resolve from this runner (attempt $attempt of 3)" >&2
  elif npx playwright install-deps chromium; then
    exit 0
  fi

  if [ "$attempt" -lt 3 ]; then
    sleep 30
  fi
done

echo "the fonts would not install in three attempts: the runner cannot reach Ubuntu's mirrors" >&2
exit 1
