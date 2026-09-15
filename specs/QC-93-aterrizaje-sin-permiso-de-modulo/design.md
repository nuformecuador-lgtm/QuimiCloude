# QC-93 — aterrizaje-sin-permiso-de-modulo · design.md

## 0. Hallazgos

Todo lo de esta seccion esta medido en disco sobre el arbol principal (`dev`, `0f2c70c`) el
2026-09-13. Donde la ficha y el disco no coinciden, manda el disco y se dice.

### 0.1 Los cuatro casos existen, pero **tres de las cuatro lineas de la ficha estan desplazadas**

| La ficha dice | En disco esta en | Titulo |
|---|---|---|
| `e2e/inventario.spec.ts:306` (R4) | **`e2e/inventario.spec.ts:571`** | `un usuario que no es Administrador acaba fuera y no ve el catalogo (R4)` |
| `e2e/pedidos.spec.ts:443` (R49) | **`e2e/pedidos.spec.ts:447`** | `... y no ve ningun dato de pedidos (R49)` |
| `e2e/proveedores.spec.ts:463` (R52) | **`e2e/proveedores.spec.ts:467`** | `... y no ve ningun dato de proveedores (R52)` |
| `e2e/recetas.spec.ts:376` (R6) | `e2e/recetas.spec.ts:376` ✔ | `... y no ve el catalogo (R6)` |

**Los cuatro casos son los que la ficha dice** —mismo nombre, mismo requisito de origen, misma
causa—; lo unico que ha cambiado son las lineas (`inventario.spec.ts:306` cae hoy dentro de la
limpieza de huerfanos de QC-90, `:300-327`). No se reabre nada: se anota para que nadie busque en
el sitio equivocado.

### 0.2 El patron roto esta **doblemente** roto en esos cuatro casos

No es solo el `login()` que espera `DASHBOARD_ROUTE`. El cuerpo del caso tambien espera una
**redireccion** que QC-75 retiro:

```
await page.goto(SUPPLIERS_ROUTE);
await page.waitForURL((url) => url.pathname === DASHBOARD_ROUTE, ...);   // proveedores.spec.ts:475-476
```

Desde QC-75 una ruta privada sin permiso responde **404 en su sitio**, sin redireccion
(`app/(private)/not-found.tsx`, y `requirePagePermission` en cada `page.tsx`). O sea que estos
cuatro casos, aunque el login aterrizara donde toca, seguirian afirmando una regla que ya no
existe. El modelo de como debe quedar el caso **ya esta escrito en el repo**:
`e2e/presentaciones.spec.ts:356-382` (status 404 + `private-not-found` visible + cuenta cero de
los testids de datos). El caso migrado se calca de ahi.

### 0.3 Las **trece suites**: cuadra, y estas son

Contando «suite que entra por el formulario y afirma un aterrizaje con una ruta escrita»:

| # | Suite | Donde | Forma |
|---|---|---|---|
| 1 | `aislamiento-inventario.spec.ts` | `:230-235` | `login()` propio, `DASHBOARD_ROUTE` dentro |
| 2 | `errores.spec.ts` | `:199-203` | login en linea, `DASHBOARD_ROUTE` |
| 3 | `establecer-contrasena.spec.ts` | `:272-280` | login en linea, `DASHBOARD_ROUTE` |
| 4 | `grupos-de-trabajo.spec.ts` | `:243-248`, `:369` | `login(page, user, landing)` con la ruta en la llamada |
| 5 | `inventario.spec.ts` | `:203-208`, `:574` | `login()` propio · **caso roto (R4)** |
| 6 | `login.spec.ts` | `:314` | login en linea, `DASHBOARD_ROUTE` |
| 7 | `pedidos.spec.ts` | `:168-173`, `:450` | `login()` propio · **caso roto (R49)** |
| 8 | `presentaciones.spec.ts` | `:192-197`, `:301`, `:362` | `login(..., landing)` con la ruta en la llamada |
| 9 | `proveedores.spec.ts` | `:175-180`, `:470` | `login()` propio · **caso roto (R52)** |
| 10 | `recetas.spec.ts` | `:148-153`, `:377` | `login()` propio · **caso roto (R6)** |
| 11 | `recetas-pasos.spec.ts` | `:124-129` | `login()` propio |
| 12 | `unidades.spec.ts` | `:235-240`, `:370`, `:469` | `login(..., landing)` con la ruta en la llamada |
| 13 | `usuarios.spec.ts` | `:234-239`, `:320`, `:434` | `login(..., landing)` con la ruta en la llamada |

