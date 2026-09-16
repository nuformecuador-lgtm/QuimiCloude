# QC-101 — cierre-de-sesiones-de-otro-desde-la-pantalla · review (F2.2)

> Reviewer, 2026-09-15. Worktree `.worktrees/QC-101-cierre-de-sesiones-de-otro-desde-la-pantalla`,
> HEAD `58d3ae8`, diff revisado `d6008f1..HEAD` (5 commits). No se ha editado codigo.

## Veredicto

**RECHAZADO — 4 mayores (bloqueantes), 3 menores.**

El producto esta bien hecho. La action delega sin decidir nada, las decisiones de riesgo se
cumplen una a una, el E2E es de verdad (dos contextos, ninguna escritura por Prisma en el
recorrido) y esta **verde en Chromium y WebKit, corrido por mi**. Los 22 requisitos tienen un test
que los verifica.

**Lo que no pasa es el gate.** La suite unitaria completa da **6 archivos rojos**:
- **4 los provoca este diff.** Dos de ellos quedarian ademas **ocultos** por el comparador del
  baseline.
- **1 lo trae `dev`** (QC-95).
- **Ningun rojo es de la base de datos.**

El implementer solo corrio `vitest related` y no llego a ver ninguno: **los cinco rojos son guardias
o tests de alcance que leen el disco o el fuente, y el grafo de imports no los selecciona.** El 6.º
(`usuarios/scope`) viene de `dev` y en `related` tampoco sale.

## Lo que ejecute (salidas reales)

| Comando | Resultado |
| --- | --- |
| `pnpm run typecheck` | `EXIT=0` |
| `pnpm run lint` | `EXIT=0` |
| `pnpm run db:test status` | base de desarrollo QuimiCloude al dia: 28 migraciones aplicadas |
| comparacion de `check-trazabilidad.mjs` aplicada a QC-101 (nota 1) | `declarados 22 · mapeados 22 · faltan [] · tasks pendientes 0 hechas 12` |
| `pnpm run test:rapido` (related del diff + todas las guardias) | related: `Test Files 33 passed (33) · Tests 564 passed, 4 skipped`; guardias: `Test Files 1 failed, 38 passed (39) · Tests 1 failed, 406 passed, 9 skipped` → **EXIT=1** |
| `vitest run --reporter=verbose` qc101-alcance + qc23-alcance + session-actions + end-all-sessions + guard-identificador-de-request | `Tests 1 failed, 85 passed, 3 skipped (89)`. Los 3 saltos son de `qc23-alcance` («esta NO es la rama de QC-23»), como exige `design.md > 0` hallazgo 2. **`qc101-alcance`: 0 saltos.** El rojo es la guardia de QC-71 |
| 11 tests que recorren el disco, fuera de `guards/` (los que `related` no selecciona) | `Test Files 1 failed, 10 passed (11)` → `grupos/alcance.test.ts` |
| `playwright test e2e/cierre-de-sesiones.spec.ts --project=chromium` | `✓ 1 [chromium] … (13.8s) · 1 passed (46.1s) · EXIT=0` |
| `playwright test e2e/cierre-de-sesiones.spec.ts --project=webkit` | `✓ 1 [webkit] … (17.8s) · 1 passed (26.5s) · EXIT=0` |
| filas residuales `qc101_e2e_*` tras los dos E2E (consulta de solo lectura) | `usuarios qc101_e2e_*: 0 [] · empresas qc101_e2e_*: 0 []` |
| `vitest run --project ui --project node` (suite unitaria completa, sin `integration`) | `Test Files 6 failed, 398 passed (404) · Tests 6 failed, 5835 passed, 74 skipped (5915) · Duration 316s` → **EXIT=1** |

Nota 1. `scripts/check-trazabilidad.mjs` **no existe en este worktree**: vive en el arbol principal,
en la rama del arnes. Corrido tal cual contra el worktree, sale `EXIT=0`, pero **no mira QC-101**: la
ficha esta `pending` en el `feature_list.json` del worktree y el script solo cruza fichas `done` e
`in_progress`. Por eso apliqué a mano sus mismas dos expresiones (`DECLARA` y la del mapa) a los dos
archivos de QC-101.

**No se corrio el proyecto `integration`**: el diff no toca adaptadores driven, `db/` ni
`lib/composition`, y hubiera escrito en la base compartida mientras QC-81 migra.

### Atribucion de los 6 rojos de la suite unitaria

| Archivo rojo | Caso | Causa | En `baseline-rojos.json` | Clasificacion |
| --- | --- | --- | --- | --- |
| `tests/guards/guard-identificador-de-request.test.ts` | «no hay ningun archivo nuevo en e2e/…» (QC-71 R21) | **diff**: `e2e/cierre-de-sesiones.spec.ts` no esta en `E2E_ESPERADOS` | no | **M1** |
| `tests/unit/configuracion-ui/grupos/alcance.test.ts` | «cada operacion entra por su RUTA EXACTA…» (QC-85 R36) | **diff** que destapa una bomba de QC-85 | no | **M2** |
| `tests/unit/identity/account-status-scope.test.ts` | «los archivos de produccion que nombran el estado son EXACTAMENTE los de la lista cerrada» (QC-65 R19) | **diff**: `user-sheet.tsx` nombra `accountStatus` | no | **M3** |
| `tests/unit/configuracion-ui/configuracion-convenciones.test.ts` | «ninguna consulta de la carpeta identifica por texto de interfaz» (R35) | **diff**: `end-user-sessions-dialog.test.tsx` usa `ByText` | **si**, pero por OTRO motivo (dependencias) | **M4** |
| `tests/unit/configuracion-ui/unidades-convenciones.test.ts` | «ninguna consulta de la carpeta identifica por texto de interfaz» (R49) | **diff**, el mismo `ByText` | **si**, pero por OTRO motivo (dependencias) | **M4** |
| `tests/unit/identity/usuarios/scope.test.ts` | «R45 — ningun archivo de produccion de la feature lee ni escribe los tres contadores de bloqueo» (QC-66) | **`dev`**: `user-admin-prisma.ts` lo toco `f728d15 feat(QC-95)`; QC-101 no toca ese archivo (0 en `git diff --name-only d6008f1..HEAD` para esa ruta) | no | no es de esta ficha: nota al leader |

