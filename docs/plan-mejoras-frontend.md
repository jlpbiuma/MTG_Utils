# Plan: pipeline de compra, rendimiento por lanzamiento y mejoras de UX

No he visto el backend, así que lo marcado como **[verificar]** son hipótesis sobre el código que hay que comprobar antes de estimar.

## 1. Decisión clave del modelo: el "lote de adquisición"

Como no todas las expansiones tienen presentación y el coste varía, no conviene modelar "la presentación de una edición". Conviene un **lote de adquisición** (`acquisition_batch`): cualquier compra o evento con un coste. Una edición puede tener 0, 1 o N lotes.

```text
acquisition_batch
  id, user_id, set_code (nullable)
  kind: prerelease | booster_box | bundle | singles | trade | other
  acquired_on, cost_total, shipping, currency, notes
  origin: manual | offer_confirmed   -- "offer_confirmed" viene de Evaluar oferta

collection_item
  + acquisition_batch_id (nullable, FK)   -- qué cartas vinieron de qué lote
```

Esto resuelve varias cosas a la vez:

- **Expansiones sin presentación**: no tienen lote, y la vista solo muestra valor y tendencia, sin ROI.
- **Costes distintos**: el coste es un campo del lote, no de la edición.
- **Compras a vendedores**: al pulsar "Confirmar compra" en Evaluar oferta se crea automáticamente un lote `singles` con el precio pagado más el envío. Así el ROI sirve también para tus compras de Cardmarket.
- **Datos antiguos**: las cartas que ya tienes no tienen lote. Se ofrece un asistente "Asignar cartas a un lote" que propone cartas por edición y rango de fechas de adquisición, que la app ya guarda **[verificar]**. El usuario confirma y no hay migración destructiva.

**Dos bases de tendencia, no una:**
- Índice de la **edición**: normalizado a 100 en la fecha de salida de la edición (la da Scryfall, no depende de que tú asistas).
- Curva de **tu lote**: normalizada a 100 en la fecha de adquisición.

Así la comparación funciona aunque no hubiera presentación.

## 2. Datos de precios

Es el mayor riesgo técnico.

```text
card_price_snapshot   (printing_id, provider, captured_on, price)   -- todo el catálogo
set_price_index       (set_code, provider, captured_on, index_value, n_cards)   -- precalculado
```

- **[verificar]** si hoy el histórico semanal se guarda solo para tu colección o para todo el catálogo. Si es solo tuyo, hay que ampliar el job para las ediciones que te interesen, y empezar cuanto antes, porque el histórico no se puede recuperar hacia atrás. Se puede empezar solo con las ediciones con lote o con cartas tuyas.
- **Definición del índice**: hay que fijarla de forma explícita, porque cambia el resultado. Propuesta: suma de precios de cartas no promocionales con precio mayor a 0,25 €, excluyendo las que no se venden en la práctica. Si no, el "valor total" lo dominan miles de cartas de céntimos.
- **Valor vendible frente a valor de mercado**: ya tienes "Valor vendible" en las simulaciones. Úsalo también en el ROI, porque 60 € de mercado con muchas cartas de céntimos no equivalen a 60 € vendibles.
- La frecuencia semanal muestra la forma de la caída y el rebote, pero no el día exacto.

## 3. API

| Endpoint | Para qué |
| --- | --- |
| `GET /expansions?mine=true&with_stats=true` | Lista con valor total, faltante y en propiedad, más ROI si hay lotes. **Arreglar aquí los 0,00 €.** |
| `GET /expansions/{code}/performance` | Serie del índice, serie de tus cartas, serie por lote, y resumen (inversión, valor, ROI) |
| `GET /expansions/{code}/cards` | Por carta: variación desde salida, diferencia frente al índice, precio actual frente a máximo, mazos que la usan. Filtros: `outperforming`, `lagging`, `unused_in_decks` |
| `CRUD /acquisition-batches` | Crear, editar y borrar lotes |
| `POST /acquisition-batches/{id}/assign` | Asignar cartas (manual o por rango de fechas) |
| `GET /decks/{id}/value-history` | Suma de las cartas del mazo con los mismos snapshots |
| `POST /wants/bulk` | Añadir a la lista de compra las cartas seleccionadas en Necesito y en Golden Wants |
| `POST /offers` · `PATCH /offers/{id}` · `POST /offers/{id}/confirm` | Ver sección 4 |
| `GET/PUT /me/preferences` | Proveedor de precios global y otras preferencias |
| `GET /search?q=` | Buscador global Cmd+K: cartas, mazos y secciones |

