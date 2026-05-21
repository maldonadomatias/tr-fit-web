# Prompt para Claude Code

Copialo y pegalo en una sesión nueva de Claude Code parado en el root de
`tr-fit-web`.

---

```
Aplicá el handoff que está en design_handoff_rutinas_redesign/.
Arrancá leyendo:
  - README.md
  - IMPLEMENTATION.md (es un checklist por fase, seguilo en orden)
  - INTERACTIONS.md (atajos, approve/reject, 409, query params)
Un commit por fase. No empieces Fase 6 (rename DB) sin confirmarme.
```

---

## Notas para vos (no para el prompt)

- El handoff reusa los tokens FORMA del rediseño admin previo
  (`design_handoff_admin_redesign/TOKENS.md`). No se duplican acá.
- Si Claude detecta endpoints faltantes (`GET /api/exercises`,
  `GET /api/rutinas/last-approved`, `GET /api/rutinas/:id/history`,
  `GET /api/rutinas/:id/diff`), decirle si querés que stubeé frontend o
  agregue backend.
- Fase 6 (rename DB `skeletons` → `rutinas`) está marcada como blocking.
  El prompt ya pide confirmación antes.
- Fase 7 borra `pages/coach/*` y `AppShell.tsx`. Verificá antes de
  aprobar que no quede uso vivo del rol coach.
