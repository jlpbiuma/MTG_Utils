#!/usr/bin/env bash
# ==============================================================================
# Paso 7: Arranque de todos los servicios y worker en producción
# ==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/common.env.sh"

log_info "Iniciando todos los contenedores en ${REMOTE_HOST}..."
run_ssh "cd '${REMOTE_DIR}' && docker compose up -d"

log_info "Esperando a que los servicios se estabilicen (15 segundos)..."
sleep 15

log_info "Estado actual de los contenedores en ${REMOTE_HOST}:"
run_ssh "cd '${REMOTE_DIR}' && docker compose ps"

log_info "Verificando logs del worker en ${REMOTE_HOST}:"
run_ssh "cd '${REMOTE_DIR}' && docker compose logs --tail=30 worker"

log_success "Todos los servicios y el worker están levantados en producción."
