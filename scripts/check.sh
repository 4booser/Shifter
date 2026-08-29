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
npm test --silent

echo "── mobile"
cd ../mobile
npx tsc --noEmit
npm test --silent

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
