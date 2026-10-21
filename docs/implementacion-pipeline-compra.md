# Pipeline de compra y rendimiento por expansión

Implementación local del 30 de septiembre de 2026. Referencias: [plan original](plan-mejoras-frontend.md) y [arquitectura web](arquitectura-frontend.md). No se ha desplegado ni se ha aplicado la migración en la base de la aplicación.

## Diagnóstico de las hipótesis

- **Histórico:** el worker ya conserva precios diarios de impresiones y acabados en `cm_price_history`, alimentados por MTGJSON, para el catálogo consultado por su job. No se ha creado una tabla de snapshots duplicada. El índice derivado semanal solo sigue ediciones con inventario o lotes.
- **Adquisición:** `CollectionCard.acquiredAt` ya existe. El asistente usa edición y fechas como propuesta; exige cantidades y confirmación explícita. No modifica automáticamente la procedencia del inventario anterior.
- **Expansiones a cero:** la agregación anterior mezclaba resolución de identidad y consultas correlacionadas del inventario. Se resuelve la impresión una vez, se agregan precios y cantidades, se distingue foil y se cuenta el catálogo realmente disponible. Un catálogo sin cotizaciones o una consulta fallida se representa como valor no disponible, en lugar de afirmar 0 €. No se ha atribuido a todos los ceros de producción una única causa sin comprobar su base.
- **Funciones y `otag:`:** las etiquetas del Tagger no están importadas en el catálogo actual. Se usa texto Oracle y producción de maná del bulk local, más etiquetas manuales existentes. Son estimaciones visibles, con objetivos editables y guardados por mazo. No se añade una consulta externa por carta.
- **Pruebas:** existen suites frontend/backend/worker. Se añaden pruebas de navegación móvil, compra y clasificación, y seis escenarios con PostgreSQL real y temporal.

## Modelo y garantías

`AcquisitionBatch` representa una adquisición con coste y envío separados, fecha, moneda y edición opcional. `AcquisitionBatchItem` registra cantidades por impresión y acabado. Se utiliza una relación de cantidades en vez de una FK única en inventario: una misma fila de inventario puede acumular copias procedentes de varias compras. Borrar un lote manual no borra cartas. Los lotes de compras confirmadas conservan la trazabilidad.

Las ofertas reutilizan `SimulatedCollection` y su parser: vendedor, enlace, envío, precio pagado y estado `evaluating`, `discarded` o `purchased`. Confirmar exige una impresión exacta y ejecuta en una transacción el incremento del inventario, la reducción de Wants y la creación del lote. El bloqueo de la oferta hace que repetir o confirmar simultáneamente la misma compra no duplique cartas. Las ofertas compradas quedan protegidas frente a nuevas mutaciones.

La asignación bloquea lote e inventario, respeta la cantidad disponible y permite corregir asignaciones. Las consultas de usuario, mazos, preferencias y lotes mantienen el filtro de propietario.

## Interpretación del rendimiento

- Índice Cardmarket versión 1: cohorte fija de impresiones no promocionales de ediciones físicas de producto, con primera cotización posterior a la salida mayor de 0,25 €. La cohorte se congela después de generar el primer índice. Si el catálogo bulk identifica una impresión como promocional, se excluye.
- Base 100: primera observación disponible desde la salida. Si falta el precio de lanzamiento, no se inventa ni se etiqueta como observado ese día. La fecha base se entrega en la API.
- Puntos semanales: última cotización disponible para cada impresión hasta esa fecha, con cobertura completa. No representan el día exacto de una caída.
- Lotes: la curva necesita precios completos en la fecha de adquisición. La serie del inventario revaloriza la composición **actual**, normalizada en su primera observación completa; no reconstruye compras y ventas históricas.
- Valor de mercado y valor vendible se muestran separados. Vendible aplica el umbral de 0,25 €; no descuenta comisiones ni garantiza ventas. ROI requiere inversión positiva, moneda EUR, cartas asignadas y cotizaciones completas. No se convierten monedas implícitamente.
- Un lote puede contener varias ediciones; cuando se muestra desde una de ellas, su resumen corresponde al lote completo. Se puede editar desde cualquier edición con cartas asignadas.
- El histórico e índice de rendimiento utilizan Cardmarket porque es la fuente histórica disponible. La preferencia global se aplica a las pantallas que admiten los tres proveedores.

