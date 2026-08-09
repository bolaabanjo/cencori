#!/bin/sh
# Cencori Compute — agent runtime entrypoint (self-building).
#
# Env injected by the build pipeline (lib/compute/build.ts):
#   REPO_FULL_NAME  owner/repo
#   COMMIT_SHA      pinned commit to deploy
#   ROOT_DIR        agent dir within the repo ("" = repo root)
#   GITHUB_TOKEN    short-lived installation token (to clone a private repo)
#   CENCORI_API_KEY project-scoped key — the agent's gateway calls bind here
#   CENCORI_API_URL gateway base (e.g. https://cencori.com/api/v1)
#   PORT            port to serve the Runtime Contract on (default 8080)
set -eu

: "${REPO_FULL_NAME:?REPO_FULL_NAME required}"
: "${COMMIT_SHA:?COMMIT_SHA required}"
PORT="${PORT:-8080}"
ROOT_DIR="${ROOT_DIR:-}"
SRC=/app/src
URL="https://api.github.com/repos/${REPO_FULL_NAME}/tarball/${COMMIT_SHA}"

echo "[arcie-runtime] fetching ${REPO_FULL_NAME}@${COMMIT_SHA}"
mkdir -p "$SRC"
if [ -n "${GITHUB_TOKEN:-}" ]; then
  curl -fsSL -H "Authorization: token ${GITHUB_TOKEN}" "$URL" | tar -xz -C "$SRC" --strip-components=1
else
  curl -fsSL "$URL" | tar -xz -C "$SRC" --strip-components=1
fi

# Move into the agent dir (repo root if ROOT_DIR is empty).
cd "$SRC/${ROOT_DIR}" 2>/dev/null || cd "$SRC"
echo "[cencori-runtime] building in $(pwd)"

# Commands come from the detected build plan (lib/compute/adapters), injected by
# the pipeline. Defaults keep an Arcie agent working if they're unset.
INSTALL_COMMAND="${INSTALL_COMMAND:-npm ci}"
BUILD_COMMAND="${BUILD_COMMAND:-npx arcie build}"
START_COMMAND="${START_COMMAND:-node .arcie/server.mjs}"

echo "[cencori-runtime] install: ${INSTALL_COMMAND}"
sh -c "$INSTALL_COMMAND"

if [ -n "$BUILD_COMMAND" ]; then
  echo "[cencori-runtime] build: ${BUILD_COMMAND}"
  sh -c "$BUILD_COMMAND"
fi

echo "[cencori-runtime] serving Runtime Contract on :${PORT} — ${START_COMMAND}"
exec env PORT="$PORT" sh -c "$START_COMMAND"
