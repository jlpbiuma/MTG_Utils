#!/usr/bin/env bash
# ==============================================================================
# Paso 1: Generación de archivos .env para producción
# ==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/common.env.sh"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

log_info "Generando configuración de entorno para producción (${REMOTE_HOST})..."

# Extraer valores existentes del .env local (sin sobrescribir secretos a mano)
_read_env() {
    local key="$1"
    local file="$2"
    if [ -f "$file" ]; then
        grep -E "^${key}=" "$file" 2>/dev/null | head -1 | cut -d '=' -f2- | tr -d '"' | tr -d "'" || true
    fi
}

CARDTRADER_TOKEN="$(_read_env CARDTRADER_API_TOKEN "${PROJECT_ROOT}/backend/.env")"
if [ -z "$CARDTRADER_TOKEN" ]; then
    CARDTRADER_TOKEN="$(_read_env CARDTRADER_API_TOKEN "${PROJECT_ROOT}/.env")"
fi

OCR_API_TOKEN="$(_read_env OCR_API_TOKEN "${PROJECT_ROOT}/.env")"
OCR_API_URL="$(_read_env OCR_API_URL "${PROJECT_ROOT}/.env")"
OCR_API_TIMEOUT="$(_read_env OCR_API_TIMEOUT "${PROJECT_ROOT}/.env")"
WHATSAPP_ALLOWED_CHATS="$(_read_env WHATSAPP_ALLOWED_CHATS "${PROJECT_ROOT}/.env")"

# Defaults seguros si faltan en local
OCR_API_URL="${OCR_API_URL:-http://host.docker.internal:8020}"
OCR_API_TIMEOUT="${OCR_API_TIMEOUT:-15}"

if [ -z "$OCR_API_TOKEN" ]; then
    log_warn "OCR_API_TOKEN vacío en .env local: worker/backend en prod fallarán con 401 si el OCR exige token."
fi

# 1. Root .env.production
cat <<EOF > "${PROJECT_ROOT}/.env.production"
# ==============================================================================
# MTG UTILS - PRODUCCIÓN (${REMOTE_HOST})
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

# WhatsApp listener
WHATSAPP_ALLOWED_CHATS="${WHATSAPP_ALLOWED_CHATS}"

# OCR home (mismo token que ocr_service en la máquina del OCR)
OCR_API_URL=${OCR_API_URL}
OCR_API_TOKEN=${OCR_API_TOKEN}
OCR_API_TIMEOUT=${OCR_API_TIMEOUT}
EOF

# 2. backend/.env.production
cat <<EOF > "${PROJECT_ROOT}/backend/.env.production"
DATABASE_URL="postgresql://postgres:postgres@db:5432/mtg_utils?schema=public"
CARDTRADER_API_TOKEN="${CARDTRADER_TOKEN}"
OCR_API_URL="${OCR_API_URL}"
OCR_API_TOKEN="${OCR_API_TOKEN}"
OCR_API_TIMEOUT=${OCR_API_TIMEOUT}
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
if [ -n "$OCR_API_TOKEN" ]; then
    log_info "OCR_API_TOKEN incluido (longitud ${#OCR_API_TOKEN})."
fi
