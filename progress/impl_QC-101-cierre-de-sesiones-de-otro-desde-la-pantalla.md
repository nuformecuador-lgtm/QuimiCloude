# QC-101 — cierre-de-sesiones-de-otro-desde-la-pantalla · bitacora de implementacion (F2.1)

> Implementer, 2026-09-15. Worktree `.worktrees/QC-101-cierre-de-sesiones-de-otro-desde-la-pantalla`,
> rama `feature/QC-101-cierre-de-sesiones-de-otro-desde-la-pantalla`. Spec aprobado el 2026-09-15.
> Sin PR ni push: eso va despues de la review.
>
> **Lo que NO se ha corrido aqui, a proposito** (AGENTS.md > «Regla del gate»): ni la suite completa,
> ni `./init.sh`, ni `./init.sh --rapido`. Eso lo corre el leader. T12 pide `./init.sh` completo: esa
> mitad de T12 queda **pendiente del leader**.

## Commits de la feature

| Commit | Tasks |
| --- | --- |
| `68aa996` feat(QC-101): Server Action endAllSessionsAction y sus tests | T1, T2, T3 |
| `310c62e` test(QC-101): test de alcance de la ficha, R18-R22 | T11 (escrito antes de T10; re-verificado sobre el diff final) |
| `c19be72` feat(QC-101): cerrar todas las sesiones desde el panel de detalle | T4, T5, T6, T7, T8, T9 |
| `a4c0c00` test(QC-101): E2E con dos sesiones vivas | T10 |
| (el que anade este archivo) docs(QC-101): bitacora de implementacion | T12 |

## Reparto por subagente

| Tanda | Subagente | Tasks |
| --- | --- | --- |
| 1 | `backend_dev` | T1, T2, T3 |
| 1 (paralelo) | `frontend_dev` | T4 (quedo en rojo: el barrel no republicaba; ver «Por tanda») |
| 2 | `frontend_dev` | T5, T6, T7, T8, T9 + cierre del rojo de T4 |
| 2 (paralelo) | `backend_dev` | T11 |
| 3 | `frontend_dev` | T10 + nombre del caso «QUINCE Server Actions» |

## Archivos tocados (`git diff --stat d6008f1..HEAD`: 28 archivos, +3165 / -201)

**Produccion**
- `lib/modules/identity/adapters/driving/session-actions.ts` — NUEVO (T1). Directiva use server, `EndSessionsFormState`, `endAllSessionsAction`; quinta copia de `currentActor()` con comentario de deuda.
- `app/(private)/configuracion/usuarios/components/end-user-sessions-dialog.tsx` — NUEVO (T5).
- `app/(private)/configuracion/usuarios/components/user-labels.ts` — T4: `endUserSessionsLabel`, `endUserSessionsTitle`, `endUserSessionsMessage`, `endUserSessionsSuccess`.
- `app/(private)/configuracion/usuarios/components/user-form.tsx` — T6: prop `endSessions?: UserFormEndSessions` y disparador `type="button"`.
- `app/(private)/configuracion/usuarios/components/user-sheet.tsx` — T6: `currentUserId`, `canEndSessions`, monta el dialogo. **Ojo al revisar:** el diff crudo es +226/-176, pero con `git diff -w` es **+52/-2**; el resto es reindentacion (sin cambio de fin de linea: 0 CRLF antes y despues).
- `app/(private)/configuracion/usuarios/components/user-table.tsx`, `user-list-section.tsx`, `page.tsx` — T7: `currentUserId` baja por props; `canModifyUsers()` devuelve `{ canModify, currentUserId }` de la misma lectura de `getSessionUser()`.
- `app/(private)/configuracion/usuarios/components/index.ts` — T8: republica los nombres nuevos.

**Tests**
- `tests/unit/identity/sesiones/session-actions.test.ts` — NUEVO (T2, 15 casos).
- `tests/unit/identity/end-all-sessions.test.ts` — T3, bloque anadido al final (8 casos nuevos; los 13 previos intactos).
- `tests/unit/identity/qc101-alcance.test.ts` — NUEVO (T11, 19 casos).
- `tests/unit/configuracion-ui/end-user-sessions-dialog.test.tsx` — NUEVO (T9).
- `tests/unit/configuracion-ui/user-sheet.test.tsx`, `user-form.test.tsx`, `user-row-actions.test.tsx`, `usuarios-page.test.tsx`, `user-labels.test.ts` — casos nuevos (T4, T9).
- `tests/unit/configuracion-ui/user-table.test.tsx`, `user-list-section.test.tsx`, `user-list-empty.test.tsx` — solo la prop `currentUserId`.
- `tests/unit/configuracion-ui/usuarios-convenciones.test.ts` — `COMPONENTES_ESPERADOS` 27 -> 28, `session-actions`/`endAllSessionsAction` en `ACCIONES_POR_RUTA`, y el caso renombrado de «CATORCE» a «QUINCE Server Actions» (6 + 1 + 7 + 1 = 15).
- `vi.mock` de `session-actions` que lanza si se invoca, en: `usuarios-viewport.test.tsx`, `user-list-section.test.tsx`, `usuarios-page.test.tsx`, `grupos/usuarios-page.test.tsx`, `grupos/work-group-a11y.test.tsx`, `grupos/work-group-list-skeleton.test.tsx` (ver desvio 4).
- `e2e/cierre-de-sesiones.spec.ts` — NUEVO (T10).

