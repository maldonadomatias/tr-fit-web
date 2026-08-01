# cola de rutinas: no deja deslizar hasta abajo, botones de acción inalcanzables

- **Prioridad**: alta
- **Estado**: resuelto
- **Creado**: 2026-08-01
- **Dónde**: aprobación de rutinas, pestaña "Cola Pendiente" (`https://app.tatoroblesfit.com/admin/rutinas`) — `frontend/src/components/admin/rutinas/ListPane.tsx:77`, grid de `ColaPane` en `frontend/src/pages/admin/Rutinas.tsx:94`
- **Qué pasa**: con muchas rutinas pendientes la página no scrollea del todo hacia abajo, así que Rechazar / Descartar / Skip / Aprobar quedan fuera de pantalla. El coach venía zafando con los atajos J (skip) y A (aprobar), a ciegas.
- **Esperado**: el footer de acciones siempre visible; lista y detalle con scroll interno propio.
- **Notas**: mismo root cause que `2026-07-13-rutinas-activas-no-scrollea-hasta-abajo.md` (ya arreglado en Activas), reaparecido en la cola.

## Resolución

- **Resuelto**: 2026-08-01
- **Commit/PR**: `1b97fa1` (deployado a prod, bundle `assets/index-C8rgRvKd.js`)
- **Cómo se arregló**: el `<aside>` de `ListPane` es item del grid de `ColaPane` y no tenía `min-h-0`. Su `min-height: auto` (= min-content de la lista completa) estiraba la fila del grid muy por encima de la altura del panel: medido en repro, fila de 2647px dentro de un contenedor de 695px. Con el grid en `lg:overflow-hidden` el footer quedaba recortado y sin scroll posible; cuantas más pendientes, más alta la fila. La columna derecha ya tenía `min-h-0` — sólo faltaba en el aside (igual que `ListPaneActivas`).
  - Fix: `min-h-0` en el aside + tope de la lista en mobile bajado de `60vh` a `40vh` (el detalle quedaba en una franja de ~100px).
  - Verificado en browser con repro de la jerarquía real de clases: 1280×800 footer pasa de y=2684 (fuera de pantalla) a y=733–800; 390×844 el detalle pasa de 101px a 269px de alto. Lista y detalle scrollean internamente.
  - Ojo para la próxima: cualquier item de grid/flex que contenga una región scrolleable necesita `min-h-0`, si no el min-content del contenido estira el track.