**Ninguno es de la base compartida.** Los seis son del proyecto `node` y leen el fuente o el arbol de
archivos; ninguno abre una conexion. Los dos E2E, que si escriben en la base, estan verdes.

## Hallazgos

### MAYORES (bloqueantes)

**M1 — La guardia de QC-71 esta roja por el E2E nuevo, y pone en rojo `./init.sh --rapido` y `./init.sh`.**
`tests/guards/guard-identificador-de-request.test.ts:689` compara los `e2e/*.spec.ts` contra la lista
cerrada `E2E_ESPERADOS` (`:80-127`), y el mensaje dice que `e2e/cierre-de-sesiones.spec.ts` es un
«archivo nuevo en e2e/» y que «QC-71 difirio el E2E con motivo (R21)».
La lista es cerrada **por diseno**, y su punto de extension es darse de alta en ella. Asi lo hicieron
QC-49, QC-67, QC-79, QC-85 y QC-102, cada una con su comentario.
**Que falta:** anadir `cierre-de-sesiones.spec.ts` a `E2E_ESPERADOS`, con el comentario de QC-101 T10
/ R17: que recorrido ejercita y que **no** ejercita el cruce borde → accion del identificador de
peticion. Asi el diferimiento de QC-71 R21 sigue intacto. El E2E ya esta en `CHECKPOINTS.md` y en la
decision cerrada 9: el caso esta aprobado, solo falta el alta.

**M2 — `grupos/alcance.test.ts` (QC-85 R36) se pone rojo con este diff, y no esta en el baseline.**
El caso de la linea 555 no recibe `ctx` ni llama a `baseDeEstaRama(ctx)`, al contrario que su hermano
de la linea 547. Aun asi mide `archivosDeLaPantalla()`, que sale del **diff de la rama**
(`:246-251`). Cualquier rama que toque la pantalla de usuarios le cae: QC-101 toca `user-form.tsx`,
`user-sheet.tsx` y `user-list-section.tsx`, y el caso lista 5 importes. Solo uno es nuevo
(`endAllSessionsAction` desde `…/session-actions`); los otros cuatro (`createUserAction`,
`updateUserAction`, `getUserAction`, `listRolesAction`) existian antes.
La **causa** es de QC-85: una guardia de alcance sin precondicion de rama, la misma especie de
«bomba de relojeria» que describen QC-45 y QC-65. El **rojo** sale en esta rama, y el comparador de
`./init.sh` completo lo va a contar como nuevo.
**Que falta:** meter ese caso bajo la misma precondicion que ya protege a sus hermanos (que reciba
`ctx` y llame a `baseDeEstaRama(ctx)`), con un comentario que cite QC-101 como la rama que lo
destapo. **No vale** meterlo en `tests/baseline-rojos.json`, que apagaria el archivo entero, ni
anadir `session-actions`/`role-actions` a `ADAPTADORES_DRIVING`, que convertiria el alcance de QC-85
en un censo de lo que hace cualquiera.

**M3 — `account-status-scope.test.ts` (QC-65 R19): `user-sheet.tsx` nombra el estado de cuenta fuera de la lista cerrada.**
La comparacion es de **igualdad** (`:531`): recibe 41 archivos donde espera 40, y el nuevo es
`app/(private)/configuracion/usuarios/components/user-sheet.tsx`, por la comparacion
`user.accountStatus === 'active'` (R11). No esta en el baseline, asi que el gate completo sale rojo.
**Que falta:** dar de alta `user-sheet.tsx` en `SITIOS_PERMITIDOS` (`:159`) con su comentario
`QC-101 R11`: el panel decide ofrecer el cierre solo sobre cuentas activas, con el estado que ya
viaja en la `UserRow`. Es el mismo mecanismo que usaron QC-78 y QC-79 (`:161-256`). La regla de
R11 es correcta; lo que falta es declararla donde QC-65 exige declararla.

**M4 — `end-user-sessions-dialog.test.tsx:145` identifica por texto de interfaz y rompe la convencion R35/R49. El gate no lo veria.**
La linea es `expect(within(dialogo).getByText(endUserSessionsTitle(FILA.displayName))).toBeInTheDocument();`.
Dos tests de convencion de la carpeta `tests/unit/configuracion-ui/` la cazan con el mismo mensaje
(`end-user-sessions-dialog.test.tsx: ByText identifica por copy`):
- `configuracion-convenciones.test.ts:721`
- `unidades-convenciones.test.ts:806`

