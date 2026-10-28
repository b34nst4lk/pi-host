#!/usr/bin/env bash
# Host-side runner for pi-host's daemon (first live runs; containerized later).
# Reads staged secrets from tmpfs files into the environment. Values are never
# echoed, never logged, never land in argv or this repo.
#
#   sudo-mkdir? no — just:  mkdir -p /dev/shm/pi-host
#   stage secrets (0600):   /dev/shm/pi-host/matrix_token   (bot access token)
#                           /dev/shm/pi-host/ollama_key
#   run:                    scripts/run-host-daemon.sh '!roomid-or-#alias' '@jacksim:jacks.im'
# env overrides: MATRIX_HOMESERVER (default https://matrix.jacks.im), PI_HOST_DB.
set -euo pipefail
cd "$(dirname "$0")/.."

[ -f /dev/shm/pi-host/matrix_token ] || { echo "FAIL: /dev/shm/pi-host/matrix_token missing (stage the bot access token, chmod 600)"; exit 1; }
[ -f /dev/shm/pi-host/ollama_key ] || { echo "FAIL: /dev/shm/pi-host/ollama_key missing (stage the ollama cloud key, chmod 600)"; exit 1; }

ROOM="${1:?usage: scripts/run-host-daemon.sh '<room id or #alias>' '<allowed-user-ids,comma-separated>'}"
USERS="${2:?usage: scripts/run-host-daemon.sh '<room id or #alias>' '<allowed-user-ids,comma-separated>'}"

export MATRIX_HOMESERVER="${MATRIX_HOMESERVER:-https://matrix.jacks.im}"
# The host's IPv6 egress to cloudflare edges is broken (connect-refusal in ms;
# DNS lists AAAA first, and node 22 tries v6 first without curl-style fallback —
# the 2026-10-28 ETIMEDOUT flapping). Force v4-first for node's resolver.
export NODE_OPTIONS="${NODE_OPTIONS:---dns-result-order=ipv4first}"
export MATRIX_ROOM="$ROOM"
export MATRIX_ALLOWED_USERS="$USERS"
MATRIX_ACCESS_TOKEN="$(cat /dev/shm/pi-host/matrix_token)"
OLLAMA_API_KEY="$(cat /dev/shm/pi-host/ollama_key)"
export MATRIX_ACCESS_TOKEN OLLAMA_API_KEY
trap 'unset MATRIX_ACCESS_TOKEN OLLAMA_API_KEY' EXIT

exec ./node_modules/.bin/tsx src/daemon.ts