# QC-93 — aterrizaje-sin-permiso-de-modulo · tasks.md

Orden por dependencias. `[P]` = puede ir en paralelo con las otras `[P]` de su bloque.
Cada tarea dice **que archivos toca** y **cuando esta hecha**.

## [x] T1 — Medir el rojo ANTES de tocar nada (base limpia, dos motores)

Toca: nada. Produce: la corrida de referencia.

1. Base limpia y sembrada para el E2E (migrar + `pnpm run db:seed`), **no** la de desarrollo con
   estado arrastrado — ese estado es lo que escondia el fallo (`design.md > 0.4`).
2. `pnpm exec playwright test` completo, Chromium **y** WebKit.

**Hecho cuando:** en `progress/impl_QC-93-*.md` esta pegado el resumen —`N passed / M failed`— y la
**lista de archivos rojos con su test**. Ese M es el numero de esta ficha, salga 8, 17 o 23; no se
copia el «23» de la ficha (`design.md > 0.4`).

## [x] T2 — El helper unico  ·  R1, R2, R3, R4, R5, R6, R7

Toca: **`e2e/helpers/landing.ts`** (nuevo).

Las cuatro exportaciones de `design.md > 2`, en ingles. `landingRouteForPermissions` compone
`filterNavItemsByPermissions` + `firstVisibleNavHref` sobre `PRIVATE_NAV_ITEMS` con
`?? DASHBOARD_ROUTE`; `permissionsForUsername` lee usuario→rol→`role_permissions` con el `prisma`
compartido y **lanza nombrando el username** si no hay usuario vivo.

**Hecho cuando:** `pnpm run typecheck` y `pnpm run lint` verdes, y el archivo **no importa nada
nuevo**: solo `@playwright/test`, `@/lib/shared/db/prisma`, `@/lib/shared/navigation/private-nav` y
`@/lib/shared/routes`.

## [x] T3 — Confirmar que Playwright NO recoge el helper como test  ·  R1

Toca: nada (verificacion). Depende de T2.

**Hecho cuando:** `pnpm exec playwright test --list` no menciona `e2e/helpers/landing.ts` y el conteo
de tests listados es el mismo que antes de T2.

## [x] T4 — Test unitario del helper  ·  R2, R3, R4, R5

Toca: **`tests/unit/e2e-helpers/landing.test.ts`** (nuevo, proyecto `node`).

Casos: permisos de Administrador → `DASHBOARD_ROUTE`; permisos de Operador
(`['inventario.consultar','asignaciones.consultar']`) → `/inventario`; **lista vacia →
`DASHBOARD_ROUTE`** (R3); un permiso inventado → `DASHBOARD_ROUTE`. Sobre `landingRouteForPermissions`,
que es puro y no necesita base.

**Hecho cuando:** los cuatro casos pasan en `pnpm test` y el mapa `R2, R3 -> este archivo` esta
escrito en el progreso. (R4/R5 se cierran en T11 con la corrida real, que es donde hay base.)

## T5 — Migrar los **cuatro casos** de «acaba fuera»  ·  R11, R12, R13

Toca, uno por tarea paralela:

- `[P]` **`e2e/inventario.spec.ts`** (`:203-208` el `login()` propio, `:571-...` el caso R4)
- `[P]` **`e2e/pedidos.spec.ts`** (`:168-173`, `:447-...` R49)
- `[P]` **`e2e/proveedores.spec.ts`** (`:175-180`, `:467-483` R52)
- `[P]` **`e2e/recetas.spec.ts`** (`:148-153`, `:376-...` R6)

Plantilla exacta en `design.md > 4`. Se borra el `login()` local, se usa `loginAndLand`, el cuerpo
pasa a **404 sin redireccion + `private-not-found` + cuenta cero**, y el titulo **conserva su `R<n>`**.

**Hecho cuando:** cada archivo pasa **solo**, en los dos motores:
`pnpm exec playwright test e2e/<archivo>.spec.ts`.

## [x] T6 — Migrar las otras nueve suites  ·  R8

Depende de T2. Paralelizable en dos tandas:

- `[P]` `e2e/aislamiento-inventario.spec.ts` (`:230-235`), `e2e/recetas-pasos.spec.ts` (`:124-129`),
  `e2e/errores.spec.ts` (`:199-203`), `e2e/establecer-contrasena.spec.ts` (`:272-280`),
  `e2e/login.spec.ts` (`:305-314`)
