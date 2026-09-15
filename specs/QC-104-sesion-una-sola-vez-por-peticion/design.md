# QC-104 — sesion-una-sola-vez-por-peticion · design.md

> Escrito por `spec_author` el 2026-09-15 (F1.2). Todo lo que se cita con `archivo:linea` se leyo
> en disco ese dia. Donde algo no se pudo comprobar, se dice.

## 0. Hallazgos (para el humano; no se resuelven aqui)

- **H1 — `React.cache` NO alcanza a las Server Actions invocadas desde el navegador.** La decision 1
  pedia declararlo con evidencia si pasaba, y pasa. La evidencia esta en `> 2.2`. **No deja nada
  fuera**: el diseno cubre las acciones con un segundo ambito (`> 2.3`), sin dependencia nueva.
- **H2 — «Una peticion» es ambigua cuando una accion revalida.** Next ejecuta la accion y, si hubo
  revalidacion, repinta la pantalla **en la misma respuesta HTTP**
  (`node_modules/next/dist/server/app-render/action-handler.js:987-998`: `requestStore.phase` pasa de
  `'action'` a `'render'`). Con este diseno esa respuesta cuesta **hasta dos** lecturas: una en la
  accion y otra en el repintado. Juntarlas es posible, pero entonces el repintado pintaria la sesion
  de **antes** de la mutacion. **Anotada como Pregunta abierta 2**; R4 esta escrito con la opcion de
  dos ambitos, provisional.
- **H3 — La semilla se queda corta al contar las lecturas.** «Tres lecturas por pagina» cuenta solo
  las llamadas directas a `identity.getSessionUser()` desde `app/`. Pero los componentes de servidor
  **invocan Server Actions mientras se pintan**, y cada una resuelve su actor por su cuenta:
  - `app/(private)/configuracion/unidades/components/unit-list-section.tsx:62-63` llama dos veces a
    `listUnitsAction`, y cada llamada hace `Promise.all([getSessionUser(), getSessionContext()])`
    (`lib/modules/unidades/adapters/driving/unit-actions.ts:66-69`): **4 lecturas mas** sobre las 3
    de la semilla.
  - `app/(private)/pedidos/components/order-list-section.tsx:80-81, 147, 179-180, 197` llama a seis
    acciones mas.
  - `app/(private)/configuracion/usuarios/components/user-list-section.tsx:63` llama a
    `listUsersAction` y `listRolesAction`.

  **Cifra exacta: desconocida.** Esto es lectura estatica y no se ha contado en ejecucion; la da la
  medicion «antes» de R16 (T1). El alcance no cambia («una por peticion»), pero ahorra mas de lo que
  decia la ficha. Y **obliga** a que las acciones invocadas durante el pintado compartan el ambito
  del pintado (`> 2.4`): si no, R1 no se cumple.
- **H4 — Hay 8 sitios con `Promise.all` de las dos caras, no 11.** El grep de `getSessionContext`
  en `lib/modules/**/adapters/driving` da 8 helpers `currentActor`:
  - `unit-actions.ts:66`
  - `product-actions.ts:151`
  - `presentation-actions.ts:67`
  - `credential-setup-actions.ts:128`
  - `order-assignment-actions.ts:77`
  - `work-group-actions.ts:68`
  - `user-actions.ts:135`
  - `role-actions.ts:74`

  Cada helper lo usan varias acciones del mismo archivo, asi que «11 Server Actions» y «8 helpers»
  probablemente cuentan unidades distintas. No cambia el diseno: se toca el helper, y con el caen
  todas las acciones que lo usan.
- **H5 — Limite de lo que puede probar el gate.** Vitest carga el `react` de cliente, y ahi `cache`
  no memoiza nada (`node_modules/next/dist/compiled/react/cjs/react.development.js:994-998`:
  `return fn.apply(null, arguments)`). El test de R15 **no puede** ejercitar la semantica real de
  React. Prueba el **cableado** con un ambito de pintado simulado (`> 5.2`). Que React comparta de
  verdad dentro de la peticion de Next lo prueba la medicion en ejecucion de R16, que se hace una
  vez. La decision 2 no lo contradice, pero conviene saberlo antes de aprobar.