**Es mayor aunque sea una linea**, porque esos dos archivos estan en `tests/baseline-rojos.json` por
**otro** motivo (el `package.json`, desde QC-79). El comparador es por archivo, asi que `./init.sh`
completo **no lo contaria como rojo nuevo** y la violacion entraria en `dev` sin que nadie la viera.
Ademas contradice lo que dice el propio archivo en su cabecera: «Ningun assert sobre literales de
copy», y T9 «sin literales de copy copiados».
**Que falta:** localizar el titulo por rol y nombre (`getByRole('heading', { name: … })`, si el
primitivo lo expone como heading) o por un `data-testid` exportado, igual que
`END_USER_SESSIONS_MESSAGE_TESTID` para la descripcion. Luego volver a correr los dos archivos de
convenciones y confirmar que el unico rojo que les queda es el documentado en el baseline.

### menores

**m1 — El `vi.mock` nuevo quedo metido entre el comentario de QC-85 y el `vi.mock` al que ese comentario se refiere.**
Afecta a cuatro archivos:
- `user-list-section.test.tsx:96-118`
- `usuarios-page.test.tsx`
- `usuarios-viewport.test.tsx`
- `grupos/usuarios-page.test.tsx`

En los cuatro, el bloque «QC-85 T7 — Las SIETE Server Actions de GRUPOS…» queda encima del mock de
`session-actions` y separado del de `work-group-actions`, que es el que explica. En
`work-group-a11y.test.tsx` y `work-group-list-skeleton.test.tsx` esta bien colocado. Moverlo
**debajo** del mock de grupos, o antes de su comentario.

**m2 — T4-T9 en un solo commit (`c19be72`)**, contra `docs/conventions.md:25` («Un commit por task
lógica»). Esta declarado en la bitacora y el motivo es razonable (barrel compartido por T4 y T8). Lo
anoto para que conste, no para rehacer la historia.

**m3 — T12 esta marcada `[x]` y su «Hecho: gate en verde» no se cumple.**
La bitacora lo declara con honradez: «esa mitad de T12 queda pendiente del leader». Pero la casilla
dice otra cosa, y el gate, corrido, esta rojo por M1-M4. Tras corregir M1-M4 hay que volver a correr
`./init.sh` completo y dejar su salida en la bitacora.

### Nota al leader (no es hallazgo de QC-101)

`tests/unit/identity/usuarios/scope.test.ts` (QC-66 R45, «CONTENIDO: muerde siempre, tambien dentro
de dev») esta **rojo en `dev`**. `f728d15 feat(QC-95)` hizo que
`lib/modules/identity/adapters/driven/persistence/user-admin-prisma.ts` escriba `failedLoginAttempts`,
`lockLevel` y `lockedUntil`. QC-95 lo necesitaba (el desbloqueo manual limpia el conteo), y el test de
QC-66 lo prohibe. Esta rama no toca ese archivo. `./init.sh` completo lo mostrara como rojo nuevo
también aqui, porque no esta en el baseline. Decide el leader: arreglarlo en `dev` o darlo de alta en
el baseline con motivo. **No es trabajo de QC-101**, pero va a salir en su gate.

## Las cinco cosas que se pidieron mirar

### 1. Los cuatro desvios declarados

| Desvio | Veredicto | Por que |
| --- | --- | --- |
| `UserForm` recibe `endSessions: { displayName, onEndSessions }` y no `onEndSessions?: () => void` | **aceptado** | Comprobado: `UserDetail` (`domain/user-view.ts:64`) no trae `displayName`, que solo esta en `UserRow` (`:44`). Recomponerlo seria una segunda copia de `buildDisplayName`. La regla de ausencia se mantiene y tiene test: `user-form.test.tsx` «R11 R12 — sin `endSessions` no se emite NADA…» |
| El dialogo cuelga de la raiz del `Sheet`, hermano de `UserForm` y fuera del `form` | **aceptado, y es mejor que lo del design** | Los eventos sinteticos de React se propagan por el arbol de React aunque haya portal. Si el dialogo colgara de dentro de `UserForm`, el submit de su formulario subiria por ese arbol hasta los manejadores del de edicion. Siendo hermano, no hay ancestro comun con el `form`. Lo afirman `user-sheet.test.tsx` «R9 — pulsar el disparador abre la confirmacion…» (el formulario de edicion no contiene al dialogo) y «R10 — confirmar invoca la action EXACTAMENTE una vez… y NINGUNA escritura de edicion», y los dos E2E verdes |
| `canModify` no baja a `UserSheet` | **aceptado** | El panel solo se abre desde el alta (`user-table.tsx:196`, condicionado a `canModify`) o desde las acciones de fila, que ya reciben `canModify`. Quien autoriza es el service: R3 esta probado alli. Una tercera comprobacion en el panel seria redundante y no es autorizacion |
| `vi.mock` de `session-actions` en seis tests ajenos | **aceptado: no enmascara nada, y no hay que resolverlo en la action** | (a) **Las 13 Server Actions del repo** evaluan `createErrorStateTranslator(…, observabilidad.readRequestIdHeader)` al cargarse (`user-actions.ts:119`, `role-actions.ts:53`, `work-group-actions.ts:57`, `credential-setup-actions.ts:113`, `order-actions.ts:111`, `unit-actions.ts:53`…). Hacer perezosa solo esta la volveria la unica distinta y rompería la «implementacion unica» de QC-70. (b) Los seis archivos ya mockeaban `user-actions`, `role-actions` y `work-group-actions` por el mismo motivo: QC-85 metio el de grupos con un comentario casi identico. Es el patron vigente. (c) El doble **lanza si se invoca**, y esas pantallas no abren el panel: si algo llamara a la action al pintar, el caso se pondria rojo. El acoplamiento de fondo, que los dobles de `@/lib/composition` declaren solo `identity`, es anterior a esta ficha. Solo m1 (comentario mal colocado) |

