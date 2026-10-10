# QC-255 — sanear-suite-e2e · bitacora de implementacion

> Implementer (frontend_dev), 2026-10-10, worktree `.worktrees/QC-255-sanear-suite-e2e`.
> Spec aprobado con los defaults de P1–P7. Sin dependencias nuevas. Sin cambios en `app/`, `lib/`,
> `components/`, `hooks/`, `middleware.ts` ni `db/` (R22).

## Tandas y commits

| Tanda | Tarea | Commit |
|---|---|---|
| 1 | T1 — helper `createFixtureUser` y su test unitario | `adee47f1` |
| 1 | T2 — guardia de usuarios de fixture | `2d0edcdf` |
| 2 | T3 — 54 sitios en 52 specs al helper | `80148072` |
| 2 | Desviacion D-1/D-2 — `errores` y `session` | `ecbea65e` |
| 2 | T4 — presentaciones, aislamiento-recetas, pedidos-cotizacion | `3086169c` |
| 2 | T5 — permisos, grupos-de-trabajo, datos-de-lote | `7dc642b0` |
| 2 | T6 — proveedores, usuarios | `40a673ec` |
| 3 | T7 — guardia de saltos | `f8dc4478` |
| 3 | T8 — `actionTimeout`, matriz por navegador, guardia de presupuesto | `260c5513` |
| 3 | T7 — esta bitacora y la tabla de equivalencias | (commit de cierre) |

T2 se commiteo roja (tal como pide `tasks.md`) y se empujo junto con T3, ya en verde: ningun
push lleva la guardia en rojo.

## Archivos

Nuevos:

- `e2e/helpers/fixture-user.ts`
- `tests/unit/e2e-helpers/fixture-user.test.ts`
- `tests/guards/guard-e2e-fixture-user.test.ts`
- `tests/guards/guard-e2e-sin-saltos.test.ts`
- `tests/guards/guard-e2e-presupuesto.test.ts`
- `progress/impl_QC-255.md`

Modificados:

- `playwright.config.ts` (`use.actionTimeout: 30_000`)
- `.github/workflows/gate.yml` (job `e2e-navegador` en matriz + job agregador `e2e`)
- Los 52 specs de `tasks.md > Archivos esperados` (import + `createFixtureUser`), y ademas los
  cuerpos de: `errores`, `session`, `presentaciones`, `aislamiento-recetas`, `pedidos-cotizacion`,
  `permisos`, `grupos-de-trabajo`, `datos-de-lote-en-acondicionamiento`, `proveedores`,
  `usuarios`.

Listas cerradas revisadas: no se anade ningun spec E2E nuevo; `tests/unit/clientes/scope.test.ts`
(`E2E_PERMITIDOS`) y `tests/unit/shared/data-table-alcance.test.ts` siguen verdes sin tocarlas.

## Mapa R → test

| R | Test |
|---|---|
| R1, R2, R3, R4 | `tests/unit/e2e-helpers/fixture-user.test.ts` (10 casos: sello con `now` en `.000/.500/.999`, iat del mismo segundo por encima del sello, `active` por defecto, `pending` y sello explicitos respetados, resto de datos intacto, `select` y retorno) |
| R5, R6 | `tests/guards/guard-e2e-fixture-user.test.ts` (caso sintetico rojo + recorrido de `e2e/`) |
| R7 | `e2e/session.spec.ts` (los dos casos de revocacion), `e2e/cierre-de-sesiones.spec.ts` |
| R8 | `e2e/login.spec.ts` (cuentas `pending`, `inactive`, `blocked`), `e2e/establecer-contrasena.spec.ts` |
| R9 | `e2e/errores.spec.ts` |
| R10 | `e2e/presentaciones.spec.ts` (R36) |
| R11 | `e2e/aislamiento-recetas.spec.ts` (paso 4) |
| R12, R13 | `e2e/pedidos-cotizacion.spec.ts` (los dos casos) — importes sin cambiar |
| R14 | `e2e/permisos.spec.ts` (404 del Operador) |
| R15 | `e2e/grupos-de-trabajo.spec.ts` (R42) |
| R16 | `e2e/datos-de-lote-en-acondicionamiento.spec.ts` (R28 del spec; el paso que abre los lotes) |
| R17 | `e2e/proveedores.spec.ts` (alta del Administrador, paso 10) |
| R18 | `e2e/usuarios.spec.ts` (`afterAll`) + consulta a la base tras correrlo: 0 usuarios y 0 empresas `qc67_e2e_*` |
| R19 | `tests/guards/guard-e2e-sin-saltos.test.ts` |
| R20, R21 | Tabla de abajo |
| R22 | `git diff --name-only origin/dev...HEAD` (ver «Verificacion») |
| R23, R24, R25 | `tests/guards/guard-e2e-presupuesto.test.ts` |
| R26, R27 | Run de CI que lanza el leader (pendiente) |

