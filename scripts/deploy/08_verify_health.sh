#!/usr/bin/env bash
# ==============================================================================
# Paso 8: Verificación completa de salud de los servicios en producción
# ==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/common.env.sh"

log_info "Ejecutando comprobaciones de salud en ${REMOTE_HOST}..."

# 1. Backend Health
log_info "1. Comprobando Backend API (http://${REMOTE_HOST}:${PROD_BACKEND_PORT}/api/health)..."
if curl -sf "http://${REMOTE_HOST}:${PROD_BACKEND_PORT}/api/health" >/dev/null 2>&1; then
    log_success "Backend API responde OK."
else
    log_error "Backend API no responde en el puerto ${PROD_BACKEND_PORT}."
fi

# 2. Worker Health
log_info "2. Comprobando Worker Service (http://${REMOTE_HOST}:${PROD_WORKER_PORT}/health)..."
if curl -sf "http://${REMOTE_HOST}:${PROD_WORKER_PORT}/health" >/dev/null 2>&1; then
    log_success "Worker API responde OK."
else
    log_warn "Worker API no responde aún en el endpoint /health (puede estar arrancando o ejecutando sync inicial)."
fi

# 3. Frontend
log_info "3. Comprobando Frontend Web (http://${REMOTE_HOST}:${PROD_FRONTEND_PORT})..."
FRONT_HTTP=$(curl -s -o /dev/null -w "%{http_code}" "http://${REMOTE_HOST}:${PROD_FRONTEND_PORT}" || echo "failed")
if [ "$FRONT_HTTP" = "200" ] || [ "$FRONT_HTTP" = "307" ] || [ "$FRONT_HTTP" = "308" ]; then
    log_success "Frontend responde con código HTTP ${FRONT_HTTP}."
else
    log_error "Frontend reportó código HTTP inesperado: ${FRONT_HTTP}."
fi

# 4. Servidor de Imágenes Nginx
log_info "4. Comprobando servidor de imágenes Nginx (http://${REMOTE_HOST}:${PROD_NGINX_PORT})..."
if curl -sI "http://${REMOTE_HOST}:${PROD_NGINX_PORT}/" >/dev/null 2>&1; then
    log_success "Servidor Nginx de imágenes responde en el puerto ${PROD_NGINX_PORT}."
else
    log_error "Nginx no responde en el puerto ${PROD_NGINX_PORT}."
fi

# 5. Estado de Contenedores
log_info "5. Estado de salud general de los contenedores:"
run_ssh "docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' | grep '^mtg-utils-'"

log_success "Comprobación de salud completada."
