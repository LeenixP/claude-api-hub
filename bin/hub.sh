#!/usr/bin/env bash
set -euo pipefail

HUB_DIR="${HOME}/.claude-api-hub"
PID_FILE="${HUB_DIR}/hub.pid"
LOG_FILE="${HUB_DIR}/hub.log"
GATEWAY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HEALTH_URL="http://127.0.0.1:9800/health"

mkdir -p "${HUB_DIR}"

_is_running() {
  if [[ -f "${PID_FILE}" ]]; then
    local pid
    pid=$(cat "${PID_FILE}")
    if kill -0 "${pid}" 2>/dev/null; then
      return 0
    fi
  fi
  return 1
}

cmd_start() {
  if _is_running; then
    echo "hub is already running (PID $(cat "${PID_FILE}"))"
    exit 0
  fi
  echo "Starting claude-api-hub..."
  nohup node "${GATEWAY_DIR}/dist/index.js" >> "${LOG_FILE}" 2>&1 &
  echo $! > "${PID_FILE}"
  echo "Started (PID $!). Logs: ${LOG_FILE}"
}

cmd_stop() {
  if ! _is_running; then
    echo "hub is not running"
    exit 0
  fi
  local pid
  pid=$(cat "${PID_FILE}")
  kill "${pid}"
  rm -f "${PID_FILE}"
  echo "Stopped (PID ${pid})"
}

cmd_status() {
  if _is_running; then
    echo "hub is running (PID $(cat "${PID_FILE}"))"
    echo ""
    curl -sf "${HEALTH_URL}" && echo "" || echo "Health endpoint not responding"
  else
    echo "hub is not running"
  fi
}

cmd_logs() {
  if [[ ! -f "${LOG_FILE}" ]]; then
    echo "No log file at ${LOG_FILE}"
    exit 1
  fi
  tail -f "${LOG_FILE}"
}

cmd_restart() {
  cmd_stop || true
  sleep 1
  cmd_start
}

case "${1:-}" in
  start)   cmd_start ;;
  stop)    cmd_stop ;;
  status)  cmd_status ;;
  logs)    cmd_logs ;;
  restart) cmd_restart ;;
  *)
    echo "Usage: hub.sh {start|stop|status|logs|restart}"
    exit 1
    ;;
esac