Quedan fuera a proposito `session.spec.ts` y `permisos.spec.ts` (llegan por `returnTo` o afirman el
aterrizaje **ya derivado**, `permisos.spec.ts:214`) y `theme.spec.ts` / `login-skin.spec.ts` (no
entran). **Trece exactas.**

### 0.4 Los **23 fallos**: no los puedo reconstruir en disco, y este es el numero que si encuentro

La medicion original es real y esta fechada: `progress/impl_QC-85-...:451` dice **«49 pasan / 23
fallan»** sobre `QuimiCloude_QC85` recien migrada y sembrada, y nombra seis specs:
`recetas`, `proveedores`, `inventario`, `pedidos`, `presentaciones` y `errores`
(`:467-468`). Leyendo el disco de hoy, **la causa raiz solo alcanza a cuatro tests**, que en dos
proyectos son **8 ejecuciones rojas**, no 23:

- `presentaciones.spec.ts` **ya no** lleva el patron roto para el Operador: entra con
  `INVENTORY_ROUTE` (`:362`) y afirma 404 sin redireccion. Parte de los 23 ya esta curada en `dev`.
- `errores.spec.ts` crea **solo un Administrador** (`:63`, `:120`), que si tiene
  `dashboard.consultar`: la causa raiz **no puede explicar** su rojo. Su fallo sobre base limpia
  tiene otra causa, todavia sin nombre.
- Los otros tres nombrados (`recetas`, `proveedores`, `inventario`) mas `pedidos` son los cuatro de
  0.1.

**Conclusion operativa, y es lo que hace la ficha ejecutable:** el numero al que hay que responder
no es «23» congelado sino **«los rojos que de verdad da la corrida completa hoy»**. Por eso T1 es
medir antes de tocar nada y T12 medir despues (R23), y por eso R24 exige **causa nombrada** para
cada rojo que sobreviva en vez de un conteo. No se fuerza la cifra: si la corrida de T1 da 8, 17 o
23, el PR escribe la que salga y la compara con la de despues.

### 0.5 Indicios de agujero REAL de permisos: **ninguno**

Se busco a proposito, porque la decision cerrada nº 6 obliga a parar si aparece. Lo que hay:

- Cada `page.tsx` privado abre con `requirePagePermission('<modulo>.consultar')` —comprobado en
  `inventario`, `pedidos`, `proveedores`, `dashboard`, `configuracion/usuarios`,
  `configuracion/unidades`, `configuracion/presentaciones`, `produccion/formulas/[id]`—, y el corte
  va **en la pagina, nunca en el layout**, con el porque escrito en `app/(private)/not-found.tsx:14-18`.
- El filtrado del menu ocurre **en servidor** (`private-nav.ts:412-414`): los items ocultos no
  viajan en el payload, y `permisos.spec.ts:219-224` ya lo afirma por `toHaveCount(0)` sobre el
  `data-testid`.
- El usuario de `login.spec.ts` nace con un **rol efimero sin ningun permiso**
  (`login.spec.ts:229-235`: `prisma.role.create` sin `permissions`). Hoy aterriza en
  `DASHBOARD_ROUTE` por el respaldo de `login-action.ts:122-126` y **ve un 404**. Eso no es un
  agujero: es exactamente el camino que la decision cerrada nº 4 manda ejercitar. El caso nuevo
  (R14-R18) es, de hecho, la sonda que lo delataria si algun dia dejara de serlo.

