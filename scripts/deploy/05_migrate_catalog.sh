#!/usr/bin/env bash
# ==============================================================================
# Paso 5: Migración selectiva del catálogo MTG (Sin datos de usuario)
# ==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/common.env.sh"

log_info "Comprobando contenedor de base de datos local..."
if ! docker ps --format '{{.Names}}' | grep -q '^mtg-utils-db$'; then
    log_error "El contenedor local mtg-utils-db no está en ejecución. Inícialo antes de migrar."
    exit 1
fi

# Stage the complete payload before touching the destination. A failed local dump
# must never cause the remote catalog to be truncated.
command -v python3 >/dev/null || { log_error "Se requiere python3 para normalizar el catálogo."; exit 1; }
DUMP_FILE="$(mktemp "${TMPDIR:-/tmp}/mtg-catalog.XXXXXX")"
trap 'rm -f "$DUMP_FILE"' EXIT

log_info "Preparando exportación compatible con el esquema actual..."
{
    cat <<'SQL'
BEGIN;
TRUNCATE TABLE
    public.card_price_history,
    public.card_translation_retries,
    public.card_printings,
    public.card_catalog,
    public.card_sets;
SQL
    docker exec mtg-utils-db pg_dump -U postgres -d mtg_utils -a --disable-triggers \
        -t card_sets \
        -t card_catalog \
        -t card_printings \
        -t card_price_history \
        -t card_translation_retries \
        | python3 "${SCRIPT_DIR}/normalize_catalog_dump.py"

    cat <<SQL
SET search_path = public;
UPDATE card_printings
SET image_uri = REPLACE(image_uri, 'http://localhost:8080/images', 'http://${REMOTE_HOST}:${PROD_NGINX_PORT}/images'),
    image_uri_small = REPLACE(image_uri_small, 'http://localhost:8080/images', 'http://${REMOTE_HOST}:${PROD_NGINX_PORT}/images'),
    image_uri_large = REPLACE(image_uri_large, 'http://localhost:8080/images', 'http://${REMOTE_HOST}:${PROD_NGINX_PORT}/images')
WHERE image_uri LIKE '%localhost:8080%';
UPDATE card_catalog
SET image_uri = REPLACE(image_uri, 'http://localhost:8080/images', 'http://${REMOTE_HOST}:${PROD_NGINX_PORT}/images')
WHERE image_uri LIKE '%localhost:8080%';
COMMIT;
SQL
} | gzip -c > "$DUMP_FILE"

gzip -t "$DUMP_FILE"
log_info "Importando catálogo en ${REMOTE_HOST} en una única transacción..."
# COMMIT is at the end of the payload. SQL errors or a disconnected stream
# before COMMIT roll back both TRUNCATE and COPY, including trigger changes.
run_ssh "bash -o pipefail -c 'gunzip -c | docker exec -i mtg-utils-db psql -X -U postgres -d mtg_utils -v ON_ERROR_STOP=1'" < "$DUMP_FILE"
log_success "Datos del catálogo MTG importados exitosamente en ${REMOTE_HOST}."

log_info "Comprobando conteo de filas en el servidor de producción:"
run_ssh "docker exec mtg-utils-db psql -U postgres -d mtg_utils -c '
    SELECT relname as tabla, n_live_tup as filas 
    FROM pg_stat_user_tables 
    WHERE relname IN (
        \$\$card_sets\$\$, \$\$card_catalog\$\$, \$\$card_printings\$\$, \$\$card_rulings\$\$,
        \$\$scryfall_bulk_cards\$\$, \$\$cm_price_history\$\$, \$\$users\$\$, \$\$decks\$\$, \$\$user_collections\$\$
    )
    ORDER BY n_live_tup DESC;
'"

log_success "Migración del catálogo finalizada. No se han importado datos de usuario."