## 1. Punto de partida (medido en disco)

- La cadena de cortes: `lib/modules/identity/domain/resolve-session.ts:48-173`. Es **la** consulta
  por peticion (`findActiveById`, `:75`), y ya falla cerrado con un `catch` que registra la causa
  (`:76-87`).
- El cableado:
  - **una** instancia en `lib/composition/index.ts:297-301`;
  - las dos proyecciones en `:327-330`, cada una llamando a `resolveSession()` **por su cuenta**.

  No hay memoizacion en ningun sitio.
- Las lecturas directas desde `app/` y el corte por permiso:
  - `app/(private)/layout.tsx:59`
  - `lib/modules/identity/adapters/driving/require-page-permission.ts:49`
  - `app/(private)/configuracion/usuarios/page.tsx:54`
  - `app/(private)/pedidos/components/order-list-section.tsx:122`
  - `app/(private)/configuracion/unidades/page.tsx:59-60`, que corta dos veces

  Mas las indirectas de H3.
- Las acciones que ya hacen **una** sola lectura (solo `getSessionUser`) **no se tocan**:
  - `recipe-actions.ts:93`
  - `supplier-actions.ts:82`
  - `supplier-catalog-actions.ts:62`
  - `order-actions.ts:115`
  - `login-action.ts:111`
- Versiones: `next` 16.3.0, `react` 19.2.8 (`package.json:44-46`). `next.config.ts` esta vacio: sin
  `cacheComponents`.

## 2. Mecanismo

### 2.1 Resumen de la decision

**Una sola memoizacion, dos fuentes de ambito.** La lectura se memoiza **por peticion** en un helper
tecnico nuevo, y la «peticion» sale de una de estas dos fuentes:

1. **Pintado de una pantalla** → el ambito que React da por peticion con `React.cache`, que Next
   documenta para esto.
2. **Invocacion de una Server Action** → un ambito explicito con `AsyncLocalStorage`, de
   `node:async_hooks`, que es modulo de Node y no una dependencia npm. Se abre en el unico sitio donde
   una accion pide las dos caras: su `currentActor`.

Si no hay ninguno de los dos, **no se memoiza nada** y se lee como hoy (R7). El dominio no cambia.
`resolveSession` sigue construyendose **una** vez, y las dos proyecciones conservan nombre y firma
(decision 7).

### 2.2 Por que `React.cache` sirve para el pintado y no para las acciones (evidencia de H1)

**Lo que documenta Next 16.3** (local, `node_modules/next/dist/docs/`):

- `01-app/01-getting-started/06-fetching-data.md:544-588`: «multiple calls within the same request
  return the same memoized result» y «`React.cache` is scoped to the current request only. Each
  request gets its own memoization scope».
- `01-app/02-guides/caching-without-cache-components.md:264-266`: «deduplicate requests within a
  single render pass».
- `01-app/02-guides/authentication.md:1135`: «memoize the return value of the function during a
  React render pass». Y en `:1173` propone llamar a `verifySession()` desde Server Actions, **sin
  decir que alli memoice**.

**Lo que dice el codigo vendorizado** (compilaciones de desarrollo; las de produccion no se leyeron,
ver el cierre de este apartado):

1. `next/dist/compiled/react/cjs/react.react-server.development.js:599-603`: `cache(fn)` pide
   `ReactSharedInternals.A.getCacheForType(createCacheRoot)` en cada llamada.
2. `next/dist/compiled/react-server-dom-turbopack/cjs/react-server-dom-turbopack-server.node.development.js:6230-6235`:
   `getCacheForType` usa `resolveRequest()`. **Si no hay peticion de React, devuelve un `new Map()`
   nuevo en cada llamada**, o sea que no memoiza nada.
3. El mismo archivo, `:1235-1239`: `resolveRequest()` solo encuentra peticion si `currentRequest`
   esta puesto o si `requestStorage.getStore()` tiene algo. Y `requestStorage` solo lo abre el pintado
   RSC (`:4341`, `requestStorage.run(request, performWork, request)`).
4. `next/dist/server/app-render/action-handler.js:976-987`: una accion pedida desde el navegador se
   ejecuta con `workUnitAsyncStorage.run(requestStore, () => action.apply(null, args))`. Es el
   almacen **de Next**, no el `requestStorage` **de React**, y va **antes** de cualquier pintado.

