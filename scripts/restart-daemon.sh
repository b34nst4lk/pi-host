#!/usr/bin/env bash
# Restart the pi-host daemon to load new code — safely, and detached.
#
# Why this exists: the daemon process IS the agent. Killing it kills the running
# turn, so the restart has to be done by a process that is not the daemon and
# that outlives it (setsid), after a delay long enough for the in-flight reply to
# be delivered. The durable ledger makes the rest recoverable: a reply committed
# but not sent stays outside the pump cursor and is redelivered on boot.
#
#   scripts/restart-daemon.sh --dry-run        # print what would happen, touch nothing
#   scripts/restart-daemon.sh --delay 45       # schedule a restart 45s from now, detached
#   scripts/restart-daemon.sh --now            # restart immediately (for a maintenance shell)
#
# Room and allowlist are read from the live process's environment, so a restart
# never needs the arguments retyped. Secrets stay in /dev/shm, read by the runner.
set -euo pipefail
cd "$(dirname "$0")/.."
REPO="$PWD"
DB="${PI_HOST_DB:-./storage/session.sqlite}"
LOG="${RESTART_LOG:-./storage/daemon.log}"
DELAY=45
MODE="schedule"

while [ $# -gt 0 ]; do
	case "$1" in
		--dry-run) MODE="dry"; shift ;;
		--now) MODE="now"; shift ;;
		--delay) DELAY="${2:?--delay needs seconds}"; shift 2 ;;
		*) echo "unknown arg: $1" >&2; exit 2 ;;
	esac
done

say() { printf '[restart] %s\n' "$*" >&2; }

# --- 1. find the live daemon (tsx src/daemon.ts, this repo) ---
find_daemon() {
	pgrep -f "$REPO/node_modules/\.bin/tsx src/daemon\.ts" 2>/dev/null | head -1 || true
}
PID="$(find_daemon)"
if [ -z "$PID" ]; then
	echo "FAIL: no running daemon found for $REPO (is it already down? start it with scripts/run-host-daemon.sh)" >&2
	exit 1
fi
say "daemon pid=$PID"

# --- 2. preflight: a restart that cannot come back leaves the agent deaf ---
for f in /dev/shm/pi-host/matrix_token /dev/shm/pi-host/ollama_key; do
	[ -r "$f" ] || { echo "FAIL: $f missing/unreadable (stage it 0600 first)" >&2; exit 1; }
done
[ -d "$(dirname "$DB")" ] && [ -w "$(dirname "$DB")" ] || { echo "FAIL: db dir $(dirname "$DB") not writable" >&2; exit 1; }
[ -x ./node_modules/.bin/tsx ] || { echo "FAIL: tsx not installed (npm install)" >&2; exit 1; }

ROOM="$(tr '\0' '\n' < "/proc/$PID/environ" | sed -n 's/^MATRIX_ROOM=//p')"
USERS="$(tr '\0' '\n' < "/proc/$PID/environ" | sed -n 's/^MATRIX_ALLOWED_USERS=//p')"
HOMESERVER="$(tr '\0' '\n' < "/proc/$PID/environ" | sed -n 's/^MATRIX_HOMESERVER=//p')"
[ -n "$ROOM" ] && [ -n "$USERS" ] || { echo "FAIL: cannot read MATRIX_ROOM/MATRIX_ALLOWED_USERS from pid $PID" >&2; exit 1; }
say "room=$ROOM users=$USERS homeserver=${HOMESERVER:-default}"

if [ "$MODE" = "dry" ]; then
	say "dry run — nothing is sent, killed, or started"
	say "would wait ${DELAY}s for the in-flight reply, then: kill -TERM $PID"
	say "would wait up to 30s for exit, else kill -KILL $PID"
	say "would start: setsid scripts/run-host-daemon.sh '$ROOM' '$USERS' >> $LOG 2>&1"
	say "would consider it up only when 'harness up' appears in $LOG (never trust setsid's \$!)"
	say "would retry up to 3 times if the new process never reports 'harness up'"
	exit 0
fi

# --- 3. the restart itself, in a detached process that outlives the daemon ---
restart_body() {
	set -u
	room="$1" users="$2" pid="$3" delay="$4" repo="$5" log="$6"
	[ "$delay" -gt 0 ] && sleep "$delay"
	# the pid may have been restarted meanwhile; re-resolve, never kill a stranger
	current="$(pgrep -f "$repo/node_modules/\.bin/tsx src/daemon\.ts" 2>/dev/null | head -1 || true)"
	if [ -n "$current" ]; then
		echo "[restart] $(date -Is) TERM $current" >> "$log"
		kill -TERM "$current" 2>/dev/null || true
		for _ in $(seq 1 30); do
			kill -0 "$current" 2>/dev/null || break
			sleep 1
		done
		if kill -0 "$current" 2>/dev/null; then
			echo "[restart] $(date -Is) still alive after 30s; KILL $current" >> "$log"
			kill -KILL "$current" 2>/dev/null || true
			sleep 2
		fi
	fi
	cd "$repo" || exit 1
	# liveness is judged by the log + pgrep, NEVER by $!: setsid may fork, so $! can
	# be a short-lived wrapper — trusting it would call a live daemon dead and start
	# a second one on the same SQLite (one process owns a storage).
	for attempt in 1 2 3; do
		for _ in $(seq 1 10); do
			[ -z "$(pgrep -f "$repo/node_modules/\.bin/tsx src/daemon\.ts" 2>/dev/null | head -1 || true)" ] && break
			sleep 1
		done
		mark="$(wc -l < "$log" 2>/dev/null || echo 0)"
		echo "[restart] $(date -Is) start attempt $attempt" >> "$log"
		setsid ./scripts/run-host-daemon.sh "$room" "$users" >> "$log" 2>&1 &
		up=""
		for _ in $(seq 1 20); do
			sleep 1
			if tail -n +$((mark + 1)) "$log" 2>/dev/null | grep -q "harness up"; then up="yes"; break; fi
		done
		if [ -n "$up" ]; then
			live="$(pgrep -f "$repo/node_modules/\.bin/tsx src/daemon\.ts" 2>/dev/null | head -1 || true)"
			echo "[restart] $(date -Is) up as pid ${live:-unknown} (harness up)" >> "$log"
			exit 0
		fi
		echo "[restart] $(date -Is) attempt $attempt never reached 'harness up'; see $log" >> "$log"
		sleep 5
	done
	echo "[restart] $(date -Is) FAILED after 3 attempts — manual start needed: scripts/run-host-daemon.sh '$room' '$users'" >> "$log"
	exit 1
}
export -f restart_body

mkdir -p "$(dirname "$LOG")"
if [ "$MODE" = "now" ]; then
	setsid bash -c "restart_body '$ROOM' '$USERS' '$PID' 0 '$REPO' '$LOG'" >/dev/null 2>&1 &
else
	setsid bash -c "restart_body '$ROOM' '$USERS' '$PID' '$DELAY' '$REPO' '$LOG'" >/dev/null 2>&1 &
fi
say "scheduled (mode=$MODE delay=${DELAY}s); the restart runs detached and logs to $LOG"
say "after it fires this conversation resumes from the durable ledger — a reply committed but unsent is redelivered"
