#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

PID_FILE="${PID_FILE:-$ROOT_DIR/.craftagents-dev.pids}"

source "$ROOT_DIR/scripts/detect-instance.sh"

rm -f "$PID_FILE"
touch "$PID_FILE"

cleanup() {
  trap - INT TERM EXIT

  if [[ -f "$PID_FILE" ]]; then
    while IFS= read -r pid; do
      [[ -z "${pid}" ]] && continue
      if kill -0 "$pid" 2>/dev/null; then
        kill -TERM "$pid" 2>/dev/null || true
      fi
    done < "$PID_FILE"

    # Give children a moment to shut down gracefully
    sleep 1

    while IFS= read -r pid; do
      [[ -z "${pid}" ]] && continue
      if kill -0 "$pid" 2>/dev/null; then
        kill -KILL "$pid" 2>/dev/null || true
      fi
    done < "$PID_FILE"

    rm -f "$PID_FILE"
  fi
}

trap cleanup INT TERM EXIT

echo "[dev] Cleaning Vite cache"
bun run electron:clean:vite

echo "[dev] Building resources"
bun run electron:build:resources

start_bg() {
  "$@" &
  local pid="$!"
  echo "$pid" >> "$PID_FILE"
}

echo "[dev] Starting watchers (Vite + esbuild) and Electron"
start_bg bun run electron:dev:vite
start_bg bun run electron:dev:main
start_bg bun run electron:dev:preload
start_bg bun run electron:dev:electron

echo "[dev] Running. Stop with Ctrl+C or: bun run electron:dev:stop"
wait