## Pantallas y contratos

La navegación principal es Mazos / Colección / Comprar, con barra inferior móvil. Comprar contiene Necesito, Lista de compra, Evaluar oferta y Golden Wants. Oportunidades se integra en Evaluar oferta. Las rutas anteriores redirigen y los componentes antiguos permanecen disponibles en el código. Los filtros principales usan `q`, `sort`, `direction`, `group`; el detalle de expansión usa `set`, los mazos `tab` y el editor `mode`. La búsqueda Cmd/Ctrl+K consulta catálogo, mazos propios y secciones.

Necesito y Golden Wants añaden selecciones a Wants mediante una operación masiva idempotente. Las ofertas muestran directamente métricas y cartas. Cardmarket añade datos de compra, envío, comparación de mercado e histórico. Venta presencial utiliza siempre la tendencia de la edición elegida, sin envío, también al incorporar una selección al inventario. El parser sigue aceptando los formatos anteriores con cualquier origen. La exportación de Wants destaca Cardmarket. Los mazos combinan Lista/Editar, reúnen acciones de faltantes, muestran un gráfico de 30 días y permiten editar objetivos de funciones. La guía de onboarding permite marcar pasos y guarda su avance por usuario en ese navegador.

El cálculo de maná considera tierras multicolor y rocas disponibles antes del turno objetivo. El umbral es un modelo hipergeométrico de probabilidad del 90 %, inspirado en Karsten: mano de siete, jugando primero, sin mulligans y fuentes disponibles sin retrasos. No se presenta como reproducción de sus tablas. El veredicto general usa los mismos resultados que el panel por colores.

Nuevas operaciones bajo `/api`: `GET/PUT /me/preferences`, CRUD `/acquisition-batches`, candidatos y asignación por lote, `POST/GET /offers`, `PATCH /offers/{id}`, `POST /offers/{id}/confirm`, `POST /wants/bulk`, `GET /search`, `GET /expansions/{code}/performance`, `GET /expansions/{code}/cards`, `GET /decks/{id}/value-history` y `GET/PUT /decks/{id}/function-targets`. El listado de ediciones conserva `/catalog/sets`; la web aplica Mis expansiones/Todas sobre sus estadísticas. Los endpoints de simulaciones se mantienen como compatibilidad y reutilizan el mismo servicio.

## Activación y validación

Migración aditiva: `backend/prisma/migrations/20260930_purchase_pipeline/migration.sql`. Se actualizaron los tres esquemas Prisma consumidores. Al desplegar, aplicar las migraciones mediante el procedimiento existente (`make migrate-db`) y regenerar clientes. No se ha ejecutado ningún objetivo remoto. El worker calcula índices al terminar el job de precios; un fallo del índice se registra sin invalidar la ingestión.

Validación local: suites Vitest, pytest del backend y del worker; TypeScript; build Next con webpack; comparación de ESLint frente a HEAD y `git diff --check` en los repositorios afectados. El proyecto conserva errores de lint previos. Las pruebas PostgreSQL de integración ordinarias se omiten si no existe `MTG_TEST_DATABASE_URL`; las seis nuevas se ejecutaron adicionalmente contra una base temporal local que se eliminó al terminar.

Esas seis pruebas cubren aislamiento por usuario, límites de asignación, rollback, repetición y concurrencia de confirmaciones, cantidades foil, Wants masivo, valoración/histórico, cohorte fija, preferencias, objetivos y privacidad de búsqueda. Se verificó un índice real en PostgreSQL temporal. Quedan pendientes el despliegue, el índice con datos de producción y la comprobación visual en dispositivos reales.
