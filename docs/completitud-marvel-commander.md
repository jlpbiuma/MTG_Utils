# Completitud de Marvel Super Heroes Commander

Comparación de lectura del catálogo y del inventario locales, 1 de octubre de 2026.
La lista oficial de Wizards define la edición base de Commander con los números
1–290: [lista de cartas](https://media.wizards.com/2026/downloads/card-sets/MSH_Cardlist_06122026.pdf).

El catálogo local contiene 866 impresiones. La edición base publicada contiene
290 impresiones, pero solo 281 cartas únicas: distintas ilustraciones de Sol Ring,
Arcane Signet o Command Tower no añaden una carta al denominador. El inventario
cubre 214 de las 281 cartas únicas: 76,16% (76% redondeado), con 67 cartas faltantes.
Hay 229 versiones alternativas de esas cartas en el catálogo de esta edición.

La fórmula es: cartas únicas poseídas de la edición / cartas únicas de la edición.
La identidad es `CardPrinting.catalogId`, siempre dentro del mismo set. Si no se
ha resuelto ese ID, la impresión se cuenta por separado para no fusionar cartas
por accidente. Todas las versiones de la misma carta cuentan como un único
hueco; poseer cualquier versión de esta edición cubre ese hueco. Las cantidades
y acabados foil/no foil no aumentan el número de cartas cubiertas. Una reimpresión
de otra edición no cubre el hueco de esta edición.

La comparación por impresión, nombre y cantidad está en
`comparacion-marvel-commander.csv`. La API y el detalle calculan la completitud con
la misma agrupación. El contador de alternativas suma las impresiones adicionales
de las identidades incluidas en la lista base; permanece visible en el índice y
el detalle, independientemente de los filtros. «Todas las versiones» permite
consultar las impresiones adicionales. Las cartas únicas de productos adicionales
ajenas a la lista base de MSC siguen excluidas de su completitud.

Los valores monetarios conservan sus cálculos por impresión y copias reales;
este cambio afecta a la completitud. La propiedad exacta de cada impresión y la
acción de añadirla a la colección también se conservan. El listado indica si una
carta ya está cubierta por otra versión de la misma edición.

El rango base de MSC está registrado en
`backend/src/services/expansion_completion.py`; no se infiere un rango para otras
ediciones a partir del tamaño del catálogo. Para ellas se agrupa todo el catálogo
local por carta dentro del set.

Colección y Expansiones comparten `CatalogCardGridItem`, con imagen completa
63/88, tipo, coste de maná, nombre, cantidad y precio. Imagen y nombre son botones
accesibles que abren el diálogo habitual de detalle con el ID de la impresión.

Validación: pruebas de API, integración PostgreSQL en una base desechable y pruebas
frontend de completitud, navegación al detalle, filtro de versiones y colección.
La base local de la aplicación todavía no tiene la migración de adquisiciones:
la comparación real usa SQL de lectura; el flujo completo de API se verifica en
la base temporal con las migraciones aplicadas. Esta tarea no migra ni despliega
la base de la aplicación.