**Conclusion:** dentro de una Server Action invocada desde el navegador, `React.cache` evalua la
funcion en cada llamada. Una accion invocada **desde un componente de servidor mientras se pinta**
si esta dentro del `requestStorage` de React, y ahi si comparte.

**Lo que NO esta verificado:** que las compilaciones de produccion se comporten igual. Por eso la
medicion en ejecucion de R16 (T1 y T8) cuenta un guardado real y lo deja escrito.

### 2.3 El helper: `lib/shared/request-scope.ts` (nuevo)

Contrato (identificadores en ingles, como el resto del codigo):

```ts
export type RequestScope = {
  /** Envuelve una funcion sin argumentos: dentro de un ambito de peticion se evalua UNA vez y
   *  todas las llamadas reciben la MISMA promesa; fuera de ambito se evalua en cada llamada. */
  requestScoped<T>(compute: () => Promise<T>): () => Promise<T>;
  /** Ejecuta `fn` dentro de un ambito de peticion. Si ya hay uno activo (explicito o de pintado),
   *  lo reutiliza; si no, abre uno explicito que muere cuando `fn` termina. */
  runInRequestScope<T>(fn: () => Promise<T>): Promise<T>;
};

export function createRequestScope(deps: { renderStore: () => Map<object, unknown> }): RequestScope;

// Instancia de produccion: `renderStore = cache(() => new Map())`, con `cache` de 'react'.
export const { requestScoped, runInRequestScope } = createRequestScope({ renderStore: /* ... */ });
```

Comportamiento, en orden de busqueda del almacen activo:

1. **Ambito explicito**: `AsyncLocalStorage.getStore()`, si lo hay.
2. **Ambito de pintado**: se llama dos veces a `renderStore()` y se comparan por identidad. Dentro
   de una peticion de React devuelven el **mismo** `Map`. Fuera, `cache` vuelve a evaluar la funcion
   (apartado 2.2, punto 2, y `react.development.js:994-998`) y salen **distintos**. Iguales = hay
   pintado. Esto se apoya en el contrato documentado de `React.cache` («same request → same
   result»), no en un campo interno.
3. **Ninguno** → `requestScoped` llama a `compute()` sin guardar nada (R7).

`requestScoped` guarda **la promesa**, no el valor. Dos llamadas simultaneas, como el `Promise.all`,
comparten la consulta en vuelo. Una promesa rechazada tambien se comparte: nadie reintenta dentro de
la peticion (R9).

**Por que en `lib/shared` y no en `lib/composition`:** la fila de `lib/shared/**` en
`docs/architecture.md > La regla de dependencias` **permite paquetes npm**, y la de `lib/composition`
no los enumera. Aqui entran `react` (heredada, `docs/dependencias.md:52`) y `node:async_hooks`. El
helper no conoce ningun modulo: sigue siendo hoja (guardia, bloque 9). No es codigo de negocio: es
infraestructura como `lib/shared/pagination.ts`.

### 2.4 Acciones invocadas durante el pintado (consecuencia de H3)

`runInRequestScope` **reutiliza** el ambito de pintado cuando lo hay. Una accion que un componente
de servidor llama mientras se pinta (`listUnitsAction` desde `unit-list-section.tsx`) no abre un
ambito propio: lee el `Map` de la peticion de React y comparte la lectura con el layout y el corte
por permiso. Sin esta regla, cada accion abriria su `AsyncLocalStorage` y R1 caeria.

### 2.5 Cableado en `lib/composition/index.ts` (bloque que se toca)

- **Import:** una linea, al final del bloque de imports:
  `import { requestScoped } from '@/lib/shared/request-scope';`.
- **Despues de `:301`** (tras `const resolveSession = createResolveSession({...})`), unas 4-6 lineas
  con su comentario:
  `const resolveSessionOncePerRequest = requestScoped(() => resolveSession());`
- **`:328` y `:330`:** las dos proyecciones pasan a llamar a `resolveSessionOncePerRequest()` en vez
  de a `resolveSession()`. Dos lineas cambiadas, mismas claves y mismas firmas.

