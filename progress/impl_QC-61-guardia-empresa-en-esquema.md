# QC-61 — guardia-empresa-en-esquema · bitacora de implementacion

Fecha: 2026-09-18 · Rama `feature/QC-61-guardia-empresa-en-esquema` · Tasks T1-T9 cerradas (A, B y C aprobadas en F1.4).

## Archivos

| Archivo | Cambio | Task | Quien |
|---|---|---|---|
| `tests/guards/guard-empresa-en-esquema.test.ts` | nuevo (378 l.): `leerModelos`, `EXENTAS` (8 con motivo), `hallazgosSinEmpresa`, `hallazgosExentasSinMotivo`, `hallazgosExentasQueSobran`, `hallazgosDocExentas`; 15 `it` | T1, T2, T3, T5, T8 | backend_dev |
| `docs/architecture.md` | bullet «Toda tabla de negocio nueva nace con su columna de empresa.»: las ocho exentas con motivo agrupado, basta con que la columna exista, nombra la guardia, `users` sin comillas y declarada no exenta, conserva «BLOQUEANTE» | T4 | implementer |
| `CHECKPOINTS.md` | la lista vieja de tres se sustituye por remision a `architecture.md > Dominio` y a la guardia | T7 | implementer |
| `.claude/agents/reviewer.md` | idem, punto 8 | T7 | implementer |
| `specs/QC-61-guardia-empresa-en-esquema/tasks.md` | T1-T9 marcadas `[x]` | — | implementer |

Sin cambios en `db/`, `lib/`, `app/`, `components/`, `scripts/`, `package.json`. `git diff origin/dev -- package.json` = 0 lineas.

## Mapa R<n> -> test (`tests/guards/guard-empresa-en-esquema.test.ts` salvo indicacion)

| R | Test |
|---|---|
| R1 | `R1 lee db/schema.prisma sin cliente generado ni red` |
| R2 | `R2 da rojo a un modelo sin company_id que no esta exento` (+ T6 a y b sobre el esquema real) |
| R3 | `R3 acepta la columna obligatoria y la opcional` |
| R4 | `R4 no juzga a una exenta sin columna` |
| R5 | `R5 no cuenta company_id en comentario ni en fields de una relacion` |
| R6 | `R6 un modelo llamado como una exenta con otra tabla da rojo` |
| R7 | `R7 EXENTAS son exactamente las ocho y users no esta` |
| R8 | `R8 cada entrada de EXENTAS lleva su motivo` |
| R9 | `R9 una exenta sin motivo da rojo` |
| R10 | `R10 el esquema real queda en verde y users se juzga por su columna` (+ T6) |
| R11 | `R11 CRLF y LF dan los mismos hallazgos` |
| R12 | `R12 un esquema sin modelos da rojo` |
| R13 | `R13 la guardia vive en tests/guards y la selecciona el patron guard` (+ aparece en `test:rapido`, ver abajo) |
| R14 | `R14 la lista de docs/architecture.md coincide con EXENTAS` |
| R15 | `tests/guards/guard-dependencias-aprobadas.test.ts` (verde) + `git diff origin/dev -- package.json` vacio |
| R16 | `R16 una exenta que sobra da rojo` |

Sin R huerfanas.

## Falsabilidad (T1, T5 — mutaciones a mano, restauradas y verificadas con `diff`)

Hallazgo durante la verificacion: el primer borrador del despojador (`/\/\/.*/` sin `$`) mas el
`.trim()` por linea hacia que quitar la normalizacion CRLF no rompiera nada, y el fixture de
comentario no dependia del despojador (una linea que empieza por `//` nunca casa como campo). Se
corrigio: despojador `/\/\/.*$/` y fixture con el comentario colgando de un campo real
(`otroCampo String // @map("company_id") ...`). Tras eso:

| Mutacion | Resultado |
|---|---|
| (a) quitar `normalizarFinesDeLinea` de `leerModelos` | `R11` ROJO (la version CRLF pierde el hallazgo) |
| (b) quitar `quitarComentariosDeLinea` | `R5` y `R11` ROJOS |
| (c) anadir `` `users` `` al bullet real de `docs/architecture.md` | `R14` ROJO: `docs/architecture.md: el bullet de exentas nombra de mas a users` |

## T6 — muerde sobre los archivos reales (`pnpm run test:guardias -- guard-empresa-en-esquema`, `$?` leido sin pipe)

| Caso | exit |
|---|---|
| sin mutar | 0 |
| (a) sin la linea `companyId` en `model Product` | 1 (`R10` nombra `Product`/`products`) |
| (b) `model Foo` con `@@map("foos")` sin `company_id` | 1 (`R10` nombra `Foo`/`foos`; tambien cae `guard-arquitectura-modulos` por falta de `/// @module`, esperado) |
| (c) `` `users` `` en el bullet de `docs/architecture.md` | 1 (`R14`) |

`git status --short db/ docs/` vacio tras restaurar.

## Salida real de los checks (2026-09-18)

- `./init.sh --rapido` -> **exit 1**, se para en el validador de features, ANTES de typecheck/tests:
  ```
  ✗ feature_list.json invalido:
  zona backend: QC-59, QC-61, QC-68 (3 in_progress, max 2)
  faltan specs para features sdd en vuelo: QC-68
  ```
  Ajeno a esta rama (esta no toca `feature_list.json`). Ademas del rojo de QC-68 ya conocido,
  aparece el de cupo: QC-59 sigue `in_progress` en el `feature_list.json` de esta rama aunque su
  PR #84 ya esta mergeado en `dev`.
- Pasos del gate corridos a mano, con el `.env` cargado como hace `init.sh`:
  - `pnpm run typecheck` -> exit 0
  - `pnpm run lint` -> exit 0
  - `pnpm run test:rapido` -> exit 0; guardias: `Test Files 45 passed (45)` / `Tests 555 passed | 9 skipped (564)`
  - `pnpm exec vitest run tests/guards/guard-empresa-en-esquema.test.ts` -> `Tests 15 passed (15)`
- Suite completa (mitad no rapida de `./init.sh`): `pnpm run test:json` -> exit 1,
  `Test Files 36 failed | 497 passed (533)` / `Tests 435 failed | 7382 passed | 95 skipped (7912)`;
  `scripts/comparar-baseline-rojos.mjs` -> exit 1, 36 archivos en rojo fuera de `tests/baseline-rojos.json`
  (integracion `*-constraints`/`company-scope` y UI `configuracion-ui`, `pedidos-ui`, `recetas-ui`, `shared/data-table*`).
  **Comparado contra la linea base** (worktree temporal en `39a7b110`, el padre de los commits de
  esta rama, mismo `.env` y `node_modules`): `Test Files 36 failed | 496 passed (532)` /
  `Tests 435 failed | 7367 passed | 95 skipped (7897)`, y la lista de 36 archivos rojos es
  **identica** (`diff` vacio). La rama solo suma 1 archivo y 15 tests, en verde. Causas vistas en
  una muestra: `TypeError: Cannot read properties of undefined (reading 'setItem'/'clear')`
  (localStorage bajo Node v26.7.0) y `Found multiple elements` en UI; `expected [ …(9) ] to deeply
  equal [ …(10) ]` en integracion. No investigadas: fuera de alcance.
