#!/usr/bin/env bash
# ==============================================================================
# Paso 1: Generación de archivos .env para producción
# ==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/common.env.sh"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

log_info "Generando configuración de entorno para producción (${REMOTE_HOST})..."

# Extraer token existente si existe
CARDTRADER_TOKEN=""
if [ -f "${PROJECT_ROOT}/backend/.env" ]; then
    CARDTRADER_TOKEN=$(grep '^CARDTRADER_API_TOKEN=' "${PROJECT_ROOT}/backend/.env" | cut -d '=' -f2- | tr -d '"')
fi
if [ -z "$CARDTRADER_TOKEN" ] && [ -f "${PROJECT_ROOT}/.env" ]; then
    CARDTRADER_TOKEN=$(grep '^CARDTRADER_API_TOKEN=' "${PROJECT_ROOT}/.env" | cut -d '=' -f2- | tr -d '"')
fi

# 1. Root .env.production
cat <<EOF > "${PROJECT_ROOT}/.env.production"
# ==============================================================================
# MTG UTILS - PRODUCCIÓN (192.168.0.4)
# ==============================================================================
NODE_ENV=production
NEXT_PUBLIC_APP_URL=http://${REMOTE_HOST}:${PROD_FRONTEND_PORT}
BACKEND_URL=http://backend:8000
DATABASE_URL=postgresql://postgres:postgres@db:5432/mtg_utils?schema=public

# Almacenamiento MinIO e Imágenes
MINIO_ROOT_USER=mtg-utils
MINIO_ROOT_PASSWORD=mtg-utils-prod-secret
MINIO_BUCKET=mtg-images

# Llaves imgproxy (compatibles con firmas existentes)
IMGPROXY_KEY=736f6d65333262797465736c6f6e676b6579666f726465766f6e6c79
IMGPROXY_SALT=736f6d65333262797465736c6f6e6773616c74666f726465766f6e6c79

# Puerto e IP para resolución de imágenes desde el navegador
NGINX_PORT=${PROD_NGINX_PORT}
PUBLIC_IMAGE_BASE_URL=http://${REMOTE_HOST}:${PROD_NGINX_PORT}/images

# Worker Scryfall
SCRYFALL_BULK_ENABLED=true
SCRYFALL_BULK_TYPE=default_cards

# Token CardTrader
CARDTRADER_API_TOKEN="${CARDTRADER_TOKEN}"
EOF

# 2. backend/.env.production
cat <<EOF > "${PROJECT_ROOT}/backend/.env.production"
DATABASE_URL="postgresql://postgres:postgres@db:5432/mtg_utils?schema=public"
CARDTRADER_API_TOKEN="${CARDTRADER_TOKEN}"
EOF

# 3. frontend/.env.production
cat <<EOF > "${PROJECT_ROOT}/frontend/.env.production"
DATABASE_URL="postgresql://postgres:postgres@db:5432/mtg_utils?schema=public"
BACKEND_URL="http://backend:8000"
IMAGE_SERVICE_URL="http://nginx:80"
CARDTRADER_API_TOKEN="${CARDTRADER_TOKEN}"
EOF

log_success "Archivos de entorno para producción generados:"
echo "  - ${PROJECT_ROOT}/.env.production"
echo "  - ${PROJECT_ROOT}/backend/.env.production"
echo "  - ${PROJECT_ROOT}/frontend/.env.production"
