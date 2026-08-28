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

echo "── web"
cd web
npx tsc --noEmit
npm test --silent

echo "── mobile"
cd ../mobile
npx tsc --noEmit
npm test --silent

echo "── all clear"
