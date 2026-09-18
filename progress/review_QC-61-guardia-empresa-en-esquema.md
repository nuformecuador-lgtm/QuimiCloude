# QC-61 — guardia-empresa-en-esquema · review (F2.2)

Fecha: 2026-09-18 · Rama `feature/QC-61-guardia-empresa-en-esquema` · Diff revisado: `git diff 39a7b110..HEAD`
(4 commits: `61aba4a2`, `ee448852`, `44cf2f69`, `29145768`). Entorno: Node v26.7.0, Windows, `core.autocrlf=true`.

## Veredicto: **OK (aprobado)**

Cero bloqueantes, cero mayores, cinco menores. La guardia muerde en todas sus ramas (11 mutaciones
de codigo y 8 de archivos reales, todas en rojo donde tocaba; ver abajo), nace verde sobre el
`db/schema.prisma` real y la lista de exentas es la misma en los cuatro sitios.

## Checklist

- [x] **Spec**: `requirements.md` (R1-R16 EARS), `design.md` (tres alternativas descartadas, § 4-6), `tasks.md`.
- [x] **Tasks**: T1-T9 marcadas `[x]` (T5, T7, T8 entran por la aprobacion F1.4 A/B/C del 2026-09-18).
- [x] **Trazabilidad**: cada R1-R16 mapea a un `it` concreto; mapa copiado en `progress/impl_…md`. Ver mapa verificado abajo (R12 con matiz, menor 1).
- [x] **typecheck** exit 0, **lint** exit 0 (corridos por el reviewer).
- [x] **Guardia nueva**: `pnpm exec vitest run tests/guards/guard-empresa-en-esquema.test.ts` -> 15/15 verde, exit 0.
- [x] **test:guardias**: 45/45 archivos, 555 passed | 9 skipped, exit 0 (segunda corrida; la primera, ver menor 5).
- [~] **`./init.sh --rapido`**: exit 1 en el validador, «faltan specs para features sdd en vuelo: QC-68». Ajeno: QC-68 esta en curso en otra maquina. El error de cupo que anotaba la bitacora ya no sale tras `29145768` (QC-59 a `done`, coincide con el PR #84 mergeado).
- [~] **`./init.sh` completo**: no re-corrido entero. La bitacora mide 36 archivos rojos fuera del baseline, identicos (diff vacio) a los del padre `39a7b110` sin los commits de la rama. Se acepta como linea base/entorno: el diff no toca ningun archivo de produccion (`app/`, `lib/`, `components/`, `db/`, `scripts/`, `package.json`); solo anade un `*.test.ts` autocontenido que no importa nada del repo y edita tres `.md` y `feature_list.json`, asi que no puede alterar tests de integracion ni de UI. No es regresion de esta rama; si es condicion pendiente antes del PR (regla 5 de `CLAUDE.md`), decision del leader.
- [x] **Sin E2E** (no pedido, D7), **sin migracion**, **sin RLS** que revisar (no hay tabla nueva).
- [x] **Dependencias**: `git diff origin/dev -- package.json pnpm-lock.yaml` = 0 lineas. Solo `node:fs`, `node:path`, `node:url`, `vitest`.
- [x] **Aislamiento por empresa**: el diff no anade modelos ni consultas. Es la propia guardia de esa regla.
- [x] **Multiplataforma**: no toca UI.
- [x] **Secretos / hardcode de contexto**: ninguno.
- [x] **Comentarios**: ninguna cita `QC-<n>`, `R<n>`, `design.md` ni «decision cerrada» en comentarios del archivo nuevo (grep). `R<n>` solo en nombres de `it`. Los motivos de `EXENTAS` no citan fichas.
- [x] **Lista de exentas coherente en los cuatro sitios**:
  - guardia `tests/guards/guard-empresa-en-esquema.test.ts:86-95`: las ocho, cada una con motivo, sin `users`;
  - `docs/architecture.md:30-38`: las mismas ocho entre comillas invertidas; `users` sin comillas y declarada no exenta; conserva «BLOQUEANTE» (y lo comprueba el `it` R14);
  - `CHECKPOINTS.md:28-31` y `.claude/agents/reviewer.md:33-38`: ya no enumeran, remiten a `architecture.md > Dominio` y a la guardia, y dicen que `users` no es exenta.
  - Grep de la lista vieja («tres del sistema», `users`/`roles`/`document_types` como exentas) fuera de `specs/` y `progress/` historicos: 0 apariciones.
- [x] **Nace verde sobre el esquema real**: 20 modelos; `hallazgosSinEmpresa` = `[]`, `hallazgosExentasQueSobran` = `[]`, `users` con `company_id`. Tambien verde con el esquema convertido entero a CRLF.

## Falsabilidad (mutaciones locales, restauradas con `git checkout -- <archivo>`; `git status` limpio al final)

Codigo de la guardia (`vitest run` del archivo):

| Mutacion | Exit | Caen |
|---|---|---|
| quitar `normalizarFinesDeLinea` | 1 | R11 |
| quitar `quitarComentariosDeLinea` | 1 | R5, R11 |
| quitar la exencion en `hallazgosSinEmpresa` | 1 | R4, R10 |
| no mirar la columna (solo exencion) | 1 | R3, R10 |
| ignorar `@@map` (tabla = modelo) | 1 | R2, R4, R5, R6, R10, R16 |
| ignorar `@map` (columna = nombre de campo) | 1 | R3, R10, R16 |
| motivo sin `.trim()` | 1 | R9 |
| `hallazgosExentasQueSobran` sin la rama «ya declara» | 1 | R16 |
| `hallazgosExentasQueSobran` sin la rama «no existe» | 1 | R16 |
| anadir `users` a `EXENTAS` | 1 | R7, R10, R14, R16 |
| quitar `recipe_lines` de `EXENTAS` | 1 | R7, R10, R14 |

Archivos reales:

| Mutacion | Exit | Caen / mensaje |
|---|---|---|
| `db/schema.prisma` vacio | 1 | R1, R10, R16 |
| `db/schema.prisma` solo con un `enum` | 1 | R1, R10, R16 |
| `Product` sin su linea `company_id` | 1 | R10, nombra el modelo `Product` y la tabla `products` |
| `Product` con `company_id` solo en un comentario colgado de otro campo | 1 | R10 |
| `model Foo` con `@@map("foos")` sin empresa | 1 | R10, nombra `Foo` y `foos` |
| esquema entero en CRLF | 0 | (verde, como exige R11) |
| `recipe_lines` sin comillas en el bullet de `architecture.md` | 1 | R14 |
| frase inicial del bullet cambiada | 1 | R14 (no pasa en vacio) |

## Mapa de trazabilidad verificado (`tests/guards/guard-empresa-en-esquema.test.ts`)

| R | `it` (linea) | Lo verifica de verdad |
|---|---|---|
| R1 | `R1 lee db/schema.prisma sin cliente generado ni red` (186) | Si para «lee y juzga cada modelo»; lo de «sin cliente/red» se verifica por inspeccion de imports (7-11), ver menor 2 |
| R2 | `R2 da rojo a un modelo sin company_id…` (191) | Si, mensaje exacto con `toEqual`; y R10 muerde sobre el esquema real |
| R3 | `R3 acepta la columna obligatoria y la opcional` (200) | Si |
| R4 | `R4 no juzga a una exenta sin columna` (213) | Si |
| R5 | `R5 no cuenta company_id en comentario ni en fields…` (218) | Si (comentario colgado de un campo real, el caso que si depende del despojador) |
| R6 | `R6 un modelo llamado como una exenta con otra tabla…` (252) | Si |
| R7 | `R7 EXENTAS son exactamente las ocho y users no esta` (261) | Si (conjunto + longitud 8, atrapa duplicados) |
| R8 | `R8 cada entrada de EXENTAS lleva su motivo` (279) | Si |
| R9 | `R9 una exenta sin motivo da rojo` (286) | Si, con simetrico |
| R10 | `R10 el esquema real queda en verde…` (293) | Si |
| R11 | `R11 CRLF y LF dan los mismos hallazgos` (301) | Si (la mutacion sin normalizar lo tumba) |
| R12 | `R12 un esquema sin modelos da rojo` (318) | Parcial: el `it` solo prueba que `leerModelos` devuelve `[]`; el rojo lo da la asercion de R1 (187). Comportamiento comprobado por mutacion. Ver menor 1 |
| R13 | `R13 la guardia vive en tests/guards…` (324) | Si, junto con `package.json:13` (`vitest run guard`) y `scripts/test-rapido.mjs:77`; el completo corre todo vitest. Sin E2E en el diff |
| R14 | `R14 la lista de docs/architecture.md coincide con EXENTAS` (331) | Si: doc real + fixture de menos + fixture de mas + bullet ausente |
| R15 | `tests/guards/guard-dependencias-aprobadas.test.ts` + diff vacio de `package.json` | **Vale.** R15 es una propiedad negativa de este diff, no un invariante permanente: el diff vacio de `package.json`/`pnpm-lock.yaml` contra `origin/dev` (verificado) la demuestra, y la guardia de dependencias impide que una entrada sin aprobacion pase el gate |
| R16 | `R16 una exenta que sobra da rojo` (361) | Si: las dos ramas con su hallazgo exacto y el esquema real `[]` |

Sin R huerfanas.

## Hallazgos

Bloqueantes: 0 · Mayores: 0 · Menores: 5.

1. **menor** — `tests/guards/guard-empresa-en-esquema.test.ts:318-322`: el `it` «R12 un esquema sin
   modelos da rojo» no da rojo con nada; solo afirma que `leerModelos` sobre un texto vacio y sobre
   un esquema con solo `enum` devuelve `[]`. El rojo real sobre un esquema sin modelos lo pone la
   asercion de la linea 187 (dentro del `it` R1, con su mensaje propio), y ademas R10 (296) y R16
   (362). Comprobado vaciando `db/schema.prisma`: exit 1. La proteccion existe, pero el mapa apunta
   a un `it` que no la contiene. Sugerencia: mover la asercion `length > 0` al `it` R12 o citar
   R1:187 en el mapa.
2. **menor** — `tests/guards/guard-empresa-en-esquema.test.ts:186-189`: el nombre promete «sin
   cliente generado ni red», pero eso no se afirma en ningun test; solo se ve en los imports
   (7-11). Aceptable por inspeccion.
3. **menor** — `tests/guards/guard-empresa-en-esquema.test.ts:70,76`: el lector solo reconoce la
   forma `@map("…")` / `@@map("…")`. Con la forma con nombre de Prisma (`@map(name: "company_id")`,
   `@@map(name: "…")`) leeria la columna o la tabla por su nombre Prisma. Falla hacia el rojo (no
   da verdes falsos), y el esquema no usa esa forma hoy.
4. **menor** — `tests/guards/guard-empresa-en-esquema.test.ts:74-77`: un campo de **relacion**
   llamado literalmente `company_id` (`company_id Company @relation(fields: [otra], …)`) contaria
   como columna y daria un verde falso. Caso rebuscado, fuera de lo que R5 pide («sin estar
   declarada como campo propio»), y no aparece en el esquema. Informativo.
5. **menor (entorno, no de la rama)** — primera corrida de `pnpm run test:guardias`: 3 archivos
   rojos por `Test timed out in 15000ms` (`guard-editor-aislado`, `guard-teclear-y-plazo`,
   `proveedores-ui/guard-convenciones-proveedores`), guardias que recorren el arbol. Verdes al
   correrlas solas y en la segunda corrida completa (45/45). La rama no las toca. Flakiness de E/S
   (OneDrive); conviene tenerlo presente al leer un `--rapido` rojo.

Nota, no hallazgo: `29145768` pasa QC-59 a `done` en `feature_list.json` dentro de la rama de
QC-61. Es estado del arnes, va en un commit propio, esta justificado (PR #84 mergeado) y quita el
error de cupo del validador.
