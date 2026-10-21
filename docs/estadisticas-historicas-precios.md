# Media y desviación típica históricas

Implementación del 1 de octubre de 2026. Se muestran en la pestaña Precios del detalle de carta, por impresión seleccionada y acabado no foil/foil, y en las ofertas de origen Cardmarket por carta y para el conjunto. También se admiten listas sencillas sin precios del vendedor.

## Definición

Se utilizan cotizaciones Cardmarket en EUR de todo el histórico **almacenado**, con una observación por fecha y por impresión/acabado. La media aritmética y la desviación típica poblacional (`STDDEV_POP`, divisor N) no dependen de la ventana elegida para el gráfico. No se mezclan impresiones, proveedores, monedas ni acabados, ni se rellenan fechas sin precio. Un cero efectivamente observado sí es un dato; no tener histórico no equivale a precio cero.

Fuente principal: `cm_price_history` (normal = finish 0, foil = finish 1). Para las fechas sin observación en esa fuente se utiliza `card_price_history` de Cardmarket/EUR, eligiendo la última cotización de cada día. En una fecha compartida prevalece MTGJSON. Ese histórico antiguo no distingue acabado, por lo que nunca se utiliza como fallback foil. Se combinan únicamente las fechas realmente observadas, sin duplicarlas ni inventar cotizaciones.

La API entrega media, desviación, número de fechas, inicio/fin, proveedor y moneda. La interfaz muestra «Sin datos» cuando no hay observaciones. Una única fecha produce desviación 0 y un aviso de que no permite valorar fluctuaciones.

## Global de una oferta

Se agrupan filas repetidas por impresión/acabado y se suman cantidades. Para cada fecha con observaciones en **todas** las referencias, se calcula el valor total `Σ(cantidad × precio)`. La media y desviación se calculan sobre esos totales; no se suman desviaciones individuales ni se asume independencia de precios.

Ejemplo probado: dos copias de una carta con precios 1 y 3 €, y una copia de otra con precios 9 y 7 €, generan totales 11 y 13 €. Media: 12 €; desviación típica: 1 €. Las desviaciones individuales ponderadas sumarían 3 €, que sería incorrecto.

Si falta una referencia, un histórico o no existen fechas comunes, las estadísticas globales quedan sin datos. Se informa cuántas copias tienen histórico y cuántas no. El envío, precio del vendedor y comisiones no forman parte del valor histórico de mercado. Las referencias aproximadas siguen identificadas como tales.

## Contratos y rendimiento

El listado de ofertas no consulta históricos. El detalle y la simulación web los solicitan únicamente para Cardmarket; WhatsApp, Otros y Venta presencial muestran métricas y cartas. La API de análisis de texto conserva el histórico por defecto para clientes anteriores, y admite `includeHistory: false`.

Campos aditivos en `PrintingPriceSeries`: `statistics` y `foilStatistics`. Las respuestas de ofertas incluyen `historyStatistics`, `historyCoveredCopies` y `missingHistoryCopies`; las filas de compra incorporan `historyPrintingId` y `historyStatistics`. El identificador histórico puede ser aproximado y no sustituye a `referencePrintingId`, que mantiene su papel de identidad exacta para confirmar compras.

El servicio compartido `backend/src/services/price_statistics.py` calcula estadísticas mediante consultas por conjuntos: una para todas las referencias y otra para el total si hay cobertura. No añade una consulta por carta ni transfiere el histórico completo al navegador. No requiere migración y no solicita datos externos. Los clientes Swift existentes ignoran los campos adicionales; no cambia sus campos requeridos.

Validación: regresiones de detalle y ofertas en frontend, suites backend/frontend, TypeScript y build Next. PostgreSQL temporal comprueba histórico antiguo frente a ventana de 7 días, foil, cantidades repetidas, covarianza del total, fechas disjuntas, referencias sin datos, fallback legado y exclusión de moneda ajena. No se ha desplegado ni modificado la base de la aplicación.