## Tabla de equivalencias (R20)

Ninguna afirmacion se borra sin su equivalente; no se anade `force: true` ni se sube ningun
timeout de caso. No hay ningun caso de R21.

| Caso | Antes | Despues | Origen del comportamiento actual |
|---|---|---|---|
| `errores.spec.ts` — error inesperado (QC-70 R33) | El usuario del fixture nacia sin `accountStatus` (`pending`) y el login no entraba. | Nace `active` por el helper y aterriza (R9). | QC-65 / QC-78 (`pending` por defecto). |
| `errores.spec.ts` — mismo caso, paso 4 (**desviacion D-1**) | `recipe-list-error-message` con `errorMessage('unexpected')` y `recipe-list-error-code` con `unexpected`. | Dentro de `recipe-list-error`: `unexpected-error-notice` con `data-code="unexpected"`, su `unexpected-error-notice-message` con `errorMessage('unexpected')` y `unexpected-error-notice-reference` visible. El chequeo del HTML sin detalle interno (R13) no cambia. | QC-71 (`f115cb94`, el error inesperado se pinta con `UnexpectedErrorNotice` y el identificador de la peticion) y QC-231 (`f3c00f62`, formulas con `ErrorState`/`ErrorAlert` compartidos). |
| `session.spec.ts` — `afterAll` (**desviacion D-2**) | Borraba usuarios directamente: `revoked_sessions_user_id_fkey` lo rechazaba despues del cierre de sesion del ciclo. | Borra antes las sesiones cerradas de sus usuarios (mismo `where` por prefijo de `RUN_ID`), igual que `login.spec.ts`. | QC-23 (`revoked_sessions.user_id` `onDelete: Restrict`). |
| `presentaciones.spec.ts` R36 (spec dueño QC-45) | Alta solo con el nombre; el panel no se cerraba. | Elige ademas la unidad (`presentation-unit-select` → primera opcion), mismo gesto que el alta rapida de `566d122d`. Panel cerrado, toast, fila filtrada y fila en base: sin cambios. | QC-80 (unidad obligatoria). |
| `aislamiento-recetas.spec.ts` paso 4 (spec dueño QC-50) | Tecleaba solo el nombre; `recipe-form-submit` seguia deshabilitado. | Siembra un producto de A en el `beforeAll`, lo elige en la linea 0 al 100 % y afirma `toBeEnabled()` antes de guardar. Las afirmaciones de aislamiento (listas, HTML, foto de la receta de B, dos recetas con el mismo nombre en dos empresas) intactas. Limpieza: productos por empresa, despues de las recetas. | `afa5a867` (2026-09-23, `canSubmit = isComplete && hasAllProducts`). El commit no cita ficha (`git log`: «feat(recetas): tabs ingredientes/herramientas…», autor cquevedo1): entro fuera del arnes. |
| `pedidos-cotizacion.spec.ts` — recorrido (a)–(d) (spec dueño QC-151) | Cotizaba sin unidad: `order-cost-quote-value` se quedaba en «—». Elegia la unidad en (d). | Elige la unidad (litro, la del fixture) antes de (a); (d) ya no la elige. Importes identicos: 12.750,00, 12.752,55, «—», 12.755,00 con envase, guardado 12755.0000. | QC-204 (`1c201406`, la cotizacion exige `unitId`). |
| `pedidos-cotizacion.spec.ts` — R59 | Igual: sin unidad. | Elige la unidad antes de teclear 30. Importe identico: 370,00. | QC-204 (`1c201406`). |
| `permisos.spec.ts` — 404 del Operador (spec dueño QC-74/QC-75) | Abria `private-user-trigger` con foco + `Enter` y afirmaba `private-logout` visible. | `private-logout` visible, enfocado por teclado y `toBeFocused()`. Se mantiene la razon de usar teclado (overlay de `next dev` en WebKit). Aterrizaje, menu corto y 404 sin pista sin cambios. | Enmienda del 2026-09-07 (`components/private/nav-user.tsx`: el logout es boton del encabezado). |
| `grupos-de-trabajo.spec.ts` R42 (spec dueño QC-85) | `work-group-member-search` y `work-group-candidate[data-user-id]`. | En el bloque `work-group-members`: `data-table-search` con el username, la fila `data-table-row-<id de la persona>` es la unica fila del selector, y se pulsa su boton «Agregar: <nombre mostrable>». Las afirmaciones de miembro (fila unica, nombre, posicion, base) sin cambios. | `897a4f91` y `527a9902` (2026-10-02, fuera del arnes, QC-180). |
| `datos-de-lote-en-acondicionamiento.spec.ts` (spec dueño QC-219, caso R28) | Click directo en `product-batches-open` dentro de la fila. | `openRowActionsMenuItem(page, fila.getByTestId('product-row-actions'), 'product-batches-open')`, igual que los otros cuatro specs. Afirmaciones del panel de lotes sin cambios. | QC-232 (`c2d4d46f`). |
| `proveedores.spec.ts` R51 (spec dueño QC-44, R41 del costo) | `data-table-cell-cost` con texto `12.3456`. | Texto `12.35` y el `title` del valor (el `span` con `title` dentro de la celda) igual a `12.3456`, la cadena que el caso tecleo. | `682d3e3b` (2026-09-17, la pantalla redondea a dos). |
| `usuarios.spec.ts` `afterAll` (spec dueño QC-67) | `user.deleteMany` fallaba por `credential_setup_tokens_user_id_fkey`, y el `finally` de la empresa tapaba ese error. | Pasos tokens → usuarios → empresa, cada uno corre aunque falle el anterior y se relanza el PRIMER fallo (patron `primerFallo`). | QC-79 (crear un usuario genera su token, `onDelete: Restrict`). |

