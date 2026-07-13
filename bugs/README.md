# Bugs — tr-fit-web

Tracking de bugs por archivo. Cada bug vive en su propio `.md`.

## Estructura

```
bugs/
  README.md              # este archivo
  pendientes/            # bugs abiertos
  resueltos/             # bugs cerrados (mover acá al resolver)
```

## Convención de nombre

`YYYY-MM-DD-slug-corto.md`

- `YYYY-MM-DD` → fecha de creación.
- `slug-corto` → kebab-case, 3-6 palabras, describe el bug.

Ejemplo: `2026-05-14-header-constancia-espacio-blanco.md`

## Formato de cada archivo

```md
# [título]

- **Prioridad**: alta | media | baja
- **Estado**: pendiente | resuelto
- **Creado**: YYYY-MM-DD
- **Dónde**: archivo:línea o pantalla/flujo
- **Qué pasa**: comportamiento actual
- **Esperado**: comportamiento correcto
- **Notas**: opcional (repro, screenshots, links)

## Resolución (al cerrar)

- **Resuelto**: YYYY-MM-DD
- **Commit/PR**: <hash> o #NN
- **Cómo se arregló**: 1-2 líneas
```

## Flujo

1. Bug nuevo → archivo en `pendientes/`.
2. Al arreglar → editar archivo (estado `resuelto`, agregar sección "Resolución"), mover a `resueltos/`.
3. Listado pendientes: `ls bugs/pendientes/` o `grep -l "Prioridad.*alta" bugs/pendientes/*.md`.
