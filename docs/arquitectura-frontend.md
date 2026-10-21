# Arquitectura del frontend web

Estado actualizado tras la implementación del pipeline de compra: 30 de septiembre de 2026. Alcance: submodulo `frontend/` de este checkout. Este documento describe el codigo ejecutado; el `README.md` de la raiz conserva referencias a una arquitectura anterior.

## Vista general

El frontend es una aplicacion Next.js 16 (App Router), React 19 y TypeScript. Las rutas viven en `frontend/src/app/`; los componentes de pantalla y dialogos, en `frontend/src/components/`; las Server Actions, en `frontend/src/actions/`; y los contratos y utilidades, en `frontend/src/lib/`. Tailwind CSS 4 define los estilos globales y los controles reutilizables de `components/ui/` se apoyan en Radix. `package.json` contiene los comandos de desarrollo, build, lint y Vitest. Es un submodulo Git: sus cambios tienen historial independiente de la raiz.

```text
Navegador
  -> App Router: pagina y layouts (Server Components por defecto)
  -> vista interactiva (Client Component, cuando procede)
  -> Server Action o /api/* de Next
  -> backendFetch -> API FastAPI -> PostgreSQL / worker / catalogo
```

La mayoria de las paginas de datos usan `dynamic = "force-dynamic"` y consultan el backend en el servidor antes de renderizar la vista interactiva. Esas vistas reciben datos iniciales y gestionan despues filtros, dialogos, refrescos y mutaciones. `/collection/expansions` delega la carga inicial en su componente cliente. Las acciones suelen llamar a `revalidatePath` tras mutaciones y algunas vistas llaman a `router.refresh()`.

## Composicion y navegacion

`src/app/layout.tsx` envuelve todas las paginas con `Navbar`, `EnrichmentProgressBanner`, el area principal y un pie. Define metadatos, idioma espanol y fuentes Geist. `src/app/collection/layout.tsx` anade las pestañas de coleccion a sus subrutas. `src/app/error.tsx` ofrece reintento y enlaces de salida ante errores; mazos y coleccion tienen `loading.tsx` propios.

La barra superior (`components/navbar.tsx`) enlaza a **Mazos**, **Colección** y **Comprar**, con búsqueda Cmd/Ctrl+K y acceso a cuenta. `SectionNav` ofrece las mismas tres secciones en una barra inferior móvil. El logo lleva a `/decks`. Cardmarket es el único proveedor que utiliza el frontend; no se carga ni se guarda una preferencia de mercado.

## Mapa de rutas de interfaz

| URL | Vista y comportamiento |
| --- | --- |
| `/decks` | `DeckListView` y recomendaciones EDHREC. Mis mazos, Archivados y Descubrir con `?tab=`; checklist para empezar o retomar. |
| `/decks/[id]` | `DeckDetailView`: Lista/Editar con `?mode=`, mainboard/sideboard, faltantes y gráfico de valor a 30 días. |
| `/decks/[id]/analytics` | Analítica y mulligan, funciones con objetivos guardados y diagnóstico coherente de maná. |
| `/decks/[id]/edhrec` | Recomendaciones para el mazo. |
| `/decks/recommendations/[slug]` | Lista EDHREC en lectura. |
| `/collection/inventory` | `CollectionView`: inventario, estadísticas compactas, importación, filtros y versiones. |
| `/collection/expansions` | `ExpansionsView` y `AcquisitionLots`: Mis expansiones/Todas, detalle `?set=`, lotes, asignación, índice y cartas. |
| `/buy/needs` | `PrioritiesView`: déficit por mazo, selección múltiple y añadido idempotente a Wants. |
| `/buy/list` | `WantsView`: lista de compra, exportación Cardmarket, tendencias y traslado a colección. |
| `/buy/offers` | `SimulatedCollectionsTab` y `OfferControls`: pegar tabla del vendedor, comparación y confirmación con lote. |
| `/buy/budget` | `GoldenWantsTab`: presupuesto, carrito, añadido masivo y enlaces a mazos afectados. |
| `/buy/opportunities` | `WhatsAppMatchesView`: ofertas y demandas externas. |
| `/account`, `/login` | Cuenta, sesión y acceso demo. |

`/` redirige a `/decks`; `/collection` a inventario y `/buy` a Necesito. Las rutas antiguas `/priorities`, `/priorities/golden-wants`, `/wants`, `/matches`, `/expansions`, `/collection/simulated`, `/collection/value-history`, `/collection/dormant`, `/prices` y `/decks/[id]/editor` redirigen a sus sustitutas. Las pantallas antiguas se conservan como componentes; no forman parte de la navegación principal.

