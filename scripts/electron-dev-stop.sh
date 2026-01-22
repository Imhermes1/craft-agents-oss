#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_FILE="${PID_FILE:-$ROOT_DIR/.craftagents-dev.pids}"

if [[ ! -f "$PID_FILE" ]]; then
  echo "[dev:stop] No pid file found at $PID_FILE"
  echo "[dev:stop] Trying best-effort cleanup by process name..."
  pkill -TERM -f "vite dev --config apps/electron/vite.config.ts" 2>/dev/null || true
  pkill -TERM -f "esbuild apps/electron/src" 2>/dev/null || true
  pkill -TERM -f "electron apps/electron" 2>/dev/null || true
  exit 0
fi

echo "[dev:stop] Stopping dev processes from $PID_FILE"

while IFS= read -r pid; do
  [[ -z "${pid}" ]] && continue
  if kill -0 "$pid" 2>/dev/null; then
    kill -TERM "$pid" 2>/dev/null || true
  fi
done < "$PID_FILE"

sleep 1

while IFS= read -r pid; do
  [[ -z "${pid}" ]] && continue
  if kill -0 "$pid" 2>/dev/null; then
    kill -KILL "$pid" 2>/dev/null || true
  fi
done < "$PID_FILE"

rm -f "$PID_FILE"
echo "[dev:stop] Done."