Total: **~8 lineas en dos bloques contiguos (imports y `:297-344`)**, sin reordenar nada. La
estructura que exige QC-48 R21 se conserva: una instancia y dos proyecciones que salen de ella, y
ahora ademas de la misma lectura (R12). Nada mas cambia en el archivo.

> **Coordinacion con QC-81** (`backend`, `in_progress`): su `tasks.md:110-113` (T7) puede tocar
> `lib/composition/index.ts` «si cambia algo» y espera que no cambie. **Ademas**, su T10
> (`tasks.md:153-157`) toca `lib/modules/inventario/adapters/driving/product-actions.ts`, en
> `buildCreateProductCandidate`. QC-104 toca ese mismo archivo, pero en `currentActor` (`:150-161`)
> y una linea de import. Son bloques distintos del mismo archivo. Lo valida el leader.

### 2.6 Server Actions desde el navegador: `currentActor` en 8 archivos

En cada uno de los 8 helpers de H4, el `Promise.all([...])` se envuelve en `runInRequestScope`:

```ts
async function currentActor(): Promise<Actor | null> {
  const [sessionUser, sessionContext] = await runInRequestScope(() =>
    Promise.all([identity.getSessionUser(), identity.getSessionContext()]),
  );
  // ... sin cambios
}
```

- Un import y dos lineas por archivo. Los adaptadores driving **pueden** importar `lib/shared/**`
  (fila `adapters/driving/**`).
- **El ambito vive lo que dura ese `Promise.all`**, no la invocacion entera. Hoy basta: cada accion
  llama a `currentActor()` una vez. Si una accion futura leyera la sesion otra vez fuera de
  `currentActor`, esa segunda lectura no se memoizaria. El test de R15 la detecta si esa accion esta
  en su lista (`> 5.3`).
- Las 5 acciones de una sola lectura (`> 1`) no se tocan: ya cumplen R3.

### 2.7 Inicio de sesion y escrituras de cookie (R13)

`login-action.ts:97-111` lee la sesion **despues** de `verifyCredentials`, que la acaba de emitir en
esa misma invocacion. Si esa lectura cayera en un ambito donde antes se hubiera memoizado un «sin
sesion», devolveria un resultado viejo. **No pasa, por construccion:** `login-action` no abre ningun
ambito y no llama a `currentActor`, asi que con el apartado 2.3, punto 3, cada llamada lee. Lo mismo
vale para `endSession` (`index.ts:338-343`) y `endOtherSessions`, que no leen a traves de la
proyeccion memoizada. El test de R13 lo fija. **Regla para quien venga despues:** no se abre
`runInRequestScope` alrededor de codigo que escriba la cookie de sesion.

### 2.8 Fallo cerrado y registro (R9, R10)

`resolveSession` ya convierte el fallo de la base en `null` y registra la causa (`resolve-session.ts:76-87`).
Al memoizar su promesa:

- todos los lectores de la peticion reciben ese mismo `null`, asi que layout y pagina ya no pueden
  discrepar (decision 6);
- el `catch` corre **una** vez, asi que hay una sola linea de registro por peticion en vez de una
  por lector (R10).

No se anade ningun `console` ni ningun log (R14, decision 8).

## 3. Contratos de entrada y salida

- `identity.getSessionUser(): Promise<SessionUser | null>` y
  `identity.getSessionContext(): Promise<SessionContext | null>`: **sin cambios**
  (`lib/modules/identity/ports/session-provider.ts:4-15`).
- `lib/shared/request-scope.ts`: el contrato de `> 2.3`. Es nuevo y solo lo consumen
  `lib/composition/index.ts` y los 8 adaptadores driving.
- Ninguna ruta, pantalla ni endpoint nuevo. `app/` y `components/` no se tocan (decision 11).

## 4. Modelo de datos

**Ninguno.** Sin tablas, sin columnas, sin migraciones, sin RLS y sin cambios en
`session-user-prisma.ts`. La consulta es la misma: solo cambia **cuantas veces** se hace.

## 5. Tests

### 5.1 `tests/unit/shared/request-scope.test.ts` (nuevo, proyecto `node`)

La semantica del helper, con un `renderStore` inyectado:

