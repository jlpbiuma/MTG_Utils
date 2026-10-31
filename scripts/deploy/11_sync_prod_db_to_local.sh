#!/usr/bin/env bash
# ==============================================================================
# Copia completa de la base de datos de producción a la base local de desarrollo
#
# Producción solo se LEE: pg_dump se ejecuta con default_transaction_read_only
# dentro del contenedor remoto y su salida viaja por SSH. Nunca se ejecuta
# psql, pg_restore ni ningún otro comando que escriba en el servidor remoto.
#
# En local, la base mtg_utils del contenedor mtg-utils-db se reemplaza por la
# copia. Antes se guarda una copia de seguridad de la base local en
# data/db-snapshots/, salvo SKIP_LOCAL_BACKUP=1.
#
# Variables: REMOTE_HOST, REMOTE_USER, LOCAL_DB (mtg_utils), KEEP_DUMPS (3).
# ==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/common.env.sh"

ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
SNAPSHOT_DIR="${ROOT_DIR}/data/db-snapshots"
LOCAL_DB="${LOCAL_DB:-mtg_utils}"
KEEP_DUMPS="${KEEP_DUMPS:-3}"
STAMP="$(date +%Y%m%d-%H%M%S)"
PROD_DUMP="${SNAPSHOT_DIR}/prod-${STAMP}.dump"
LOCAL_BACKUP="${SNAPSHOT_DIR}/local-before-sync-${STAMP}.dump"

mkdir -p "${SNAPSHOT_DIR}"

log_info "Comprobando acceso SSH a ${SSH_TARGET}..."
if ! run_ssh "docker ps --format '{{.Names}}' | grep -q '^mtg-utils-db\$'"; then
    log_error "No se puede acceder a mtg-utils-db en ${REMOTE_HOST}. Revisa SSH y el contenedor remoto."
    exit 1
fi

log_info "Comprobando el contenedor local mtg-utils-db..."
if ! docker ps --format '{{.Names}}' | grep -q '^mtg-utils-db$'; then
    log_info "Arrancando el servicio local db..."
    (cd "${ROOT_DIR}" && docker compose up -d db)
fi
for _ in $(seq 1 30); do
    docker exec mtg-utils-db pg_isready -U postgres -q && break
    sleep 1
done
docker exec mtg-utils-db pg_isready -U postgres -q || { log_error "La base local no responde."; exit 1; }

log_info "Volcando producción en modo solo lectura (formato custom, comprimido)..."
# The dump is staged to a file first: a broken transfer never touches local data.
run_ssh "docker exec -e PGOPTIONS='-c default_transaction_read_only=on' mtg-utils-db \
    pg_dump -U postgres -d mtg_utils -Fc -Z 6 --no-owner --no-privileges" > "${PROD_DUMP}.partial"
mv "${PROD_DUMP}.partial" "${PROD_DUMP}"
docker exec -i mtg-utils-db pg_restore --list < "${PROD_DUMP}" > /dev/null \
    || { log_error "El volcado descargado no es válido: ${PROD_DUMP}"; exit 1; }
log_success "Volcado de producción guardado en ${PROD_DUMP} ($(du -h "${PROD_DUMP}" | cut -f1))."

if [[ "${SKIP_LOCAL_BACKUP:-0}" != "1" ]] && \
   docker exec mtg-utils-db psql -U postgres -Atc "SELECT 1 FROM pg_database WHERE datname='${LOCAL_DB}'" | grep -q 1; then
    log_info "Guardando copia de seguridad de la base local en ${LOCAL_BACKUP}..."
    docker exec mtg-utils-db pg_dump -U postgres -d "${LOCAL_DB}" -Fc --no-owner --no-privileges > "${LOCAL_BACKUP}"
fi

log_info "Reemplazando la base local ${LOCAL_DB} por la copia de producción..."
docker exec mtg-utils-db psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 \
    -c "DROP DATABASE IF EXISTS \"${LOCAL_DB}\" WITH (FORCE)" \
    -c "CREATE DATABASE \"${LOCAL_DB}\""
docker exec -i mtg-utils-db pg_restore -U postgres -d "${LOCAL_DB}" --no-owner --no-privileges \
    --exit-on-error -j 1 < "${PROD_DUMP}"
docker exec mtg-utils-db psql -X -U postgres -d "${LOCAL_DB}" -q -c "ANALYZE"

log_info "Filas copiadas en las tablas principales:"
docker exec mtg-utils-db psql -X -U postgres -d "${LOCAL_DB}" -c "
    SELECT 'users' AS tabla, count(*) FROM users UNION ALL
    SELECT 'decks', count(*) FROM decks UNION ALL
    SELECT 'deck_cards', count(*) FROM deck_cards UNION ALL
    SELECT 'user_collections', count(*) FROM user_collections UNION ALL
    SELECT 'card_catalog', count(*) FROM card_catalog UNION ALL
    SELECT 'card_printings', count(*) FROM card_printings;"

# Keep the most recent production dumps only; they contain private user data.
ls -1t "${SNAPSHOT_DIR}"/prod-*.dump 2>/dev/null | tail -n +"$((KEEP_DUMPS + 1))" | while read -r old; do rm -f "$old"; done
log_success "Base local ${LOCAL_DB} sincronizada con producción (${REMOTE_HOST}). Producción no se ha modificado."
log_warn "La copia contiene datos privados de usuarios: no la compartas ni la subas al repositorio."