Los layouts de Colección y Comprar mantienen sus enlaces internos. `DeckTabPage` sigue resolviendo las subrutas de mazo con `getDeckDetail(id)`. Los filtros principales se sincronizan con la URL a través de `hooks/use-query-state.ts`, usando History API sin pedir una navegación de servidor por cada cambio local.

## Componentes y estado de pantalla

Los componentes `*-view.tsx` son los contenedores de cada area. Mantienen estado de interaccion y componen piezas reutilizables: `CardSearchDialog`, `CardDetailDialog`, `PricingProviderSelector`, `CardSortingBar`, `PriceFilter`, `ExportListDialog`, `CardImage`, `ManaCost` y los controles de `components/ui/`. Los dialogos de crear, editar, importar y borrar mazos encapsulan esos flujos. `CardDetailDialog` tiene pestañas locales **Versiones**, **Legalidad**, **Precios**, **Rulings** y **Mi Colección**; puede abrirse desde varias areas sin ruta propia.

En coleccion y Wants, la pagina aporta estadisticas y, cuando corresponde, una consulta inicial; el componente cliente vuelve a llamar a las acciones al cambiar busqueda, orden o agrupacion. El listado se pagina y se filtra entre datos de servidor y controles locales segun la vista. En mazos, `DeckDetailView` concentra estados de cartas, asignaciones, board y dialogos. `TabErrorBoundary` aisla errores del editor, analitica y EDHREC. `simulated-collections-tab.tsx` concentra el flujo de analisis y comparacion de simulaciones.

Las búsquedas, orden y agrupación de las vistas principales usan parámetros de URL; la selección de expansión usa `?set=`, las pestañas de mazos `?tab=` y Lista/Editar `?mode=`. Los diálogos y algunas vistas internas conservan estado local.

## Datos, autenticacion e integraciones

- `actions/*.ts` es la capa de operaciones del frontend. Los archivos se agrupan por dominio: `auth`, `decks`, `collection`, `wants`, `priorities`, `simulated-collections`, `expansions`, `pricing`, `edhrec`, `scryfall`, `import` y `whatsapp-matches`. Son funciones de servidor usadas tanto al renderizar paginas como desde componentes cliente. Los DTO y contratos web estan en `lib/schemas.ts` y en los tipos exportados por varias acciones.
- `lib/api-client.ts` centraliza `backendFetch`. Elige `BACKEND_URL`, despues `NEXT_PUBLIC_BACKEND_URL` y finalmente `http://localhost:8000`; envia JSON, `X-User-Id` cuando se indica y, en servidor, la cookie `mtg_token` como Bearer. Si no se especifica cache o revalidacion, usa `no-store`. Los errores HTTP se propagan.
- `actions/auth.ts` gestiona `mtg_token`, `mtg_refresh_token`, `mtg_user_id` y `mtg_user_email`, el acceso invitado y el cierre de sesion. `getCurrentUserId()` tiene fallback demo/de desarrollo. La autoridad sobre usuarios y datos persistentes reside en FastAPI; no asumir autenticacion Supabase por dependencias residuales de `package.json`.
- `app/api/prices/route.ts` acepta POST para resumen de precios de un mazo, la coleccion o una lista de cartas. `app/api/scryfall/search/route.ts` expone GET de busqueda y consulta FastAPI con preferencia por catalogo local. `app/api/worker/enrich/route.ts` expone GET/POST para enriquecimiento pendiente. Este ultimo usa `lib/worker.ts` y `lib/prisma.ts` para acceder a PostgreSQL desde Next: es una excepcion a la ruta habitual por FastAPI, no un servicio de worker independiente.
- `lib/pricing/` contiene adaptadores y tipos para Cardmarket, CardTrader y MTGGoldfish, asi como cache de cotizaciones. Las acciones de `pricing.ts` obtienen resumenes, movimientos e historicos. `components/pricing-summary.tsx` muestra el resumen de Cardmarket sin controles para cambiar de proveedor o actualizar precios manualmente. Las acciones normalizan las peticiones a Cardmarket, incluso si reciben un valor de proveedor antiguo; las cotizaciones locales usan EUR y no toman precios de CardTrader como sustituto.
- `lib/card-utils.ts`, `sorting.ts`, `want-filters.ts`, `deck-analytics.ts`, `golden-wants-solver.ts`, `parser.ts` y `simulated-card-list.ts` contienen calculos y transformaciones de interfaz/dominio. `CardImage` y `lib/image-loader.ts` resuelven imagenes; los datos base proceden del catalogo/backend y de su infraestructura de imagenes.

## Donde ampliar la aplicacion