**Titular: no hay nada que reportar como seguridad.** Si la corrida de T1 o T12 lo contradice,
R18 manda: se para y se abre ficha.

### 0.6 Dos cosas menores, medidas, que el implementer agradecera

- `e2e/` **no tiene hoy ningun helper compartido**: cero imports relativos en todo el directorio.
  El precedente a seguir es `tests/helpers/*.ts` (`user-event.ts`, `test-database.ts`…): archivos
  planos en un `helpers/`, sin barril. Por eso el helper nace en `e2e/helpers/`, que es directorio
  nuevo, y no inventa convencion: copia la que ya existe un nivel mas arriba.
- `playwright.config.ts:27` fija `testDir: 'e2e'`. Con el `testMatch` por defecto
  (`**/*.@(spec|test).?(c|m)[jt]s?(x)`) un `e2e/helpers/landing.ts` **no** se recoge como test.
  Conviene comprobarlo con `pnpm exec playwright test --list` (T3) en vez de fiarse.

## 1. Que se construye

Un solo archivo nuevo de helper, trece suites migradas, un caso nuevo y una guardia.

```
e2e/helpers/landing.ts          (nuevo)   el helper unico — R1..R7
e2e/*.spec.ts                   (13)      migradas a el — R8
e2e/login.spec.ts               (+1 caso) el usuario sin permisos — R14..R18
tests/guards/guard-e2e-landing.test.ts (nuevo) la guardia — R9
```

Nada mas. `app/**`, `lib/**`, `db/**`, `scripts/**`, `package.json` y `pnpm-lock.yaml` quedan con
**diff vacio** (R21): el helper solo **importa** de produccion, no la modifica. Se comprobo antes de
escribirlo: `filterNavItemsByPermissions` y `firstVisibleNavHref` ya son exportaciones publicas de
`lib/shared/navigation/private-nav.ts` (`:418`, `:452`), y `prisma` ya se importa en los specs desde
`@/lib/shared/db/prisma` (p. ej. `e2e/inventario.spec.ts:62`). **No hace falta tocar produccion ni
anadir un solo export.**

## 2. El helper: `e2e/helpers/landing.ts`

Identificadores en ingles (R1, decision nº 10).

```ts
/** El destino que el login dara a ESTOS permisos. Misma composicion que login-action.ts:122-126. */
export function landingRouteForPermissions(permissions: readonly string[]): string

/** Los permisos vivos de ese usuario, leidos de la base: usuario -> rol -> role_permissions. */
export async function permissionsForUsername(username: string): Promise<readonly string[]>

/** El destino esperado para ese usuario. Compone las dos de arriba. */
export async function expectedLandingRoute(username: string): Promise<string>

/** Entra por el formulario real y espera al destino derivado. Devuelve la ruta donde aterrizo. */
export async function loginAndLand(page: Page, credentials: Credentials): Promise<string>
```

### 2.1 Como deriva el destino (R2, R3)

```ts
return firstVisibleNavHref(filterNavItemsByPermissions(PRIVATE_NAV_ITEMS, permissions))
  ?? DASHBOARD_ROUTE;
```

Literalmente la expresion de `login-action.ts:122-126`. **Esto es lo que hace que no se pueda volver
a congelar:** si manana se reordena `PRIVATE_NAV_ITEMS`, cambia el permiso de un item o se retira el
respaldo, el helper cambia solo, porque no tiene regla propia. Si en cambio reimplementara «primer
item» a mano, estariamos a una ficha de repetir QC-75.

### 2.2 De donde salen los permisos (R4, R5)

De la base, con el cliente Prisma compartido que los specs ya usan:

```ts
const user = await prisma.user.findFirst({
  where: { username, deletedAt: null },
  select: { role: { select: { permissions: { select: { permissionCode: true } } } } },
});
if (user === null) throw new Error(`no existe usuario vivo con username "${username}"...`);
return user.role.permissions.map((p) => p.permissionCode);
```

El esquema lo respalda: `Role.permissions: RolePermission[]` (`db/schema.prisma:49`) y
`RolePermission.permissionCode` (`:90`).

