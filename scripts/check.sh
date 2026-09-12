#!/bin/sh
# Everything that has to be true before a commit goes anywhere.
#
# This exists because `dotnet test | grep …` succeeds whenever grep finds the
# word it was looking for — including the word "failed" — so chaining a commit
# onto it pushes broken code twice in one evening, which is exactly what
# happened. A script that exits non-zero cannot be talked round.
set -e

cd "$(dirname "$0")/.."

echo "── server"
dotnet test tests/Shifter.Tests/Shifter.Tests.csproj --nologo --verbosity quiet

# The same application over real HTTP against a real Postgres. Skipped rather
# than failed where there is no database to talk to: a laptop on a train should
# still be able to run everything else, and CI has one either way.
if pg_isready -h localhost -q 2> /dev/null; then
  echo "── api"
  dotnet test tests/Shifter.Api.Tests/Shifter.Api.Tests.csproj --nologo --verbosity quiet
else
  echo "── api (skipped: no postgres on localhost)"
fi

echo "── web"
cd web
npx tsc --noEmit
# The weight budget lived only in the deploy pipeline, so a green gate said
# nothing about whether the deploy would go out: two pushes reached main on a
# red budget before anybody noticed production had not moved in a day.
#
# It needs the export to measure, and reading a stale `out/` is worse than not
# checking — the first attempt died on a chunk name from the previous build.
# So the gate builds. That is the minute this check costs, and it buys back a
# day of a deploy that silently did not happen.
npm run build >/dev/null
npm run budget
# TZ=UTC, deliberately: CI runs in UTC and three deploys died on a date test
# that was green in Europe/Kyiv. The gate must fail where CI will fail.
TZ=UTC npm test --silent

# The screens, looked at. The only check in here that can see a layout: the
# unit tests know every number on the statistics page and nothing knows that
# the axis printed two dates in one place, or that a panel lost its bottom.
#
# Forty-seven seconds for twenty-two shots, which is nothing against the
# fifteen minutes around it. Only where the baselines belong: they are
# darwin-rendered, and Linux would fail every one of them on font hinting.
if [ "$(uname)" = "Darwin" ] && pg_isready -h localhost -q 2> /dev/null; then
  echo "── screens"

  # Its own server, unless one is already answering: a dev API left running
  # is the usual state of this machine and starting a second on the same
  # port fails outright.
  mine=""
  if ! curl -sf http://localhost:5208/login > /dev/null 2>&1; then
    (cd .. && ASPNETCORE_ENVIRONMENT=Development ASPNETCORE_URLS=http://localhost:5208 \
      dotnet run --project server --no-launch-profile > /dev/null 2>&1 &)
    mine="yes"
    for _ in $(seq 1 60); do
      curl -sf http://localhost:5208/login > /dev/null 2>&1 && break
      sleep 2
    done
  fi

  shots=0
  npx playwright test e2e/screens.spec.ts || shots=$?

  # Killed before the exit, or a failed run leaves a server holding 5208.
  [ -n "$mine" ] && pkill -f "dotnet run --project server --no-launch-profile"

  if [ "$shots" -ne 0 ]; then
    echo "screens: смотреть на дифф в web/test-results, потом --update-snapshots"
    exit "$shots"
  fi
else
  echo "── screens (skipped: baselines are darwin and need postgres)"
fi

echo "── mobile"
cd ../mobile
npx tsc --noEmit
TZ=UTC npm test --silent

# The front end being built on Vite. --quiet on the linter reports errors
# only; the fast-refresh warnings shadcn's own files raise are not worth
# failing a push over. In a subshell: the widget step below reads paths
# relative to mobile/, and a `cd` that leaks out of here would send it looking
# for Swift files in the wrong tree.

# The mock. It ships nothing and has no tests to run — but it is a whole site
# now, and a caption that does not compile is still a caption nobody sees.
# Same subshell rule as above.
echo "── design/ui"
(cd ../design/ui && npx tsc -b && npx oxlint --quiet)

# The widget's own arithmetic, where a Swift compiler exists. It is skipped
# rather than failed elsewhere: the widget only ships from a Mac, and a Linux
# runner that could not check it must not stop everything else.
if command -v swiftc > /dev/null 2>&1; then
  echo "── widget"
  swiftc -O -o "${TMPDIR:-/tmp}/shifter-widget-check" \
    targets/widget/Snapshot.swift tools/widget-check/main.swift
  "${TMPDIR:-/tmp}/shifter-widget-check"
fi

echo "── all clear"