## Desviaciones respecto al spec

- **D-1, `errores.spec.ts` paso 4.** El diagnostico solo vio el fallo de login (B); con el usuario
  `active`, el caso llega al paso 4 y falla por otro motivo que llevaba oculto desde el
  2026-09-10: el error inesperado ya no pinta `recipe-list-error-message`/`-code`, sino el aviso
  compartido. Hay equivalente directo (mensaje, codigo en `data-code`, mas el identificador), asi
  que se adapta segun D7 en vez de parar (no es R21). Lo anoto para que el reviewer lo valide.
- **D-2, `session.spec.ts` `afterAll`.** Mismo patron que F, en otro spec: la limpieza chocaba con
  `revoked_sessions_user_id_fkey`. Arreglo de fixture, sin cambio de afirmaciones.
- **Matriz: `timeout-minutes: 60` por navegador** (como el job unico de antes). No se baja hasta
  medir el run de cierre.
- **T2 y el push:** ver «Tandas».

## Verificacion local (2026-10-10)

Entorno: base aislada `quimicloude_e2e_qc255` en `quimicloude-pg17:5433`, copia de la plantilla
`qct_tpl_709b209fd728` (`pnpm run db:test template`, 82 migraciones, sembrada), igual que el job
`e2e` de `gate.yml`; `.env` del repo cargado y `DATABASE_URL`/`DIRECT_URL` sobreescritas,
`APP_BASE_URL=http://localhost:3117`. Servidor: el `webServer` de `playwright.config.ts`
(`next dev` en 3117). En local `retries` es 0: cada rojo es un rojo en el primer intento. Al final
se borro la base y el 3117 quedo libre.

