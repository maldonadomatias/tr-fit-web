# Elegir día pendiente — design

**Fecha:** 2026-08-13
**Repos:** `tr-fit-web` (backend), `tr-fit-app` (mobile)

## Problema

Los atletas se quejan de no poder saltear ni cambiar el día de entrenamiento.
El entrenador armó las rutinas en un orden concreto para que no caigan dos días
del mismo grupo muscular seguidos, y ese orden es la única garantía que existe
hoy.

Estado actual del código:

- El día lo decide el servidor: `startSession` ignora el `day_of_week` que manda
  la app y usa `computeNextPendingDay` (`backend/src/services/engine.service.ts`).
- `computeNextPendingDay` devuelve `MAX(day_of_week) + 1` de las sesiones
  terminadas de la semana de programa. Es una cola secuencial: si el atleta no
  fue al gimnasio el martes, el miércoles le toca igual el día 2 — **el día no se
  pierde por faltar**.
- Pero como es `MAX + 1`, si alguna vez se completa un día fuera de orden, todos
  los días anteriores de esa semana quedan inalcanzables — **se pierden**.
- El único bloqueo real es `already_trained_today` (una sesión por día UTC), con
  override explícito del atleta ("Entrenar de todas formas").

Lo que falta es **reordenar**: "hoy no me da piernas, hago el día de pecho y
piernas queda para mañana".

## Decisiones tomadas

1. **Elegir entre días pendientes**, no saltear definitivamente. El día que se
   posterga sigue pendiente y se vuelve a ofrecer. El volumen semanal no cambia.
2. **Bloqueo duro** cuando el día elegido repite el grupo dominante de la última
   sesión terminada. Sin override: si se puede overridear, se overridea siempre,
   y el orden del coach deja de garantizar nada.
3. **El grupo dominante se deriva** de los slots que ya existen. Los `focus` de
   `skeleton_days` son etiquetas compuestas (`"Piernas / Espalda / Abdomen"`) y
   no sirven para comparar. Si más adelante hace falta precisión, el escape es
   declarar el grupo por día en el editor de rutinas; no se implementa ahora.

## Diseño

### Grupo dominante de un día

Por día del skeleton activo, entre los slots `role = 'principal'`, se agrupa por
grupo primario (`muscle_group` recortado antes de `' - '`: `"Piernas -
Cuadriceps"` → `"Piernas"`) y gana el que más slots tiene; a igual cantidad, el
que aparece primero (`MIN(slot_index)`). Un día sin principales no tiene grupo
dominante y nunca bloquea.

### Días pendientes

`computeNextPendingDay` pasa de `MAX(día) + 1` al **menor día de
`1..days_per_week` sin sesión terminada en la semana de programa actual**. Con el
orden normal el resultado es idéntico al de hoy; con un día postergado, ese día
vuelve a ofrecerse en vez de perderse. Se expone además `listPendingDays`, que
devuelve todos los pendientes en orden y es la fuente única para el dashboard y
para validar la elección.

### Elegir el día al arrancar

`POST /sessions` acepta un campo **nuevo** `pick_day_of_week`. El viejo
`day_of_week` sigue ignorado, así las builds viejas de la app no cambian de
comportamiento. Con `pick_day_of_week` presente el servidor valida:

- el día está en `listPendingDays` → si no, `day_not_pending`;
- su grupo dominante ≠ el de la última sesión terminada → si no,
  `same_focus_back_to_back`.

Excepción: si **todos** los pendientes chocan con el grupo de la última sesión,
no se bloquea ninguno — el atleta no puede quedar sin poder entrenar.

### Dashboard

`nextSessions` deja de ser una proyección cíclica de 3 días y pasa a ser la lista
de **días pendientes posteriores al de hoy**, cada uno con su `dominantGroup` y
un `blocked` (`'same_focus' | null`). Si no quedan pendientes (la sesión de hoy
cierra la semana), se mantiene la proyección cíclica actual con `blocked: null`.

### App

La ficha de un día pendiente gana el botón "Entrenar este", que arranca la sesión
con `pick_day_of_week`. Los días bloqueados se muestran deshabilitados con el
motivo ("Hiciste Piernas en tu última sesión"). Los errores del servidor se
traducen a mensajes en español.

## Fuera de alcance

- Descartar un día del programa sin hacerlo nunca.
- Declarar el grupo dominante a mano en el editor de rutinas.
- Avisar al coach cuando un atleta reordena seguido.