**Sin tocar, comprobado:** `lib/modules/identity/domain/end-all-sessions.ts`, `lib/modules/identity/ports/session-revocation-repository.ts`, `specs/QC-23-registro-de-sesiones/`, `lib/modules/identity/index.ts`, `package.json`, `db/`. Ninguna dependencia nueva, ningun `npx shadcn add`.

## Mapa R<n> -> test (los 22)

Nombres de caso copiados del disco (verificados con grep sobre los archivos y con la salida `verbose`).

| R | Archivo | Caso(s) |
| --- | --- | --- |
| R1 | `tests/unit/identity/sesiones/session-actions.test.ts` | «R1: llama a identity.endAllSessions una vez, con el actor y el id del campo oculto TAL CUAL»; «R1: un id con espacios llega sin recortar, y un id ausente llega como cadena vacia»; «R1: con un actor SIN ningun permiso la action igual invoca el caso de uso (no filtra en el borde)»; «R1: sin permiso sobre otra persona el rechazo sale del caso de uso REAL y el puerto no se toca»; «R1: el estado previo no influye en el resultado» |
| R2 | `tests/unit/identity/sesiones/session-actions.test.ts` | «R2: con sesion completa el actor es id y permisos de getSessionUser + empresa de getSessionContext»; «R2: si ${caso}, el actor es null, la accion sigue y el caso de uso REAL rechaza sin tocar el puerto» (falta getSessionUser / falta getSessionContext / faltan las dos) |
| R3 | `tests/unit/identity/end-all-sessions.test.ts` | «QC-101 R3: ${caso}, rechaza con code unauthorized y stampAll registra CERO llamadas» (conjunto vacio / solo usuarios.consultar / otros permisos de modificar); control: «QC-101 R3: el mismo actor CON usuarios.modificar si llega al puerto (el rechazo es por el permiso)» |
| R4 | `tests/unit/identity/end-all-sessions.test.ts` | «QC-101 R4: si ${caso}, responde user_not_found y no unauthorized» (no existe / borrado logicamente / otra empresa); «QC-101 R4: los tres casos son INDISTINGUIBLES (misma clase, mismo code, mismo mensaje)» |
| R5 | `tests/unit/identity/sesiones/session-actions.test.ts` | «R5: con exito devuelve EXACTAMENTE { status: success } y ninguna clave mas»; «R5: aunque el caso de uso devolviera algo, la action no lo propaga al estado» |
| R6 | `tests/unit/identity/sesiones/session-actions.test.ts` | «R6: UnauthorizedError se traduce a code unauthorized con el mensaje del catalogo»; «R6: UserNotFoundError se traduce a code user_not_found con el mensaje del catalogo»; «R6: la traduccion va por code y NUNCA por mensaje (un mensaje enganoso no cambia el code)»; «R6: un error que NO es de dominio devuelve unexpected con reference, no se relanza y no filtra su texto» |
| R7 | `user-sheet.test.tsx`, `user-form.test.tsx`, `user-labels.test.ts`, E2E | «R7 — sobre otra persona activa se ofrece dentro del panel, con su nombre en el nombre accesible»; «R7 — con `endSessions` se ofrece dentro del panel, con un nombre accesible que incluye el nombre»; «el disparador (R7), el dialogo (R9) y el aviso de exito (R13) incluyen el nombre mostrable»; E2E paso 3 (el nombre accesible de `user-form-end-sessions` contiene el nombre de la victima) |
| R8 | `tests/unit/configuracion-ui/user-row-actions.test.tsx` | «R8 — QC-101 no anade nada a la fila: exactamente tres controles, ninguno de sesiones y sin menu» |
| R9 | `end-user-sessions-dialog.test.tsx`, `user-sheet.test.tsx`, E2E | «R9 — el titulo y la descripcion nombran a la persona y advierten con los textos de user-labels»; «R9 — abrir el dialogo NO invoca la action, y volver tampoco»; «R9 — pulsar el disparador abre la confirmacion con el nombre y NO invoca la action»; «R9 — volver cierra la confirmacion sin invocar nada y el panel sigue abierto»; E2E paso 4 (`end-user-sessions-message` contiene el nombre) |
| R10 | `end-user-sessions-dialog.test.tsx`, `user-sheet.test.tsx`, `user-form.test.tsx` | «R10 — al confirmar se invoca EXACTAMENTE una vez, con el id como campo oculto»; «R10 — confirmar invoca la action EXACTAMENTE una vez con el id, y NINGUNA escritura de edicion»; «R10 — pulsarlo avisa al panel UNA vez y NO envia el formulario de edicion»; «R10 — el disparador no anade ningun campo al `FormData`: siguen siendo los nueve» |
| R11 | `user-sheet.test.tsx`, `user-form.test.tsx` | «R11 — con la cuenta \`${estado}\` el control NO existe en el DOM» (un caso por estado no activo); «R11 — ancla: hay estados no activos que comprobar»; «R11 — en el alta, que no tiene sujeto, el control tampoco existe»; «R11 R12 — sin `endSessions` no se emite NADA: ni el disparador ni un contenedor vacio» |
| R12 | `user-sheet.test.tsx`, `user-form.test.tsx` | «R12 — si la persona del panel es el propio actor, el control NO existe en el DOM»; «R11 R12 — sin `endSessions` no se emite NADA: ni el disparador ni un contenedor vacio» |
| R13 | `end-user-sessions-dialog.test.tsx`, `user-sheet.test.tsx`, E2E | «R13 — en este orden: cierra el dialogo, avisa por toast y refresca, sin navegar»; «R13 R19 — el aviso es el de user-labels, nombra a la persona y no afirma ningun numero»; «R13 — el dialogo no monta ninguna region de avisos propia»; «R13 — con exito se cierra la confirmacion, se avisa una vez y se refresca sin navegar»; E2E paso 4 (toast con el nombre, sin `end-user-sessions-error`, dialogo cerrado) |
| R14 | `end-user-sessions-dialog.test.tsx`, `user-sheet.test.tsx` | «R14 — \`${code}\` se pinta dentro, el dialogo sigue abierto y no hay aviso de exito» (unauthorized / user_not_found); «R14 — el rechazo INESPERADO se pinta dentro con el identificador de la peticion»; «R14 — un rechazo se pinta dentro de la confirmacion, que sigue abierta, sin aviso de exito» |
| R15 | `end-user-sessions-dialog.test.tsx`, `user-form.test.tsx` | «R15 — confirmar y volver miden al menos 44x44 px»; «R15 — los dos controles estan en el DOM desde el primer render, sin clases de visibilidad por puntero»; «R15 — mide al menos 44x44 px y esta en el DOM sin depender de `:hover`» |
| R16 | `user-sheet.test.tsx`, `usuarios-page.test.tsx`, `usuarios-convenciones.test.ts` | «R16 — el control lo gobiernan SOLO las props: cambiar `currentUserId` lo quita y lo devuelve»; «R16 — ni el panel, ni el formulario, ni el dialogo leen la sesion o la composicion»; «R16 — QC-101: el `currentUserId` sale de la MISMA lectura de sesion que `canModify` y baja por props»; guardia existente «ninguno importa el punto de composicion, Prisma ni el cliente de base de datos» |
| R17 | `e2e/cierre-de-sesiones.spec.ts` | «cierre de sesiones de otra persona desde la pantalla › el administrador cierra las sesiones de otra persona y esa persona acaba en el login» — dos `browser.newContext()`; la victima entra por el formulario real y tiene `SESSION_COOKIE_NAME`; el administrador cierra desde el panel (ninguna escritura por Prisma fuera de fixtures y limpieza); la victima vuelve a `INVENTORY_ROUTE` con **exactamente una** redireccion de documento, `inventario-title` y `private-user-name` con `toHaveCount(0)`, `login-form` visible; la sesion del administrador sigue viva (`USERS_ROUTE`, sin `login-form`) |
| R18 | `tests/unit/identity/qc101-alcance.test.ts` | «el conjunto de codigos del catalogo es identico al de la base de fusion con `origin/dev`»; «`sesiones.modificar` no aparece en codigo de `db/` ni de `lib/` que el diff toque»; mordida: «las reglas de R18 disparan con un catalogo y un diff fabricados, y no con unos limpios»; ancla: «el catalogo de permisos existe y se lee con `usuarios.modificar` dentro y sin `sesiones.modificar`» |
| R19 | `qc101-alcance.test.ts`, `user-labels.test.ts`, `end-user-sessions-dialog.test.tsx`, E2E | «el diff no toca `end-all-sessions.ts` ni el puerto de revocacion»; «ningun archivo agregado o modificado bajo `lib/modules/identity/` declara un conteo»; mordida: «las reglas de R19 disparan con cambios y firmas fabricados, y no con unos limpios»; UI: «ningun texto contiene un digito fuera del nombre: no se afirma cuantas se cerraron (R19)», «ninguno recibe mas que el nombre: no hay por donde meter una cantidad (R19)», «R19 — ningun texto del dialogo abierto contiene un digito fuera del nombre»; E2E paso 4 (el toast sin el nombre no tiene digitos) |
| R20 | `tests/unit/identity/qc101-alcance.test.ts` | «declara EXACTAMENTE `revokeSession` y `stampAll`, y ni un metodo mas»; «no declara ninguna forma de listado, busqueda o lectura»; mordida: «las reglas de R20 disparan con un puerto fabricado que si lista, y no con uno limpio» (independientes del rango) |
| R21 | `tests/unit/identity/qc101-alcance.test.ts` | «nadie fuera del dominio, el contrato y `lib/composition` nombra `endOtherSessions`»; «ningun archivo de `app/` que el diff agrega o modifica ofrece «cerrar mis sesiones»»; mordida: «las reglas de R21 disparan con archivos y textos fabricados, y no con unos limpios» |
| R22 | `tests/unit/identity/qc101-alcance.test.ts` | «los nombres de `dependencies` + `devDependencies` son identicos a los de la base de fusion»; mordida: «la regla de R22 dispara con un manifiesto fabricado y no con uno igual» |

Precondicion de rama de `qc101-alcance`: «la precondicion es conjuntiva: una senal sola no basta» y «`git merge-base origin/dev HEAD` resuelve; si no, este test falla ruidosamente en vez de saltarse». En esta rama **ningun** caso de R18-R22 se salta.

## Salidas de los tests (reales)

Las salidas completas estan en el scratchpad de la sesion del implementer; aqui van los resumenes literales.

### Estado de partida (antes de tocar nada, tras preparar el entorno)
```
pnpm run typecheck   -> exit=0
pnpm run lint        -> exit=0
```

### Cierre final sobre HEAD `a4c0c00` (implementer)
```
pnpm run typecheck
> tsc --noEmit
EXIT typecheck=0

