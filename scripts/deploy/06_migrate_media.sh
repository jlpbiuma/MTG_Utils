#!/usr/bin/env bash
# ==============================================================================
# Paso 6: Migración de medios MinIO (4.4 GB de imágenes y artes de cartas)
# ==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/common.env.sh"

log_info "Comprobando contenedor local MinIO..."
if ! docker ps --format '{{.Names}}' | grep -q '^mtg-utils-minio$'; then
    log_error "El contenedor local mtg-utils-minio no está en ejecución. Inícialo antes de migrar."
    exit 1
fi

log_info "Comprobando contenedor remoto MinIO..."
if ! run_ssh "docker ps --format '{{.Names}}' | grep -q '^mtg-utils-minio$'"; then
    log_error "El contenedor remoto mtg-utils-minio no está en ejecución en ${REMOTE_HOST}."
    exit 1
fi

log_info "Iniciando transferencia directa de artes e imágenes de MinIO a ${REMOTE_HOST}..."
log_info "(Esto puede tomar entre 1 y 2 minutos dependiendo de la velocidad de la red local)..."

docker cp mtg-utils-minio:/data/mtg-images - | run_ssh "docker cp - mtg-utils-minio:/data/"

log_success "Transferencia de archivos MinIO completada."

log_info "Verificando contenido en MinIO remoto:"
run_ssh "docker exec mtg-utils-minio du -sh /data /data/mtg-images/* 2>/dev/null || true"

log_success "Medios migrados correctamente al SSD remoto."
