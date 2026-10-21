# Rendimiento de Evaluar oferta

Auditoría del 4 de octubre de 2026. [Mediciones](evaluar-oferta-rendimiento.json).

## Alcance de la medición

La base local contiene 19.032 cartas de catálogo, 45.819 impresiones y ninguna
oferta guardada. Se inspeccionaron planes `EXPLAIN ANALYZE`, índices y estadísticas
mediante transacciones de solo lectura, con un límite de diez segundos por
consulta. No se modificaron datos ni se aplicaron migraciones en esa instancia.
Su esquema de ofertas todavía carece de `raw_text`, por lo que no permite medir
una oferta guardada con la API actual. La API se midió en PostgreSQL desechable,
con una copia de los nombres/alias públicos del catálogo y doce ofertas sintéticas
de tres nombres. No se copiaron inventarios, deseos, compras ni usuarios. Los 93 nombres del
fixture TMNT se resolvieron en el catálogo local sin consultas externas.

## Resultados

| Medición | Antes | Después |
| --- | ---: | ---: |
| Resolver tres nombres en la base local, sin nuevos índices | 1.475 ms | 452 ms |
| Resolver tres nombres en la copia aislada, mediana de tres ejecuciones SQL | 142 ms | 16 ms |
| Listado de doce ofertas por la API aislada, mediana de tres peticiones | 1.533 ms | 118 ms |
| Consultas del listado de doce ofertas | 73 | 7 |

Las tres mediciones de API optimizada fueron 118, 337 y 23 ms; existe variación
entre ejecuciones. No son un objetivo de latencia garantizado ni una medición de
producción. Las respuestas de las dos implementaciones fueron idénticas en el
fixture de API.

## Causas y cambios

La resolución anterior expandía todos los alias de todas las cartas mediante un
`LATERAL UNION`, con normalización por expresión regular, para cada oferta. Se
sustituyó por ramas independientes de búsqueda exacta e índices de expresión
compatibles con la misma normalización de acentos y puntuación. La búsqueda de
caras españolas se restringe a filas con arrays de caras; conserva nombres
compuestos, alias traducidos y detección de ambigüedades.

La migración `backend/prisma/migrations/20261007_offer_alias_indexes/migration.sql`
añade cinco índices de alias y un índice parcial de caras al catálogo compartido.
No modifica campos ni contratos Prisma; estos índices de expresión se mantienen
en SQL. Se ha probado exclusivamente en la base desechable. Debe desplegarse por
el procedimiento normal de migraciones para obtener la mejora completa.

Cada oferta repetía lecturas de mazos, inventario, deseos, impresiones y futuras
reimpresiones. Ahora se preparan una vez para el conjunto de ofertas de una
petición. El contexto conserva el usuario y rechaza reutilización entre usuarios;
no hay caché persistente de precios o propiedad. Otra petición vuelve a leer los
datos, incluidos los deseos que se resuelven tras una compra. El descubrimiento
de ofertas también comparte ese contexto y omite históricos que no se muestran.
El detalle Cardmarket sigue consultando sus históricos.

La web esperaba a que terminasen las ofertas guardadas, las coincidencias de
WhatsApp y el descubrimiento antes de mostrar el listado. Ahora muestra las
ofertas guardadas al recibirlas y permite abrirlas mientras busca las adicionales.
Un fallo de descubrimiento no bloquea las ofertas guardadas. Las respuestas de
cargas anteriores se descartan y la búsqueda adicional muestra su propio estado.

## Validación y límites

Se verifican los nombres españoles, caras localizadas, impresión explícita,
Cardmarket, cantidades, compras y eliminación de deseos. Un test de presupuesto
de consultas comprueba que doce ofertas comparten una lectura por recurso y que
una petición posterior refresca los datos del usuario. Un test de UI deja el
descubrimiento pendiente y después lo hace fallar: la oferta guardada continúa
visible y se puede abrir.

Comandos desde `backend/`:

```sh
uv run python ../scripts/diagnostics/audit_offers.py --output /tmp/offers-audit.json
uv run pytest tests/test_offer_query_performance.py tests/test_scryfall_search_languages_integration.py
```

Las integraciones requieren `MTG_TEST_DATABASE_URL` apuntando a PostgreSQL
exclusivo de pruebas. El script de auditoría solo acepta un host local, no llama
al catálogo externo y no imprime credenciales ni identificadores de usuario.

Queda medir una carga real de ofertas de producción tras aplicar las migraciones.
La resolución externa de nombres ausentes y el descubrimiento de WhatsApp pueden
seguir añadiendo latencia; el estado de ofertas guardadas ya no depende del
resultado de ese descubrimiento. La prueba sintética no representa ofertas con
cientos de impresiones o históricos completos. El lint de la vista conserva
cuatro errores de reglas de hooks existentes en este componente; TypeScript,
pruebas y compilación se comprueban por separado.

Resultado final: 427 pruebas backend y 479 frontend, TypeScript y compilación de
producción con Webpack correctos. Las cuatro incidencias de lint del componente
también se reproducen con su carga de datos anterior; los tests modificados pasan
lint. `git diff --check` correcto en raíz y submódulos afectados.