pnpm run lint
> eslint
EXIT lint=0

pnpm exec vitest related --run <los .ts/.tsx de git diff --name-only d6008f1..HEAD, sin e2e/> tests/unit/identity/qc23-alcance.test.ts
 Test Files  34 passed (34)
      Tests  572 passed | 7 skipped (579)
EXIT related=0

pnpm exec vitest run --reporter=verbose qc101-alcance + qc23-alcance + usuarios-convenciones
 Test Files  3 passed (3)
      Tests  46 passed | 7 skipped (53)
EXIT alcance=0
```

**Los 7 saltos, uno por uno** (ninguno es de QC-101):
- 3 en `qc23-alcance.test.ts` (R47 dependencias; R51 superficie de interfaz; R51 «nadie... nombra el cierre en bloque»): «el rango no trae a la vez `lib/modules/identity/ports/session-revocation-repository.ts` y `specs/QC-23-registro-de-sesiones/`: esta NO es la rama de QC-23». Es lo que `design.md > 0` hallazgo 2 exige: esta rama no toca ese puerto ni esa carpeta, y la guardia de QC-23 sigue muda.
- 4 en `usuarios-convenciones.test.ts` (bloque R37 de QC-67): «el rango no trae a la vez `app/(private)/configuracion/usuarios/page.tsx` y `specs/QC-67-pantalla-de-usuarios/`: esta NO es la rama de QC-67».

### Por tanda (subagentes)
```
T1-T3 (backend_dev)
  vitest related --run session-actions.ts session-actions.test.ts end-all-sessions.test.ts
   Test Files  2 passed (2)      Tests  36 passed (36)          EXIT=0
  vitest run tests/guards/guard-arquitectura-modulos.test.ts
   Test Files  1 passed (1)      Tests  61 passed (61)          EXIT=0
  vitest run qc23-alcance + guard-catalogo-de-errores + guard-permisos-no-administrables
   Test Files  3 passed (3)      Tests  54 passed | 3 skipped   EXIT=0
  (typecheck exit 2 en ese momento: 4 TS2305 en user-labels.test.ts, trabajo concurrente de T4)