### 2. Las decisiones de riesgo

| Decision | Donde se cumple | Test que la sostiene |
| --- | --- | --- |
| Nunca sobre uno mismo | `user-sheet.tsx`: `user.id !== currentUserId`. `currentUserId` sale de la misma lectura de `getSessionUser()` en `page.tsx` (`canModifyUsers`) | `user-sheet.test.tsx` «R12 — si la persona del panel es el propio actor, el control NO existe en el DOM» y «R16 — … cambiar `currentUserId` lo quita y lo devuelve» |
| Solo cuentas activas | `user-sheet.tsx`: `user.accountStatus === 'active'` | «R11 — con la cuenta X el control NO existe en el DOM», un caso por estado no activo, con ancla anti-vacuidad |
| Confirmacion con el nombre dentro | `user-labels.ts` `endUserSessionsTitle` y `endUserSessionsMessage` (los dos con el nombre) | «R9 — el titulo y la descripcion nombran a la persona…» y E2E paso 4 (`toContainText(VICTIM_DISPLAY_NAME)`) |
| El mensaje no promete numero | Las cuatro funciones de texto reciben solo el nombre (aridad 1); `EndSessionsFormState` de exito es `{ status: 'success' }` | `user-labels.test.ts` (sin digitos y aridad 1), `session-actions.test.ts` «R5 … ninguna clave mas», el E2E (el toast sin el nombre no tiene digitos) y `qc101-alcance` R19 |
| `usuarios.modificar`, sin permiso nuevo | La action no decide nada (`session-actions.ts:104-117`) y la regla sigue en `end-all-sessions.ts` | `end-all-sessions.test.ts` «QC-101 R3 …» y `qc101-alcance` R18 (catalogo identico al de la base de fusion) |
| R10: el disparador no envia la edicion | `user-form.tsx`, disparador `type="button"` | `user-form.test.tsx` «R10 — pulsarlo avisa al panel UNA vez y NO envia el formulario de edicion» (afirma `type="button"` y cero llamadas a `createUserAction`/`updateUserAction`), «R10 — … siguen siendo los nueve» (ningun campo nuevo en el `FormData`) y `user-sheet.test.tsx` R10 en el panel de edicion real |

### 3. El E2E de R17

- **Dos contextos de verdad**: `browser.newContext()` dos veces (`:283-284`), cerrados en `finally` (`:398-401`).
- **El administrador cierra desde el panel, sin Prisma**: en el cuerpo del test no hay ni una llamada
  a `prisma`. Solo aparece en `beforeAll` (fixtures, `:223-252`) y `afterAll` (limpieza, `:254-269`).
  El cierre es fila → editar → disparador → confirmar (`:312-339`).
- **La sesion del administrador sigue viva**: paso 6 (`:390-397`). Vuelve a pedir la lista, exige el
  titulo, que la ruta sea `USERS_ROUTE` y `login-form` con `toHaveCount(0)`.
- **La victima tenia sesion**: aterriza en `INVENTORY_ROUTE` con la cookie `SESSION_COOKIE_NAME`
  presente (`:292-300`). Despues exige **exactamente una** redireccion de documento hasta el login.
- **Ejecutado por mi**: verde en Chromium (13.8 s) y WebKit (17.8 s), y la base sin filas `qc101_e2e_*`
  despues.
- Matiz, no hallazgo: `inventario-title` y `private-user-name` con `toHaveCount(0)` se afirman ya en el
  login, donde son ciertos por construccion. Lo que prueba «sin ver nada privado» es el recuento de
  una sola redireccion de documento. Es el mismo criterio que `session.spec.ts`.

### 4. La quinta copia de `currentActor()`

**Declarada, no escondida**, en tres sitios:
- **El codigo**: `session-actions.ts:68-76`. Dice «QUINTA copia… dentro de `identity`», nombra las
  otras cuatro, recuerda la promesa incumplida de `role-actions.ts:67-71` y propone
  `adapters/driving/current-actor.ts`.
- **El design**: `design.md > 3` alternativa B y `> 7`.
- **La bitacora**: «Deuda registrada para el leader».

La bitacora afina ademas lo que el comentario no dice: en todo el repo son 13 copias, no 5. Lo he
comprobado: `async function currentActor` aparece en 13 archivos `adapters/driving/`. Abrir la ficha
de extraccion lo decide el leader.

### 5. Riesgo de entorno (base compartida)

La base esta al dia (28 migraciones). **Ninguno de los 6 rojos toca la base**: todos son del
proyecto `node` y leen fuente o arbol. Los dos E2E, que si escriben usuarios y empresas, estan verdes
y no dejaron residuos. Que QC-81 este migrando `product_batches.lot` no afecta a nada de lo corrido.
El unico rojo que no es de este diff (`usuarios/scope`) viene de `dev` (QC-95), no de la base.

## Checklist

### Especificacion
- [x] `requirements.md` con EARS numerados R1-R22 y 10 decisiones cerradas.
- [x] `design.md` con alternativas descartadas A-D y su porque.
- [x] `tasks.md`: 12/12 `[x]`. Ver m3: la casilla de T12 afirma un gate verde que no lo esta.

