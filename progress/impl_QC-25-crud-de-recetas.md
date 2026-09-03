# Implementación QC-25 — crud-de-recetas

Backend dev. Alcance de esta tanda: **Grupo A — cimientos** (T0, T1, T2, T3) de
`specs/QC-25-crud-de-recetas/tasks.md`.

## T0 — Instalar la dependencia aprobada

- `pnpm add @supabase/storage-js` (solo ese sub-paquete; `@supabase/supabase-js` no entra).
- Archivos modificados: `package.json` (+1 dependencia), `pnpm-lock.yaml`.
- La fila en `docs/dependencias.md` ya existía (la escribió el leader en F1.4), no se tocó.
- Verificación: `pnpm exec vitest run tests/guards/guard-dependencias-aprobadas.test.ts` → 2 passed.
- Confirmado por `git diff package.json`: la única entrada nueva es `@supabase/storage-js`.

## T1 — Dominio base del módulo

Archivos creados:
- `lib/modules/recetas/domain/actor.ts` — `Actor`, `ADMIN_ROLE_NAME`, `requireAdmin`
  (falla cerrado, igualdad exacta, sin `includes` ni normalización).
- `lib/modules/recetas/domain/errors.ts` — `RecetasError` (clase base abstracta) y
  `UnauthorizedError`, `NotFoundError`, `DuplicateNameError`, `ValidationError`.
- `lib/modules/recetas/domain/page.ts` — `Page<T>` (estructural, no importado de
  `inventario` ni de `lib/shared`), `PageQuery`, `pageQuerySchema` (zod: solo valida
  forma/mínimo; el default de 10 y el tope de 25 los aplica `lib/shared/pagination.ts`
  en el adaptador driven, no aquí).
- `domain/recipe-name.ts` no se tocó (ya existía, QC-24).

Verificación: `pnpm run typecheck` limpio. `grep "^import"` sobre `domain/*.ts` confirma
que solo se importa `zod` y `./errors` — nada de framework, Prisma, `lib/shared/` ni
`lib/composition`.

## T2 — Detección de formato y límites de la imagen

- `lib/modules/recetas/domain/recipe-image.ts` — función pura `validateRecipeImage(bytes)`:
  rechaza por tamaño (`> 5 MB`, `MAX_IMAGE_BYTES`) y detecta JPEG/PNG/WebP por los bytes
  (firmas `FF D8 FF`, `89 50 4E 47 0D 0A 1A 0A`, `RIFF`…`WEBP`), devolviendo `contentType`
  y `extension` derivados de la firma. Cualquier otra firma (PDF, SVG con o sin
  declaración XML, HEIC) se rechaza.
- Test: `tests/unit/recetas/recipe-image.test.ts` — tabla de firmas (3 aceptados con
  `it.each`, 4 rechazados con `it.each`: PDF, SVG×2, HEIC) + corte de 5 MB (rechaza
  `MAX_IMAGE_BYTES + 1`, acepta exactamente `MAX_IMAGE_BYTES`).

Verificación: `pnpm exec vitest run tests/unit/recetas/recipe-image.test.ts` → 9 passed.

## T3 — Test de alcance, adelantado

- `tests/unit/recetas/scope.test.ts`, cinco `it`:
  1. No hay pantalla/página/componente de recetas bajo `app/` ni `components/`, ni spec
     nuevo en `e2e/` (patrón `/recet|recipe/i` sobre la ruta completa, igual que el
     patrón que usó QC-20 para `product|presentation`).
  2. No hay route handler bajo `app/api/recetas` ni `app/api/recipes`, y todo archivo que
     aparezca en `adapters/driving/` debe declarar `'use server'` en su primera línea.
  3. `lib/modules/recetas/**` no reimplementa la aritmética de paginación: se buscan los
     patrones `Math.ceil(total…)`, `(page - 1) * …` y multiplicación directa por
     `pageSize` en el texto fuente del módulo (excluidos los tests).
  4. Ningún archivo bajo `tests/` importa `@supabase/storage-js` (import/require) ni el
     adaptador `recipe-image-supabase` (el propio archivo de test se excluye del barrido,
     porque cita esos literales a propósito para poder buscarlos).
  5. `db/schema.prisma` — `model Recipe` y `model RecipeLine` no ganaron ni perdieron
     ninguna columna, índice o restricción respecto al estado que dejó QC-24: se extrae
     el cuerpo de cada modelo, se normalizan espacios internos y se compara línea a línea
     (`toEqual`) contra el snapshot exacto de columnas, `@@index`, `@@unique` y `@@map`
     actuales. Es descriptivo sobre estos DOS modelos, no un censo global del schema.

