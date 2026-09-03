# Implementacion - QC-13 guardia-de-sesion-en-navegacion

> Estado: T1-T5 completas y verificadas. T6 (gate completo `./init.sh`) pendiente, la corre
> el leader antes del PR. No se abrio PR (no corresponde a esta fase).

## Actualizacion de la ronda 2 (cierre de los dos bloqueos)

Los dos bloqueos que dejo la ronda 1 (ver historial mas abajo, conservado para trazabilidad)
quedaron resueltos:

1. **T5 - sync con dev**: el leader reconcilio `dev` local con `origin/dev` (habian
   divergido 11<->10 commits) y mergeo `origin/dev` en esta rama fuera de esta sesion de
   implementer. El merge fue limpio, **sin conflictos** en ningun archivo, incluido
   `private-nav.ts` (terreno compartido con QC-26). Commits de sincronizacion en esta rama:
   `e7f8e01` (merge: reconciliar dev local con origin/dev) y `22effb5` (Merge remote-tracking
   branch 'origin/dev' into feature/QC-13-guardia-de-sesion-en-navegacion). QC-26 seguia sin
   mergear a `origin/dev` en el momento del merge, asi que el terreno compartido
   (`private-nav.ts`, `tests/unit/app-sidebar.test.tsx`) no habia chocado todavia - el bloqueo
   real que aparecia en la ronda 1 (conflicto en `feature_list.json`,
   `progress/current.md`, `progress/history.md`) lo resolvio el leader, no forma parte del
   alcance de este implementer. T5 marcada `[x]` en `tasks.md`.

2. **Pregunta abierta 2 (rol del E2E) - resuelta por decision humana**: el diagnostico de la
   ronda 1 era correcto (el fixture creaba un rol efimero sin permisos y `INVENTORY_ROUTE`
   exige literalmente `ADMIN_ROLE_NAME`). El humano decidio: lo efimero es el usuario, no el
   rol. `e2e/session.spec.ts` (commit `9612544`) ahora:
   - Importa `ADMIN_ROLE_NAME` desde el barrel `@/lib/modules/inventario` (valor, no
     `import type`, no ruta profunda - misma regla que sigue
     `lib/composition/route-role-rules.ts`).
   - En `beforeAll`, busca el rol `Administrador` real con `prisma.role.findUnique({ where:
     { name: ADMIN_ROLE_NAME } })` (sembrado por QC-6) en vez de crearlo; si no existe, lanza
     un error explicito pidiendo correr el seed. No lo crea el test: `roles.name` es unico y
     crearlo desde un E2E lo volveria dato de prueba mezclado con el seed real.
   - `afterAll` ya NO toca la tabla `roles` en ningun caso: se quito el `deleteMany` por
     `ROLE_NAME_PREFIX` (ya no aplicaba, no borraba nada) y se quito la constante
     `ROLE_NAME_PREFIX` por quedar sin uso. Verificado por lectura completa del archivo: no
     queda ninguna rama de `beforeAll` ni `afterAll` que pueda borrar el rol `Administrador`
     real (el unico borrado de `role` que existia se elimino del todo).
   - La limpieza defensiva de huerfanos de usuarios (`USERNAME_PREFIX`) se conserva intacta,
     sigue siendo necesaria porque el usuario del fixture sigue siendo efimero. La parte que
     buscaba roles huerfanos por `ROLE_NAME_PREFIX` se elimino junto con la constante, con un
     comentario explicando que ya no aplica (ningun rol se crea con ese prefijo).
   - Corregido el comentario de cabecera: ya no es cierto que el spec "no use el seed de
     QC-6"; ahora si depende de el para el rol.
   - Esto **cierra en la practica la pregunta abierta 2** de `requirements.md`. No se borro
     del archivo (le corresponde al leader bajarla a decision cerrada); queda anotado aqui
     para que el leader lo haga.