Hay que mantener los esquemas de `lib/schemas.ts` alineados con los de FastAPI.

## 4. Evaluar oferta (evolución de Colecciones Simuladas)

Modelo: a la simulación actual se le añade
`status` (evaluando / comprada / descartada), `seller`, `shipping`, `source_url` (opcional).

Veredicto de la oferta:
- Total del vendedor frente al mercado, con diferencia en € y en %.
- Coste total con envío y coste efectivo por carta.
- Cartas marcadas en rojo cuando están por encima de mercado.
- Por carta, cuántos mazos la piden, para aprovechar el envío.
- Botón **Confirmar compra**: añade las cartas a la colección, las quita de la lista de compra y crea el lote `singles`.

La entrada principal es "Pegar tabla del vendedor". El parser ya existe (`parser.ts`, `simulated-card-list.ts`), así que hay que reutilizarlo y no duplicarlo.

## 5. Estructura de navegación y rutas

| Nueva ruta | Vista reutilizada | Notas |
| --- | --- | --- |
| `/decks` | `DeckListView` | Pestañas Mis mazos · Archivados · Descubrir, con `?tab=` sincronizado |
| `/decks/[id]` | `DeckDetailView` | Cartas + Editar fusionadas, Analítica, EDHREC |
| `/collection/inventory` | `CollectionView` | Sin paneles repetidos antes de la primera carta |
| `/collection/expansions` | nueva `ExpansionsPerformanceView` | Lista y detalle con `?set=` |
| `/buy/needs` | `PrioritiesView` | Con selección múltiple |
| `/buy/list` | `WantsView` | |
| `/buy/offers` | `SimulatedCollectionsTab` | |
| `/buy/budget` | `GoldenWantsTab` | |
| `/buy/opportunities` | `WhatsAppMatchesView` | Baja de sección a pestaña |

**Redirects** desde todas las URLs antiguas (`/priorities`, `/wants`, `/expansions`, `/matches`, `/collection/simulated`, etc.). Las pantallas sin uso (Evolución de Valor, Cartas Dormidas, Precios) se redirigen a su sustituto, pero no se borran hasta que el nuevo motor de datos esté validado.

## 6. Cambios de UX por pantalla

**Navbar**: Mazos · Colección · Comprar. A la derecha, el proveedor de precios (global) y un menú de cuenta. En móvil, barra inferior de 3 pestañas. Hoy en móvil no hay navegación.

**Comprar / Necesito**: casilla por fila y barra flotante "Añadir N a la lista de compra". Los botones Want y Comprar de cada fila se mantienen. Se añade una indicación "ya en lista" para no duplicar.

**Comprar / Lista de compra**:
- Acción "Exportar para Cardmarket" en primer plano.
- Las cartas marcadas "comprada" pasan a la colección en un paso.
- Las "Tendencias en tus Wants" se mantienen, y sustituyen a Precios.

**Golden Wants**: botón "Añadir selección a la lista de compra", y enlaces de cada mazo afectado.

**Mazo**: pestaña única con conmutador Lista / Editar. "Faltantes a Wants" y "Solo faltantes" quedan juntos y siempre visibles. Se elimina el duplicado "Precio neto total" / "Valor en posesión" si la cifra es la misma. En la cabecera, un mini gráfico de valor a 30 días.

