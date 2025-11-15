#!/usr/bin/env bash
set -euo pipefail

BASE_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG_DIR="$BASE_DIR/logs"
PID_FILE="$LOG_DIR/server.pid"
LOG_FILE="$LOG_DIR/server.log"
HOST=${HOST:-0.0.0.0}
PORT=${PORT:-5000}

mkdir -p "$LOG_DIR"

if [[ -f "$PID_FILE" ]]; then
  if ps -p "$(cat "$PID_FILE")" > /dev/null 2>&1; then
    echo "Server already running with PID $(cat "$PID_FILE")."
    exit 0
  else
    rm -f "$PID_FILE"
  fi
fi

export HOST PORT

cd "$BASE_DIR"
nohup python3 main.py >> "$LOG_FILE" 2>&1 &
PID=$!
echo $PID > "$PID_FILE"
echo "Server started (PID $PID) on $HOST:$PORT. Logs: $LOG_FILE"
