# Cartas multicara, batallas y símbolos de maná

Fecha: 31 de octubre de 2026. Alcance: backend, worker, web y Swift de este checkout. Sin PostgreSQL ni Docker disponibles: la migración y las consultas SQL no se ejecutaron contra una base real (su test de integración queda omitido sin `MTG_TEST_DATABASE_URL`).

## Causas encontradas

| Problema visible | Causa | Corrección |
| --- | --- | --- |
| Cartas transformables, MDFC y batallas sin coste de maná, con valor de maná 0 y sin colores | En esos layouts Scryfall solo publica `mana_cost` dentro de `card_faces`; el worker y el backend leían únicamente el campo superior | `card_mana_cost()` (worker y backend) guarda el coste de la cara frontal, que es el que cuenta en la pila. La migración `20261031_double_faced_mana_cost` rellena los costes vacíos existentes en catálogo, mazos, colección, deseos y colecciones simuladas |
| Batallas agrupadas como «Criaturas»; Westvale Abbey como criatura | La categoría se calculaba sobre la línea de tipo completa `Battle — Siege // Creature — …` | Se clasifica por la cara frontal en web, backend y Swift |
| Al girar una carta se veía siempre el anverso; faltaban fuerza, resistencia y defensa | El detalle generado por el worker no copiaba estadísticas ni imágenes por cara, y la API vaciaba `image_uris` de cada cara | El worker copia la imagen de cada cara trasera en MinIO (`originals/{id}/face-N`) y guarda las estadísticas de cada cara. La API conserva solo las URLs de imgproxy; el anverso sigue la impresión seleccionada |
| `{W/P}`, `{G/W}`, `{2/W}` aparecían como texto gris en la web; en Swift el pirexiano era un degradado con una «P» | El componente solo dibujaba WUBRG/C | Símbolos híbridos (círculo partido en diagonal), pirexianos (glifo propio) e híbridos pirexianos, en web y Swift. Separador `//` entre las caras de cartas partidas y aventuras |
| Tropical Island, Volcanic Island, Mountain Goat, Sapseep Forest o Swamp Mosquito contaban siempre como poseídas en la completitud | `is_basic_land` aceptaba cualquier nombre que empezara o terminara por el nombre de una básica. Swift usaba otra lista, así que web e iOS daban porcentajes distintos | Coincidencia exacta con la misma lista en las tres plataformas |
| Valor de maná incorrecto: aventuras sumaban ambas mitades, `{2/W}` valía 1 en backend y Swift, `{HW}` valía 1 | Tres implementaciones distintas | Regla única: híbrido = mitad más cara, medio maná = 0,5, cartas partidas suman las dos mitades y las aventuras/presagios solo la principal. En la web, `parseManaValue` delega en `extractCmc` |

## Antes/después y rendimiento

Las implementaciones anteriores se han congelado como oráculos: `backend/tests/fixtures/legacy/card_utils_v1.py` y `frontend/tests/fixtures/legacy/*.ts`. `test_card_semantics_equivalence.py` y `card-semantics-equivalence.test.ts` ejecutan la versión anterior y la nueva sobre el mismo corpus (`card_semantics_corpus.json`, 66 cartas con casos límite). Exigen resultados idénticos salvo una lista cerrada de correcciones. Un cambio nuevo o una corrección que deje de producirse hace fallar el test.

| Medida (mejor de 5) | Antes | Después |
| --- | --- | --- |
| Completitud backend, 6.000 filas en 40 mazos | 23,9 ms | 2,1 ms (11,5×) |

La mejora viene de `is_basic_land` (antes recorría unas 60 entradas con dos comparaciones de cadena por llamada; ahora es una búsqueda en un conjunto), de las expresiones regulares precompiladas y de una caché LRU en `normalize_card_name`. En la web, `isBasicLand` ya no crea un array a cada llamada. El test web mide además el tiempo de las reglas sobre 6.000 filas y exige que no empeore.

## Pendiente de verificar o decidir

- Ejecutar la migración y su test de integración con una base aislada (`MTG_TEST_DATABASE_URL`) antes de desplegar.
- Las imágenes traseras se generan al sincronizar o enriquecer de nuevo cada carta; las ya existentes no tienen dorso hasta entonces.
- Los cuellos de botella SQL de `docs/auditoria-rendimiento-produccion.md`, salvo Expansiones, que ya estaba corregido, siguen pendientes: paginación de colección en SQL, N+1 de rendimiento por lote, índice semanal de precios e I/O síncrono del worker. Exigen medir con una base de datos real.
- Dos tests de Swift ya fallaban antes de estos cambios (`CrossMatchingTests.pipelineDeckSummaryMatchesFixtureNumbers` y `BackendLoadingTests.cacheRefreshesForSameCountReplacementAndEditionSearch`).
