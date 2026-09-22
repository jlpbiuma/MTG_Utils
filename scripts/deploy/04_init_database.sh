#!/usr/bin/env bash
# ==============================================================================
# Paso 4: Arranque de infraestructura sin modificar el esquema ni los datos
# ==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/common.env.sh"

log_info "Arrancando servicios base (db, minio, minio-init, tor, imgproxy, nginx) en ${REMOTE_HOST}..."
run_ssh "cd '${REMOTE_DIR}' && docker compose up -d db minio minio-init tor imgproxy nginx"

log_info "Esperando a que la base de datos PostgreSQL esté lista..."
run_ssh "cd '${REMOTE_DIR}' && until docker compose ps db | grep -q 'healthy'; do sleep 2; done"
log_success "Base de datos PostgreSQL en ejecución y saludable."

log_success "Infraestructura lista. El esquema se actualiza únicamente mediante make migrate-db."
