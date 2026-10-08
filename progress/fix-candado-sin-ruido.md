# fix: candado de archivos sin ruido (2026-10-07/08)

Problema: `archivos-en-vuelo.mjs --candidata QC-177` daba CHOCA con todo lo en vuelo por
`./init.sh` (comando entre backticks) y `tests/baseline-rojos.json` (apendice compartido).

## Cambios
- `scripts/archivos-en-vuelo.mjs`: rutas esperadas solo de `## Archivos ...` (canon
  `## Archivos esperados`; acepta tambien `## Archivos que toca...` de QC-156); dentro de la
  seccion cuentan tambien archivos de raiz (`init.sh`). Sin seccion: todo el archivo menos
  `./...` + AVISO. Compartidos (`tests/baseline-rojos.json`, `progress/deudas.md`, override
  `arnes.config.json > equipo.archivos_compartidos`) -> AVISO, exit no cambia; aplica a diff y tasks.
- `tests/guards/guard-archivos-en-vuelo-sin-ruido.test.ts` (nuevo, en `arnes.manifest`): 6 fixtures en
  UN repo (refs `origin/*` con un solo `git fast-import`, 6 candidatas en paralelo): 33 s -> ~4 s.
  Script viejo: 5 de 6 en rojo (pasa solo «choque real», el anti-vacuidad).
- `docs/equipo.md` (reglas + `### Por que`), `docs/specs.md > 3. tasks.md`.

## Contra el board real (feature_list.json de la raiz)
- QC-177: antes CHOCA x4 (init.sh, baseline) exit 1 -> ahora sin conflicto, exit 0; AVISO baseline
  con QC-82, AVISO QC-82/QC-131 sin seccion, QC-96 rama no publicada.
- QC-180: antes CHOCA x4 -> ahora solo `CHOCA con QC-167: tests/unit/navegacion/pantallas-exigen-permiso.test.tsx`
  (esta en la seccion de QC-167), exit 1.

## Verificacion
- `pnpm exec vitest run guard`: 55 files, 730 passed, 11 skipped, exit 0
- `pnpm run typecheck` (NODE_OPTIONS 4096): exit 0
- `pnpm run lint`: exit 0 (8 warnings previos, ninguno en archivos tocados)
- `node scripts/check-perfil.mjs`: exit 0

Pendiente: subir a la plantilla con `./scripts/arnes-sync.sh --subir` (regla 8).
Veredicto: candado vuelve a distinguir choque real de ruido; verde.
