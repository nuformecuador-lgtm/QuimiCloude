# QC-101 — cierre-de-sesiones-de-otro-desde-la-pantalla · design.md

> Zona `fullstack`. Dos mitades: la Server Action que hoy no existe y el control con su dialogo en
> el panel de detalle. Mas el E2E, que es la razon de ser de la ficha.
> **Sin migracion, sin tabla nueva, sin RLS nueva, sin ruta nueva y sin dependencia nueva.**

## 0. Hallazgos (lo que dice el disco, medido antes de escribir)

1. **El caso de uso existe, esta probado y nadie lo invoca.**
   `lib/modules/identity/domain/end-all-sessions.ts:63-65` — firma
   `(actor: Actor | null | undefined, targetUserId: string) => Promise<void>`. La autorizacion es
   **la primera linea** y es condicional: `:73-74` exige `usuarios.modificar` **solo** cuando
   `targetUserId !== actor?.id`, y sobre uno mismo basta `requireActor`. Devuelve `void` (`:88-89`)
   y traduce los **tres** casos de no-encontrado al mismo `UserNotFoundError` sin distinguirlos
   (`:87-88`). Su cabecera (`:33-38`, `:60-61`) ya escribe **por que no hay permiso nuevo**
   —`sesiones.modificar` seria la cuarta enmienda al catalogo cerrado de QC-74, con migracion y seed
   de `role_permissions`, y no separa ninguna capacidad real— y **que no hay codigo de error nuevo**:
   `unauthorized` y `user_not_found` ya estan en el catalogo cerrado de QC-70
   (`lib/modules/errores/domain/error-codes.ts:54,83`).
   Ya esta cableado: `lib/composition/index.ts:568`, `endAllSessions: createEndAllSessions({...})`,
   con el comentario `:561-567` que nombra a QC-101 como quien pondra el boton.
   **Ninguna decision cerrada de la tabla contradice el codigo.**

2. **La guardia de alcance de QC-23 esta desactivada para esta rama, y hay que mantenerlo asi.**
   `tests/unit/identity/qc23-alcance.test.ts:159-161` exige, **conjuntivamente**, que el diff traiga
   `lib/modules/identity/ports/session-revocation-repository.ts` **y** algo bajo
   `specs/QC-23-registro-de-sesiones/` para que sus casos de R47/R51 apliquen; si no, hace
   `ctx.skip()` nombrando explicitamente a QC-101 (`:178-180`). Consecuencia operativa: **esta rama
   no toca ese puerto ni esa carpeta de spec**, y asi la guardia sigue muda. Su caso fabricado
   (`:473`) usa literalmente `lib/modules/identity/adapters/driving/session-actions.ts` como ejemplo
   de la Server Action que QC-101 viene a escribir: se adopta **ese mismo nombre de archivo**.
   Sus anclas independientes del rango (`:334-350`, `:356-402`) siguen corriendo: son las que
   verifican R20 de esta ficha.

3. **`currentActor()` ya esta copiado CUATRO veces** —`user-actions.ts:134`, `role-actions.ts:73`,
   `work-group-actions.ts:67`, `credential-setup-actions.ts:127`— y `role-actions.ts:67-71` dejo
   escrito que «cuando aparezca la TERCERA copia se extrae», con sitio propuesto
   `adapters/driving/current-actor.ts`. La promesa **ya se incumplio dos veces**. No es una
   contradiccion con ninguna decision cerrada de QC-101, pero si deuda registrada: ver alternativa
   descartada **B** y la nota final.

4. **El «panel de detalle del usuario» de la decision 2 es, en el disco, el panel de EDICION.**
   `app/(private)/configuracion/usuarios/components/user-sheet.tsx` no es una ficha de solo lectura:
   con `user !== null` pide `getUserAction(id)` (`:91`) y, cuando resuelve, monta **`UserForm`**, que
   es quien pinta el `SheetContent` (`user-form.tsx:343-350`). No hay ninguna otra pantalla de
   detalle. La decision se cumple **poniendo el control dentro de ese panel**; no se abre.

