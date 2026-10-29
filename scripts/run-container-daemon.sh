#!/usr/bin/env bash
# In-container runner for pi-host's daemon (container twin of
# scripts/run-host-daemon.sh).
#
# Secrets arrive as FILES from a read-only bind mount of the host tmpfs:
#   /run/secrets/matrix_token   (bot access token, 0600 on the host)
#   /run/secrets/ollama_key     (ollama cloud key, 0600 on the host)
# They are read into the environment and unset on exit. Values are never echoed,
# never logged, never an argv element and never a compose `environment:` value —
# `docker inspect` shows env, so env-with-values is the leak pattern this
# deliberately avoids.
#
# Room and allow-list come from MATRIX_ROOM / MATRIX_ALLOWED_USERS (compose
# environment, non-secret) or from $1 / $2 for a one-off `docker run`.
set -euo pipefail

SECRETS_DIR="${SECRETS_DIR:-/run/secrets}"
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
# Guard against being run from a stray copy (e.g. a probe copy under
# workspace/tmp/): a wrong APP_DIR would silently point PI_HOST_DB at a
# different ledger file, and two ledgers is the one thing that must not happen.
if [ ! -f "$APP_DIR/package.json" ]; then
	echo "FAIL: $APP_DIR is not the pi-host repo root (no package.json) — run scripts/run-container-daemon.sh from inside the mounted tree" >&2
	exit 1
fi
cd "$APP_DIR"

for secret in matrix_token ollama_key; do
	if [ ! -s "$SECRETS_DIR/$secret" ]; then
		echo "FAIL: $SECRETS_DIR/$secret missing or empty — bind-mount the host tmpfs read-only there (/dev/shm/pi-host:/run/secrets:ro) and keep it 0600" >&2
		exit 1
	fi
done

ROOM="${1:-${MATRIX_ROOM:-}}"
USERS="${2:-${MATRIX_ALLOWED_USERS:-}}"
if [ -z "$ROOM" ]; then
	echo "FAIL: no room — set MATRIX_ROOM or pass the room id as \$1" >&2
	exit 1
fi
if [ -z "$USERS" ]; then
	echo "FAIL: no allowed steerers — set MATRIX_ALLOWED_USERS or pass them as \$2 (an unset list makes the daemon deaf by design)" >&2
	exit 1
fi

# Inside home_server_home_server-network the homeserver is reachable by its alias,
# so no Cloudflare hop is involved (the host runner needs the public origin
# because the host itself cannot resolve `conduit`).
export MATRIX_HOMESERVER="${MATRIX_HOMESERVER:-http://conduit:6167}"
# Kept from the host runner: cloudflare edges answer on v4 first, and node's
# resolver would otherwise try AAAA first and sit through a connect timeout.
export NODE_OPTIONS="${NODE_OPTIONS:---dns-result-order=ipv4first}"
export MATRIX_ROOM="$ROOM"
export MATRIX_ALLOWED_USERS="$USERS"
export OLLAMA_MODEL="${OLLAMA_MODEL:-deepseek-v4.1-flash}"
export OLLAMA_BASE_URL="${OLLAMA_BASE_URL:-https://ollama.com/v1}"
export OLLAMA_EMBED_BASE_URL="${OLLAMA_EMBED_BASE_URL:-http://127.0.0.1:11434}"
export PI_HOST_DB="${PI_HOST_DB:-$APP_DIR/storage/session.sqlite}"
export PI_HOST_SANDBOX="${PI_HOST_SANDBOX:-$APP_DIR/workspace}"

MATRIX_ACCESS_TOKEN="$(cat "$SECRETS_DIR/matrix_token")"
OLLAMA_API_KEY="$(cat "$SECRETS_DIR/ollama_key")"
export MATRIX_ACCESS_TOKEN OLLAMA_API_KEY
trap 'unset MATRIX_ACCESS_TOKEN OLLAMA_API_KEY' EXIT

# Same storage file as the host runner: exactly one process may own it, so the
# host daemon must be stopped before this container starts (the cutover step).
exec ./node_modules/.bin/tsx src/daemon.ts