Verificación: `pnpm exec vitest run tests/unit/recetas/scope.test.ts` → 5 passed.

En la primera pasada el test se auto-disparaba en dos sitios (falsos positivos
detectados y corregidos antes de darlo por bueno):
- El patrón de paginación era demasiado genérico (`offset[:=]`, `totalPages[:=]`)
  y disparaba sobre `Page<T>.totalPages: number` (declaración de tipo, no cómputo) y
  sobre el parámetro `offset = 0` de `recipe-image.ts` (offset de bytes, no de
  paginación). Se acotó a los tres patrones de arriba, atados a `page`/`total`/`pageSize`.
- El propio `scope.test.ts` se detectaba a sí mismo al buscar la cadena literal
  `@supabase/storage-js` (porque la cita en su propia regex). Se excluyó su propio
  `fileURLToPath(import.meta.url)` del barrido.

## Mapa `R<n> → test` de este grupo

| R | Test |
| --- | --- |
| R23 | `tests/unit/recetas/recipe-image.test.ts` |
| R31 (parte) | `tests/unit/recetas/scope.test.ts` → `el modulo recetas no reimplementa el calculo de paginacion` |
| R41 | `tests/unit/recetas/scope.test.ts` → `esta feature no anade ninguna columna, indice ni restriccion a recipes ni a recipe_lines` |
| R43 (parte) | `tests/unit/recetas/scope.test.ts` → `ningun test importa @supabase/storage-js ni el adaptador de Storage` |
| R44 | `tests/unit/recetas/scope.test.ts` → `no existe ninguna pantalla, pagina ni componente de recetas, ni spec E2E nuevo` |

R2, R3, R38, R39 (autorización, borde, Server Actions) NO se cierran en este grupo: sus
tests (`authorization.test.ts`, `recipe-input.test.ts`, `recipe-actions.test.ts`) son del
Grupo B/C, que dependen de los casos de uso y las Server Actions que este grupo aún no
construye. La cláusula de R39 que sí toca T3 —"no hay ningún route handler bajo
`app/api`"— queda cubierta arriba.

## Verificación de la tanda (Grupo A completo)

- `pnpm run typecheck` → limpio (sin salida, exit 0).
- `pnpm run lint` → limpio (sin salida, exit 0).
- `pnpm exec vitest run tests/unit/recetas` → 6 test files, 62 tests, todos passed
  (incluye los 2 nuevos de este grupo más los ya existentes de QC-24:
  `module-contract.test.ts`, `domain/`, `schema/`).
- `pnpm exec vitest run guard --passWithNoTests` → 12 test files, 123 tests, todos passed
  (incluye `guard-dependencias-aprobadas`, `guard-arquitectura-modulos`, `guard-rls-force`
  sin regresión).

No se corrió `./init.sh` completo ni la suite entera: instrucción explícita del prompt
para esta tanda (solo typecheck + lint + los tests propios del grupo). Corresponde a T16
cerrar con `./init.sh` completo antes del PR.

## Qué resultó imposible de cumplir tal como está escrito en el spec

Nada. Las cuatro tasks del Grupo A se completaron tal como las describen `design.md` y
`tasks.md`, sin necesidad de reinterpretar ningún requisito.

## Veredicto

Grupo A (T0–T3) cerrado: dependencia instalada y aprobada, dominio base (`actor.ts`,
`errors.ts`, `page.ts`) sin imports prohibidos, detección de imagen por contenido con su
tabla de firmas, y test de alcance adelantado en verde y sensible a las cuatro
regresiones que debe cazar. Listo para que el Grupo B (T4–T8, T17, T18) construya sobre
esta base.
