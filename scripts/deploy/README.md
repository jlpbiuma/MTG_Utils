# Despliegue y migraciones

`make deploy-full` comprueba el servidor, sincroniza el código, compila imágenes,
levanta la infraestructura, aplica migraciones versionadas, arranca los servicios
y verifica su salud. Los pasos se ejecutan en orden incluso con `make -j`.

La única actualización del esquema durante el despliegue es
`uv run prisma migrate deploy`, ejecutada en un contenedor temporal del backend.
El arranque normal del backend solo ejecuta la API. No ejecuta `db push`, scripts
SQL de mantenimiento ni importaciones. `deploy-full` no invoca `sync-catalog` ni
`sync-media`; esos objetivos son operaciones manuales independientes.

Si una migración falla, el despliegue se detiene antes de arrancar los nuevos
servicios. No hay un fallback a `db push --accept-data-loss`, reset ni baseline
automático. Las migraciones SQL versionadas deben revisarse y debe conservarse
un respaldo antes de aplicarlas: usar migraciones no convierte cualquier SQL en
una operación sin pérdida de datos.

## Bases existentes e inicialización

`backend/prisma/migrations/0_init` crea las 26 tablas del esquema actual en una
base vacía. Los tres SQL incrementales anteriores, que no tenían historial
registrado en las bases existentes, se conservan en `backend/prisma/legacy_migrations`.

Para una base existente que devuelve P3005, después de sincronizar el código:

```bash
make baseline-db
make migrate-db
make start-services
make verify
```

`baseline-db` compara el esquema remoto con la instantánea inmutable
`migrations/0_init/schema.prisma`. Solo si no hay diferencias ejecuta
`prisma migrate resolve --applied 0_init`: registra el historial de Prisma sin
ejecutar el SQL de creación ni cambiar las tablas de la aplicación. Si hay
diferencias o falla la conexión, se detiene antes de registrar la migración.
No se ejecuta automáticamente en `deploy-full` ni debe repetirse tras adoptarlo.

Una base local antigua con tablas ausentes no superará esta comprobación:
necesita una migración de reconciliación revisada, no un baseline forzado.
No modificar la instantánea de `0_init` al añadir futuras migraciones.
Los SQL auxiliares de `backend/prisma/` tampoco se ejecutan automáticamente:
futuros cambios deben incorporarse a migraciones versionadas.

## Validación local sin acceder al servidor

```bash
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s scripts/deploy/tests -v
bash -n scripts/deploy/04_init_database.sh scripts/deploy/09_migrate_database.sh
```