**Por que de la base y no del catalogo `SEED_ROLE_PERMISSIONS`:** porque hay fixtures cuyo rol **no
esta en el seed**. `login.spec.ts:229` y `establecer-contrasena.spec.ts:122` crean roles efimeros
sin permisos; un helper que mapeara «nombre de rol → permisos del seed» no sabria que responder para
ellos, y es justo el caso que la decision nº 4 quiere ejercitar. Ademas, leer la base afirma sobre
**lo que la corrida tiene sembrado**, que es donde nacio el problema: el rojo de QC-85 aparecio
precisamente porque el arbol principal arrastraba estado que una base limpia no tiene.

**Coste:** una consulta por login en un E2E que ya hace varias por fixture. Irrelevante frente a los
60 s de `waitForURL` que se ahorra cuando el destino es el correcto.

### 2.3 La entrada (R6, R7)

`loginAndLand` hace `goto(LOGIN_ROUTE)` → rellena → `click` → `waitForURL(destino derivado)` con el
mismo `timeout: 60_000` que usan hoy las trece copias, y **devuelve** el destino para que el caso
pueda encadenar (`expect(page.url())`, navegar desde ahi, etc.). **No admite parametro de
aterrizaje** (R7): la unica forma de decirle donde se aterriza es cambiar los permisos del usuario,
que es como funciona el producto.

Los flujos con `returnTo` (`session.spec.ts:247-260`) **no** son aterrizaje y no usan el helper
(R10): ahi el destino es la ruta que se pidio antes de autenticarse, y derivarla del menu seria
afirmar otra cosa.

## 3. La guardia (R9)

`tests/guards/guard-e2e-landing.test.ts`: recorre `e2e/**/*.spec.ts` como texto y falla si encuentra
un `waitForURL` con una ruta de aterrizaje constante a menos de N lineas de un `login-submit`, o una
definicion local `async function login(`. La lista de excepciones nombradas —hoy `session.spec.ts` y
`permisos.spec.ts`— vive en la propia guardia con su motivo escrito, igual que
`tests/integration/aislamiento.json` obliga a escribir el motivo.

Vive en las guardias por el motivo que `docs/verification.md` da para todas: **ningun grafo de
imports la seleccionaria** (los `.spec.ts` de Playwright no los importa nadie desde Vitest), asi que
en `--rapido` seria justo lo que se pierde. Y es la **unica** parte de esta feature que el gate
puede ejecutar: Playwright no corre en `init.sh`. Sin ella, la trazabilidad de R1/R8 depende de que
un humano mire el diff.

**Limite honesto, y se escribe en el propio archivo:** la guardia comprueba **la forma del texto**,
no que el aterrizaje afirmado sea cierto. Un spec puede usar el helper y afirmar una tonteria y la
guardia saldra verde. Lo que compra es lo mismo que compro `setupUser()` en QC-58: que exista **un**
sitio donde esta escrito como se afirma un aterrizaje en este repo, y que la copia numero catorce no
nazca en silencio.

## 4. Los cuatro casos, como quedan (R11, R12, R13)

Plantilla unica, calcada de `presentaciones.spec.ts:356-382`:

```ts
test('un usuario sin <modulo>.consultar recibe 404 y no ve ni un dato (R<n>)', async ({ page }) => {
  const landing = await loginAndLand(page, operatorUser);      // R11: derivado, no escrito
  expect(landing).not.toBe(MODULE_ROUTE);                       // la premisa, dicha en voz alta

  const response = await page.goto(MODULE_ROUTE);
  expect(response?.status()).toBe(404);                         // R12: 404 en su sitio
  expect(new URL(page.url()).pathname).toBe(MODULE_ROUTE);      // R12: sin redireccion
  await expect(page.getByTestId('private-not-found')).toBeVisible({ timeout: 60_000 });

  // R13: cuenta cero de titulo / tabla / lista / vacio, tal como estan hoy
});
```