### Trazabilidad
- [x] Los 22 `R<n>` aparecen en el mapa de la bitacora (comparacion de conjuntos: `faltan []`).
- [x] Cada test citado verifica su requisito (tabla de abajo, uno a uno).

### Calidad de codigo
- [x] `pnpm run typecheck` → EXIT=0.
- [x] `pnpm run lint` → EXIT=0.
- [ ] **`pnpm test` pasa**: rojo. 6 archivos, 5 por este diff (M1-M4) y 1 de `dev`.
- [x] Flujo critico (autenticacion y permisos) con E2E: `e2e/cierre-de-sesiones.spec.ts`, verde en los dos navegadores.
- [x] Multiplataforma:
  - disparador, confirmar y volver con `min-h-11 min-w-11`;
  - nada que dependa de `:hover`;
  - sin `100vh`;
  - el unico `input` nuevo es `type="hidden"`;
  - sin libreria nueva;
  - WebKit ejercitado de verdad.
- [x] Sin dependencias anadidas (`package.json` fuera del diff; `qc101-alcance` R22 verde).

### Datos y seguridad
- [x] Sin tabla, columna ni modelo nuevo: no hay RLS, `down.sql` ni columna de empresa que exigir.
- [x] El permiso se valida en el service y tiene test (R3: `stampAll` con cero llamadas).
- [x] El aislamiento por empresa lo mantiene el caso de uso heredado. R4 prueba que «de otra empresa» da el mismo `user_not_found` que «no existe».
- [x] Sin cliente de Supabase, sin secretos y sin configuracion hardcodeada.
- [x] No hay webhooks.

### Modulos hexagonales
- [x] `domain/` y `ports/` sin tocar; `end-all-sessions.ts` y el puerto fuera del diff.
- [x] La action pide el caso de uso a `lib/composition`; no instancia nada.
- [x] `'use server'` no reexportado desde el barrel del modulo; la UI lo importa por ruta exacta (`usuarios-convenciones.test.ts` lo vigila).
- [x] Sin logica de negocio en la action.

### Permisos
- [x] La pagina resuelve la sesion en el servidor y baja `currentUserId` por props.
- [x] Ningun componente de cliente lee la sesion, `lib/composition` ni Prisma (R16).
- [x] La mutacion es una Server Action.

### Verificacion final
- [ ] **`./init.sh` en verde**: no. `test:rapido` ya sale rojo por M1, y la suite completa por M1-M4 (M4 oculto por el baseline).
- [ ] `progress/review_<feature>.md` con veredicto OK: RECHAZADO.
- [ ] Entrada en `progress/history.md`: la hace el leader al cerrar.
- [ ] Worktree desmontado o anotado: no aplica todavia.

## Trazabilidad verificada, requisito por requisito

«Verifica» = lei el test y afirma lo que el requisito exige: mordiendo, no pasando en vacio.
«Ejecutado» = el archivo corrio verde en mis corridas (`test:rapido` related, verbose o suite completa).