| Corrida | Resultado | Tiempo |
|---|---|---|
| T3, primera pasada (errores, session, cierre-de-sesiones, login), chromium | 8 passed, 2 failed → destapo D-1 y D-2 | 1.3 min |
| Los 13 specs tocados (T3–T6 + establecer-contrasena), chromium | **23 passed**, 0 failed | 1.3 min |
| Los mismos 13 specs, webkit | **23 passed**, 0 failed | 2.0 min |
| Suite completa, chromium (base nueva) | **171 passed**, 0 failed, 0 skipped | 7.9 min |
| Suite completa, webkit (base nueva) | **170 passed, 1 failed**, 0 skipped | 7.9 min |
| `acondicionar-con-equipo.spec.ts`, webkit, `--repeat-each=3` | 2 passed, 1 failed | 1.5 min |

`GET /login?sesion=fin` en el log del servidor: 3 por corrida completa (chromium y webkit) y 3 en
cada corrida de los 13 specs: los dos casos de revocacion de `session.spec.ts` (cuenta inactiva y
ficha dada de baja) y el de `cierre-de-sesiones.spec.ts`. Ninguno espurio. Antes: 89 en el run
de #199.

`interrupted by another navigation`: 0 apariciones en los logs locales.

### Flaky a vigilar (entrada para QC-208, P3)

- `e2e/acondicionar-con-equipo.spec.ts:395` (R33 y R34 de QC-218), **solo webkit**, 1 de 4 en
  rojo en la suite completa y 1 de 3 en `--repeat-each=3`; verde en chromium. Falla en dos sitios
  distintos, los dos justo despues de una Server Action con dialogo:
  - paso 4: `conditioning-order-screen > conditioning-order-status` no aparece tras cerrar el
    dialogo de comenzar (la pantalla no esta en el arbol);
  - paso 7: `page.waitForURL` a «Por acondicionar» agota sus 60 s tras «Terminar».
  No toca nada de esta ficha (el spec solo cambia en como crea sus usuarios) y no es el patron del
  sello (sin `sesion=fin`). Es la misma familia que QC-208 (navegacion/refresco en WebKit sobre
  `next dev`). En CI tiene `retries: 2`. Si el run de cierre lo da en rojo duro, es la primera
  entrada de QC-208.

### Comandos

- `pnpm run typecheck` → OK (tras `pnpm exec next typegen`, que el worktree nuevo no tenia).
- `pnpm run lint` / `pnpm exec eslint e2e playwright.config.ts tests/guards/…` → `No issues found`.
- `pnpm exec vitest run tests/unit/e2e-helpers/fixture-user.test.ts` → 10 passed.
- `pnpm exec vitest run tests/guards tests/unit/shared tests/unit/clientes tests/unit/e2e-helpers`
  → 135 files passed, 1689 passed | 19 skipped (los skipped son previos, de vitest).
- `./init.sh` (con el `.env` cargado) → `== init OK ==` (typecheck, lint, `test:rapido` 108
  archivos / 1472 passed, guardias, validador y perfil). Avisos en amarillo previos y ajenos: 60
  tests de arbol fuera del gate rapido, base de desarrollo compartida 5 migraciones atras.
- `pnpm exec playwright test --list` → 171 `[chromium]` + 171 `[webkit]` = 342, los mismos que
  antes (T8).
- R22: `git diff --name-only origin/dev...HEAD` no lista nada bajo `app/`, `lib/`,
  `components/`, `hooks/`, `middleware.ts` ni `db/` (0 de 64 archivos).

## Lo que falta

- **T9 (R26, R27):** el `workflow_dispatch` de `gate.yml` sobre esta rama lo lanza el leader. Hay
  que anotar aqui: id del run, duracion de `e2e (chromium)`, `e2e (webkit)` y `e2e`, recuento
  `passed / flaky / failed / skipped` por proyecto, `sesion=fin` atribuidos (solo `session.spec.ts`
  y `cierre-de-sesiones.spec.ts`) y la lista de flaky con su primer error.

## Veredicto

Suite E2E saneada en local (chromium 171/171; webkit 170/171 con un flaky de WebKit ajeno al
sello), gate local en verde; falta el run de CI de T9.