El titulo cambia («acaba fuera» ya no describe lo que pasa) pero **conserva el `R<n>` de la ficha de
origen** (R13): esa etiqueta es el mapa `R<n> -> test` de QC-20/QC-25/QC-34/QC-43 y romperla dejaria
huerfanos cuatro requisitos de otras fichas.

**Enmienda del 2026-09-15:** en el caso de inventario `operatorUser` no sirve, porque el Operador
**si** tiene `inventario.consultar`. Ese caso entra con el usuario de un rol efimero sin permisos
(R25-R28). La plantilla de arriba no cambia; cambia quien entra. Detalle en `## 9`.

## 5. El caso nuevo de `login.spec.ts` (R14-R18)

El fixture ya existe: `createTestUser()` cuelga del rol efimero **sin permisos** de
`login.spec.ts:229-235`. No hace falta sembrar nada nuevo.

```
entra con el helper                    -> destino derivado === DASHBOARD_ROUTE (R15, por R3)
private-not-found visible              -> el 404 esta dentro del layout privado (R16)
private-nav y private-logout presentes -> tiene menu (vacio) y salida (R16)
cuenta cero de los testids de datos    -> la sonda de R18
private-logout -> LOGIN_PATH, goBack no vuelve a la zona privada (R17)
```

`private-logout` y el `goBack` ya estan ejercitados en `session.spec.ts:275-286`: se copia el gesto,
no se inventa.

## 6. Alternativas descartadas

**a) Pasar la ruta de aterrizaje como parametro, como ya hacen cuatro suites** (`usuarios.spec.ts:234`,
`unidades`, `presentaciones`, `grupos-de-trabajo`). Es el arreglo minimo: cambiar
`login(page, operatorUser)` por `login(page, operatorUser, INVENTORY_ROUTE)` en cuatro sitios y
listo. **Descartada** porque es exactamente el estado que produjo esta ficha: la premisa sigue
escrita a mano en el archivo de test, solo que ahora en la llamada en vez de en el cuerpo. El dia que
el Operador gane o pierda un permiso —QC-86 ya le sumo `asignaciones.consultar`— vuelven a ser trece
sitios que actualizar a mano. La decision cerrada nº 2 lo prohibe por escrito.

**b) Derivar los permisos de `SEED_ROLE_PERMISSIONS` por nombre de rol** en vez de leer la base.
Mas barato (cero consultas) y sin dependencia del sembrado. **Descartada** por 2.2: no sabe
responder para los roles efimeros de `login.spec.ts` y `establecer-contrasena.spec.ts`, que son dos
de las trece suites y ademas el caso nuevo; y afirmaria sobre el catalogo en codigo, no sobre lo que
la base de esa corrida tiene, que es donde vive el fallo que se esta arreglando.

**c) Un `storageState` global de Playwright con la sesion ya abierta**, para no entrar por el
formulario en cada suite. Descartada: varias de las trece suites afirman **el propio acto de entrar**
(cookie emitida, destino, estado de cuenta) y un estado precargado se los lleva por delante. Ademas
los fixtures son por worker y por `RUN_ID`; un estado compartido choca con `fullyParallel: true`.

**d) Hacer que el helper consulte el menu renderizado** (leer el primer `nav-*` visible de la barra
lateral y esperar esa ruta) en vez de calcularlo. Descartada: afirmaria la pantalla contra si misma
—si el filtrado del menu se rompiera, el test seguiria verde— y es justo el tipo de test que
`docs/verification.md` llama «un test que no asegura nada».

## 7. Dependencias

**Ninguna nueva** (R22). Todo lo que el helper necesita ya esta aprobado y en uso:
`@playwright/test`, `@prisma/client` via `@/lib/shared/db/prisma`, y codigo propio del repo
(`@/lib/shared/navigation`, `@/lib/shared/routes`). No se abre ningun proceso de los cuatro checks
de `docs/architecture.md > Dependencias de terceros`.

## 8. Riesgos

