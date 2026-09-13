# QC-101 — cierre-de-sesiones-de-otro-desde-la-pantalla · tasks.md

> Orden real de dependencias. `[P]` = puede ir en paralelo con la tarea marcada igual.
> Ninguna tarea toca `lib/modules/identity/ports/session-revocation-repository.ts` ni
> `specs/QC-23-registro-de-sesiones/`: eso despertaria la guardia de alcance de QC-23
> (`design.md > 0`, hallazgo 2).
> Cierre de tanda: `./init.sh --rapido`. Cierre de feature y antes del PR: `./init.sh` completo.

## Mitad servidor

- [ ] **T1 — La Server Action.** Crear `lib/modules/identity/adapters/driving/session-actions.ts`
      (`'use server'`) con `EndSessionsFormState` y `endAllSessionsAction(prevState, formData)`,
      segun `design.md > 1`: `id` como campo oculto leido tal cual, actor de las dos caras de la
      sesion (quinta copia de `currentActor()` **con su comentario de deuda**), llamada a
      `identity.endAllSessions(actor, id)`, traduccion con el traductor unico de QC-70. Sin
      `revalidatePath`, sin reexportar desde el barrel del modulo, sin decidir nada de negocio.
      **Hecho:** el archivo compila con `pnpm run typecheck` y la guardia
      `tests/guards/guard-arquitectura-modulos.test.ts` sigue verde.
      *Depende de: nada.*

- [ ] **T2 — Tests de la action.** `tests/unit/identity/sesiones/session-actions.test.ts`, con
      `@/lib/composition` mockeado al estilo de `tests/unit/identity/usuarios/user-actions.test.ts`.
      Casos: exito devuelve `{ status: 'success' }` **y nada mas** (R5); el actor se construye con
      las dos caras y es `null` si falta cualquiera (R2); `UnauthorizedError` → `unauthorized` y
      `UserNotFoundError` → `user_not_found`, **por `code` y nunca por mensaje** (R6); un error que
      no es de dominio → `unexpected` y no se relanza (R6); la action **no** repite ninguna
      comprobacion de permiso (R1).
      **Hecho:** todos verdes y el mapa `R1, R2, R5, R6 -> caso` anotado.
      *Depende de: T1.*

- [ ] **T3 [P] — Test de la autorizacion en el service para ESTA ficha.** Ampliar
      `tests/unit/identity/end-all-sessions.test.ts` (o un archivo hermano) con el caso que
      `CHECKPOINTS.md > Permisos` exige nombrado como R3: sobre **otra** persona sin
      `usuarios.modificar` se rechaza **y el puerto `stampAll` no se llama ni una vez**; y R4: los
      tres casos de no-encontrado dan el **mismo** codigo.
      **Hecho:** el doble del puerto registra cero llamadas en el caso denegado.
      *Depende de: nada. Paralelo a T1/T2.*

## Mitad pantalla

- [ ] **T4 [P] — Textos.** Anadir a
      `app/(private)/configuracion/usuarios/components/user-labels.ts`:
      `endUserSessionsLabel(displayName)`, el texto del dialogo (nombre dentro + «tendra que volver a
      entrar») y el del aviso de exito. **Ninguno promete numero** (R19). Actualizar
      `tests/unit/configuracion-ui/user-labels.test.ts`.
      **Hecho:** los textos existen en un solo sitio y ningun test copia literales.
      *Depende de: nada. Paralelo a T1.*

- [ ] **T5 — El dialogo.** Crear
      `app/(private)/configuracion/usuarios/components/end-user-sessions-dialog.tsx` (`'use client'`)
      con la forma de `delete-user-dialog.tsx`: `AlertDialog`, `useActionState`, `<form>` con el `id`
      oculto, error **dentro** por `data-code` con `UnexpectedErrorNotice` para `unexpected`, y en
      exito cerrar → `toast.success` → `router.refresh()`. Constantes `*_TESTID` y
      `END_USER_SESSIONS_ID_FIELD` exportadas. Objetivos tactiles `min-h-11 min-w-11`.
      **Hecho:** el componente monta aislado en un test y no invoca la action al abrirse.
      *Depende de: T1 (la action) y T4 (los textos).*