**Expansiones (rendimiento)**:
- La lista por defecto muestra "Mis expansiones" (con cartas o lotes), ordenadas por fecha, con ROI visible si hay lotes. Las 240 ediciones quedan tras un filtro "Todas".
- Detalle con tres bloques: resumen (inversión, valor actual, ROI), gráfico comparativo (índice de la edición y tu lote, ambos a 100) y tabla por carta con los filtros de la sección 3.
- Edición sin lote: aviso "Sin inversión registrada" con botón "Registrar compra o lote".
- Formulario de lote: tipo, fecha, coste, envío. El resto es opcional.

**Analítica de mazo**:
- Panel "Funciones" con etiquetado automático (rampa, robo, eliminación, barridos, tutores, protección). **[verificar]** si se puede apoyar en las etiquetas de Scryfall (`otag:`).
- Ajuste por comandante con objetivos editables y explicados ("Tu comandante roba: objetivo de robo reducido").
- Corregir la contradicción de la base de maná ("equilibrada" frente a "insuficiente" en los tres colores). Los umbrales de Karsten deben tener en cuenta tierras multicolor y rocas, y el veredicto global ha de ser coherente con el panel superior.

**Transversales**: búsqueda Cmd+K, filtros y orden en la URL (`?q=`, `?sort=`, `?group=`), estados vacíos con CTA, y un checklist de onboarding en `/decks`. El flujo de onboarding no sirve solo para nuevos usuarios: también guía a quien vuelve después de meses.

## 7. Fases

| Fase | Contenido | Criterio de aceptación |
| --- | --- | --- |
| **0. Diagnóstico** (1-2 días) | Causa de los 0,00 € en Expansiones. Qué guarda hoy el histórico semanal. Si existen fechas de adquisición en `collection_item`. Si hay tests de las acciones afectadas. | Informe con respuestas a los **[verificar]** |
| **1. Datos** | Migraciones: `acquisition_batch`, `acquisition_batch_id`, snapshots de catálogo, índice por edición. Job de snapshots ampliado. Arreglo de los 0,00 €. | Expansiones muestra cifras correctas. Existe índice histórico de al menos una edición |
| **2. Navegación** | Rutas `/buy/*`, redirects, navbar de 3 secciones, barra inferior móvil, filtros en URL, proveedor global | Ninguna URL antigua da 404. Navegación móvil operativa |
| **3. Pipeline de compra** | Selección múltiple en Necesito, `wants/bulk`, `status` en ofertas, veredicto con envío, "Confirmar compra" con lote automático | Puedes hacer el flujo completo de punta a punta sin salir de Comprar |
| **4. Expansiones** | CRUD de lotes, asistente de asignación, vista de rendimiento, filtros por carta | Puedes comparar tu lote frente al índice de una edición real |
| **5. Mazo y analítica** | Fusión Cartas/Editar, valor del mazo, Funciones, ajuste por comandante, corrección de maná | El veredicto de maná es coherente. Los objetivos se editan |
| **6. Onboarding y pulido** | Checklist, Cmd+K, estados vacíos, limpieza de pantallas obsoletas | Un usuario demo completa el checklist sin ayuda |

Las fases 2 y 3 pueden ir en paralelo a la 1, porque no dependen de los datos nuevos. Si solo pudieras hacer una cosa ya, haría la 0 y la 1 (empezar a acumular histórico), porque es lo único que no se puede recuperar después.

## 8. Riesgos

- **Histórico insuficiente**: si empieza ahora, el gráfico de una edición nueva solo cubrirá desde hoy. Para la próxima presentación conviene tenerlo listo antes.
- **Definición del índice**: si cambia, cambian todas las curvas. Se guarda la versión de la definición junto al índice.
- **Volumen**: snapshots semanales de todo el catálogo son muchas filas. Hay que limitar a ediciones activas o a cartas con precio mayor a un umbral, e indexar por `(printing_id, captured_on)`.
- **ROI engañoso**: precio de mercado no es precio de venta. Mostrar ambos.
- **Backfill de lotes**: la asignación por fechas puede equivocarse, por lo que siempre requiere confirmación.
