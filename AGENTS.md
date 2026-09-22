# MTG Utils — Guía para agentes

## Producto y fuentes de verdad

MTG Utils permite gestionar mazos y colecciones físicas de Magic: The Gathering,
comparar cartas disponibles y faltantes, asignar copias a mazos, importar listas,
gestionar deseos y prioridades, simular colecciones y consultar precios y
recomendaciones de EDHREC. Tiene una interfaz web y una aplicación SwiftUI que
comparten una API y un catálogo local enriquecido desde fuentes externas.

El `README.md` raíz conserva instrucciones de una arquitectura anterior (Next.js
15, Supabase y código en la raíz). Contrasta sus indicaciones con
`docker-compose.yml`, los manifiestos de cada submódulo y el código ejecutado.
Actualmente el frontend declara Next.js 16 y React 19; la autenticación principal
está implementada en el backend con PostgreSQL y sesiones propias.

## Repositorios y responsabilidades

La raíz contiene la orquestación Docker, scripts de despliegue y cuatro
**submódulos Git**, cada uno con su propio historial y dependencias:

| Directorio | Responsabilidad y puntos de entrada |
| --- | --- |
| `frontend/` | Next.js App Router, TypeScript, Tailwind y componentes Radix/shadcn. Páginas en `src/app/`, UI en `src/components/`, Server Actions en `src/actions/`, cliente HTTP en `src/lib/api-client.ts`. |
| `backend/` | API FastAPI, Python 3.12+, Pydantic y Prisma Python asíncrono. Entrada `src/main.py`; rutas en `src/routers/`, contratos en `src/schemas/`, lógica de negocio en `src/services/`, configuración/DB/autenticación en `src/core/`. |
| `worker/` | Servicio unificado de catálogo, imágenes, precios y reglas. Entrada `src/main.py`; sincronización en `src/worker.py`, cola en `src/priority_queue.py`, integraciones en `src/services/`. |
| `frontend_swift/` | Aplicación SwiftUI. Código en `mtg-utils/` organizado en `Views`, `ViewModels`, `Models`, `Services` y `Utilities`; estado compartido en `AppStore.swift`; pruebas en `mtg-utilsTests/`. |
| `docker/`, `scripts/deploy/` | Infraestructura de imágenes, Tor y operación del servidor remoto. El `Makefile` raíz es de despliegue, no de pruebas locales. |

Antes de editar, revisa `git status --short` tanto en la raíz como en los
submódulos afectados. Conserva cambios ajenos. Si faltan submódulos, usa
`git submodule update --init --recursive` para obtener las revisiones registradas.
No actualices sus ramas remotas como parte de una tarea no relacionada. Si se
solicitan commits, registra primero los cambios del submódulo y después su
referencia en el repositorio raíz.

Hay copias anidadas de código en `backend/src/src/...`. El arranque desde
`backend/` usa `src.main` y el árbol directo `backend/src/`. Comprueba los imports
y el directorio de ejecución antes de editar; no propagues cambios a todas las
copias ni las elimines como limpieza incidental.

## Cómo circulan los datos

- La web invoca Server Actions, que usan `backendFetch` para llamar a `/api/*`
  del backend. El cliente transmite las cookies de sesión como Bearer token y,
  cuando corresponde, `X-User-Id`. Swift utiliza `BackendClient` y
  `BackendDataStore`. Mantén compatibles los contratos Pydantic, TypeScript y
  Swift cuando cambies una respuesta o petición.
- El backend gestiona los datos de usuario y consulta el catálogo local;
  coordina con el worker las solicitudes de enriquecimiento. Las integraciones
  también tienen rutas de consulta externa: revisa cada flujo antes de asumir
  que todo acceso a Scryfall pasa por el worker.
- El worker comparte PostgreSQL con el backend. Ejecuta sincronización periódica
  de sets, precios y reglas, además de la cola persistente de enriquecimiento y
  el cargador de datos bulk de Scryfall. También integra precios de MTGJSON.
  No introduzcas servicios separados de sets, precios o reglas sin una necesidad
  explícita: esas tareas ya viven en `worker/`.
- Las imágenes originales se almacenan en MinIO; imgproxy genera derivados
  mediante URLs firmadas y Nginx los sirve con caché. Reutiliza los resolvers y
  loaders existentes. `PUBLIC_IMAGE_BASE_URL` debe ser accesible desde el cliente;
  los nombres internos de Docker no lo son.
- La autenticación actual está en `backend/src/services/auth_service.py` y
  `backend/src/core/auth.py`, con modo demo y compatibilidad con cabeceras de
  desarrollo. No presupongas validación JWT/Supabase ni aislamiento mediante RLS.
  Conserva el filtrado por usuario en los servicios al modificar consultas.

## Reglas del dominio y persistencia

- Distingue una carta del catálogo (`CardCatalog`) de una impresión concreta
  (`CardPrinting`, set y número de coleccionista). Reutiliza la normalización y
  resolución existentes; no intercambies IDs del catálogo y de impresiones.