- **La corrida completa tarda y se paga dos veces** (antes y despues, dos motores). Es el precio que
  la decision cerrada nº 8 acepta a conciencia: el gate no cubre nada de esta ficha.
- **Rojos ajenos en la corrida completa** (el de `errores.spec.ts`, 0.4). No son de esta feature y
  **no se arreglan aqui**: se nombran en el PR con su causa (R24). Si alguno resulta ser de permisos,
  manda R18.
- **La guardia de R9 puede dar falsos positivos** en un spec futuro con `returnTo`. Por eso la lista
  de excepciones es explicita y con motivo, no un regex mas laxo.

## 9. Enmienda del 2026-09-15: el caso de inventario entra con un rol sin `inventario.consultar`

Vuelta a F1.2 con la feature `in_progress`. Origen: el bloqueo que el implementer anoto en
`progress/impl_QC-93-... > 0.1.4`, y el unico rojo de causa «premisa» que dejo la corrida T12
(`e2e/inventario.spec.ts:564`). Todo lo de esta seccion esta medido en el worktree.

### 9.1 Por que ese caso no se podia cumplir con el Operador

- El Operador tiene `inventario.consultar` (`lib/modules/identity/domain/permissions.ts:165`, QC-74 R9,
  con `asignaciones.consultar` sumado por QC-86 R26).
- Su destino derivado es `/inventario`. El primer item de `PRIVATE_NAV_ITEMS` es el dashboard, que
  exige `dashboard.consultar` y el Operador no lo tiene (`lib/shared/navigation/private-nav.ts:232-238`).
  El segundo es inventario (`:240-248`). `asignaciones.consultar` no abre ningun item.
- `/inventario` exige justo ese permiso (`app/(private)/inventario/page.tsx:57`), asi que al Operador le
  responde 200 con el catalogo. El `expect(landing).not.toBe(INVENTORY_ROUTE)` de la plantilla de `## 4`
  es falso, y R12 y R13 tambien.
- **No existe ningun rol del seed sin ese permiso**: el seed solo crea `Administrador` y `Operador`
  (`lib/modules/identity/domain/roles.ts:16`), y los dos lo tienen (`permissions.ts:150` y `:165`).

### 9.2 Los otros tres casos siguen con el Operador (confirmado)

| Caso | Permiso que exige la pantalla | ¿Lo tiene el Operador? | Destino derivado | Corrida T12 |
|---|---|---|---|---|
| `e2e/pedidos.spec.ts:440` (R49) | `pedidos.consultar` (`app/(private)/pedidos/page.tsx:60`) | no | `/inventario` | verde en los dos motores |
| `e2e/proveedores.spec.ts:455` (R52) | `proveedores.consultar` (`app/(private)/proveedores/page.tsx:59`) | no | `/inventario` | verde en los dos motores |
| `e2e/recetas.spec.ts:369` (R6) | `recetas.consultar` (`app/(private)/produccion/formulas/page.tsx:62`) | no | `/inventario` | verde en los dos motores |

Fuente de la ultima columna: `progress/impl_QC-93-... > T12`, «Curados por esta ficha». En estos tres
no se toca nada.

### 9.3 El fixture: un rol efimero sin permisos, dentro de `inventario.spec.ts`

**¿Hay uno que reutilizar?** Como import, no:

- El rol sin permisos del caso nuevo de `login.spec.ts` (R14) es **local a ese archivo**. Lo crea su
  `beforeAll` (`e2e/login.spec.ts:287-294`, prefijo `qc7_e2e_rol_` en `:97`), lo borra su `afterAll`
  (`:343`) y lo barre su limpieza de huerfanos (`:242-284`). `createTestUser` (`:137`) no se exporta.
- Importar un `*.spec.ts` desde otro registraria sus tests en el que importa, y `e2e/helpers/` solo
  contiene el helper de aterrizaje.
- `e2e/establecer-contrasena.spec.ts:125-132` repite el mismo patron, tambien local.

Lo que se reutiliza es **el patron**, que ya esta probado en verde en Chromium y en WebKit
(`e2e/login.spec.ts:386`, corrida T12).