| R | Test(s) | Ejecutado | Verifica de verdad | Nota |
| --- | --- | --- | --- | --- |
| R1 | `tests/unit/identity/sesiones/session-actions.test.ts`: «R1: llama a identity.endAllSessions una vez…», «R1: un id con espacios llega sin recortar…», «R1: con un actor SIN ningun permiso la action igual invoca el caso de uso», «R1: sin permiso sobre otra persona el rechazo sale del caso de uso REAL y el puerto no se toca» | si | **si** | Cubre las dos mitades: sin permiso, la action llama igual (no filtra en el borde), y con el caso de uso real sobre un puerto que revienta, el rechazo sale del service |
| R2 | `session-actions.test.ts`: «R2: con sesion completa el actor es id y permisos de getSessionUser + empresa de getSessionContext», «R2: si (caso), el actor es null, la accion sigue y el caso de uso REAL rechaza sin tocar el puerto» (x3) | si | **si** | `toStrictEqual(ACTOR_ESPERADO)`, las dos lecturas una vez cada una, y los tres casos incompletos llegan con `null` al caso de uso real |
| R3 | `tests/unit/identity/end-all-sessions.test.ts`: «QC-101 R3: (caso), rechaza con code unauthorized y stampAll registra CERO llamadas» (x3) y el control «…CON usuarios.modificar si llega al puerto» | si | **si** | El objetivo existe y es de la empresa, asi que el rechazo solo puede ser por el permiso. El control positivo demuestra que el doble no rechaza siempre |
| R4 | `end-all-sessions.test.ts`: «QC-101 R4: si (caso), responde user_not_found y no unauthorized» (x3) y «…los tres casos son INDISTINGUIBLES» | si | **si** | Puerto en memoria con el filtro id + empresa + no borrado: tres situaciones distintas de verdad. Misma clase, `code` y mensaje |
| R5 | `session-actions.test.ts`: «R5: … EXACTAMENTE status success y ninguna clave mas», «R5: aunque el caso de uso devolviera algo, la action no lo propaga» | si | **si** | Solo la clave `status`, y un retorno fabricado con `closed: 5` no aparece en el JSON |
| R6 | `session-actions.test.ts`: «R6: UnauthorizedError…», «R6: UserNotFoundError…», «R6: la traduccion va por code y NUNCA por mensaje», «R6: un error que NO es de dominio devuelve unexpected con reference, no se relanza y no filtra su texto» | si | **si** | Un mensaje enganoso no cambia el `code`, y un error ajeno llamado como un code sale `unexpected`. Afirma ademas `console.error` una vez con el detalle (el `catch` no descarta) |
| R7 | `user-sheet.test.tsx` «R7 — sobre otra persona activa se ofrece dentro del panel…», `user-form.test.tsx` «R7 — con endSessions se ofrece…», `user-labels.test.ts`, E2E paso 3 | si (E2E incluido) | **si** | Nombre accesible por rol button con `endUserSessionsLabel`, y en el E2E `toHaveAccessibleName` con el nombre de la victima |
| R8 | `user-row-actions.test.tsx` «R8 — QC-101 no anade nada a la fila: exactamente tres controles, ninguno de sesiones y sin menu» | si | **si** | Cuenta botones, enlaces, role button y role menuitem = 3, compara sus testid uno a uno y afirma ni menu ni aria-haspopup |
| R9 | `end-user-sessions-dialog.test.tsx` «R9 — el titulo y la descripcion nombran a la persona…», «R9 — abrir el dialogo NO invoca la action, y volver tampoco»; `user-sheet.test.tsx` «R9 — pulsar el disparador abre la confirmacion…», «R9 — volver cierra la confirmacion…»; E2E paso 4 | si | **si** | Lo verifica, pero el primer caso localiza el titulo con `getByText`: eso es **M4** |
| R10 | `end-user-sessions-dialog.test.tsx` «R10 — al confirmar se invoca EXACTAMENTE una vez, con el id como campo oculto»; `user-sheet.test.tsx` «R10 — … NINGUNA escritura de edicion»; `user-form.test.tsx` «R10 — pulsarlo avisa al panel UNA vez y NO envia el formulario de edicion», «R10 — … siguen siendo los nueve» | si | **si** | Una llamada, sigue siendo una tras procesar el exito, `FormData` con solo `id`, disparador de tipo button y cero escrituras de edicion |
| R11 | `user-sheet.test.tsx` «R11 — con la cuenta X el control NO existe en el DOM» (un caso por estado), «R11 — ancla…», «R11 — en el alta…»; `user-form.test.tsx` «R11 R12 — sin endSessions no se emite NADA» | si | **si** | Cero en el DOM por cada estado derivado de `USER_ACCOUNT_STATUSES`. El ancla impide que el bucle quede vacio, y se afirma que no queda contenedor |
| R12 | `user-sheet.test.tsx` «R12 — si la persona del panel es el propio actor, el control NO existe en el DOM»; `user-form.test.tsx` «R11 R12 — …» | si | **si** | Con `currentUserId` igual al id de la fila, cero en el DOM. «R16 — cambiar currentUserId lo quita y lo devuelve» demuestra que no es un falso cero |
| R13 | `end-user-sessions-dialog.test.tsx` «R13 — en este orden: cierra el dialogo, avisa por toast y refresca, sin navegar», «R13 R19 — el aviso es el de user-labels…», «R13 — el dialogo no monta ninguna region de avisos propia»; `user-sheet.test.tsx` «R13 — …»; E2E paso 4 | si | **si** | El orden es close, toast, refresh, y lo apuntan los propios dobles. Sin push ni replace (misma URL), sin aria-live propio, y en el E2E el toast del Toaster del layout |
| R14 | `end-user-sessions-dialog.test.tsx` «R14 — (code) se pinta dentro, el dialogo sigue abierto y no hay aviso de exito» (x2), «R14 — el rechazo INESPERADO se pinta dentro con el identificador de la peticion»; `user-sheet.test.tsx` «R14 — …» | si | **si** | `data-code` dentro del dialogo, dialogo abierto, sin toast, sin refresh y la insignia de estado intacta («no altera nada de lo pintado») |
| R15 | `end-user-sessions-dialog.test.tsx` «R15 — confirmar y volver miden al menos 44x44 px», «R15 — los dos controles estan en el DOM desde el primer render…»; `user-form.test.tsx` «R15 — mide al menos 44x44 px…» | si | **si, por clase** | jsdom no mide pixeles: se afirman `min-h-11 min-w-11` (44 px) y la ausencia de clases de visibilidad por puntero. Es el criterio del repo; WebKit real lo ejercita el E2E |
| R16 | `user-sheet.test.tsx` «R16 — el control lo gobiernan SOLO las props…», «R16 — ni el panel, ni el formulario, ni el dialogo leen la sesion o la composicion»; `usuarios-page.test.tsx` «R16 — QC-101: el currentUserId sale de la MISMA lectura…» | si | **si** | Mitad de comportamiento (rerender con props) y mitad de fuente (sin composicion, getSessionUser, cookies ni Prisma), con ancla anti-vacuidad use client. El de pagina es regex sobre el fuente, fragil pero correcto |
| R17 | `e2e/cierre-de-sesiones.spec.ts` «…el administrador cierra las sesiones de otra persona y esa persona acaba en el login» | **si, Chromium y WebKit** | **si** | Ver seccion 3: dos contextos, cierre por el panel sin Prisma, una sola redireccion de documento, login visible y administrador vivo |
| R18 | `tests/unit/identity/qc101-alcance.test.ts`: «el conjunto de codigos del catalogo es identico al de la base de fusion…», «sesiones.modificar no aparece en codigo de db/ ni de lib/…», mordida, ancla | si, 0 saltos | **si** | Compara contra el `permissions.ts` del merge-base en los dos sentidos. Un catalogo ilegible lanza en vez de dar «vacio = identico» |
| R19 | `qc101-alcance.test.ts`: «el diff no toca end-all-sessions.ts ni el puerto…», «ningun archivo… declara un conteo», mordida; `user-labels.test.ts` (sin digitos, aridad 1); `end-user-sessions-dialog.test.tsx` «R19 — …»; E2E | si, 0 saltos | **si** | Las dos mitades: firmas del dominio y textos de interfaz. Mordida con una clave numerica `closed` y una firma que devuelve un numero, las dos fabricadas |
| R20 | `qc101-alcance.test.ts`: «declara EXACTAMENTE revokeSession y stampAll…», «no declara ninguna forma de listado…», mordida | si | **si** | No depende del rango: corre en cualquier rama. Lee la interfaz del fuente, con mordida sobre un `getAliveSessions` fabricado |
| R21 | `qc101-alcance.test.ts`: «nadie fuera del dominio, el contrato y lib/composition nombra endOtherSessions», «ningun archivo de app/… ofrece cerrar mis sesiones», mordida | si, 0 saltos | **si** | git grep con untracked sobre app, components, hooks, lib y middleware.ts. La precondicion conjuntiva lo apaga en QC-53, que es lo correcto |
| R22 | `qc101-alcance.test.ts`: «los nombres de dependencies + devDependencies son identicos a los de la base de fusion», mordida | si, 0 saltos | **si** | Identidad de conjuntos contra el `package.json` del merge-base |