- Inventario, cantidad requerida y cantidad asignada a un mazo son conceptos
  distintos. Respeta variantes foil/no foil, mainboard/sideboard, comandantes,
  mazos archivados y colecciones simuladas. Antes de cambiar completitud o
  asignaciones, consulta sus pruebas, incluidos los casos de tierras básicas y
  equivalencia entre reimpresiones.
- Hay esquemas Prisma en `backend/prisma/schema.prisma`,
  `worker/prisma/schema.prisma` y `frontend/prisma/schema.prisma`. No son copias
  idénticas: Python y JavaScript usan generadores distintos y algunos modelos
  difieren. Para cambios de tablas compartidas, revisa los tres consumidores,
  actualiza los modelos afectados y regenera los clientes correspondientes.
- Revisa las migraciones y SQL auxiliares de `backend/prisma/` antes de cambiar
  persistencia o importación. El backend solo arranca la API; las migraciones
  versionadas se aplican explícitamente mediante `make migrate-db` con
  `prisma migrate deploy`. No reintroduzcas `db push --accept-data-loss` en el
  arranque. `deploy-full` no importa ni vacía el catálogo. La migración `0_init`
  crea el esquema completo en bases vacías; `make baseline-db` permite registrar
  una base existente solo si coincide con su esquema. Revisa
  `scripts/deploy/README.md` antes de establecer un baseline.
- Conserva los límites, reintentos y tratamiento de HTTP 429 del cliente Scryfall
  del worker. Las pruebas ordinarias deben usar mocks; los benchmarks live y las
  sincronizaciones masivas son operaciones independientes.

## Desarrollo y validación

Ejecuta cada comando desde el directorio indicado; no hay `package.json` raíz.

| Ubicación | Preparación y ejecución | Validación |
| --- | --- | --- |
| `frontend/` | `npm ci`; `npm run dev` | `npm test`, `npm run lint`, `npm run build` según el alcance. El build también genera Prisma. |
| `backend/` | `uv sync --locked`; `uv run prisma generate`; `uv run uvicorn src.main:app --reload --port 8000` | `uv run pytest`; puedes seleccionar un archivo de `tests/`. |
| `worker/` | `uv sync --locked`; `uv run prisma generate`; `uv run python -m src.main` | `uv run pytest`; revisa configuración antes de arrancarlo, porque puede sincronizar al inicio. |
| Raíz, Swift | Proyecto `frontend_swift/mtg-utils.xcodeproj`, scheme `mtg-utils` | Usa `xcodebuild -project frontend_swift/mtg-utils.xcodeproj -scheme mtg-utils -showdestinations` y ejecuta `test` con un destino disponible. |

Las pruebas de integración PostgreSQL de backend y worker requieren
`MTG_TEST_DATABASE_URL`; sin esa variable se omiten. Apúntala a una base aislada
de pruebas e informa de las pruebas omitidas. No presentes un healthcheck como
prueba de funcionamiento completo de la base de datos o de la sincronización.

Para desarrollo con Docker, consulta `docker-compose.yml` y prepara los archivos
de entorno que referencia: `.env`, `backend/.env` y `frontend/.env`, usando las
plantillas disponibles sin sobrescribir configuraciones existentes. Los puertos
por defecto son web `3000`, API `8000` (`/api/health`, `/docs`), worker `8001`
(`/health`, `/status`), PostgreSQL `5432`, imágenes `8080` y consola MinIO `9001`.
Usa `docker compose ps` y `docker compose logs --tail=100 <servicio>` para
diagnosticar. En Swift, la URL del backend se resuelve en `AppConfiguration`
mediante `UserDefaults`, `Info.plist` y un fallback; comprueba accesibilidad desde
el dispositivo físico al cambiar URLs.

Ejecuta las pruebas relacionadas con el comportamiento modificado y
`git diff --check` en cada repositorio afectado. Para cambios solo de
documentación, verifica rutas, comandos y el diff sin levantar servicios.
Comunica qué se comprobó y qué quedó sin verificar.

## Entorno, despliegue y skills

- No incluyas valores privados de `.env` o `.env.production` en respuestas,
  código o commits. Las credenciales de DB, MinIO y firmas imgproxy pertenecen al
  servidor; no deben exponerse mediante `NEXT_PUBLIC_*`.
- Los objetivos `make deploy-*`, `sync-*`, `migrate-db` y `remote-*` operan sobre
  un servidor remoto. Úsalos solo dentro de una solicitud de despliegue u
  operación que los autorice, no como checks de un cambio local.
- Las skills del proyecto se registran en `skills-lock.json` y se instalan en
  `.agents/skills/`. Para restaurarlas: `npx skills experimental_install`. Este
  comando puede actualizar hashes si cambió el contenido de origen; revisa el
  diff del lock. Lee el `SKILL.md` de las skills pertinentes antes de aplicarlas.
- Conserva el bloque de Next.js que sigue. En este repositorio, busca sus guías
  en `frontend/node_modules/next/dist/docs/`. Si faltan o el directorio está
  vacío, consulta la documentación oficial de la versión instalada antes de
  cambiar APIs del framework; no des por válida la guía del README antiguo.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