3. **E2E ejecutado por frontend_dev tras el fix**: `pnpm exec playwright test
   e2e/session.spec.ts` -> **2 passed** (chromium 6.3s, webkit 9.7s). El recorrido completo
   aterriza en `/inventario`: pasan `waitForURL((url) => url.pathname === INVENTORY_ROUTE)` y
   `expect(page.getByTestId('inventario-title')).toBeVisible()` en el paso 2, ademas del resto
   de la cadena (nombre real en la barra, cookie de sesion, logout, "atras" no restaura la
   zona privada). R11-R13 quedan demostrados end-to-end, no solo en unit.
   `pnpm typecheck` y `pnpm lint` limpios tras regenerar el cliente de Prisma
   (`pnpm exec prisma generate --schema db/schema.prisma`, necesario por la entrada reciente
   de QC-33/modelo-pedidos via merge; sin cambios de codigo propios de esta ficha).

## Resumen para el leader (ronda 1, historico)

- Feature 100% frontend, delegada en frontend_dev en 3 bloques: T1 (solo), T2+T3 (juntas,
  mismo archivo), T4 (en paralelo con T2+T3, archivo distinto).
- Los tres archivos de la ficha estan completos, commiteados y pasan typecheck/lint/vitest
  propios.
- T5 (sync con origin/dev) se intento y se aborto en la ronda 1: cero conflicto en el terreno
  compartido con QC-26 (QC-26 todavia no esta en origin/dev), pero el merge traia conflicto en
  feature_list.json, progress/current.md y progress/history.md, archivos de bookkeeping
  cross-feature fuera del mandato de este implementer. Resuelto por el leader antes de la
  ronda 2, ver seccion "Actualizacion de la ronda 2" arriba.
- El E2E (corazon de T4) fallaba en la ronda 1, y no por el codigo de esta ficha: materializaba
  exactamente la pregunta abierta 2 del spec. Resuelto en la ronda 2, ver arriba.
- Efecto colateral de entorno (no de codigo): faltaban .env y el cliente Prisma generado en
  este worktree; se resolvieron localmente para poder correr las verificaciones (ver
  "Notas de entorno").

## Archivos tocados

| Archivo | Tarea | Commit |
| --- | --- | --- |
| lib/shared/navigation/private-nav.ts | T1 | 653eaa9 refactor(QC-13): quitar items de relleno del menu de navegacion privada |
| tests/unit/app-sidebar.test.tsx | T2 + T3 | 587d9f1 test(QC-13): migrar fixture de SUPPLIERS_ROUTE y cubrir el borrado de items de relleno |
| e2e/session.spec.ts | T4 | e0c23d1 test(QC-13): usar INVENTORY_ROUTE en vez de DASHBOARD_ROUTE en el E2E de sesion |
| e2e/session.spec.ts | ronda 2 (fixture rol Administrador) | 9612544 fix(QC-13): fixture E2E usa rol Administrador real, no uno efimero |
| specs/QC-13-guardia-de-sesion-en-navegacion/tasks.md | checklist | 1531275 docs(QC-13): marcar T1-T4 cerradas en tasks.md |

Ningun otro archivo de produccion se toco. No se anadio ninguna dependencia (R16).

## Estado de PRIVATE_NAV_ITEMS tras T1

Exactamente 3 entradas de nivel superior: nav-dashboard, nav-inventario, nav-produccion
(grupo con un unico hijo nav-produccion-formulas, FORMULAS_ROUTE, label Formulas, intacto,
terreno de QC-26). NOTIFICATIONS_ROUTE, PURCHASE_ORDERS_ROUTE, SUPPLIERS_ROUTE, BATCHES_ROUTE
ya no se exportan.

## Mapa R<n> -> test

