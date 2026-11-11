#!/usr/bin/env bash
# Releases an already-built commit to production from a laptop, for the day
# GitHub Actions is down and the Deploy workflow cannot run.
#
#   scripts/deploy-by-hand.sh <host> <user> <commit sha>
#
# It does what the Deploy job does, in the same order and with the same files:
# makes room (docker/make-room.sh), copies compose.prod.yaml and docker/ to
# /opt/shifter, logs in to ghcr.io, runs docker/release.sh with the sha, and
# logs out again. Then it asks the site from outside whether it is up and
# which commit is answering.
#
# The files come out of the commit being released, not out of this checkout:
# git show and git archive read them from the sha, so a dirty working tree or
# another branch checked out here cannot change what lands on the server. The
# commit has to be in this clone — git fetch origin first.
#
# What it cannot do is build, or run the checks. The sha must be one whose
# images are already in the registry and marked as having passed: "Build and
# push" pushes <sha> for every commit on main, including one whose checks then
# fail, so the tag alone says only that it was built. The Deploy workflow adds
# checked-<sha> once the checks pass, and this refuses a commit without it
# before anything is touched. UNCHECKED=1 releases one anyway, for an
# emergency somebody has looked at; it says so loudly.
#
# The token is a personal access token with read:packages. Asked for at the
# terminal without echo when GHCR_TOKEN is not set; never an argument, because
# arguments end up in shell history and in ps, and better not typed into an
# export either, which lands in the history file just the same. It is never
# printed, it is taken out of this script's environment before anything else
# starts, and it travels only on stdin: into curl's config for the registry
# check, and over ssh into a single docker login on the server that a trap
# undoes on any exit — the same trap the Deploy job sets.
#
# Environment:
#   GHCR_TOKEN  read:packages; asked for at the terminal when unset
#   GHCR_USER   the GitHub login the token belongs to (default 4booser)
#   SSH_KEY     identity file (default ~/.ssh/shifter_deploy, when it exists)
#   IMAGES      where the images live (default ghcr.io/4booser)
#   SITE        asked at the end (default https://www.shifter.ink)
#   DRY_RUN=1   check the arguments and the commit, print what would happen,
#               and contact nothing; needs no token
#   UNCHECKED=1 release a commit that was built but never marked checked
set -euo pipefail

usage() {
  echo "usage: $0 <host> <user> <commit sha>" >&2
  echo "       the token is asked for at the terminal, or read from GHCR_TOKEN" >&2
  echo "       DRY_RUN=1 checks the arguments and prints the plan, contacting nothing" >&2
  exit 64
}

[ "$#" -eq 3 ] || usage

host=$1
user=$2
wanted=$3

GHCR_USER=${GHCR_USER:-4booser}
IMAGES=${IMAGES:-ghcr.io/4booser}
SITE=${SITE:-https://www.shifter.ink}
SITE=${SITE%/}

# Taken into a plain variable and out of the environment, so neither ssh nor
# git nor curl inherits it.
token=${GHCR_TOKEN:-}
unset GHCR_TOKEN

# Anything ssh would read as an option is not a host.
case "$host" in
  '' | -* | *[[:space:]]*)
    echo "not a host: '$host'" >&2
    exit 64
    ;;
esac

if ! [[ "$user" =~ ^[a-z_][a-z0-9_-]*$ ]]; then
  echo "not a user name: '$user'" >&2
  exit 64
fi

# Hex only, so a branch or a tag cannot stand in for a commit: what goes out
# is a sha somebody looked up, not wherever a name happens to point today.
if ! [[ "$wanted" =~ ^[0-9a-f]{7,40}$ ]]; then
  echo "not a commit sha: '$wanted'" >&2
  exit 64
fi

# Both end up on the server's command line, so they are held to what a
# GitHub login and a GHCR owner can be.
if ! [[ "$GHCR_USER" =~ ^[A-Za-z0-9][A-Za-z0-9-]*$ ]]; then
  echo "not a GitHub login: '$GHCR_USER'" >&2
  exit 64
fi

if ! [[ "$IMAGES" =~ ^ghcr\.io/[a-z0-9][a-z0-9._-]*$ ]]; then
  echo "IMAGES must look like ghcr.io/<owner>, not '$IMAGES'" >&2
  exit 64
