# fix-jira-estados — los estados del board se declaran en el perfil

Rama `chore/arnes-jira-estados`. Origen: F0 de QC (2026-10-08) encontró *Por hacer*,
*En revisión* y *Finalizado* sin traducción; `docs/jira.md` suponía columnas con nombre fijo.

## Cambios
**Perfil**
- `arnes.config.json`: `jira.estados` (Por hacer→pending, En revisión→spec_ready,
  En curso→in_progress, Finalizado→done, Cancelado→cancelled).

**Arnés**
- `docs/jira.md`: nueva `## Los estados del board` (tabla por proyecto, F0 traduce por nombre,
  estado no listado detiene F0, F1.4 = transición spec_ready→in_progress, `### Por qué`). Paso 3
  de «Montar el board», contrato de campos y tabla de sincronización, por papel.
- `AGENTS.md` (F0, F1.3, F1.4, F2.0, F2.5), `docs/specs.md`, `docs/guia-de-uso.md`,
  `docs/equipo.md`, `.claude/agents/leader.md`, `.claude/commands/{afinar-feature,arnes-init,jira-connect}.md`:
  sin nombres de columna fijos; se nombra el estado por su papel «según `jira.estados`».
- `scripts/validate-features.mjs`: bloque 0a valida `jira.estados` (objeto; valores en los cinco;
  aviso si falta alguno; muchos-a-uno permitido), antes del corte «sin copia del board», así que
  muerde también en CI. Bloque 1: `status` de cada ficha en los cinco.
- `tests/guards/guard-validador-estados.test.ts` (nuevo, 7 casos) y su fila en `arnes.manifest`.
- `scripts/check-perfil.mjs`: sin cambios (no valida claves sueltas de `arnes.config.json`).
- Títulos `##` existentes de `docs/jira.md` intactos; ninguna cita rota.

## Verificación
- Muerde: con el validador de `HEAD`, la guardia nueva da `5 failed | 2 passed`.
- `pnpm exec vitest run tests/guards/guard-validador` → 3 files, 16 passed.
- `pnpm exec vitest run guard` → 54 files, 724 passed, 11 skipped.
- `node scripts/validate-features.mjs` → exit 1 solo por «faltan specs para features sdd en
  vuelo: QC-156 QC-167» (conocido, ajeno a este cambio). Ningún error de status.
- `node scripts/check-perfil.mjs` → 6/6 docs, exit 0.
- `tsc --noEmit` (4 GB) → exit 0. `eslint` de los archivos tocados → sin issues.

## Pendiente
- Subir la mejora a la plantilla (`./scripts/arnes-sync.sh --subir`); `arnes.lock.json` no se tocó.
- `arnes.config.example.json` de la plantilla debería traer `jira.estados` (vive en harness_config).

Veredicto: listo para PR; el rojo del validador es previo y ajeno.
