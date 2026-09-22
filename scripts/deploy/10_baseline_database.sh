#!/usr/bin/env bash
# One-time adoption of an existing schema; no application tables are changed.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/common.env.sh"

log_info "Comprobando que el esquema remoto coincide con la migración inicial..."
if ! run_ssh "cd '${REMOTE_DIR}' && docker compose run --rm --no-deps backend sh prisma/baseline.sh"; then
    log_error "Baseline detenido. Revisa las diferencias o el error anterior; no fuerces migrate resolve."
    exit 1
fi
log_success "Esquema existente registrado como 0_init. Ya se puede ejecutar make migrate-db."