5. **Ese `SheetContent` ES un `<form>`** (`user-form.tsx:347-349`, `isForm` + `formProps`). Por eso
   el control no puede ser un segundo `<form>` anidado en el arbol del panel, y el disparador debe
   ser `type="button"`. El dialogo si puede llevar su propio `<form>` porque `AlertDialogContent` se
   monta en un portal fuera de ese arbol —es lo mismo que ya hacen `delete-user-dialog.tsx:115` y
   `user-status-dialog.tsx:133` colgando de la tabla—.

6. **El actor NO aparece en su propia lista.** `list-users.ts:73` llama
   `listAliveInCompany(actor.companyId, actor.id, query)` con `excludeUserId` **obligatorio**
   (`:54-56`), y el E2E de QC-67 lo afirma (`e2e/usuarios.spec.ts:164`). O sea: el caso «el panel
   abierto sobre uno mismo» es hoy **inalcanzable por construccion**. R12 se implementa igual, de
   forma explicita y testeable — ver alternativa descartada **C**.

7. **La pagina resuelve la sesion pero solo se queda con un booleano.** `page.tsx:53-63`
   (`canModifyUsers`) llama `identity.getSessionUser()` y devuelve `boolean`; el identificador del
   actor **se descarta**. Hace falta subirlo para R12.

8. **El estado de cuenta viaja ya hasta el panel**: `UserRow.accountStatus`
   (`domain/user-view.ts:42-49`) y `UserDetail.accountStatus` (`:64-79`), y `UserSheet` recibe la
   `UserRow` completa por props. R11 no necesita ninguna lectura nueva.

9. **Las primitivas de shadcn que hacen falta YA EXISTEN**: `components/ui/alert-dialog.tsx` y
   `components/ui/button.tsx`. **No se invoca `npx shadcn add` para nada** (la parada de QC-85 no se
   repite).

10. **No hay ningun E2E con dos sesiones vivas a la vez.** Lo unico parecido es
    `e2e/theme.spec.ts:212-213`, que clona `storageState` en un contexto nuevo —eso duplica **una**
    sesion, no monta dos personas—. Los cortes de sesion ya probados (`e2e/session.spec.ts:289`,
    `:352`) usan **una** sesion y matan la cuenta por fuera con Prisma. El patron de dos contextos
    **no existe y lo crea esta ficha** (seccion 5).

## 1. La Server Action

**Archivo nuevo:** `lib/modules/identity/adapters/driving/session-actions.ts`, con `'use server'`.
Archivo propio y no una septima funcion en `user-actions.ts`, por el mismo motivo que
`role-actions.ts:10-12`: aquel archivo es la administracion de usuarios y este es el **cierre de
sesiones**, que consumiran ademas QC-53 y QC-89. El nombre es el que la propia guardia de QC-23 usa
como ejemplo (hallazgo 2).

```ts
/** Sin datos: el caso de uso devuelve `void` y aqui no se inventa ninguno (R5, R19). */
export type EndSessionsFormState = { status: 'idle' } | { status: 'success' } | ErrorState;

export async function endAllSessionsAction(
  _prevState: EndSessionsFormState,
  formData: FormData,
): Promise<EndSessionsFormState>;
```

- **Entrada `FormData`** con un unico campo oculto `id`, leido **tal cual** (`String(get('id') ?? '')`),
  igual que `readTargetId` en `user-actions.ts:180-182`: un `id` ausente llega vacio y **el dominio**
  responde `user_not_found`. Aqui no se juzga la entrada (R1).
- **Forma de estado propia y no `UserMutationFormState` importado**: este archivo no depende de
  `user-actions.ts`, y el tipo es identico en forma pero de otro asunto. (Los tipos se borran en
  compilacion, asi que la restriccion de `'use server'` —solo funciones `async` exportadas— no
  afecta a `export type`.)
- **Actor**: quinta copia de `currentActor()` (hallazgo 3), con el comentario que lo declare y
  apunte a la extraccion pendiente. Falla cerrado a `null` (R2).
- **No decide nada** (R3 se cumple **en el service**): no repite `requirePermission`, no comprueba
  «soy yo», no mira el estado de cuenta. Una comprobacion aqui seria una segunda copia de la regla
  de `end-all-sessions.ts:73-74`.
- **Errores** por `createErrorStateTranslator(IdentityError, observabilidad.readRequestIdHeader)`,
  la misma unica implementacion de QC-70 (R6). Ningun codigo nuevo.