- dentro de `runInRequestScope`, N llamadas a la funcion envuelta llaman una sola vez a `compute`;
- dos `runInRequestScope` seguidos o simultaneos no comparten (R5, R6);
- un `runInRequestScope` anidado reutiliza el de fuera;
- con un ambito de pintado simulado activo, `runInRequestScope` no abre otro y comparte con el
  pintado (`> 2.4`);
- fuera de ambito no se memoiza (R7);
- una promesa rechazada se comparte y `compute` no se reintenta (R9);
- al terminar un ambito explicito, un ambito de pintado posterior lee de nuevo (R4);
- una prueba de fuente: el archivo solo importa `react` y `node:async_hooks` (R20).

### 5.2 `tests/unit/identity/session-once-per-request-render.test.tsx` (nuevo, proyecto `ui`)

**El conteo del gate para pantallas (R1, R2, R15).**

Montaje:

- `lib/composition` **real**, importado una vez en `beforeAll` con plazo propio, mismo patron que
  `tests/unit/composition/identity-facade.test.ts:111-115`;
- dobles solo de los adaptadores driven de sesion (`session-cookie`, `session-user-prisma`) y de
  `@/lib/shared/db/prisma`;
- `next/headers` y `next/navigation` doblados;
- `@/lib/shared/request-scope` sustituido por `createRequestScope` **real**, con un `renderStore` que
  el test controla: «empieza la peticion» crea un `Map` y «fuera de peticion» devuelve uno nuevo en
  cada llamada.

Casos:

- Una peticion simulada llama a `PrivateLayout` y a la pagina, y ademas a los componentes de servidor
  que la pagina monta y que leen sesion o invocan acciones:
  - `UsuariosPage`;
  - `UnidadesPage` + `UnitListSection`;
  - la seccion de `/pedidos`.

  Afirma `findActiveById` llamado **exactamente 1** vez por pantalla.
- Dos peticiones simuladas seguidas → 2 lecturas (R5).
- Con `findActiveById` rechazando: layout y pagina resuelven sin sesion, `findActiveById` 1 vez y la
  causa registrada 1 vez (R9, R10).
- Camino feliz sin ninguna llamada a `console.*` (R14).
- `getSessionUser().id === getSessionContext().userId` con una sola lectura (R12).

### 5.3 `tests/unit/identity/session-once-per-request-actions.test.ts` (nuevo, proyecto `node`)

**El conteo del gate para acciones (R3, R15).** Mismo montaje, **sin** ambito de pintado (el
`renderStore` real de Vitest no memoiza, H5). Casos:

- Para **cada uno** de los 8 archivos de H4, se invoca una accion con una entrada que llegue a
  `currentActor`. Afirma `findActiveById` **exactamente 1** por invocacion y **2** con dos
  invocaciones seguidas (R3, R5).
- Llamadas directas a `identity.getSessionUser()` sin ambito, con la cookie doblada cambiando entre
  llamadas: la segunda ve la nueva (R7, R13).
- Prueba de fuente: `login-action.ts` no contiene `runInRequestScope` (R13).
- `identity.getSessionUser.length === 0` y `identity.getSessionContext.length === 0` (R11).

### 5.4 Que muerde (R15)

Antes de dar T5 y T6 por hechas, se quita a mano `requestScoped` del cableado y se comprueba que los
dos tests de conteo se ponen rojos. Despues se quita `runInRequestScope` de un `currentActor` y se
comprueba que su caso se pone rojo. Se restaura. La salida se pega en `progress/impl_...`
(`docs/verification.md > Probar que muerde, no que pasa`).

### 5.5 Lo que ya existe y sigue igual

- `tests/unit/identity/resolve-session.test.ts`: el dominio no cambia.
- `tests/unit/composition/identity-facade.test.ts`: sin ambito no hay memo, asi que sus contadores
  siguen valiendo.
- `tests/integration/identity/session-user.int.test.ts`: el adaptador no cambia.
- `tests/unit/identity/require-page-permission.test.ts`,
  `tests/unit/navegacion/pantallas-exigen-permiso.test.tsx`,
  `tests/unit/navegacion/private-layout-menu.test.tsx` y `tests/unit/private-layout.test.tsx`
  (R22).
