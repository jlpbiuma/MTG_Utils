#!/usr/bin/env bash
# ==============================================================================
# Paso 3: Compilación nativa x86_64 en el servidor remoto
# ==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/common.env.sh"

log_info "Iniciando compilación nativa de imágenes Docker en ${SSH_TARGET}:${REMOTE_DIR}..."
run_ssh "cd '${REMOTE_DIR}' && docker compose build"

log_success "Compilación de imágenes completada en ${REMOTE_HOST}."