T4 (frontend_dev, primera tanda) — EN ROJO, cerrado en la tanda 2
  typecheck exit 2 (TS2305: el barrel no exportaba los 4 textos nuevos; el prompt le prohibia tocar el barrel)
  vitest related: 1 failed | 13 passed; 4 failed | 215 passed; ademas 14 «Failed to start forks
  worker ... Timeout waiting for worker to respond»: saturacion de CPU con dos tandas de vitest a la
  vez en la misma maquina, no un fallo de codigo (los mismos archivos pasan en las corridas finales).
  usuarios-convenciones: 1 failed («el barrel no se deja fuera ningun nombre publico de los componentes»)

T5-T9 (frontend_dev)
  typecheck exit=0 · lint exit=0
  vitest related --run <22 archivos tocados>
   Test Files  30 passed (30)    Tests  509 passed | 4 skipped (513)   exit=0

T11 (backend_dev)
  vitest run qc101-alcance   Tests  19 passed (19)            EXIT=0
  vitest run qc23-alcance    Tests  8 passed | 3 skipped (11)  EXIT=0

T10 (frontend_dev)
  typecheck EXIT=0 · lint EXIT=0
  vitest run usuarios-convenciones   Tests  19 passed | 4 skipped (23)   EXIT=0
  playwright test e2e/cierre-de-sesiones.spec.ts --project=chromium
    ✓  1 [chromium] › e2e\cierre-de-sesiones.spec.ts:277:7 › cierre de sesiones de otra persona desde la pantalla › el administrador cierra las sesiones de otra persona y esa persona acaba en el login (37.1s)
    1 passed (1.0m)
    EXIT e2e-chromium=0
  playwright test e2e/cierre-de-sesiones.spec.ts --project=webkit
    ✓  1 [webkit] › e2e\cierre-de-sesiones.spec.ts:277:7 › cierre de sesiones de otra persona desde la pantalla › el administrador cierra las sesiones de otra persona y esa persona acaba en el login (19.8s)
    1 passed (27.2s)
    EXIT e2e-webkit=0
  filas residuales (script de un solo uso fuera del repo)
    antes:   usuarios qc101_e2e_*: 0 []   empresas qc101_e2e_*: 0 []
    despues: usuarios qc101_e2e_*: 0 []   empresas qc101_e2e_*: 0 []
