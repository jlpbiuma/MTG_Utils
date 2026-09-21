#!/usr/bin/env bash
# ==============================================================================
# Variables comunes y funciones helper para el despliegue en producción
# ==============================================================================

set -eo pipefail

# Configuración del servidor remoto
export REMOTE_HOST="${REMOTE_HOST:-192.168.0.4}"
export REMOTE_USER="${REMOTE_USER:-icedeal}"
export REMOTE_DIR="${REMOTE_DIR:-/home/icedeal/compose/mtg-utils}"
export SSH_TARGET="${REMOTE_USER}@${REMOTE_HOST}"

# Puertos en producción
export PROD_NGINX_PORT="${PROD_NGINX_PORT:-8088}"
export PROD_FRONTEND_PORT="${PROD_FRONTEND_PORT:-3000}"
export PROD_BACKEND_PORT="${PROD_BACKEND_PORT:-8000}"
export PROD_WORKER_PORT="${PROD_WORKER_PORT:-8001}"

# Colores para salida de terminal
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warn() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}" >&2
}

# Ejecución de comandos SSH remotos con timeout
run_ssh() {
    ssh -o BatchMode=yes -o ConnectTimeout=5 "${SSH_TARGET}" "$@"
}