fi

root=$(cd "$(dirname "$0")/.." && pwd)

if ! sha=$(git -C "$root" rev-parse --verify --quiet "${wanted}^{commit}"); then
  echo "$wanted is not a commit in this clone, or is ambiguous; git fetch origin and try again" >&2
  exit 1
fi

# A commit from before releasing moved into these files cannot be released by
# them. Going back that far is the manual rollback in the README.
for file in compose.prod.yaml docker/make-room.sh docker/release.sh; do
  if ! git -C "$root" cat-file -e "$sha:$file" 2>/dev/null; then
    echo "$sha has no $file; roll back to it by hand (README, «Откатиться на предыдущую версию»)" >&2
    exit 1
  fi
done

ssh_opts=(-o ConnectTimeout=15)

if [ -n "${SSH_KEY:-}" ]; then
  if [ ! -f "$SSH_KEY" ]; then
    echo "no such key: $SSH_KEY" >&2
    exit 64
  fi
  ssh_opts+=(-i "$SSH_KEY")
elif [ -f "$HOME/.ssh/shifter_deploy" ]; then
  ssh_opts+=(-i "$HOME/.ssh/shifter_deploy")
fi

target="$user@$host"

echo "releasing $sha"
echo "  to         $target:/opt/shifter"
echo "  images     $IMAGES/shifter and $IMAGES/shifter-migrate, tag $sha"
if [ "${UNCHECKED:-}" = 1 ]; then
  echo "  1. check   both images are in the registry (UNCHECKED=1: passed checks not required)"
else
  echo "  1. check   both images are in the registry and marked checked-$sha"
fi
echo "  2. room    docker/make-room.sh from the commit, over ssh"
echo "  3. ship    compose.prod.yaml and docker/ from the commit"
echo "  4. release log in as $GHCR_USER, docker/release.sh, log out"
echo "  5. ask     $SITE/health and the build $SITE/shifter/v1/status reports"

if [ "${DRY_RUN:-}" = 1 ]; then
  echo "dry run: nothing contacted, nothing changed"
  exit 0
fi

# Typed here, unechoed, rather than into an `export GHCR_TOKEN=...`, which the
# shell would write to its history file in clear.
if [ -z "$token" ] && [ -t 0 ]; then
  IFS= read -rs -p "token for $GHCR_USER with read:packages: " token || token=
  echo >&2
fi

if [ -z "$token" ]; then
  echo "no registry token: type it when asked, or set GHCR_TOKEN (read:packages)" >&2
  exit 64
fi

on() {
  # Expanded here on purpose: every command passed in is built on this side
  # from values checked above.
  # shellcheck disable=SC2029
  ssh "${ssh_opts[@]}" "$target" "$@"
}

# 1. Both images, before the server is touched at all. Without them the pull
# in release.sh fails after the files are already shipped, and the box would
# be left holding a stack definition for a release it cannot run. And both
# marked checked: an image that exists is only an image that was built.
manifest_types='application/vnd.oci.image.index.v1+json, application/vnd.docker.distribution.manifest.list.v2+json, application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.v2+json'

# HTTP status of one tag, asked with the pull token for the repository in
# hand; 000 when the registry could not be reached at all.
manifest() {
  printf 'header = "Authorization: Bearer %s"\n' "$bearer" \
    | curl -sS -K - -o /dev/null -w '%{http_code}' -I \
        -H "Accept: $manifest_types" \
        "https://ghcr.io/v2/$repo/manifests/$1" || true
}

