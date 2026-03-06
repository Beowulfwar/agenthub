#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_PORT="${BACKEND_PORT:-3737}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"
FRONTEND_HOST="${FRONTEND_HOST:-0.0.0.0}"

backend_pid=""
frontend_pid=""

cleanup() {
  if [[ -n "${backend_pid}" ]]; then
    kill "${backend_pid}" 2>/dev/null || true
  fi

  if [[ -n "${frontend_pid}" ]]; then
    kill "${frontend_pid}" 2>/dev/null || true
  fi

  wait "${backend_pid}" "${frontend_pid}" 2>/dev/null || true
}

trap cleanup EXIT INT TERM

echo "Starting backend API on http://localhost:${BACKEND_PORT}"
(
  cd "${ROOT_DIR}"
  npm run dev:ui -- --port "${BACKEND_PORT}"
) &
backend_pid=$!

echo "Starting frontend UI on http://localhost:${FRONTEND_HOST}:${FRONTEND_PORT}"
(
  cd "${ROOT_DIR}/ui"
  npm run dev -- --host "${FRONTEND_HOST}" --port "${FRONTEND_PORT}"
) &
frontend_pid=$!

wait -n "${backend_pid}" "${frontend_pid}"
