# Gastos, adquisiciones y procedencia

La web incorpora **Comprar → Gastos e inversión** (`/buy/expenses`), con presupuesto mensual/anual, filtros, compras antiguas, evolución del valor, coste por carta y ROI. Las nuevas vistas financieras son web; Swift conserva la compatibilidad con la API existente.

## Comportamiento

- Las incorporaciones manuales y las importaciones permiten distinguir compra nueva de ajuste/regalo/inventario existente. El ajuste no genera gasto.
- WhatsApp, presencial y otros guardan la tendencia visible de la impresión seleccionada como gasto **estimado**. La revisión congela sus precios; la confirmación vuelve a comprobar presupuesto, versiones, cantidades y procedencia.
- Cardmarket conserva precios pagados por carta, envío y comisión: `redondear((cartas + envío) × 0,05) + 0,30 €`. Los volcados parciales comparten clave de compra: envío y cargo fijo una vez, porcentaje acumulado para evitar diferencias de redondeo. Editar una parte recalcula la comisión y el coste atribuido del grupo.
- **Registrar compra antigua** valida dinámicamente nombres españoles/ingleses, ambigüedades, sugerencias y copias disponibles. Acepta edición/número y foil y permite elegir copias del inventario. Nombre del producto, precio total y fecha son obligatorios; no se permiten fechas futuras. También se conserva origen, vendedor/procedencia y referencia.
- Las compras antiguas no incrementan inventario ni pueden reutilizar copias asociadas a otra compra activa, incluso con confirmaciones concurrentes. Su referencia inicial es la última observación histórica anterior o igual a la fecha de adquisición. Sin datos históricos queda desconocida, sin sustituirla por el precio actual. Se reparte el coste proporcionalmente a las referencias disponibles, con céntimos deterministas; si falta cobertura queda pendiente la atribución por carta.
- La referencia mensual es 50 € y el presupuesto anual 600 €, por año natural. Se puede utilizar saldo de otros meses del mismo año. Superar cualquiera de las referencias requiere aceptar expresamente el aviso. Los gastos estimados se identifican por separado. Anulaciones y otras divisas no cuentan en el presupuesto EUR.
- Ganancia no realizada: `mercado − inversión completa`. ROI: esa diferencia dividida entre la inversión. Con inversión cero el ROI es desconocido. Si faltan precios se muestra valoración parcial, sin clasificar una rentabilidad completa. La variación desde el valor inicial se presenta por separado; no se excluyen cartas baratas del ROI.
- Editar/anular conserva el inventario y la composición original. Anular libera asociaciones y excluye el gasto del presupuesto. Cambiar la fecha de una compra antigua recalcula su referencia histórica. El detalle de una carta muestra sus múltiples compras de procedencia.
- La incorporación física utiliza la asignación automática a mazos y sus avisos persistentes. Registrar compras antiguas no produce nuevas asignaciones físicas.

## Persistencia y pruebas

Migraciones nuevas: `20261005_acquisition_finance` y `20261006_import_replay_result`. Los tres esquemas Prisma compartidos están actualizados y sus clientes regenerados. La segunda conserva el resultado original de importaciones al reintentarlas, incluida la resolución de deseos, en la misma transacción.

Se han probado las migraciones únicamente en PostgreSQL desechable. Queda aplicarlas mediante el procedimiento habitual durante un despliegue autorizado; no se ha modificado la base de datos de la aplicación.

Comandos desde sus submódulos:

- Backend: `uv run pytest`, con `MTG_TEST_DATABASE_URL` para integraciones aisladas.
- Frontend: `npm test`, `npm run lint`, `npm run build`. Cuando el entorno impide abrir el puerto interno de Turbopack, `npx next build --webpack` permite validar la compilación de producción.
- Worker: `uv run pytest`, con la misma variable de pruebas aisladas para las integraciones PostgreSQL.

Las pruebas cubren dinero y redondeos, revisiones congeladas, compras antiguas, presupuesto, ediciones/anulaciones, procedencia, precios faltantes, foil, aislamiento por usuario, confirmaciones concurrentes, reintentos y rollback de inventario, deseos, lotes y avisos.

El volcado desde **Evaluar ofertas** se verifica mediante la API de confirmación,
el listado de deseos y el inventario: al incorporar las copias deseadas se elimina
el deseo; si quedan copias por adquirir, se reduce su cantidad. La revisión no
altera deseos, las cartas no seleccionadas y los deseos de otros usuarios se
conservan, y reintentar una confirmación no vuelve a reducir cantidades. Se cubren
ofertas de WhatsApp, Cardmarket, venta presencial y otros, completas o parciales.
Las pruebas de frontend comprueban que una confirmación correcta, incluso un
reintento, actualiza las vistas de deseos, necesidades, ofertas e inventario; una
revisión o confirmación fallida no invalida esas vistas.

## Diagnóstico del listado TMNT

El fixture `tests/fixtures/acquisitions/tmnt-precon.txt` de backend y frontend
reproduce las 93 líneas y 100 copias del listado comunicado. El archivo
`tmnt-inventory-diagnostics.json` guarda un diagnóstico sin identificadores de
usuario ni datos privados. Las pruebas reproducen ese estado en una base aislada.

En la lectura del inventario local correspondiente al listado se encontraron:

| Línea | Carta | Problema |
| --- | --- | --- |
| 20 | Corpsejack Menace | No aparece en ese inventario |
| 24 | Double Jump/Flying Kick | Nombre reconocido; impresión sin resolver |
| 75 | Steelbane Hydra | No aparece en ese inventario |
| 91 | Vigor | No aparece en ese inventario |
| 92 | Voracious Hydra | No aparece en ese inventario |

La barra diagonal simple se normaliza correctamente a la cara frontal de
`Double Jump // Flying Kick`. El fallo era que la validación aceptaba un nombre
reconocido aunque no hubiera impresión concreta, mientras la selección de copias
descartaba esa carta. Ahora devuelve `printing_unresolved`, con instrucciones para
resolver edición y número de coleccionista. Se distinguen nombres ausentes,
cantidades insuficientes y copias vinculadas a otra compra. La falta de precio
no bloquea una impresión resuelta.

La consulta de inventario también podía agotar el tiempo de espera al buscar
simultáneamente por ID o por edición/número. Se separaron ambas búsquedas,
manteniendo la prioridad del ID exacto. La lectura local pasó de agotar el tiempo
de espera a completar el diagnóstico en aproximadamente seis segundos.

El diálogo muestra progreso indeterminado durante las peticiones y el porcentaje
de líneas listas al terminar la validación. Agrupa todos los problemas antes del
listado completo, con enlaces que enfocan la línea correspondiente. Permite
reintentar una validación fallida y descarta respuestas de listados anteriores.
La preparación y el registro también muestran una barra indeterminada.

La instancia local inspeccionada todavía no tenía las tablas de adquisiciones.
La lectura diagnóstica omitió exclusivamente el cómputo de asociaciones a compras;
no verifica qué copias están ya vinculadas. No se aplicaron migraciones ni se
modificaron cartas en esa instancia. Las pruebas sí verifican esas asociaciones
con el esquema completo en PostgreSQL desechable.