**Como queda en `e2e/inventario.spec.ts`:**

1. **Rol (R27).** En el `beforeAll`, despues de crear la empresa (`:324-329`), se hace
   `prisma.role.create` con nombre `${FIXTURE_PREFIX}rol_${RUN_ID}` y **sin `permissions`**.
2. **Usuario.** Se crea con el `createUserWithRole` que ya existe (`:168-202`). Sirve tal cual porque
   busca el rol **por nombre** (`:172`). Queda en la **misma empresa** en la que el Administrador da de
   alta el catalogo, asi que la cuenta cero de R13 no puede salir en verde solo porque mira otra empresa.
3. **Sustituye a `operatorUser`.** `operatorUser` solo aparece en `:90`, `:332`, `:357` y `:567`, todas
   al servicio de este caso. Se reemplaza por un usuario con nombre en ingles (p. ej. `noInventoryUser`,
   R1 / QC-4), y desaparecen los imports que queden sin uso: `ROLE_OPERADOR` (`:59`) y `DASHBOARD_ROUTE`
   (`:63`), que hoy solo usa la espera de la redireccion retirada (`:573`). Si no se quitan, falla el lint.
4. **Destino.** Sin permisos, el menu filtrado queda vacio y `firstVisibleNavHref` devuelve `null`
   (`tests/unit/navegacion/nav-filtrado.test.ts:214-219`). El login cae en `DASHBOARD_ROUTE`
   (`lib/modules/identity/adapters/driving/login-action.ts:122-126`), y `/dashboard` exige
   `dashboard.consultar` (`app/(private)/dashboard/page.tsx:41`): **404 dentro del layout privado**. La
   premisa `landing !== INVENTORY_ROUTE` es cierta; despues, `/inventario` responde 404 en su sitio
   (`page.tsx:57`) y la plantilla de `## 4` encaja entera.
5. **Premisa leida de la base (R26).**
   `expect(await permissionsForUsername(noInventoryUser.username)).not.toContain('inventario.consultar')`,
   antes de entrar. Precedente: `e2e/login.spec.ts:394`.
6. **Limpieza (R27).** En la lista de pasos del `afterAll` (`:346-362`), el `user.deleteMany` incluye al
   usuario nuevo. Justo despues va un paso `prisma.role.deleteMany` por el **nombre exacto** del rol:
   despues de los usuarios (FK `users.role_id` `Restrict`) y antes de la empresa. No hace falta borrar
   `revoked_sessions`, porque este caso no cierra sesion. La regresion de `login.spec.ts` que arreglo
   `c0182c7` venia de un cierre de sesion.
7. **Barrido de huerfanos (R28).** En `:313-320`, se localizan primero los roles
   `${FIXTURE_PREFIX}rol_*` con mas de una hora. Despues se borran los usuarios del prefijo cuyo rol este
   entre esos, aunque sean recientes. Luego los roles, y al final las empresas. Es el orden de
   `login.spec.ts:231-284`, que deja escrito el motivo: el rol nace unos segundos antes que su usuario.
8. **Comentario de cabecera.** `inventario.spec.ts:41-45` dice que el spec no crea roles y habla de una
   «regla ruta→rol» que QC-75 retiro. Se corrige en la misma edicion (sigue siendo `e2e/**`, R21).

### 9.4 Lo que NO cambia, comprobado

- **Produccion:** R19-R21 quedan como estaban. `permissions.ts`, `db/**` y `app/**` no se tocan, y el
  Operador conserva exactamente `inventario.consultar` y `asignaciones.consultar`.
- **La guardia de R9:** el caso sigue entrando por `loginAndLand`, asi que no hace falta ninguna
  excepcion nueva.
- **Tests que listan roles:** `tests/integration/identity/role-catalog.int.test.ts:64-104` compara
  contra la propia base (conteo y `ORDER BY`), asi que tolera roles efimeros, como ya toleraba los de
  `login` y `establecer-contrasena`. `identity-seed.int.test.ts` solo resetea los roles del seed por
  nombre (`:259`, `:267`).
