#!/usr/bin/env bash
# ==============================================================================
# Paso 2: Sincronización del código fuente al servidor remoto vía rsync
# ==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/common.env.sh"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

log_info "Asegurando directorio remoto ${REMOTE_DIR} en ${SSH_TARGET}..."
run_ssh "mkdir -p '${REMOTE_DIR}'"

log_info "Sincronizando archivos del proyecto con rsync..."
rsync -avz --delete \
    --exclude='node_modules' \
    --exclude='.next' \
    --exclude='.venv' \
    --exclude='__pycache__' \
    --exclude='*.pyc' \
    --exclude='.pytest_cache' \
    --exclude='.git' \
    --exclude='.gitmodules' \
    --exclude='.agents' \
    --exclude='.vscode' \
    --exclude='.DS_Store' \
    --exclude='*.env' \
    --exclude='*.env.local' \
    --exclude='data/' \
    --exclude='frontend_swift/' \
    "${PROJECT_ROOT}/" "${SSH_TARGET}:${REMOTE_DIR}/"

log_info "Instalando archivos de entorno de producción en el servidor..."
scp "${PROJECT_ROOT}/.env.production" "${SSH_TARGET}:${REMOTE_DIR}/.env"
scp "${PROJECT_ROOT}/backend/.env.production" "${SSH_TARGET}:${REMOTE_DIR}/backend/.env"
scp "${PROJECT_ROOT}/frontend/.env.production" "${SSH_TARGET}:${REMOTE_DIR}/frontend/.env"

log_success "Código fuente y configuración sincronizados en ${REMOTE_DIR}."