| R<n> | Test | Archivo |
| --- | --- | --- |
| R1 | "private-nav.ts no exporta las constantes de ruta retiradas" | tests/unit/app-sidebar.test.tsx:379 |
| R2 | "PRIVATE_NAV_ITEMS no contiene ningun destino ni testId de los items retirados" | tests/unit/app-sidebar.test.tsx:393 |
| R3 | "PRIVATE_NAV_ITEMS no contiene ningun destino ni testId de los items retirados" | tests/unit/app-sidebar.test.tsx:393 |
| R4 | "FORMULAS_ROUTE y su item se conservan intactos: terreno de QC-26" | tests/unit/app-sidebar.test.tsx:442 |
| R5 | "PRIVATE_NAV_ITEMS tiene exactamente tres entradas de nivel superior en orden" | tests/unit/app-sidebar.test.tsx:419 |
| R6 | "el grupo nav-produccion conserva un unico hijo, nav-produccion-formulas" | tests/unit/app-sidebar.test.tsx:429 |
| R7 | Cobertura indirecta: los 12 tests preexistentes de "barra lateral privada" siguen leyendo DASHBOARD_ROUTE, INVENTORY_ROUTE, PRIVATE_NAV_LABEL, BRAND_LABEL, tipos y groupNavItemsBySection sin cambios, y pasan sin tocarse | tests/unit/app-sidebar.test.tsx:155-375 |
| R8 | "no contiene ningun valor que React rechace al serializar" + "sobrevive a una vuelta por JSON sin perder nada" + "cada icono declarado es una cadena, nunca el componente" (sin modificar) | tests/guards/guard-nav-serializable.test.ts |
| R9 | "si la ruta activa es la de un hijo, su submenu arranca expandido y el hijo queda marcado como actual" (migrado a fixture propia) | tests/unit/app-sidebar.test.tsx:320 |
| R10 | Mismo test; la fixture (grupo-a/grupo-a-hijo, grupo-b/grupo-b-hijo) no importa SUPPLIERS_ROUTE ni FORMULAS_ROUTE; confirmado por grep y por el import list del archivo | tests/unit/app-sidebar.test.tsx:320 |
| R11 | Paso 1 del recorrido: page.goto(INVENTORY_ROUTE) + expect del RETURN_PARAM contra INVENTORY_ROUTE | e2e/session.spec.ts (paso 1) |
| R12 | Paso 2 del recorrido: waitForURL contra INVENTORY_ROUTE + expect sobre getByTestId(inventario-title) | e2e/session.spec.ts (paso 2) - EN VERDE en chromium y webkit tras el fix del fixture (rol Administrador real), ver "Actualizacion de la ronda 2" |
| R13 | Estructura del archivo: un unico test() dentro de un unico test.describe() (confirmado por lectura directa, sin partir el recorrido) | e2e/session.spec.ts |
| R14 | Mismo test que R4 | tests/unit/app-sidebar.test.tsx:442 |
| R15 | Ninguna regla ruta-rol nueva: lib/composition/route-role-rules.ts no se toco | verificado por git diff: ningun archivo de identity/composition en los commits de QC-13 |
| R16 | Ninguna dependencia nueva: package.json / pnpm-lock.yaml no aparecen en el diff de esta ficha | verificado por git diff |

Los 16 requisitos quedan cubiertos y verificados, incluido R12: el E2E completo pasa en
chromium y webkit tras el fix del fixture (ronda 2).

## Evidencia de que los tests de borrado muerden (T2)

Reportado por frontend_dev (T2+T3), con mutacion real y reversion sobre
lib/shared/navigation/private-nav.ts:

- Mutacion 1: reintrodujo la constante SUPPLIERS_ROUTE = /compras/proveedores y un item
  { href: SUPPLIERS_ROUTE, testId: nav-compras } dentro del grupo nav-produccion; cayeron los
  tests de R2/R3 (/compras/proveedores presente en el arbol) y de R6 (2 hijos en vez de 1).