- **Sin `revalidatePath`**: la pantalla se pone al dia con `router.refresh()`, como el resto de esta
  ruta (`user-sheet.tsx:113`). Ademas no hay nada de la lista que cambie: la revocacion no se pinta.
- **No se reexporta desde `lib/modules/identity/index.ts`** (el contrato solo reexporta de
  `./domain`); la UI la importa por su ruta exacta.

**Contratos I/O**

| Entrada | Salida |
| --- | --- |
| `FormData { id: string }` | `{ status: 'success' }` |
| actor sin `usuarios.modificar` sobre otro | `{ status: 'error', code: 'unauthorized', message }` |
| id inexistente / borrado / de otra empresa | `{ status: 'error', code: 'user_not_found', message }` |
| fallo no de dominio | `{ status: 'error', code: 'unexpected', message, reference }` |

**Modelo de datos:** ninguno. No hay tabla nueva, ni columna, ni migracion, ni `down.sql`, ni policy
de RLS que tocar. La escritura la hace `stampAll` sobre el sello que QC-23 ya creo.

## 2. El control y el dialogo

Dos archivos nuevos en `app/(private)/configuracion/usuarios/components/`:

- **`end-user-sessions-dialog.tsx`** (`'use client'`) — copia de forma de `delete-user-dialog.tsx`:
  `AlertDialog` + `useActionState(endAllSessionsAction, INITIAL_STATE)` + `<form action={formAction}>`
  con el `id` en un `<input type="hidden">`; error dentro por `data-code` y `UnexpectedErrorNotice`
  para `unexpected` (R14); en exito, `onOpenChange(false)` → `toast.success(...)` → `router.refresh()`
  (R13). Constantes `END_USER_SESSIONS_*_TESTID` y `END_USER_SESSIONS_ID_FIELD` exportadas, para que
  ningun test dependa del copy.
- Los **textos** van a `user-labels.ts`, donde ya viven los de esta pantalla:
  `endUserSessionsLabel(displayName)` → `Cerrar todas las sesiones de ${displayName}` (nombre
  accesible del disparador, R7), y el mensaje del dialogo, que **nombra a la persona y no promete
  numero** (R9, R19): «Se cerraran todas las sesiones de {nombre}. Tendra que volver a entrar.»
  El aviso de exito: «Se cerraron las sesiones de {nombre}.»

**Donde se monta, y quien decide.** `UserSheet` pasa a ser el dueno del estado del dialogo, igual que
`UserTable` lo es de los suyos:

```
page.tsx ── canModify + currentUserId ──► UserListSection ──► UserTable ──► UserSheet
                                                                              ├─ UserForm (endSessions?: () => void)
                                                                              └─ EndUserSessionsDialog (portal)
```

- `page.tsx`: `canModifyUsers()` pasa a devolver `{ canModify, currentUserId }` de **la misma**
  lectura de `getSessionUser()` que ya hace (hallazgo 7). Sin sesion, `currentUserId` es `null`.
- `UserSheet` calcula
  `canEndSessions = user !== null && user.accountStatus === 'active' && user.id !== currentUserId`
  (R11, R12) y, solo entonces, pasa un callback `onEndSessions` a `UserForm`, que pinta el
  disparador (`type="button"`, `min-h-11 min-w-11`, icono + etiqueta accesible con el nombre) al pie
  del cuerpo del panel. **Sin callback, `UserForm` no emite nada** — ni el contenedor: la ausencia es
  la unica senal, mismo criterio que `user-row-actions.tsx:85`.
- El dialogo se monta **solo mientras esta abierto**, para que un rechazo anterior no reaparezca.
- Todo llega **por props** (R16): ningun componente de cliente lee la sesion ni importa
  `lib/composition`.
- El barrel `components/index.ts` republica **todos** los nombres nuevos: lo exige
  `usuarios-convenciones.test.ts` por los dos lados.

**Ocultar no es autorizar.** R11/R12 son comodidad de interfaz; quien decide si se **puede** es
`end-all-sessions.ts:73`. Los permisos de la sesion son una foto del login y envejecen hasta 8 h
(`docs/architecture.md > Permisos`), asi que la pantalla puede ofrecer un control que el service ya
deniega: ese rechazo se pinta como cualquier otro, por su `code` (R14).