**22 de 22 filas verificadas una a una. Ningun requisito sin test y ningun test vacio.** El rechazo no
es por trazabilidad: es por M1-M4.

## Que tiene que volver con el implementer

1. **M1**: alta de `cierre-de-sesiones.spec.ts` en `E2E_ESPERADOS`, con comentario.
2. **M2**: el caso R36 de `grupos/alcance.test.ts:555` bajo `baseDeEstaRama(ctx)`, con comentario. Sin tocar el baseline.
3. **M3**: alta de `user-sheet.tsx` en `SITIOS_PERMITIDOS` de `account-status-scope.test.ts`, con comentario QC-101 R11.
4. **M4**: `end-user-sessions-dialog.test.tsx:145` sin `ByText`. Correr a mano `configuracion-convenciones` y `unidades-convenciones`: su unico rojo tiene que ser el documentado en el baseline.
5. m1 (comentarios de QC-85 recolocados) si toca esos archivos de todos modos.
6. Correr al cerrar la tanda:
   - `pnpm run test:rapido`;
   - los seis archivos de la tabla de atribucion;
   - `vitest run --project ui --project node`, para confirmar que solo queda `usuarios/scope` (de `dev`).

   El leader corre despues `./init.sh` completo (T12).

---

# Segunda vuelta (2026-09-15, HEAD `c8eb580`)

> Commits revisados `58d3ae8..c8eb580` (7): `92ff837` m3, `1012f97` M1, `bccce2e` M3, `9350743` M2,
> `fd30f77` M4, `2f94de4` m1, `c8eb580` bitacora. No se ha editado codigo. La primera vuelta de arriba
> se conserva tal cual.

## Veredicto de la segunda vuelta

**APROBADO: 0 mayores, 1 menor (m2, que queda solo como constancia).** Los cuatro mayores y los
menores m1 y m3 estan resueltos como se pidio. Las prohibiciones se respetaron y no aparece ningun
rojo nuevo. El unico rojo de la suite unitaria completa es `tests/unit/identity/usuarios/scope.test.ts`,
que viene de QC-95 en `dev` y no de esta ficha.

**Condicion para el PR, y es del leader, no del implementer:**
- decidir que hacer con `usuarios/scope` (arreglarlo en `dev` o darlo de alta en el baseline, lo decide el humano);
- correr `./init.sh` completo, que incluye el proyecto `integration` que yo no corri;
- cerrar T12 con esa salida en la bitacora.

## Lo que ejecute en esta vuelta

| Comando | Resultado |
| --- | --- |
| `pnpm run typecheck` | `EXIT=0` |
| `pnpm run lint` | `EXIT=0` |
| `pnpm run test:rapido` | related: `Test Files 36 passed (36) · Tests 613 passed, 23 skipped (636)`; guardias: `Test Files 39 passed (39) · Tests 407 passed, 9 skipped (416)` → **EXIT=0** |
| `vitest run --project ui --project node` | `Test Files 1 failed, 403 passed (404) · Tests 1 failed, 5839 passed, 75 skipped (5915) · Duration 266s`. Unico FAIL: `usuarios/scope.test.ts` (QC-66 R45, contadores de bloqueo en `user-admin-prisma.ts`) → EXIT=1 |
| `vitest run --reporter=verbose` configuracion-convenciones + unidades-convenciones + grupos/alcance + end-user-sessions-dialog | `Test Files 4 passed (4) · Tests 74 passed, 21 skipped (95)` → **EXIT=0** |
| `git diff --stat d6008f1..HEAD -- tests/baseline-rojos.json` | vacio: el baseline no se toco |
| `git diff d6008f1..HEAD` de `grupos/alcance.test.ts`, lineas con `driving/` o `ADAPTADORES_DRIVING` | ninguna: la lista blanca no se amplio |
| grep de `ByText`, `getByLabelText`, `getByPlaceholder` y `getByDisplayValue` en `end-user-sessions-dialog.test.tsx` | ninguna coincidencia |