- **Fichas abiertas:** `specs/QC-63-ejecutar-receta-operador/requirements.md:38` da por hecho que el
  Operador nace con `inventario.consultar` y `asignaciones.consultar`, y sigue siendo cierto. QC-88,
  QC-91 y QC-92 no tienen carpeta de spec, y sus descripciones del board (`feature_list.json:1327`,
  `:1374`, `:1391`) no suponen nada sobre el Operador e inventario. No hay nada que anotar en otras
  fichas.

### 9.5 Alternativas descartadas

**a) Retirar `inventario.consultar` al Operador**, dentro de QC-93 o en ficha aparte. **El humano la
considero y la rechazo el 2026-09-15** («deja el permiso de consulta»). Ademas choca con el alcance
aprobado: seria cambiar el producto para acomodar una prueba. Coste medido antes de rechazarla:

- El seed solo **anade** asignaciones y nunca borra (`lib/modules/identity/domain/seed-initial-access.ts:217-237`),
  asi que las bases existentes necesitaban una migracion de datos.
- Al menos seis archivos de test afirman el conjunto exacto del Operador:
  - `tests/unit/identity/permissions.test.ts:142-188`
  - `tests/unit/identity/seed/seed-initial-access.test.ts:731-756` y `:812`
  - `tests/integration/identity/identity-seed.int.test.ts:592-602`, `:777-828` y `:895-950`
  - `tests/unit/navegacion/private-layout-menu.test.tsx:254-288`
  - `tests/unit/configuracion-ui/private-nav-configuracion.test.ts:130`
  - `tests/unit/e2e-helpers/landing.test.ts:35`
- `e2e/permisos.spec.ts:201-218` (QC-75 R21) apoya su recorrido entero en que el Operador aterriza en
  `/inventario`.
- Y el Operador se quedaria sin ninguna pantalla util hasta QC-88.

**b) Reescribir el caso para que el Operador afirme otra cosa** (p. ej. «ve el catalogo pero no
puede modificar»). Descartada: cambia el significado del R4 de origen, y esa afirmacion ya la cubren
`presentaciones.spec.ts:338` y los tests unitarios de `inventario.modificar`.

**c) Borrar el caso.** Descartada: deja huerfano el R4 de la ficha de origen, que es justo lo que R13
protege.

**d) Mover el rol sin permisos a un fixture compartido en `e2e/helpers/`** para que lo usen
`login.spec.ts` y `inventario.spec.ts`. Descartada: seria infraestructura nueva para un solo caso y
tocaria un `login.spec.ts` que ya esta verde. Ademas, meterlo en el helper de aterrizaje ampliaria su
contrato (R1-R7) con algo que no es aterrizaje.

**e) Un rol efimero con OTRO permiso** (p. ej. solo `pedidos.consultar`). Aterrizaria en `/pedidos` y
ejercitaria un destino que no es el respaldo. Descartada por coste: obliga a escribir en
`role_permissions` desde el E2E, y su limpieza suma otra FK `Restrict` (`role_permissions -> roles`,
`db/migrations/20260907183034_permissions_and_role_permissions/migration.sql:73`). El destino derivado
distinto del respaldo ya lo ejercitan los tres casos del Operador (`/inventario`) y `permisos.spec.ts`.

### 9.6 Riesgos de la enmienda

- **Rol huerfano si la corrida muere entre crear el rol y crear el usuario.** Lo cubre R28.
- **La carrera de QC-23** (`progress/impl_QC-93-... > T12`, hallazgo 2). Para este usuario el destino
  derivado es `DASHBOARD_ROUTE`, el mismo al que cae un login con la sesion ya muerta, asi que la
  entrada no la delata. **No da un verde falso**: con sesion nula, `/inventario` redirige al login en
  vez de responder 404, y el `expect(status).toBe(404)` falla nombrando la diferencia. Su causa sigue
  siendo de QC-23.