- Mutacion 2: anadio tambien NOTIFICATIONS_ROUTE, PURCHASE_ORDERS_ROUTE, BATCHES_ROUTE (las 4
  exportaciones completas); cayo el test de R1.
- Revertido con git checkout sobre lib/shared/navigation/private-nav.ts (arbol de trabajo
  limpio antes de mutar). git diff vacio tras el revert, confirmado.
- Reejecucion final: 16/16 tests de app-sidebar.test.tsx en verde.

Verificado de nuevo por mi (coordinador) tras el merge de los tres bloques, ejecutando la
suite completa del archivo mas la guardia: 19/19 en verde (ver "Resultado real de los tests").

## Bloqueo T5 - sync con origin/dev

git fetch origin dev + inspeccion: QC-26 todavia no esta en origin/dev (sin commits que
toquen private-nav.ts ni app-sidebar.test.tsx en su historial, confirmado con
git log origin/dev -- <archivos>), asi que no hay conflicto en el terreno compartido que
preocupaba al spec.

Al correr git merge origin/dev --no-edit sobre la rama, el merge trae de forma limpia (sin
conflicto) 9 commits de otras features ya mergeadas (QC-22, QC-25, QC-42, QC-33...) y si da
conflicto en tres archivos de bookkeeping cross-feature: feature_list.json,
progress/current.md, progress/history.md. Ninguno de los dos archivos que el spec marco como
terreno de riesgo (private-nav.ts, app-sidebar.test.tsx) tuvo conflicto.

Aborte el merge (git merge --abort) sin resolver estos tres archivos: son estado propiedad
del leader/harness (feature_list.json, progress/current.md, progress/history.md), no del
alcance de esta ficha, y resolverlos a ciegas puede corromper bookkeeping usado por todo el
arnes (estados de otras features, la regla de maximo 2 in_progress por zona, etc.). Rama y
worktree quedaron en el mismo estado que antes del intento de merge (git status limpio salvo
los commits propios de la ficha).

T5 no se puede cerrar sin que el leader decida como resolver esos tres archivos (o delegue esa
resolucion a quien tenga el contexto completo del estado cross-feature).

## Bloqueo E2E - materializa la Pregunta abierta 2 del spec

El E2E se ejecuto (ver comando y salida abajo) y falla en el paso 2, no por el codigo de esta
ficha sino por lo que la propia ficha dejo como pregunta abierta 2 (no rellenada, como exige
regla 6 de CLAUDE.md):

"El E2E pasara a pedir /inventario, que solo ve el Administrador (...). El recorrido depende
ahora de que el usuario semilla siga siendo Administrador: si eso cambiara, el test probaria
el rechazo por rol creyendo que prueba el retorno."

Lo que ocurre en la ejecucion real: e2e/session.spec.ts no usa un usuario semilla, crea su
propio rol efimero en test.beforeAll (prisma.role.create con nombre qc9_e2e_rol_<RUN_ID>, sin
ningun permiso especial) y su propio usuario con ese rol. INVENTORY_ROUTE exige por regla
ruta-rol (lib/composition/route-role-rules.ts linea 51,
{ prefix: INVENTORY_ROUTE, roles: [ADMIN_ROLE_NAME] }, con ADMIN_ROLE_NAME = Administrador en
lib/modules/inventario/domain/actor.ts linea 12) que el rol de sesion sea exactamente
Administrador. El rol que crea el fixture del E2E no lo es.

Rastro observado en la corrida real (test-results/.../error-context.md): el
waitForURL(...INVENTORY_ROUTE) del paso 2 SI pasa (decideRouteAccess deja pasar el aterrizaje
post-login sin chequear la regla de rol, paso 3 de su politica), pero en la siguiente
navegacion a /inventario el middleware vuelve a evaluar la peticion, la regla de rol la
rechaza (reason: forbidden) y redirige a DASHBOARD_ROUTE antes de que la asercion
getByTestId(inventario-title) llegue a ver la pantalla. El DOM capturado en el fallo muestra
un heading "Dashboard", no inventario.

