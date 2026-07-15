# campana del dashboard no abre las alertas

- **Prioridad**: media
- **Estado**: resuelto
- **Creado**: 2026-07-15
- **Dónde**: dashboard admin (tr-fit-web), campana ubicada junto al control de modo oscuro
- **Qué pasa**: al pulsar la campana de notificaciones no ocurre ninguna acción y no se puede acceder al panel de alertas desde ese botón. El buscador del encabezado sí funciona.
- **Esperado**: al pulsar la campana debe abrirse el panel o la pantalla de alertas correspondiente.
- **Notas**: punto 5 del PDF `ERRORES 3 - TR FIT APP.pdf`. Es una regresión parcial de `bugs/resueltos/2026-07-13-dashboard-notificaciones-y-buscador-no-andan.md`: el buscador continúa resuelto, pero la campana volvió a fallar después de la última actualización.

## Pasos para reproducir

1. Ingresar al dashboard admin.
2. Ubicar la campana a la izquierda del control de modo oscuro, en el extremo superior derecho.
3. Pulsar la campana.
4. Comprobar que no se abre el panel ni la pantalla de alertas.

## Criterios de aceptación

- La campana responde al clic y al uso por teclado.
- La acción abre la vista de alertas prevista por el dashboard.
- El control conserva una etiqueta accesible y un foco visible.
- El arreglo no afecta el buscador ni el control de modo oscuro del encabezado.

## Resolución

- **Resuelto**: 2026-07-15
- **Commit/PR**: sin commit
- **Cómo se arregló**: se corrigió el cableado invertido del header. El botón de tema vuelve a limitarse a alternar claro/oscuro y la campana es ahora el enlace accesible a `/admin/alerts`.
