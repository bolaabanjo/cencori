#!/bin/sh
# Cencori Compute — Python agent runtime entrypoint (self-building).
#
# Same env contract as the Node base, plus AGENT_ENTRYPOINT (module:attr) which
# the generic shim reads. Commands come from the detected build plan.
set -eu

: "${REPO_FULL_NAME:?REPO_FULL_NAME required}"
: "${COMMIT_SHA:?COMMIT_SHA required}"
PORT="${PORT:-8080}"
ROOT_DIR="${ROOT_DIR:-}"
SRC=/app/src
URL="https://api.github.com/repos/${REPO_FULL_NAME}/tarball/${COMMIT_SHA}"

echo "[cencori-python] fetching ${REPO_FULL_NAME}@${COMMIT_SHA}"
mkdir -p "$SRC"
if [ -n "${GITHUB_TOKEN:-}" ]; then
  curl -fsSL -H "Authorization: token ${GITHUB_TOKEN}" "$URL" | tar -xz -C "$SRC" --strip-components=1
else
  curl -fsSL "$URL" | tar -xz -C "$SRC" --strip-components=1
fi

cd "$SRC/${ROOT_DIR}" 2>/dev/null || cd "$SRC"
echo "[cencori-python] building in $(pwd)"

INSTALL_COMMAND="${INSTALL_COMMAND:-pip install -r requirements.txt}"
START_COMMAND="${START_COMMAND:-python /opt/cencori/cencori_shim.py}"

echo "[cencori-python] install: ${INSTALL_COMMAND}"
sh -c "$INSTALL_COMMAND"

if [ -n "${BUILD_COMMAND:-}" ]; then
  echo "[cencori-python] build: ${BUILD_COMMAND}"
  sh -c "$BUILD_COMMAND"
fi

echo "[cencori-python] serving Runtime Contract on :${PORT} — ${START_COMMAND}"
exec env PORT="$PORT" sh -c "$START_COMMAND"