No se volvio a correr el E2E: esta vuelta no toca `app/`, `lib/` ni `e2e/` (solo tests unitarios,
guardias, `tasks.md` y la bitacora). El verde en Chromium y WebKit de la primera vuelta sigue siendo
del mismo codigo de produccion.

## Hallazgo por hallazgo

| Hallazgo | Estado | Comprobacion |
| --- | --- | --- |
| **M1** | **resuelto** | `cierre-de-sesiones.spec.ts` esta dado de alta en `E2E_ESPERADOS`, con un comentario que describe el recorrido y dice que no ejercita el cruce del identificador de peticion. La lista sigue cerrada, porque se nombra el archivo concreto. La guardia pasa en `test:rapido` (39/39 archivos de guardias) |
| **M2** | **resuelto, y sin atajos prohibidos** | El caso recibe `ctx` y llama a `baseDeEstaRama(ctx)`, igual que sus hermanos. En el verbose sale saltado, con el motivo «el rango no trae a la vez …»: se salta avisando, no pasa en verde. **No se toco** `tests/baseline-rojos.json` ni `ADAPTADORES_DRIVING` |
| **M3** | **resuelto** | `user-sheet.tsx` entra en `SITIOS_PERMITIDOS` como bloque aditivo al final, con su comentario QC-101 R11. La comparacion sigue siendo de igualdad. `account-status-scope` ya no aparece en rojo en la suite completa |
| **M4** | **resuelto, y sin localizar por texto** | Ahora localiza por rol `heading`, con el nombre accesible que da `endUserSessionsTitle`, dentro del dialogo. El nombre sale de la funcion de `user-labels`, no de un literal copiado, y eso encaja en «rol, testid o constante», que es lo que exige la convencion. En el verbose, «R9 — el titulo y la descripcion nombran a la persona…» pasa y «ninguna consulta de la carpeta identifica por texto de interfaz» pasa en R35 y en R49. Ya no queda ningun `ByText` ni variante por texto en el archivo |
| **m1** | **resuelto** | En los cuatro archivos, el comentario «QC-85 T7 — Las SIETE Server Actions de GRUPOS…» vuelve a quedar pegado a su `vi.mock` de `work-group-actions`, y el bloque de QC-101 va antes. Es solo un reordenamiento: el diff mueve lineas y no cambia texto |
| **m2** | constancia | No se rehace la historia, como se pidio |
| **m3** | **resuelto, y el texto es honesto** | T12 pasa a `[ ]` con una nota: el mapa y la deuda estan escritos, y `./init.sh` completo lo corre el leader. La bitacora (linea 209) dice que se corrio la suite unitaria y que ni `integration` ni `./init.sh` se han corrido. Ninguna linea afirma un gate verde que no exista |

## Las dos entradas de `configuracion-convenciones` y `unidades-convenciones` en el baseline

**Confirmo lo que dice el implementer, con un matiz de alcance.**

- En esta rama, los dos archivos quedan **verdes del todo**: en el verbose no hay ningun caso en rojo.
- Los casos que motivaron sus entradas del baseline no fallan, se **saltan por precondicion de rama**:
  - R31 «no toca `package.json` ni `components/ui/`»: saltado, motivo «esta NO es la rama de QC-45»;
  - R31 «y el contenido de `package.json` sigue siendo el de `dev`»: saltado, mismo motivo;
  - R45 «`package.json` no aparece en el diff contra la base de fusion»: saltado, motivo «esta NO es la rama de QC-39».
- El unico rojo que les pusimos en la primera vuelta era el `ByText` de M4, y ya no esta.

**El matiz:** lo he comprobado **en esta rama**. Que las entradas sean obsoletas en general es muy
probable, porque la causa que describe su motivo (censar `package.json` sin mirar de quien es la
rama) ya esta protegida por esa precondicion. Pero no lo he corrido sobre `dev`. El comparador de
`./init.sh` avisa de «archivo del baseline que ya pasa», y ese aviso en la corrida completa del leader
es la confirmacion que falta. **No toque el baseline**: limpiarlo lo decide el humano.

## Notas para el leader (no son hallazgos de QC-101)

- **`usuarios/scope.test.ts` sigue rojo por QC-95** (`f728d15`). QC-101 no toca
  `user-admin-prisma.ts`, y `./init.sh` completo lo contara como rojo nuevo porque no esta en el
  baseline. Mientras eso no se decida, el gate de esta rama no puede salir verde.
- **T12 abierta tiene un efecto sobre la guardia de trazabilidad.** Mientras QC-101 tenga una task
  sin marcar, `check-trazabilidad.mjs` la salta: solo exige el mapa completo con todas las tasks
  marcadas. El mapa esta completo (22/22, comprobado en la primera vuelta), asi que no se pierde nada.
  Pero conviene marcar T12 en cuanto el gate completo este verde, para que la guardia la cubra antes
  del PR.
- **Hallazgo lateral del implementer, que confirmo por lectura:** en `grupos/alcance.test.ts`, el caso
  «ningun archivo de la pantalla llama a una ruta propia con `fetch`» tambien lee
  `archivosDeLaPantalla()` sin `ctx`. Es la misma bomba que M2, hoy en verde solo porque nadie usa
  `fetch` en la pantalla. No es alcance de QC-101; queda para quien decida abrirlo.