Para una sección principal nueva, crear su ruta y vista y actualizar `SectionNav`; para una pestaña de compra, actualizar `BuyTabNav`. Si necesita datos, anadir las operaciones al archivo de acciones del dominio o a uno nuevo y usar `backendFetch`; mantener los contratos alineados con los esquemas FastAPI. Para una pestaña enlazable, seguir el patron de subrutas y layout de coleccion o el de `DeckTabPage`; para un cambio puramente local, seguir las pestañas Radix. Las pruebas estan en `frontend/tests/` (componentes, API, librerias y unidades); ejecutar `npm test` para el comportamiento afectado y `npm run lint`/`npm run build` si cambia la integracion general.

## Fuentes principales

- Rutas y composicion: `frontend/src/app/`, `frontend/src/components/navbar.tsx`, `frontend/src/components/collection-tab-nav.tsx`.
- Pestañas y flujos: `frontend/src/app/decks/page.tsx`, `frontend/src/app/decks/[id]/deck-tab-page.tsx`, `frontend/src/components/deck-detail-view.tsx`, `frontend/src/components/collection-view.tsx`, `frontend/src/components/priorities-view.tsx`, `frontend/src/components/whatsapp-matches-view.tsx`.
- Datos y contratos: `frontend/src/actions/`, `frontend/src/lib/api-client.ts`, `frontend/src/lib/schemas.ts`, `frontend/src/app/api/`.
- Dependencias y validacion: `frontend/package.json`, `frontend/tests/`.

## Datos del pipeline de compra

`actions/purchases.ts`, `preferences.ts` y `search.ts` añaden lotes, rendimiento, ofertas, preferencias, búsqueda y objetivos de funciones. FastAPI conserva la autoridad sobre transacciones y aislamiento por usuario. Los esquemas Prisma del frontend, backend y worker incorporan las tablas compartidas, con sus propios generadores.

La confirmación de ofertas reutiliza el parser y realiza inventario, Wants y lote en una sola transacción idempotente. El worker deriva índices semanales de `cm_price_history` con cohorte fija y definición versionada. No se inventan precios ausentes ni se reconstruyen entradas y salidas históricas del inventario.

Las garantías, diagnóstico, interpretación de ROI y pasos de activación están en [implementación del pipeline](implementacion-pipeline-compra.md).

## Barras comunes de opciones y filtros

Las vistas de listado utilizan `components/view-toolbar.tsx`: `ViewToolbar` distribuye búsqueda, filtros, ordenación, vista/agrupación y acciones en ese orden. La fila se envuelve al agotarse el ancho disponible; los grupos conservan sus etiquetas, sin ocultar opciones o recortar controles en móvil. `ToolbarSearch`, `ToolbarChoices`, `ToolbarSort` y `ToolbarToggle` proporcionan el mismo estilo, estados `aria-pressed`, foco visible y controles de al menos 44 px.

Mazos, inventario, Wants, Necesito, listados y cartas de ofertas, expansiones, recomendaciones EDHREC, Golden Wants y oportunidades comparten esta composición, con criterios adecuados a sus datos. `CardSortingBar` delega la ordenación en `ToolbarSort`. Los filtros siguen visibles al obtener cero resultados. Los periodos del histórico, las opciones de rendimiento y los formularios de lotes usan botones en lugar de selects. La ordenación de ofertas incluye ambas direcciones en ganancia y cantidad.

La misma composición se aplica también al editor de mazos, su selector de modo, el solapamiento, el crecimiento de mazos de una oferta, la curva de maná, los movimientos de precios, el valor de la colección y los históricos de cartas/versiones. Las búsquedas de cartas y de candidatos a comandante mantienen sus funciones propias dentro de la barra. Crear, editar e importar mazos muestran todos los formatos mediante `ToolbarChoices`, sin enviar el formulario al cambiar la opción. En el editor, la búsqueda de cartas existentes es independiente de la búsqueda para añadir cartas; los filtros y la ordenación se conservan entre lista y cuadrícula. El rendimiento por carta permite buscar y ordenar, dejando los precios ausentes al final. No se usan selects en `frontend/src/`.

Las vistas consultan los precios e históricos disponibles y la actualización periódica sigue a cargo de los procesos automáticos. Se han retirado los botones de actualizar precios y sincronización semanal, la recarga manual del gráfico de colección y las acciones que lanzaban el worker desde esos controles. `/api/prices` no admite forzar el refresco: ignora los antiguos campos `bypassCache` y `forceRefresh`, y las Server Actions no exponen ese parámetro. Cambiar el periodo de un gráfico sigue consultando el histórico correspondiente, sin iniciar una sincronización.