```

### Entorno y base (para leer los resultados de arriba)
- El worktree **no tenia** `node_modules` ni `.env`. Se preparo como el paso 2 de `init.sh`, sin correr el gate: `pnpm install --frozen-lockfile` (sin tocar `package.json` ni el lock; `git status` limpio despues), `prisma generate`, `next typegen`, y copia del `.env` del arbol principal (ignorado por git).
- **El `.env` apunta a la base compartida `localhost:5432/QuimiCloude`** (al dia: 28 migraciones al empezar). El E2E escribe ahi sus fixtures `qc101_e2e_*` y los borra. En paralelo corrian otras sesiones: **QC-93** (E2E) y **QC-81** (migra `product_batches.lot` a obligatorio). Interferencia observada: al empezar T10 el puerto 3117 lo ocupaba el `next dev` del worktree de QC-93 (PID 21824); el subagente espero ~170 s a que se liberara sin tocarlo. **No se vio ningun rojo de E2E ni de integracion atribuible a la base.** No se corrio integracion (`*.int.test.ts`): el diff no toca adaptadores driven ni `db/`. Si la corrida del leader da un rojo de integracion o E2E fuera de este diff, la primera sospecha es la base compartida (en particular la migracion de QC-81), no esta rama.

## Numeros de linea del spec que se movieron

Verificados contra el disco tras el merge de `origin/dev` (QC-102 y QC-95). QC-95 solo toco `set-user-account-status.ts`, `ports/user-admin-repository.ts` y su adaptador Prisma (limpia los contadores de bloqueo al salir de `blocked`): **no contradice ninguna decision cerrada de QC-101**.

| Cita del spec | En disco | Nota |
| --- | --- | --- |
| `user-form.tsx:347-349` (`isForm` + `formProps`) / `:343-350` | `SheetContent` en 343, `isForm` 347, `formProps` 348 | desplazamiento de 1 linea |
| `user-row-actions.tsx:98,110,122` | `<Button>` en **93, 105, 117** | el merge no toco este archivo: la cita ya estaba corrida |
| `lib/composition/index.ts:568` y comentario `:561-567` | `endAllSessions` en **569**, comentario 559-568 | +1 |
| `end-all-sessions.ts:63-65`, `:73-74`, `:87-89`, `:33-38` | iguales | cierto |
| `role-actions.ts:67-71`, `:73` | iguales | cierto |
| `session.spec.ts:313`, `:221-238` | iguales | cierto |
| `qc23-alcance.test.ts:159-161`, `:473` | iguales | cierto |
| `delete-user-dialog.tsx:115`, `user-status-dialog.tsx:133` | iguales | cierto |
| `delete-user-dialog.tsx:95`, `user-status-dialog.tsx:113` (descripcion) | 94-96 y 112-114 | cierto (rango) |
| `page.tsx:53-63`, `list-users.ts:73`, `user-sheet.tsx:91,113`, `usuarios.spec.ts:251-254`, `theme.spec.ts:212-213` | iguales | cierto |
| «`currentActor()` ya esta copiado CUATRO veces» | 4 en `identity` (user, role, work-group, credential-setup); **12 en todo el repo** (ademas asignaciones, inventario x2, pedidos, proveedores x2, recetas, unidades) | la afirmacion vale para `identity`; en el repo la deuda es mayor |

## Desvios respecto al spec

### Los cuatro desvios de diseno

1. **La prop de `UserForm` no es `onEndSessions?: () => void` sino `endSessions?: UserFormEndSessions` = `{ displayName, onEndSessions }`.**
   *Motivo:* `UserForm` pinta sobre `UserDetail`, que **no trae `displayName`**, y R7 exige el nombre en el nombre accesible. Recomponerlo con nombres y apellidos duplicaria `buildDisplayName`; el panel lo pasa desde la `UserRow`. La regla de ausencia se mantiene: sin la prop no se emite nada, ni contenedor.
2. **El dialogo no se monta fuera del `<Sheet>`: va dentro de la raiz del `<Sheet>`, como hermano de `UserForm`.**
   *Motivo:* sigue fuera del arbol del `<form>` de edicion (lo que `design.md > 0` hallazgo 5 protege) y su contenido va en portal, pero asi Base UI lo reconoce como dialogo anidado para el foco y el apilado. Lo cubren «R10 — confirmar invoca la action EXACTAMENTE una vez con el id, y NINGUNA escritura de edicion» y, en navegador real, el E2E (verde en Chromium y WebKit).
3. **No se baja `canModify` a `UserSheet`.**
   *Motivo:* el design no lo pide, y hoy el panel solo lo abre quien puede modificar (alta y acciones de fila exigen `canModify` en `user-table.tsx`). Quien autoriza es el service (R3). Bajarlo seria una tercera comprobacion redundante.
4. **`vi.mock` de `session-actions` en seis tests que no son de esta ficha** (lista en «Archivos tocados»).
   *Motivo:* esos tests mockean `@/lib/composition` solo con `identity`, y `session-actions.ts` lee `observabilidad` al cargarse; sin el mock no cargan. El mock lanza si se invoca, asi que no puede tapar una llamada real.

### Otros ajustes menores (sin cambio de comportamiento)
- **Un solo commit para T4-T9** (`docs/conventions.md` pide uno por task): el barrel es de T4 y de T8 a la vez y los tests de T9 van ligados a T6-T7; partirlo dejaba commits intermedios en rojo.
- **T3 usa un puerto en memoria** con el mismo filtro que la consulta real (id + empresa + no borrado), no un doble que siempre responde not_found: asi los tres casos de R4 son tres situaciones distintas. El filtro en Prisma lo sigue cubriendo `tests/integration/identity/session-revocation.int.test.ts` de QC-23 (no corrido aqui).
- **T11 es algo mas ancho de lo pedido:** R18/R22 fallan tambien si se **quita** un codigo o una dependencia («identico»); R19 prohibe tocar tambien el puerto (ya lo prohibia la cabecera de `tasks.md`); R21 mira archivos **anadidos y modificados** de `app/` («ni existente»). Las funciones puras de `qc23-alcance` se **copiaron** con comentario de origen, porque importarlas registraba sus tests dos veces.
- **Textos propios del dialogo:** confirmar «Cerrar sesiones», pendiente «Cerrando…», volver «Volver». Viven en el archivo del dialogo, como en los dialogos vecinos.
- **E2E:** la fila se localiza por `[data-testid="user-row-actions"][data-user-id=<id>]`; los textos se comprueban por inclusion del nombre (compuesto con `buildDisplayName`), sin copiar frases; dos afirmaciones extra que el design no pide (no aparece `end-user-sessions-error`; el administrador sigue en `USERS_ROUTE`).

## Deuda registrada para el leader

- **Quinta copia de `currentActor()`** en `lib/modules/identity/adapters/driving/session-actions.ts`, con su comentario de deuda que apunta a la extraccion a `adapters/driving/current-actor.ts` (`design.md > 3` alternativa B y `> 7`). La promesa de `role-actions.ts:67-71` («cuando aparezca la TERCERA copia se extrae») ya se incumplio tres veces dentro de `identity`, y en todo el repo hay **12 copias** (13 con esta). No se refactoriza aqui por decision del spec; se propone ficha propia y el leader decide si la abre. *Matiz del comentario:* nombra las cuatro copias de `identity`, pero el subagente solo verifico que el cuerpo coincide con `user-actions.ts` y `role-actions.ts`.
- **Pendiente del leader:** `./init.sh` completo (segunda mitad de T12). Tras la vuelta de review ya se corrio la suite **unitaria** completa (`ui` + `node`, ver abajo); el proyecto `integration` y `./init.sh` no.

## Vuelta de review (2026-09-15)

La review (`progress/review_QC-101-cierre-de-sesiones-de-otro-desde-la-pantalla.md`, HEAD revisado `58d3ae8`) devolvio la ficha **RECHAZADA con 4 mayores y 3 menores**. Producto y trazabilidad quedaron aprobados (22/22). Lo que fallaba era el gate: cinco guardias o tests de alcance que leen el disco o el fuente, y que `vitest related` no selecciona, estaban en rojo por este diff. **La leccion para la proxima vez:** en una ficha que anade un E2E, un sitio que nombra el estado de cuenta o un test de UI, `vitest related` no basta. Hay que correr las guardias y los tests de alcance de la carpeta (`test:rapido` como minimo).

### Correcciones, un commit por hallazgo

Solo se toco codigo de test y `tasks.md`; nada de produccion. No se toco `tests/baseline-rojos.json`, ni `ADAPTADORES_DRIVING`, ni `tests/unit/identity/usuarios/scope.test.ts`.

| Hallazgo | Commit | Archivo(s) | Que se hizo |
| --- | --- | --- | --- |
| M1 | `1012f97` | `tests/guards/guard-identificador-de-request.test.ts` | Alta de `cierre-de-sesiones.spec.ts` en `E2E_ESPERADOS`, con comentario `QC-101 T10 / R17`. El comentario describe el recorrido y deja dicho que **NO** ejercita el cruce borde -> accion del identificador de peticion (el spec no lee ni afirma nada sobre el identificador ni sobre `reference`), asi que el diferimiento de QC-71 R21 sigue intacto. |
| M2 | `9350743` | `tests/unit/configuracion-ui/grupos/alcance.test.ts` | El caso QC-85 R36 «cada operacion entra por su RUTA EXACTA, nunca por el barrel del modulo» recibe `ctx` y llama a `baseDeEstaRama(ctx)`, como sus hermanos. El comentario cita a QC-101 como la rama que lo destapo: era una guardia de alcance sin precondicion de rama. En esta rama sale **saltado** («esta NO es la rama de QC-85»), no en verde. |
| M3 | `bccce2e` | `tests/unit/identity/account-status-scope.test.ts` | Alta de `app/(private)/configuracion/usuarios/components/user-sheet.tsx` en `SITIOS_PERMITIDOS`, como bloque aditivo al final con comentario `QC-101 R11`: compara el estado que ya viaja en la `UserRow`, sin lectura nueva, y la autorizacion sigue en el service. La comparacion sigue siendo una igualdad. |
| M4 | `fd30f77` | `tests/unit/configuracion-ui/end-user-sessions-dialog.test.tsx` | `getByText(endUserSessionsTitle(...))` pasa a `within(dialogo).getByRole('heading', { name: endUserSessionsTitle(FILA.displayName) })`. `AlertDialogTitle` se pinta como `h2`. No hizo falta testid nuevo, y el barrel no cambia. No quedan otros `ByText`, `ByLabelText`, `ByPlaceholderText` ni `ByDisplayValue` ahi ni en los casos QC-101 de `user-sheet.test.tsx` y `user-form.test.tsx`. |
| m1 | `2f94de4` | `user-list-section.test.tsx`, `usuarios-page.test.tsx`, `usuarios-viewport.test.tsx`, `grupos/usuarios-page.test.tsx` | Solo reordenar: el bloque del `vi.mock` de `session-actions` va antes del comentario de grupos, que queda pegado a su `vi.mock` de `work-group-actions`, como en `work-group-a11y.test.tsx`. Ninguna linea de texto cambia. |
| m2 | — | — | Solo constancia (T4-T9 en un commit, ya declarado arriba). No se rehace la historia. |
| m3 | `92ff837` | `specs/QC-101-.../tasks.md` | T12 **desmarcada**, con nota de estado: el mapa y la deuda estan escritos, y el `./init.sh` completo lo corre el leader. «Gate en verde» no se cumple hasta que su salida este en la bitacora. |

### Salidas (reales, sobre HEAD `2f94de4`)

**Antes, confirmando los rojos (subagentes):**
```
guard-identificador-de-request.test.ts   Tests  1 failed | 22 passed (23)            EXIT=1
account-status-scope.test.ts             Tests  1 failed | 8 passed | 3 skipped (12) EXIT=1
alcance + end-user-sessions-dialog + configuracion-convenciones + unidades-convenciones
  × ninguna consulta de la carpeta identifica por texto de interfaz   (configuracion-convenciones, R35)
  × ninguna consulta de la carpeta identifica por texto de interfaz   (unidades-convenciones, R49)
  × cada operacion entra por su RUTA EXACTA, nunca por el barrel del modulo   (grupos/alcance, R36)
  Test Files  3 failed | 1 passed (4)   Tests  3 failed | 72 passed | 20 skipped (95)   EXIT=1