- Los tests de las 8 acciones mockean `@/lib/composition`. `runInRequestScope` es real y no les
  cambia nada.
- `e2e/session.spec.ts` entero, incluido `:352` (R8, R21).

### 5.6 Artefacto de medicion (R16-R19)

`tests/unit/identity/session-measurement-artifact.test.ts` (nuevo, `node`) lee
`progress/medicion_QC-104-sesion-una-sola-vez-por-peticion.md` y afirma:

- existen las secciones `Metodo`, `Conteo en ejecucion` y `Tiempos`;
- `Conteo en ejecucion` trae antes y despues de las tres pantallas y un guardado;
- `Tiempos` trae numeros **o** la linea `PENDIENTE: Pregunta abierta 1`, y nunca las dos cosas (R18);
- ninguna linea contiene `umbral` ni una recomendacion sobre Redis o QC-28 (R19).

## 6. Medicion, una sola vez

**Archivo:** `progress/medicion_QC-104-sesion-una-sola-vez-por-peticion.md`. Esta en disco y
versionado, no en el chat (regla 3).

**Script:** `scripts/medir-sesion-por-peticion.ts` (nuevo). Solo se corre a mano, no entra en el
gate y no escribe logs en la aplicacion (decisiones 2 y 8).

### 6.1 Conteo en ejecucion (R16): base local, no depende de la Pregunta abierta 1

- **Que se cuenta:** en `next build && next start`, las ejecuciones de la consulta de
  `findActiveSessionUserById` por peticion en:
  - `/configuracion/usuarios`, `/pedidos` y `/configuracion/unidades`;
  - un guardado: crear una unidad en `/configuracion/unidades`.
- **Donde se cuenta: en la base, no en la aplicacion.** Hay dos opciones:
  - (a) `pg_stat_statements`: reset, N peticiones, leer `calls` de la sentencia;
  - (b) `log_statement = 'all'` en la sesion de medicion de la base local.

  **Desconocido:** cual de las dos esta disponible en la base local de este repo (`.env` apunta a
  `localhost`). T1 lo comprueba y deja escrito cual uso.
- **Antes:** se mide sobre el arbol **sin** el cambio (T1, antes de T2). **Despues:** sobre la rama
  (T8).
- Esta medicion confirma en produccion lo que `> 2.2` solo leyo en las compilaciones de desarrollo.

### 6.2 Tiempos (R17, R18): **bloqueado por la Pregunta abierta 1**

- **Montaje:** `next build && next start` en local, contra el Supabase acordado y con el usuario
  acordado, en la misma maquina y la misma red para antes y despues. Las corridas se alternan para
  no medir la hora del dia.
- **Pantallas:** para cada una de las tres, 5 peticiones de calentamiento y 30 medidas con la cookie
  de sesion. Se registran la mediana y el p95 del tiempo hasta el primer byte.
- **Guardado:** el mismo guardado de `> 6.1`, medido con Playwright (ya instalado) desde el clic
  hasta la respuesta del POST, 30 veces.
- **Antes:** un checkout del merge-base con `dev`. **Despues:** la rama.
- **Sin umbral y sin recomendacion** (decision 4, R19).

## 7. Alternativas descartadas

1. **Solo `React.cache` en la composicion** (lo que sugeria la decision 9). **Descartada como
   mecanismo unico:**
   - no alcanza a las acciones invocadas desde el navegador (H1, `> 2.2`);
   - en Vitest es un paso directo (H5), asi que el gate no veria nada.

   Se conserva como **una de las dos fuentes** de ambito.
2. **Una tercera clave en la fachada, `identity.getSession()`, que devuelva las dos proyecciones
   juntas, y que las 8 acciones la usen.** Descartada:
   - la decision 7 fija «una instancia con **sus dos** proyecciones» y una tercera puerta a la misma
     resolucion es una forma mas de pedirla;
   - no arregla nada del pintado, que es donde esta la mayoria de las lecturas (H3).
3. **Deduplicar a nivel de modulo las consultas en vuelo, con la cookie o el `sid` como clave.**
   Descartada: dos peticiones simultaneas con la misma cookie compartirian una lectura, y eso es
   reutilizar **entre peticiones** (decision 5, R5). Ademas, un fallo de clave mezclaria sesiones de
   personas distintas.