## 3. Alternativas descartadas

**A — Botón en la fila del listado, con o sin menú desplegable.** Descartada por la decision cerrada
2, y ademas el menu **no existe**: la fila son tres botones de icono
(`user-row-actions.tsx:98,110,122`). Crearlo para colgar una accion poco frecuente que **expulsa a
alguien que puede estar trabajando** es exactamente lo que la decision aparta: desde el detalle hay
que mirar de quien se trata antes de pulsar.

**B — Extraer `adapters/driving/current-actor.ts` ahora**, en vez de escribir la quinta copia de
`currentActor()`. Es lo que `role-actions.ts:67-71` prometio. Descartada **en esta ficha**: tocaria
cuatro archivos `'use server'` ajenos al alcance, cada uno con su spec y sus tests, y convertiria
una ficha de «exponer una funcion ya escrita» en una refactorizacion transversal — justo el riesgo
que la decision 1 evito al no partir la ficha. Se escribe la quinta copia **con su comentario** y la
extraccion se propone como ficha propia del board (ver seccion 7).

**C — No implementar R12 y confiar en que el actor nunca aparece en su lista** (hallazgo 6).
Descartada: seria una regla de esta pantalla sostenida por una invariante de **otra** feature
(`list-users.ts:73`), sin nada que se ponga rojo si manana el listado deja de excluir al actor. El
coste de la alternativa elegida es un `currentUserId` que hoy nunca coincide; el beneficio es que la
regla **esta escrita donde se lee** y tiene test. Se documenta en el codigo que la exclusion del
listado es la primera barrera y esta es la segunda.

**D — Confirmar con un `window.confirm` o sin dialogo.** Descartada por la decision cerrada 4: el
nombre **dentro** es lo que convierte un «¿seguro?» en una comprobacion real, y el patron de esta
pantalla ya es `AlertDialog` con el nombre en la descripcion
(`delete-user-dialog.tsx:95`, `user-status-dialog.tsx:113`).

## 4. Dependencias

**Ninguna nueva** (R22). Todo lo necesario esta en el repo: `AlertDialog` y `Button` en
`components/ui/` (hallazgo 9), `sonner` para el aviso, Playwright para el E2E. **No se ejecuta
`npx shadcn add`.** Por tanto no hay fila que anadir a `docs/dependencias.md` ni cuatro checks que
acreditar.

## 5. El E2E: dos sesiones vivas a la vez

Archivo nuevo **`e2e/cierre-de-sesiones.spec.ts`** (no se amplia `usuarios.spec.ts`: es otra cadena,
con dos navegadores, y colgarla de alli la ataria a su fixture y a su orden).

**Fixtures**, con el molde ya probado de `e2e/usuarios.spec.ts:261-310` y `e2e/session.spec.ts`:
`RUN_ID` por proceso, prefijo propio `qc101_e2e_`, empresa efimera propia
(`normalizeCompanyName`, nunca la del seed), limpieza defensiva de huerfanos por edad
(`ORPHAN_MIN_AGE_MS`), borrado en `afterAll` por nombres exactos, hash **real** con
`createPasswordHash`, `accountStatus: 'active'` explicito y roles **reales** del seed
(`ROLE_ADMINISTRADOR` para quien cierra, `ROLE_OPERADOR` para la victima — este ultimo sirve ademas
para aterrizar en `INVENTORY_ROUTE`, que es la ruta privada que su rol si puede ver).

**Las dos sesiones.** Se usa el fixture `browser` de Playwright y se crean **dos contextos
independientes**, que es lo unico que garantiza dos frascos de cookies distintos en el mismo test
(`page` no vale: es uno solo, y `storageState` clonaria la misma sesion):

```ts
test('el administrador cierra las sesiones de otra persona y esa persona acaba en el login',
  async ({ browser }) => {
    const adminContext = await browser.newContext();
    const victimContext = await browser.newContext();
    try { /* ... */ } finally {
      await adminContext.close();
      await victimContext.close();
    }
  });
```

**Los pasos, y donde se verifica cada cosa:**

1. **La victima entra por el formulario real** en `victimContext` y **aterriza en una pantalla
   privada** (`INVENTORY_ROUTE`, titulo visible). Se comprueba ademas que la cookie de sesion existe
   (`SESSION_COOKIE_NAME` en `victimContext.cookies()`): sin esto, el paso 5 no distingue «no hay
   sesion» de «nunca la hubo». **Esta es la sesion viva que la ficha promete cortar.**
