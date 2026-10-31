# Patrones de diseño móvil (web)

Guía para que la web funcione en un teléfono (375 px de ancho como referencia)
sin cambiar el escritorio. El punto de corte es `md` (768 px): por debajo se
aplica la versión móvil; `sm` (640 px) solo se usa donde se indica.

## Base

- **Viewport y zonas seguras.** `app/layout.tsx` exporta `viewport` con
  `viewportFit: "cover"`. La cabecera usa `env(safe-area-inset-top)`, y la
  navegación inferior, el contenido y las hojas usan `env(safe-area-inset-bottom)`.
  En móvil el pie de página se oculta: la barra inferior ya da la navegación.
- **Objetivos táctiles.** Con puntero táctil (`pointer: coarse`), botones,
  selectores y campos miden al menos 40 px de alto, y los botones de solo icono
  son cuadrados. En escritorio no cambia nada. Los controles nuevos deben pensarse
  para 44 px (`min-h-11`).
- **Campos a 16 px** en móvil, para que iOS no amplíe la página al enfocarlos.
- **Navegación.** Las tres secciones están en la barra inferior (`SectionNav mobile`).
  Las pestañas de cada sección son filas deslizables (`snap-row` con
  `overflow-x-auto`) o controles segmentados (`CollectionTabNav`): nunca envuelven
  en varias líneas.

## Componentes y clases

| Patrón | Uso | Dónde está |
| --- | --- | --- |
| Hoja inferior | Todos los `DialogContent` se abren desde abajo, a todo el ancho, con desplazamiento interno y asa. Los tamaños que pase cada diálogo solo afectan al escritorio. | `components/ui/dialog.tsx` |
| Barra de filtros plegable | `ViewToolbar` deja en móvil la búsqueda y las acciones, y pliega filtros, orden y vista tras «Filtros y orden». Pasa `activeFilters` con cuántas opciones difieren de su valor por defecto. | `components/view-toolbar.tsx` |
| Opciones deslizables | `ToolbarChoices` es una fila deslizable en móvil y una fila que envuelve desde `md`. | `components/view-toolbar.tsx` |
| Carrusel de resumen | `MobileScroller` muestra tarjetas de cifras como fila deslizable que deja asomar la siguiente; desde `sm` es una rejilla (pasa las columnas en `className`). | `components/ui/mobile-scroller.tsx` |
| Acciones de cabecera | `PageActions` coloca en móvil las acciones en dos columnas iguales; si el número es impar, la última, que es la principal, ocupa todo el ancho. Desde `sm` es una fila. Pon la acción principal la última. | `components/ui/page-actions.tsx` |
| Tabla apilada | Añade `responsive-table` a la `<table>`, `data-label` a cada celda, `data-primary` a la celda principal y `data-wide` a la que deba ocupar todo el ancho (`data-mobile-hidden` la oculta). En móvil cada fila es una tarjeta de dos columnas con etiquetas. Quita al contenedor el borde y el `overflow-x-auto` con `max-md:`. | `app/globals.css` |
| Paginación | Botones de 44 px en móvil (`PaginationControls`). | `components/ui/pagination-controls.tsx` |

Aplicados en: Colección (cabecera, pestañas, filtros), Mazos (cabecera, cifras,
pestañas), Necesidades (filtros y tabla), cartas de una oferta (tabla) y el
detalle de carta (pestañas y estadísticas).

## Cuándo no usarlos

- Matrices y mapas de calor (comparación de mazos): mantienen el desplazamiento
  horizontal, porque apilarlos pierde la lectura cruzada.
- Gráficos: usan el ancho disponible y no se apilan.

## Comprobación

Con la web local abierta a 375 × 812, no debe haber desplazamiento horizontal de
página (`document.documentElement.scrollWidth === 375`). El primer contenido debe
aparecer cerca del primer pantallazo y ningún control debe medir menos de 40 px.
Los tests de `tests/components/mobile-patterns.test.tsx` cubren el
comportamiento de cada patrón.
