#!/usr/bin/env bash
# ==============================================================================
# Paso 4: Arranque de infraestructura e inicialización de esquema con Prisma
# ==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/common.env.sh"

log_info "Arrancando servicios base (db, minio, minio-init, tor, imgproxy, nginx) en ${REMOTE_HOST}..."
run_ssh "cd '${REMOTE_DIR}' && docker compose up -d db minio minio-init tor imgproxy nginx"

log_info "Esperando a que la base de datos PostgreSQL esté lista..."
run_ssh "cd '${REMOTE_DIR}' && until docker compose ps db | grep -q 'healthy'; do sleep 2; done"
log_success "Base de datos PostgreSQL en ejecución y saludable."

log_info "Iniciando contenedor backend temporalmente para aplicar esquema de Prisma..."
run_ssh "cd '${REMOTE_DIR}' && docker compose up -d backend"

log_info "Esperando a que el backend aplique migraciones e inicialice el esquema..."
run_ssh "cd '${REMOTE_DIR}' && until docker compose ps backend | grep -q 'healthy'; do sleep 3; done"
log_success "Esquema de base de datos inicializado exitosamente por Prisma."

log_info "Deteniendo backend temporalmente para permitir importación segura del catálogo..."
run_ssh "cd '${REMOTE_DIR}' && docker compose stop backend worker"
log_success "Servicios base listos para recibir datos de catálogo."