2. **El administrador entra** en `adminContext` y abre la lista **por URL derivada de `USERS_ROUTE`**
   con la busqueda del `RUN_ID` ya puesta —igual que `usuarios.spec.ts:251-254`—, de modo que la
   fila de la victima este en la pagina que se visita.
3. **Abre el panel de detalle** de la victima (el disparador de edicion de su fila) y **pulsa el
   control** «Cerrar todas las sesiones»: ahi se verifica R7, que el control se ofrece sobre otra
   persona activa.
4. **Confirma en el dialogo**, cuya descripcion **contiene el nombre** de la victima (R9), y el
   administrador ve el aviso de exito (R13). Quien cierra es, explicitamente, **el otro navegador**:
   ninguna escritura se hace por Prisma en este test — a diferencia de `session.spec.ts:313`, que
   simulaba la accion administrativa porque entonces no existia. **Esa sustitucion es justo lo que
   esta ficha viene a eliminar.**
5. **La victima navega de nuevo** a `INVENTORY_ROUTE` en **su** contexto y **acaba en el login**:
   - se cuentan las redirecciones de **documento** con el ayudante de
     `session.spec.ts:221-238` (copiado, con su razon) y se exige **exactamente una**: sin esto, un
     bucle de 19 saltos pasaria el test;
   - `inventario-title` y `private-user-name` con `toHaveCount(0)`: **no llego a ver nada privado**;
   - el formulario de login visible.
6. **La sesion del administrador sigue viva**: se vuelve a pedir la lista en `adminContext` y la
   pantalla responde. Cerrar las sesiones de otro **no cierra las propias** — y sin esta afirmacion
   el recorrido no distinguiria «se corto a quien tocaba» de «se corto a todo el mundo».

**Lo que este E2E NO afirma:** cuantas sesiones se cerraron (R19: el sistema no lo sabe) y nada sobre
el borrado de la cookie de la victima (la cookie no se borra: el corte lo hace la relectura del sello
en cada peticion, `resolve-session.ts` corte 7, decision ya fijada en `session.spec.ts:337-344`).

## 6. Verificacion por nivel

| Nivel | Que cubre |
| --- | --- |
| Unit dominio | R3, R4 — ya existen en `tests/unit/identity/end-all-sessions.test.ts`; se **anade** el caso de la autorizacion visto **a traves de la action** para que R3 tenga test propio de esta ficha |
| Unit action | R1, R2, R5, R6 (`tests/unit/identity/sesiones/session-actions.test.ts`, con `@/lib/composition` mockeado como en `user-actions.test.ts`) |
| Unit componentes | R7, R8, R9, R10, R11, R12, R13, R14, R15, R16 (`tests/unit/configuracion-ui/`) |
| E2E | R17 |
| Guardias / alcance | R18, R19, R20, R21, R22 — test de alcance propio de la ficha, con **precondicion de rama conjuntiva** (el archivo de la action + la carpeta `specs/QC-101-*`), copiando el molde de `qc23-alcance.test.ts` para no dejar otra bomba de relojeria |

`./init.sh --rapido` para cerrar cada tanda; `./init.sh` completo antes del PR.

## 7. Riesgos y deuda registrada

- **Quinta copia de `currentActor()`** (hallazgo 3). Deuda explicita, no silenciosa: queda escrita en
  el comentario del archivo nuevo y se propone ficha propia para extraer
  `adapters/driving/current-actor.ts`. El leader decide si la abre.
- **El panel de detalle es el de edicion** (hallazgo 4): el control convive con un formulario. Se
  mitiga con `type="button"` y con el dialogo en portal (hallazgo 5); el riesgo real —que el
  disparador envie el formulario de edicion— tiene test propio en R10 («se invoca **exactamente una
  vez** la action», y ninguna otra).
- **El E2E es el mas caro del repo**: dos contextos, dos logins con bcrypt real y `next dev`
  compilando bajo demanda. Se le pone `test.setTimeout(180_000)` como los otros y se acepta el coste:
  es el unico sitio donde la revocacion de QC-23 se demuestra de punta a punta.
