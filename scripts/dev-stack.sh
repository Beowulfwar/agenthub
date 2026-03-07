#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_PORT="${BACKEND_PORT:-3737}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"
FRONTEND_HOST="${FRONTEND_HOST:-0.0.0.0}"
PORT_WAIT_SECONDS="${PORT_WAIT_SECONDS:-5}"
TMPDIR="${TMPDIR:-}"

backend_pid=""
frontend_pid=""

log() {
  printf '[dev-stack] %s\n' "$*"
}

have_cmd() {
  command -v "$1" >/dev/null 2>&1
}

ensure_safe_tmpdir() {
  if [[ -z "${TMPDIR}" || "${TMPDIR}" == /mnt/* ]]; then
    TMPDIR="/tmp/agent-hub-dev"
  fi

  mkdir -p "${TMPDIR}"
  export TMPDIR
}

find_pids_by_port() {
  local port="$1"

  if have_cmd lsof; then
    lsof -tiTCP:"${port}" -sTCP:LISTEN 2>/dev/null | sort -u
    return
  fi

  if have_cmd fuser; then
    fuser -n tcp "${port}" 2>/dev/null | tr ' ' '\n' | sed '/^$/d' | sort -u
    return
  fi

  if have_cmd ss; then
    ss -ltnp "sport = :${port}" 2>/dev/null \
      | grep -o 'pid=[0-9]\+' \
      | cut -d= -f2 \
      | sort -u
    return
  fi

  log "Nao foi possivel inspecionar a porta ${port}: faltam lsof, fuser ou ss."
}

port_is_busy() {
  local port="$1"
  local pids
  pids="$(find_pids_by_port "${port}" || true)"
  [[ -n "${pids}" ]]
}

wait_for_port_release() {
  local port="$1"
  local attempts="$(( PORT_WAIT_SECONDS * 10 ))"
  local i

  for ((i = 0; i < attempts; i += 1)); do
    if ! port_is_busy "${port}"; then
      return 0
    fi
    sleep 0.1
  done

  return 1
}

terminate_port_processes() {
  local port="$1"
  local signal="$2"
  local pids
  pids="$(find_pids_by_port "${port}" || true)"

  [[ -z "${pids}" ]] && return 0

  while IFS= read -r pid; do
    [[ -z "${pid}" ]] && continue
    if [[ "${pid}" == "$$" ]]; then
      continue
    fi
    kill "-${signal}" "${pid}" 2>/dev/null || true
  done <<< "${pids}"
}

ensure_port_available() {
  local port="$1"
  local label="$2"

  if ! port_is_busy "${port}"; then
    return 0
  fi

  log "Porta ${port} ocupada para ${label}. Encerrando processo anterior."
  terminate_port_processes "${port}" TERM

  if wait_for_port_release "${port}"; then
    log "Porta ${port} liberada."
    return 0
  fi

  log "Processo na porta ${port} nao respondeu ao TERM. Forcando encerramento."
  terminate_port_processes "${port}" KILL

  if wait_for_port_release "${port}"; then
    log "Porta ${port} liberada apos KILL."
    return 0
  fi

  log "Falha ao liberar a porta ${port}."
  exit 1
}

cleanup_pid() {
  local pid="$1"

  [[ -z "${pid}" ]] && return 0
  if ! kill -0 "${pid}" 2>/dev/null; then
    return 0
  fi

  kill "${pid}" 2>/dev/null || true
  wait "${pid}" 2>/dev/null || true
}

cleanup() {
  cleanup_pid "${backend_pid}"
  cleanup_pid "${frontend_pid}"
}

trap cleanup EXIT INT TERM

ensure_safe_tmpdir
ensure_port_available "${BACKEND_PORT}" "backend"
ensure_port_available "${FRONTEND_PORT}" "frontend"

log "Subindo backend API em http://localhost:${BACKEND_PORT}"
(
  cd "${ROOT_DIR}"
  exec npm run dev:ui -- --port "${BACKEND_PORT}"
) &
backend_pid=$!

log "Subindo frontend UI em http://${FRONTEND_HOST}:${FRONTEND_PORT}"
(
  cd "${ROOT_DIR}/ui"
  exec npm run dev -- --host "${FRONTEND_HOST}" --port "${FRONTEND_PORT}"
) &
frontend_pid=$!

wait -n "${backend_pid}" "${frontend_pid}"