```

**Despues, por archivo (subagentes):**
```
guard-identificador-de-request.test.ts   Tests  23 passed (23)             EXIT=0
account-status-scope.test.ts             Tests  9 passed | 3 skipped (12)  EXIT=0
pnpm run typecheck                       EXIT=0
pnpm run lint                            EXIT=0
vitest run (alcance, end-user-sessions-dialog, 3 convenciones, 4 de m1)
  Test Files  9 passed (9)   Tests  168 passed | 25 skipped (193)   EXIT=0
```

**`pnpm run test:rapido` (implementer):**
```
[test:rapido] -> vitest related --run --passWithNoTests <diff de la rama>
 Test Files  36 passed (36)
      Tests  613 passed | 23 skipped (636)
[guardias]
 Test Files  39 passed (39)
      Tests  407 passed | 9 skipped (416)
EXIT test:rapido=0
```

**Los seis archivos de la tabla de atribucion (implementer, `--reporter=verbose`):**
```
tests/guards/guard-identificador-de-request.test.ts
tests/unit/configuracion-ui/grupos/alcance.test.ts
tests/unit/identity/account-status-scope.test.ts
tests/unit/configuracion-ui/configuracion-convenciones.test.ts
tests/unit/configuracion-ui/unidades-convenciones.test.ts
tests/unit/identity/usuarios/scope.test.ts

 × |node| tests/unit/identity/usuarios/scope.test.ts > alcance de QC-66 (crud-de-usuarios) — CONTENIDO: muerde siempre, tambien dentro de dev > R45 — ningun archivo de produccion de la feature lee ni escribe los tres contadores de bloqueo de QC-...
