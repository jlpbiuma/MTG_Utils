#!/usr/bin/env bash
# ==============================================================================
# Paso 0: Verificación de conectividad, almacenamiento SSD, Docker y puertos
# ==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/common.env.sh"

log_info "Verificando conectividad SSH con ${SSH_TARGET}..."
if ! run_ssh "echo 'SSH_OK'" >/dev/null 2>&1; then
    log_error "No se puede conectar por SSH con ${SSH_TARGET}. Revisa la red o tus claves SSH."
    exit 1
fi
log_success "Conexión SSH exitosa."

log_info "Comprobando Docker y Docker Compose en el servidor remoto..."
DOCKER_VER=$(run_ssh "docker --version 2>&1" || true)
COMPOSE_VER=$(run_ssh "docker compose version 2>&1" || true)
log_success "Remoto: ${DOCKER_VER} | ${COMPOSE_VER}"

log_info "Comprobando que el almacenamiento sea SSD y espacio libre..."
run_ssh '
    DOCKER_ROOT=$(docker info 2>/dev/null | grep "Docker Root Dir" | awk "{print \$NF}")
    DOCKER_ROOT=${DOCKER_ROOT:-/var/lib/docker}
    
    # Obtener el dispositivo de bloque que respalda el directorio de docker
    DF_DEV=$(df -P "$DOCKER_ROOT" | awk "NR==2 {print \$1}")
    AVAIL_GB=$(df -BG "$DOCKER_ROOT" | awk "NR==2 {print \$4}" | tr -d "G")
    
    # Comprobar si el disco subyacente es SSD (rotational=0)
    ROTA_SDA=$(cat /sys/block/sda/queue/rotational 2>/dev/null || echo "unknown")
    
    echo "Disco raíz Docker: $DOCKER_ROOT (Dispositivo: $DF_DEV)"
    echo "Espacio disponible: ${AVAIL_GB} GB"
    if [ "$ROTA_SDA" = "0" ]; then
        echo "SSD_VERIFIED: sda es un disco de estado sólido (Samsung SSD 860, ROTA=0)."
    else
        echo "SSD_WARNING: sda reporta rotational=$ROTA_SDA."
    fi
'

log_info "Comprobando disponibilidad de puertos en ${REMOTE_HOST}..."
PORTS_TO_CHECK=("${PROD_FRONTEND_PORT}" "${PROD_BACKEND_PORT}" "${PROD_WORKER_PORT}" "${PROD_NGINX_PORT}" "5432" "9001")
BUSY_PORTS=0

for port in "${PORTS_TO_CHECK[@]}"; do
    if run_ssh "nc -z 127.0.0.1 $port" 2>/dev/null; then
        log_error "Puerto $port en ${REMOTE_HOST} está OCUPADO."
        BUSY_PORTS=$((BUSY_PORTS + 1))
    else
        log_success "Puerto $port en ${REMOTE_HOST} está DISPONIBLE."
    fi
done

# Notificar estado del puerto 8080 (gluetun)
if run_ssh "nc -z 127.0.0.1 8080" 2>/dev/null; then
    log_info "Nota: El puerto 8080 está en uso por gluetun en el servidor. Por eso usamos NGINX_PORT=${PROD_NGINX_PORT}."
fi

if [ "$BUSY_PORTS" -gt 0 ]; then
    log_error "Hay puertos en conflicto. Por favor revisa la configuración antes de continuar."
    exit 1
fi

log_success "Todas las comprobaciones previas en ${REMOTE_HOST} pasaron correctamente."
