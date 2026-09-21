# ==============================================================================
# Makefile - MTG Utils Despliegue Continuo (CD) y Operaciones en Producción
# ==============================================================================

SHELL := /usr/bin/env bash

# Servidor remoto por defecto
REMOTE_HOST ?= 192.168.0.4
REMOTE_USER ?= icedeal
REMOTE_DIR  ?= /home/icedeal/compose/mtg-utils

.PHONY: help check-remote prepare-env sync-code remote-build init-db \
        sync-catalog sync-media start-services verify migrate-db deploy-full \
        deploy-update status remote-logs remote-down

help:
	@echo ""
	@echo "🎴 MTG Utils - Gestión de Despliegue en Producción ($(REMOTE_HOST))"
	@echo "=================================================================="
	@echo "Comandos de comprobación y estado:"
	@echo "  make check-remote     - Comprueba conectividad SSH, disco SSD y puertos libres"
	@echo "  make status           - Consulta el estado de los contenedores remotos y recursos"
	@echo ""
	@echo "Comandos paso a paso ('Poco a Poco'):"
	@echo "  make prepare-env      - Genera los archivos .env de producción"
	@echo "  make sync-code        - Sincroniza código fuente con $(REMOTE_HOST) (rsync)"
	@echo "  make remote-build     - Compila las imágenes en el servidor remoto (x86_64)"
	@echo "  make init-db          - Levanta servicios base e inicializa esquema Prisma"
	@echo "  make migrate-db       - Aplica migraciones Prisma (generate + db push) en remoto"
	@echo "  make sync-catalog     - Migra datos del catálogo (12 tablas, sin datos de usuario)"
	@echo "  make sync-media       - Migra 4.4 GB de imágenes y artes de MinIO"
	@echo "  make start-services   - Arranca todos los servicios y el worker en producción"
	@echo "  make verify           - Ejecuta pruebas de salud sobre todos los servicios"
	@echo ""
	@echo "Flujos de despliegue completos:"
	@echo "  make deploy-full      - Ejecuta la migración inicial completa paso a paso"
	@echo "  make deploy-update    - CD habitual: sync, build, migraciones, reinicio y verify"
	@echo "  make remote-logs      - Muestra los logs en vivo de los contenedores remotos"
	@echo "  make remote-down      - Detiene los contenedores de producción"
	@echo "=================================================================="
	@echo ""

check-remote:
	@./scripts/deploy/00_check_remote.sh

prepare-env:
	@./scripts/deploy/01_prepare_env.sh

sync-code: prepare-env
	@./scripts/deploy/02_sync_code.sh

remote-build:
	@./scripts/deploy/03_remote_build.sh

init-db:
	@./scripts/deploy/04_init_database.sh

migrate-db:
	@./scripts/deploy/09_migrate_database.sh

sync-catalog:
	@./scripts/deploy/05_migrate_catalog.sh

sync-media:
	@./scripts/deploy/06_migrate_media.sh

start-services:
	@./scripts/deploy/07_start_services.sh

verify:
	@./scripts/deploy/08_verify_health.sh

deploy-full: check-remote prepare-env sync-code remote-build init-db sync-catalog sync-media start-services verify
	@echo ""
	@echo "🎉 ¡Migración y despliegue inicial completados con éxito en http://$(REMOTE_HOST):3000 !"

deploy-update: sync-code remote-build migrate-db start-services verify
	@echo ""
	@echo "🚀 ¡Actualización continua (CD) completada exitosamente!"

status:
	@ssh -o BatchMode=yes $(REMOTE_USER)@$(REMOTE_HOST) "cd $(REMOTE_DIR) 2>/dev/null && docker compose ps; echo ''; echo '--- Almacenamiento SSD ---'; df -h /var/lib/docker"

remote-logs:
	@ssh -t $(REMOTE_USER)@$(REMOTE_HOST) "cd $(REMOTE_DIR) && docker compose logs -f --tail=100"

remote-down:
	@ssh -o BatchMode=yes $(REMOTE_USER)@$(REMOTE_HOST) "cd $(REMOTE_DIR) && docker compose down"