- [ ] **T6 — El disparador dentro del panel.** Modificar `user-form.tsx` para aceptar
      `onEndSessions?: () => void` y pintar el control (`type="button"`, etiqueta accesible con el
      nombre) **solo si llega**; modificar `user-sheet.tsx` para calcular
      `canEndSessions = user !== null && user.accountStatus === 'active' && user.id !== currentUserId`,
      pasar el callback y montar `EndUserSessionsDialog` mientras este abierto.
      **Hecho:** sin callback no se emite nada en el DOM, ni un contenedor vacio.
      *Depende de: T5.*

- [ ] **T7 — El `currentUserId` baja por props.** `page.tsx`: `canModifyUsers()` pasa a devolver
      `{ canModify, currentUserId }` de la **misma** lectura de `getSessionUser()`; propagarlo por
      `UserListSection` → `UserTable` → `UserSheet`. Ningun componente de cliente lee la sesion (R16).
      **Hecho:** `pnpm run typecheck` verde y la cadena de props completa.
      *Depende de: T6.*

- [ ] **T8 — Barrel.** Republicar en
      `app/(private)/configuracion/usuarios/components/index.ts` **todos** los nombres nuevos
      (componente, props y `*_TESTID`), y actualizar las props cambiadas.
      **Hecho:** `usuarios-convenciones.test.ts` verde por los dos lados.
      *Depende de: T7.*

- [ ] **T9 — Tests de componente.** En `tests/unit/configuracion-ui/`:
      `end-user-sessions-dialog.test.tsx` (R9 nombre dentro y no invoca al abrir, R10 una sola
      invocacion, R13 exito, R14 error dentro y dialogo abierto) y ampliaciones de
      `user-sheet.test.tsx` / `user-form.test.tsx` (R7 se ofrece sobre otro activo; **R11** cuenta no
      activa → `toHaveCount(0)`; **R12** `user.id === currentUserId` → `toHaveCount(0)`; R15 objetivo
      tactil y sin `:hover`; R16 props). Ampliar `user-row-actions.test.tsx` para **R8**: la fila
      sigue emitiendo exactamente tres controles.
      **Hecho:** todos verdes, sin literales de copy copiados.
      *Depende de: T8.*

## El recorrido completo

- [ ] **T10 — E2E con dos sesiones vivas.** Crear `e2e/cierre-de-sesiones.spec.ts` segun
      `design.md > 5`: prefijo `qc101_e2e_`, empresa efimera, roles reales del seed, limpieza de
      huerfanos por edad, `test.setTimeout(180_000)`; **dos `browser.newContext()`**, victima con
      sesion viva en `INVENTORY_ROUTE`, el administrador cierra **desde el panel** (ninguna escritura
      por Prisma), la victima acaba en el login en **una sola redireccion de documento** y sin ver
      nada privado, y la sesion del administrador **sigue viva**.
      **Hecho:** `pnpm run e2e` verde en Chromium y WebKit; los dos contextos se cierran en `finally`
      y la base queda sin filas del `RUN_ID`.
      *Depende de: T9.*

## Limites de alcance

- [ ] **T11 — Test de alcance de la ficha.** `tests/unit/identity/qc101-alcance.test.ts`, con el
      molde de `qc23-alcance.test.ts` y **precondicion de rama conjuntiva** (el diff trae
      `lib/modules/identity/adapters/driving/session-actions.ts` **y** algo bajo
      `specs/QC-101-cierre-de-sesiones-de-otro-desde-la-pantalla/`), «no puedo mirar» en rojo y
      «no es mi rama» en `skip` ruidoso. Cubre: **R18** (el catalogo de permisos es identico a la
      base de fusion y no aparece `sesiones.modificar`), **R19** (ningun conteo: el diff no modifica
      `end-all-sessions.ts` y ninguna firma nueva devuelve numero), **R20** (ancla independiente del
      rango: el puerto declara exactamente `revokeSession` y `stampAll`), **R21** (`endOtherSessions`
      no aparece fuera del dominio, el contrato y `lib/composition`) y **R22** (ninguna dependencia
      nueva). Cada regla, pura y exportada, con su **caso de mordida** fabricado.
      **Hecho:** las reglas disparan con datos fabricados y estan verdes con el repo real.
      *Depende de: T1..T10 (mide el diff entero).*

- [ ] **T12 — Trazabilidad y cierre.** Escribir el mapa `R1..R22 -> test` en
      `progress/impl_QC-101-cierre-de-sesiones-de-otro-desde-la-pantalla.md` y correr `./init.sh`
      completo.
      **Hecho:** gate en verde, ningun `R<n>` sin test, y la deuda de `current-actor.ts`
      (`design.md > 7`) anotada para el leader.
      *Depende de: T11.*