for image in shifter shifter-migrate; do
  repo="${IMAGES#ghcr.io/}/$image"

  # The token goes to curl as config on stdin, never on its command line.
  bearer=$(printf 'user = "%s:%s"\n' "$GHCR_USER" "$token" \
    | curl -fsS -K - "https://ghcr.io/token?scope=repository:$repo:pull&service=ghcr.io" \
    | sed -n 's/.*"token":"\([^"]*\)".*/\1/p') || bearer=

  if [ -z "$bearer" ]; then
    echo "the registry gave no pull token for $repo; is the token valid for $GHCR_USER?" >&2
    exit 1
  fi

  code=$(manifest "$sha")
  if [ "$code" != 200 ]; then
    echo "$IMAGES/$image:$sha is not in the registry (HTTP $code); only built commits can be released by hand" >&2
    exit 1
  fi

  code=$(manifest "checked-$sha")
  if [ "$code" != 200 ]; then
    if [ "${UNCHECKED:-}" != 1 ]; then
      echo "$IMAGES/$image:$sha was built but is not marked checked-$sha (HTTP $code):" >&2
      echo "its checks failed, or never finished. Release a commit that passed them;" >&2
      echo "UNCHECKED=1 releases this one anyway, for an emergency you have looked at." >&2
      exit 1
    fi
    echo "WARNING: $IMAGES/$image:$sha is not marked as having passed its checks; releasing it because UNCHECKED=1" >&2
  fi

  echo "found $IMAGES/$image:$sha"
done

# 2. Room first, for the reason make-room.sh gives: a box without it fails
# halfway through everything after this.
git -C "$root" show "$sha:docker/make-room.sh" | on "IMAGES=$IMAGES bash -s"

# 3. Shipped as a tar into a waiting room on the box, not into the stack
# itself. They are unpacked in step 4, under the release lock, by the same
# session that releases them: taking the lock once to unpack and again to
# release left a gap in which a Deploy job's release could run on these files
# with its own images. The Deploy job ships into a waiting room of its own
# and unpacks under the lock the same way.
#
# A tar because tar replaces each file rather than writing through it, which
# is what release.sh's Caddy check expects. scp over SFTP writes in place, the
# running proxy would see the new Caddyfile without having loaded it, and the
# check would find nothing to recreate.
git -C "$root" archive --format=tar "$sha" compose.prod.yaml docker \
  | on "mkdir -p /opt/shifter/.incoming && cat > /opt/shifter/.incoming/by-hand-$sha.tar"

# 4. The token is the first line on the session's stdin and the script is the
# rest of it. read takes exactly that line and bash -s the remainder, so the
# token is on no command line on either machine. release.sh gets /dev/null
# for stdin, or a docker command inside it could swallow the rest of the
# script.
{
  printf '%s\n' "$token"
  cat <<'REMOTE'
set -euo pipefail
cd /opt/shifter
# One release at a time on this box: the Deploy job takes the same lock, held
# from before the login until after the logout, so neither logs the other out
# mid-pull or brings up the other's .env.release.
exec 9>>.release.lock
flock -w 300 9 || { echo "another release is still running on this box after five minutes" >&2; exit 1; }
# The files from step 3, unpacked only now that nothing else can release.
tar -xf ".incoming/by-hand-$2.tar" -C /opt/shifter
rm -f ".incoming/by-hand-$2.tar"
# Logged out on any exit, the way the Deploy job does it: a failed pull or an
# aborted migration must not leave the token in ~/.docker/config.json.
trap 'docker logout ghcr.io >/dev/null 2>&1 || true' EXIT
printf '%s\n' "$REGISTRY_TOKEN" | docker login ghcr.io -u "$1" --password-stdin
unset REGISTRY_TOKEN
IMAGES=$3 bash docker/release.sh "$2" </dev/null
REMOTE
} | on "IFS= read -r REGISTRY_TOKEN && export REGISTRY_TOKEN && exec bash -s -- $GHCR_USER $sha $IMAGES"

token=

# 5. From outside, through the proxy, as a visitor would ask. release.sh has
# already waited for the container to call itself healthy; this is the other
# half — that the site answers, and that it is this commit answering.
for _ in $(seq 1 12); do
  if curl -fsS --max-time 10 -o /dev/null "$SITE/health"; then
    build=$(curl -fsS --max-time 10 "$SITE/shifter/v1/status" \
      | sed -n 's/.*"build":"\([^"]*\)".*/\1/p') || build=

    if [ "$build" = "$sha" ]; then
      echo "$SITE is healthy and running $sha"
      exit 0
    fi

    echo "$SITE is healthy but reports build '$build', not $sha" >&2
    exit 1
  fi
  sleep 5
done

echo "$SITE/health did not answer 200 within a minute" >&2
exit 1
