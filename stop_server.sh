#!/usr/bin/env bash
set -euo pipefail

BASE_DIR="$(cd "$(dirname "$0")" && pwd)"
PID_FILE="$BASE_DIR/logs/server.pid"

if [[ ! -f "$PID_FILE" ]]; then
  echo "No PID file found; server might not be running."
  exit 0
fi

PID=$(cat "$PID_FILE")
if ps -p "$PID" > /dev/null 2>&1; then
  kill "$PID"
  rm -f "$PID_FILE"
  echo "Stopped server (PID $PID)."
else
  echo "Process $PID not running; cleaning up PID file."
  rm -f "$PID_FILE"
fi
