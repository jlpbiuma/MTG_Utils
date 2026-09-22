#!/usr/bin/env bash
# Apply only versioned migrations. Never fall back to db push/reset or seed/import.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/common.env.sh"

log_info "Aplicando migraciones versionadas de Prisma en ${REMOTE_HOST}..."
# Override the image CMD: migration failure stops the deployment before services
# are recreated. Prisma itself validates migration history; no automatic baseline.
if ! run_ssh "cd '${REMOTE_DIR}' && docker compose run --rm --no-deps backend uv run prisma migrate deploy"; then
    log_error "No se pudieron aplicar las migraciones. No se ha ejecutado db push ni importado el catálogo."
    log_error "Si Prisma devuelve P3005, ejecuta make baseline-db una vez: verificará el esquema antes de registrarlo. Otros errores requieren revisar el historial."
    exit 1
fi

log_success "Migraciones aplicadas."
