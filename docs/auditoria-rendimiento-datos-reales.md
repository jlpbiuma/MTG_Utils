# Rendimiento con datos reales y coherencia de la interfaz

Fecha: 31 de octubre de 2026. Medido contra una copia completa de producción
(`make sync-prod-db`, solo lectura en el servidor): 77 mazos, 6.969 cartas de
mazo, 5.664 filas de inventario, 105.124 impresiones, 8,3 millones de precios
históricos y 37 ofertas guardadas. API local con un proceso, sin worker; mediana
de 3 llamadas tras una de calentamiento (`backend/scripts/bench_api.py`).

## Antes y después

| Endpoint | Antes | Después | Resultado |
| --- | ---: | ---: | --- |
| Colecciones simuladas (ofertas) | 15.039 ms | 1.727 ms | idéntico* |
| Rendimiento de expansión | 1.066 ms | 29 ms | idéntico (8 ediciones, byte a byte) |
| Avisos de asignación | 541 ms | 4 ms | idéntico |
| Cartas dormidas | 1.212 ms | 181 ms | corregido (ver abajo) |
| Historial de valor de colección (30 / 90 / 365 días) | 1.184 / 3.613 / 12.559 ms | 1.011 / 1.421 / 1.652 ms | idéntico |
| Colección, página plana | 335 ms | 228 ms | idéntico |
| Colección, orden por precio | 533 ms | 318 ms | idéntico |
| Colección agrupada | 413 ms y 4,3 MB | 309 ms y una página | paginada (ver abajo) |
| `/decks/overlap` | error 500 | 97 ms | corregido |

\* Idéntico con los mismos datos. Durante la medición, el resolvedor remoto de la
versión anterior guardó una traducción en el catálogo, lo que cambia los
resultados posteriores con cualquier versión.

Con red real, la versión anterior era mucho peor: Cartas dormidas tardó 19,6 s
(una descarga de EDHREC por comandante y petición), y cada listado de ofertas
buscaba en Scryfall los 804 nombres no resueltos, uno tras otro.

## Causas y cambios

- **Ofertas:** el listado consultaba Scryfall por cada nombre sin traducción local,
  en cada petición. Ahora el listado solo resuelve con datos locales. Al abrir una
  oferta se sigue consultando Scryfall, y los fallos se recuerdan 6 horas. La
  completitud de los 77 mazos se calculaba una vez por oferta; ahora se calcula
  una vez por petición. El catálogo de cada carta se cargaba repetido en cada una
  de sus 15.011 impresiones.
- **Rendimiento de expansión:** para cada fila de inventario se recorrían todas
  las impresiones de la edición (`LATERAL` con `OR`). Ahora se cruza una sola vez
  por id y por número de coleccionista.
- **Avisos de asignación:** el `JOIN` con `OR` sobre el catálogo no podía usar
  índices. Ahora es una búsqueda indexada, y la migración
  `20261031_lower_name_indexes` añade `lower(name)` y `(deck_id, lower(card_name))`.
- **Historial de valor:** se comparaba cada día con cada observación de cada carta.
  Ahora cada observación se expande a los días que cubre y se une por (carta, día).
- **Cartas dormidas:** la exclusión por EDHREC leía una clave (`cardlists`) que no
  existe, así que nunca excluía nada, aunque descargaba EDHREC en cada petición.
  Ahora usa las listas que el worker ya guarda en `edhrec_commanders`: quedan
  3.687 cartas dormidas en lugar de 4.118, como promete la pantalla.
- **Overlap de mazos:** leía un campo `colors` que el modelo no tiene.
- **Valor de los mazos a 0 €:** con la caché de precios caliente, si las pocas
  cartas sin precio en caché no tenían impresión, `get_latest_quotes_batch`
  devolvía `{}` y descartaba todos los precios de la caché. Mazos mostraba
  «0.00 €» desde la segunda visita. Ahora conserva los precios de la caché.

## Coherencia de la interfaz

- **Colección:** la vista plana pedía 200 cartas al servidor y paginaba en el
  navegador sobre esas 200 («1–200 de 200» con 5.664 cartas). Agrupar o buscar
  descargaba la colección entera, y el filtro de precio solo actuaba sobre lo
  cargado. Ahora filtros, orden y paginación de 120 cartas se hacen en el
  servidor, igual en todos los modos. Una página agrupada es un tramo de la lista
  ordenada por secciones, con los totales de cada sección completa. Exportar
  carga la lista entera al abrir el diálogo, y las respuestas obsoletas ya no
  sobrescriben a las nuevas. Swift no envía `limit` y sigue recibiendo la
  colección completa.
- **Necesidades:** el servidor renderizaba 30 elementos sin el filtro «ocultar
  poseídas», y el cliente paginaba de 100 en 100 con el filtro activado: la
  página 1 decía «de 2.153» y la 2 «de 1.006», y los elementos 31–100 no se
  veían nunca. Ahora ambos usan los mismos filtros (los de la URL) y 100 por página.
- **Peticiones que bloqueaban la app:** Next ejecuta las Server Actions de un
  cliente de una en una, así que una lectura lenta retenía cualquier clic. Las 24
  lecturas que se hacían desde el navegador pasan por `POST /api/reads/[name]`,
  con una lista cerrada de funciones de solo lectura. Van en paralelo; las
  mutaciones siguen siendo Server Actions.

## Verificación y pendientes

- Backend: 448 tests con PostgreSQL de pruebas (ninguno omitido). Worker: 126.
  Web: 499 y `next build`. Swift: sin cambios en esta tanda.
- Los tests web ya no pueden llamar a un backend local en marcha: antes lo hacían
  si alguna acción no estaba simulada.
- Pendiente: `/catalog/sets` (≈580 ms) recalcula estadísticas de 105.000
  impresiones en cada visita. Separar la parte que no depende del usuario
  exigiría invalidarla al sincronizar el catálogo.
- No se ha medido con varios usuarios a la vez ni con el servidor de imágenes.