No lo resolvi. Asignar el rol Administrador al fixture del E2E es exactamente el tipo de
decision que la pregunta abierta 2 dejo sin cerrar a proposito, y tocar la creacion del rol en
test.beforeAll / createTestUser() excede lo que T4 y design.md seccion 1.3 autorizan (solo las
lineas de ruta/testId). Rellenarlo con un supuesto violaria la regla 6 de CLAUDE.md y el
mandato explicito de no reabrir las preguntas abiertas.

## Notas de entorno (no bloqueantes, ya resueltas localmente)

Dos huecos de entorno de este worktree en concreto, sin relacion con el codigo de la ficha,
resueltos para poder correr las verificaciones:

1. Faltaba el cliente Prisma generado (error: Cannot find module .prisma/client/default).
   Corrido pnpm exec prisma generate; no toca codigo versionado, solo genera
   node_modules/.pnpm/@prisma+client@.../.
2. Faltaba .env en este worktree (los demas worktrees activos si lo tienen; parece que quedo
   fuera al montar este). Copiado desde el repo raiz (.env esta en .gitignore, no se commiteo
   nada). Sin el, DATABASE_URL no llega al proceso de Playwright (Playwright, a diferencia de
   Vitest/Vite, no auto-carga .env); tuve que invocar el CLI de Playwright con
   node --env-file=.env porque NODE_OPTIONS=--env-file=... esta bloqueado por Node.

## Resultado real de los tests (ronda 1, historico)

Comando: pnpm exec vitest run tests/unit/app-sidebar.test.tsx tests/guards/guard-nav-serializable.test.ts
Resultado: Test Files 2 passed (2) - Tests 19 passed (19)

Comando: pnpm typecheck
Resultado: tsc --noEmit, sin salida, exit 0

Comando: pnpm lint
Resultado: eslint, sin salida, exit 0

Comando: node --env-file=.env node_modules/.pnpm/@playwright+test@1.62.1/node_modules/@playwright/test/cli.js test e2e/session.spec.ts
Resultado: Running 2 tests using 2 workers
  - [chromium] fallo en el paso 2 (Error: expect(locator).toBeVisible() failed, getByTestId(inventario-title))
  - [webkit] mismo fallo
  2 failed. Causa: aterriza en /dashboard tras el rechazo por rol, ver seccion "Bloqueo E2E" (ronda 1).

## Resultado real de los tests (ronda 2, tras el fix del fixture)

Comando: pnpm typecheck
Resultado: limpio, exit 0 (tras `pnpm exec prisma generate --schema db/schema.prisma`; el
cliente Prisma estaba desactualizado por la entrada de QC-33/modelo-pedidos via merge, no por
codigo de esta ficha).

Comando: pnpm lint
Resultado: limpio, exit 0.

Comando: pnpm exec vitest related --run e2e/session.spec.ts
Resultado: no aplica, la config de vitest excluye `e2e/**` explicitamente ("No test files
found, exiting with code 0").

Comando: pnpm exec playwright test e2e/session.spec.ts
Resultado: 2 passed (chromium 6.3s, webkit 9.7s). El recorrido aterriza en /inventario en
ambos navegadores: waitForURL contra INVENTORY_ROUTE y
getByTestId('inventario-title').toBeVisible() en verde, mas el resto de la cadena (nombre
real, cookie de sesion, logout, "atras" no restaura la zona privada).

No se corrio la suite completa en esta sesion de implementer: eso corresponde a `./init.sh`
completo (T6), tarea del leader antes del PR.

## Que falta para cerrar T6

Solo queda T6: correr `./init.sh` completo (typecheck + lint + toda la suite unitaria y de
integracion + todas las guardias + el E2E) y confirmar verde. Es tarea del leader, no de este
implementer, segun el encargo recibido.
