#!/usr/bin/env bash
# Chromium for Playwright, with the system packages it needs, in up to three
# attempts.
#
# --with-deps goes through apt, and apt through Ubuntu's mirrors, which a
# runner sometimes cannot reach for minutes at a time: on 11 November both
# browser jobs of a pull request failed because azure.archive.ubuntu.com did
# not resolve, and a red check that had nothing to do with the code would
# have held back a deploy. A pause and a second attempt get past most of
# those; three failures mean GitHub's network is down.
set -euo pipefail

cd "$(dirname "$0")/../web"

for attempt in 1 2 3; do
  if npx playwright install --with-deps chromium; then
    exit 0
  fi

  if [ "$attempt" -lt 3 ]; then
    echo "installing the browser failed (attempt $attempt of 3); trying again in 30 seconds" >&2
    sleep 30
  fi
done

echo "the browser would not install in three attempts: the runner could not reach the Ubuntu mirrors or Playwright's downloads" >&2
exit 1