- `[P]` `e2e/usuarios.spec.ts` (`:234-239`, `:320`, `:434`), `e2e/unidades.spec.ts` (`:235-240`,
  `:370`, `:469`), `e2e/presentaciones.spec.ts` (`:192-197`, `:301`, `:362`),
  `e2e/grupos-de-trabajo.spec.ts` (`:243-248`, `:369`)

En las cuatro de la segunda tanda desaparece tambien **el parametro `landing`** (R7): el destino ya
no se escribe en la llamada.

**Hecho cuando:** `grep -n "DASHBOARD_ROUTE\|async function login(" e2e/*.spec.ts` no devuelve
ninguna espera de aterrizaje con ruta escrita, y cada archivo pasa solo en los dos motores.

## [x] T7 — `session.spec.ts` y `permisos.spec.ts` se quedan como estan  ·  R10

Toca: nada. Es una decision que hay que **dejar escrita**, no un cambio.

**Hecho cuando:** el progreso dice por que cada uno queda fuera (`returnTo` en `session.spec.ts:247-260`;
aterrizaje ya derivado en `permisos.spec.ts:214`) y `git diff --stat` confirma que no se tocaron.

## [x] T8 — El caso nuevo del usuario sin ningun permiso  ·  R14, R15, R16, R17, R18

Toca: **`e2e/login.spec.ts`** (un solo `test` nuevo). Depende de T2 y T6.

Reutiliza `createTestUser()` y su rol efimero sin permisos (`login.spec.ts:229-235`). Guion en
`design.md > 5`. La cuenta cero de testids de datos **es** la sonda de R18.

**Hecho cuando:** el caso pasa en Chromium y WebKit. **Si falla porque el usuario VE datos de algun
modulo: se para todo, se abre ficha de seguridad y no se sigue** (R18, decision cerrada nº 6).

## [x] T9 — La guardia del patron  ·  R9

Toca: **`tests/guards/guard-e2e-landing.test.ts`** (nuevo). Depende de T5, T6, T8.

Recorre `e2e/**/*.spec.ts` y muerde ante un `login()` local o un `waitForURL` de aterrizaje con ruta
constante. Excepciones nombradas **con motivo escrito** para `session.spec.ts` y `permisos.spec.ts`.

**Hecho cuando:** (a) pasa sobre el arbol ya migrado; (b) **se prueba que muerde**: se reintroduce a
mano el patron en un spec, la guardia sale roja nombrando el archivo, se restaura **desde una copia**
(`cp`, no `git checkout` — `docs/verification.md > Probar que muerde`).

## [x] T10 — Auditoria del diff prohibido  ·  R19, R20, R21, R22

Toca: nada. Depende de T5-T9.

`git status --porcelain` y `git diff --stat origin/dev...HEAD` sobre `app/`, `lib/`, `db/`,
`scripts/`, `package.json`, `pnpm-lock.yaml`.

**Hecho cuando:** la salida sobre esas rutas es **vacia** y esta pegada en el progreso. Modificados
esperados: solo `e2e/**`, `tests/guards/guard-e2e-landing.test.ts`, `tests/unit/e2e-helpers/landing.test.ts`
y `specs/`+`progress/`.

## T11 — Gate completo  ·  R9, R21, R22

`./init.sh` completo. **Hecho cuando:** verde, con la guardia nueva ejecutandose (aparece en la
salida) y sin archivos rojos fuera de `tests/baseline-rojos.json`.

## T12 — La verificacion que esta ficha exige de verdad  ·  R23, R24

Depende de todo lo anterior. **Es la tarea final y no es opcional: `init.sh` no corre Playwright, asi
que un gate verde no dice nada de esta feature** (decision cerrada nº 8).

1. **Base limpia**, migrada y sembrada, igual que en T1.
2. `pnpm exec playwright test` **completo**, Chromium **y** WebKit.
3. Comparar con la medicion de T1.

**Hecho cuando:** en el PR estan escritos (a) el resultado de T1, (b) el de ahora, (c) la diferencia,
y (d) **para cada rojo que sobreviva, su causa nombrada y distinta de esta** —con `errores.spec.ts`
explicitamente resuelto: o pasa, o se dice por que falla y a que ficha va (`design.md > 0.4`)—.
Ningun rojo que quede puede tener como causa el aterrizaje derivado del menu.

## T13 — Trazabilidad

Toca: **`progress/impl_QC-93-aterrizaje-sin-permiso-de-modulo.md`**.

**Hecho cuando:** existe el mapa completo `R1..R24 -> test concreto` (archivo y nombre del caso), con
los negativos R19-R22 mapeados a la auditoria de T10 y R23/R24 a la corrida de T12. Un requisito sin
test es un fallo de la feature (`CHECKPOINTS.md > Trazabilidad`).