4. **Usar como clave la identidad del objeto que devuelve `await cookies()` o `await headers()`.**
   Descartada: que ese objeto sea el mismo durante toda la peticion es un detalle interno de Next,
   no documentado en `node_modules/next/dist/docs/`. Un cambio de version lo romperia sin avisar
   (regla 6: no se da por hecho).
5. **Pasar el `SessionUser` del layout a la pagina.** Descartada:
   - el App Router pinta layout y pagina **en paralelo** y la pagina no recibe props del layout
     (`require-page-permission.ts:39-42`);
   - `requirePagePermission` devuelve `void` a proposito (`:44-46`);
   - tocaria `app/`, contra la decision 11.
6. **Abrir `runInRequestScope` alrededor del cuerpo de cada Server Action exportada**, en vez de
   dentro de `currentActor`. Cubriria una segunda lectura futura fuera de `currentActor`, pero:
   - toca cada accion exportada (decenas), no 8 helpers;
   - un ambito que envuelve la accion entera abarcaria escrituras de cookie como la del login y
     obligaria a vigilar `> 2.7` accion por accion.

   El test de R15 cubre el riesgo que deja la opcion elegida.
7. **Una dependencia de cache por peticion.** Descartada por la decision 9: `React.cache` y
   `AsyncLocalStorage` ya estan en el repo y en Node. No se propone ninguna libreria, asi que no hay
   cuatro checks que pasar.

## 8. Costes y riesgos aceptados

- **La deteccion del ambito de pintado se apoya en el contrato de `React.cache`**: misma peticion,
  mismo resultado; fuera, se reevalua. Si React lo cambiara, el efecto seria **volver a leer como
  hoy**, nunca compartir entre peticiones. Falla hacia lo seguro. El test del helper y la medicion
  lo vigilan.
- **Una accion futura que lea la sesion fuera de `currentActor`** no se memoiza. Queda cubierta si
  entra en la lista de `> 5.3`, y hay que anadirla.
- **Una respuesta POST que revalida** cuesta hasta dos lecturas mientras la Pregunta abierta 2 siga
  abierta (H2).
- **El conteo del gate prueba cableado, no React** (H5). La prueba de React en ejecucion se hace
  una vez (R16).

## 9. Trazabilidad prevista (`R<n>` → test)

| R | Test |
|---|---|
| R1, R2 | `tests/unit/identity/session-once-per-request-render.test.tsx` |
| R3 | `tests/unit/identity/session-once-per-request-actions.test.ts` |
| R4 | `tests/unit/shared/request-scope.test.ts` (fin de ambito explicito → pintado lee de nuevo) |
| R5 | `request-scope.test.ts` + los dos tests de conteo (dos peticiones → dos lecturas) |
| R6 | `request-scope.test.ts` (ambitos simultaneos no comparten) |
| R7 | `request-scope.test.ts` + `session-once-per-request-actions.test.ts` |
| R8 | `e2e/session.spec.ts:352` (existente) |
| R9, R10 | `session-once-per-request-render.test.tsx` (caso de fallo) + `request-scope.test.ts` |
| R11 | `session-once-per-request-actions.test.ts` + `tests/unit/composition/identity-facade.test.ts` (existente, paridad de `null`) |
| R12 | `session-once-per-request-render.test.tsx` |
| R13 | `session-once-per-request-actions.test.ts` |
| R14 | `session-once-per-request-render.test.tsx` (sin `console.*` en el camino feliz) |
| R15 | los dos tests de conteo + prueba de que muerden en `progress/impl_QC-104-...md` |
| R16, R17, R18, R19 | `tests/unit/identity/session-measurement-artifact.test.ts` |
| R20 | `tests/guards/guard-dependencias-aprobadas.test.ts` (existente) + prueba de fuente en `request-scope.test.ts` |
| R21 | `e2e/session.spec.ts` (existente, entero) |
| R22 | `tests/unit/navegacion/pantallas-exigen-permiso.test.tsx`, `tests/unit/navegacion/private-layout-menu.test.tsx`, `tests/unit/identity/require-page-permission.test.ts`, `tests/unit/private-layout.test.tsx` (existentes) |