AssertionError: QC-66 toca el mecanismo de bloqueo de QC-19/QC-78, y R45 se lo prohibe:
+   "lib/modules/identity/adapters/driven/persistence/user-admin-prisma.ts: failedLoginAttempts",
+   "lib/modules/identity/adapters/driven/persistence/user-admin-prisma.ts: lockLevel",
+   "lib/modules/identity/adapters/driven/persistence/user-admin-prisma.ts: lockedUntil",
 Test Files  1 failed | 5 passed (6)
      Tests  1 failed | 104 passed | 29 skipped (134)
EXIT seis=1
```

**Suite unitaria completa, `pnpm exec vitest run --project ui --project node` (implementer):**
```
 FAIL  |node| tests/unit/identity/usuarios/scope.test.ts
 Test Files  1 failed | 403 passed (404)
      Tests  1 failed | 5839 passed | 75 skipped (5915)
   Duration  248.65s
EXIT suite-ui-node=1
```

### Lectura del resultado

- **El unico rojo es `tests/unit/identity/usuarios/scope.test.ts`, y no es de QC-101.** Acusa a `lib/modules/identity/adapters/driven/persistence/user-admin-prisma.ts`, cuyo ultimo commit es `f728d15 feat(QC-95)`. `git diff --name-only d6008f1..HEAD` para esa ruta: **0**. No se toco: lo decide el humano (arreglarlo en `dev` o darlo de alta en el baseline). `./init.sh` completo lo va a contar como rojo nuevo tambien en esta rama, porque no esta en `tests/baseline-rojos.json`.
- **Frente a la review: de 6 archivos rojos a 1.** Los 4 que provocaba este diff (M1-M4) estan en verde, y `grupos/alcance` ademas salta su caso R36 fuera de la rama de QC-85.
- **Desvio respecto a lo esperado en `configuracion-convenciones` y `unidades-convenciones`:** se esperaba que les quedara solo el rojo documentado en el baseline (los casos de `package.json`, desde QC-79). **No les queda ninguno.** Esos casos salen saltados por precondicion de rama:
  - «(R31) > no toca `package.json` ni `components/ui/`»: «esta NO es la rama de QC-45»
  - «(R45) > `package.json` no aparece en el diff contra la base de fusion»: «esta NO es la rama de QC-39»

  **Sus dos entradas en `tests/baseline-rojos.json` parecen obsoletas** (su motivo ya no se reproduce), y el propio comparador deberia avisarlo. No se tocaron: es decision del leader.
- **Base compartida:** nada de lo corrido en esta vuelta abre conexion (proyectos `ui` y `node`). No se corrio `integration` ni E2E. No se observo ninguna interferencia.
- **Hallazgo lateral, sin tocar (no lo pedia la review):** en `grupos/alcance.test.ts`, el caso vecino «ningun archivo de la pantalla llama a una ruta propia con `fetch`» (~l.591) tambien lee `archivosDeLaPantalla()` sin `ctx`. Es la misma especie de bomba que M2, hoy en verde solo porque nada en la pantalla usa `fetch`. Queda anotado para quien lo decida.
