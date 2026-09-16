# QC-104 — sesion-una-sola-vez-por-peticion · bitacora de implementacion

> Escrita por `implementer` el 2026-09-15 (F2.1), en el worktree
> `.worktrees/QC-104-sesion-una-sola-vez-por-peticion`, rama
> `feature/QC-104-sesion-una-sola-vez-por-peticion`.
>
> **Ningun subagente corrio la suite completa ni `./init.sh`** (regla del gate, `AGENTS.md`).
> Cada task cerro con `pnpm typecheck`, `pnpm lint` y los tests de sus archivos. El gate
> completo y los E2E los corre el **leader**.

## 1. Sincronizacion con `dev` (F2.3 adelantada)

`git fetch origin dev && git merge origin/dev`, **antes** de tocar codigo. Merge-base:
`f777c56`. Commit del merge: **`0d0e164`**. Trae QC-81 (PR #75) y QC-56 (PR #74).

**Un solo conflicto, y no era de codigo:** `add/add` en
`specs/QC-104-sesion-una-sola-vez-por-peticion/requirements.md`.

- `origin/dev` traia la **semilla de 53 lineas** de `/afinar-feature`, cuya seccion EARS
  todavia decia «Pendiente: los escribe spec_author (F1.2)», y cuyas «Decisiones cerradas»
  aun incluian los tiempos, el Supabase real y el umbral de QC-28.
- `HEAD` traia el **spec aprobado de 163 lineas**: R1-R16 y R20-R22, con la revision de F1.4
  (sin tiempos) y la Pregunta abierta 1 cerrada sin objeto.

**Resuelto a `HEAD` entero.** No es una decision de criterio: la version de `dev` es
estrictamente anterior y no aportaba ni una linea viva. Queda anotado porque significa que
**`dev` tiene hoy una copia vieja del spec de QC-104** que el merge de vuelta corregira.

**El conflicto que se esperaba NO se produjo.**
`lib/modules/inventario/adapters/driving/product-actions.ts` —archivo de T4 que QC-81 T10
tambien toca— entro **sin conflicto textual**: QC-81 cambio `buildCreateProductCandidate` y
QC-104 toca `currentActor`, bloques distintos del mismo archivo. Verificado en el diff final:
lo de QC-81 queda intacto.

## 2. Reparacion del entorno del worktree (antes de creer ningun rojo)

El worktree estaba **sin montar**, y eso produce exactamente los errores que mienten sobre su
causa que documenta `docs/verification.md > El gate regenera los artefactos`:

| Sintoma | Causa real | Arreglo |
|---|---|---|
| `prisma` no se reconoce como un comando | `node_modules` ausente | `pnpm install` |
| 335 errores TS, entre ellos «Module @prisma/client has no exported member PrismaClient» | `pnpm install` ignoro los build scripts de Prisma: el cliente nunca se genero | `pnpm exec prisma generate` |
| «Cannot find name LayoutProps» | tipos de ruta de Next sin generar | `pnpm exec next typegen` |
| — | la base iba **1 migracion atras** (`20260913120000_product_batch_lot_and_purchase_date`, de QC-81) | `pnpm run db:migrate` |

`pnpm run db:test status` deja la base de desarrollo «QuimiCloude» al dia: 29 migraciones
aplicadas.

**Importante para quien lea un rojo de esta rama:** el `pnpm typecheck` rojo que reporto el
subagente de T2 era **este** entorno a medias, no su codigo. Tras `prisma generate` y
`next typegen`, T3, T4 y T6 dieron `typecheck` **en verde** sobre el mismo arbol.

## 3. Tasks

| Task | Estado | Commit |
|---|---|---|
| T1 — conteo en ejecucion, ANTES (R16) | hecha (base propia) | ver seccion 5 |
| T2 — helper de ambito de peticion | hecha | `f23d312` |
| T3 — cableado en la composicion | hecha | `f23d312` |
| T4 — ambito explicito en los 8 `currentActor` | hecha | `f23d312` |
| T5 — conteo por pantalla | hecha | `974bc9d` |
| T6 — conteo por Server Action | hecha | `a9d7338` |
| T7 — prueba de que el conteo muerde | hecha, ver seccion 8 | — (no deja codigo) |
| T8 — conteo en ejecucion, DESPUES (R16) | hecha (base propia) | ver seccion 5 |
| T9 | retirada en la revision de F1.4 | — |
| T10 — test del artefacto del conteo | hecha, 9/9 y muerde | pendiente de commit |
| T11 — nota en la arquitectura | hecha | `f23d312` |
| T12 — mapa de trazabilidad | hecha, **19/19** | pendiente de commit |

### T2 — `lib/shared/request-scope.ts` (R4-R7, R9, R20)

Contrato de `design.md > 2.3` literal: `createRequestScope({ renderStore })`, y la instancia de
produccion con `cache(() => new Map())` de `react` y `AsyncLocalStorage` de `node:async_hooks`.
Orden de busqueda del almacen activo: **ambito explicito**, luego **ambito de pintado** (dos
llamadas a `renderStore()` comparadas por identidad), luego **ninguno**, y sin ambito no se
memoiza nada (R7). Guarda **la promesa**, no el valor: el `Promise.all` comparte la consulta en
vuelo y un rechazo se comparte sin reintento dentro de la peticion (R9). `runInRequestScope`
**reutiliza** el ambito de pintado si lo hay, que es lo que hace que una accion invocada por un
componente de servidor mientras se pinta comparta la lectura (`design.md > 2.4`; sin eso R1 no
se cumple).

```
pnpm lint                                              -> sin hallazgos
pnpm exec vitest related --run lib/shared/request-scope.ts tests/unit/shared/request-scope.test.ts
  Test Files  1 passed (1)
       Tests  12 passed (12)
pnpm exec vitest run tests/guards/guard-arquitectura-modulos.test.ts
  Test Files  1 passed (1)
       Tests  61 passed (61)
```

`package.json` **sin cambios** (R20). Los unicos imports del archivo son `react` y
`node:async_hooks`, y lo fija una prueba de fuente. La guardia confirma que `lib/shared` sigue
siendo **hoja** (bloque 9).

### T3 — `lib/composition/index.ts` (R1, R11, R12)

`const resolveSessionOncePerRequest = requestScoped(() => resolveSession());` detras de la unica
instancia de `resolveSession`, y las dos proyecciones pasan a llamarla. **8 lineas en dos
bloques** (un import y `:297-344`), sin reordenar nada. La estructura que exige QC-48 R21 —una
instancia, dos proyecciones que salen de ella, mismas claves y firmas sin parametros (R11)— se
conserva. `endSession` no se toca.

```
pnpm typecheck  -> sin errores
pnpm lint       -> sin hallazgos
pnpm exec vitest run tests/unit/composition/identity-facade.test.ts tests/unit/identity/resolve-session.test.ts
  Test Files  2 passed (2)
       Tests  48 passed (48)
```

Los dos en verde **sin tocarlos**, como preveia `design.md > 5.5`: sin ambito activo
`requestScoped` no memoiza, asi que sus contadores siguen valiendo.

### T4 — los 8 `currentActor` (R3)

Cambio identico en los 8 (mas 6 y menos 4 lineas cada uno): un import y el `Promise.all` —**y
solo el**— envuelto en `runInRequestScope` (`design.md > 2.6`). El ambito vive lo que dura ese
`Promise.all`, no la invocacion entera.

Archivos: `unidades/unit-actions.ts`, `inventario/product-actions.ts`,
`inventario/presentation-actions.ts`, `identity/credential-setup-actions.ts`,
`asignaciones/order-assignment-actions.ts`, `identity/work-group-actions.ts`,
`identity/user-actions.ts`, `identity/role-actions.ts`.

**Auditoria previa exigida por la task, hecha antes de editar:** en los 8 archivos, **cada
accion exportada llama a `currentActor()` como maximo UNA vez por invocacion** —sin bucles, sin
ramas que la repitan y sin un segundo helper que la llame—, ninguno lee la sesion por otra via y
ninguno escribe la cookie de sesion. **Nada que escalar.** Unica particularidad, y en sentido
contrario: `setCredentialWithLinkAction` no llama a `currentActor()` **ninguna** vez, por diseño
explicito (accion publica sin actor).

**NO se tocaron** `recipe-actions.ts`, `supplier-actions.ts`, `supplier-catalog-actions.ts`,
`order-actions.ts` ni `login-action.ts` (`design.md > 1`, `> 2.7`), confirmado por `git status`.
`login-action.ts` es ademas el unico sitio donde una accion **emite** la sesion y luego la lee en
la misma invocacion: un ambito ahi memoizaria un «sin sesion» viejo (R13).

```
pnpm typecheck  -> sin errores
pnpm lint       -> sin hallazgos
pnpm exec vitest related --run <los 8 archivos>
  Test Files  96 passed (96)
       Tests  1694 passed | 1 skipped (1695)
    Duration  168.67s
pnpm exec vitest run tests/guards/guard-arquitectura-modulos.test.ts
  Test Files  1 passed (1)
       Tests  61 passed (61)
```

Los tests existentes de las 8 acciones, en verde **sin tocarlos**.

### T6 — `tests/unit/identity/session-once-per-request-actions.test.ts` (R3, R5, R7, R11, R13, R15)

21 casos, proyecto `node`. Montaje de `design.md > 5.3`: `@/lib/composition` **real** importado
una vez en `beforeAll` con plazo propio de 60 s (patron de `identity-facade.test.ts:111-115`);
dobles de `readSessionClaims`, **`findActiveSessionUserById`** (el contador),
`@/lib/shared/db/prisma`, `next/headers` y `next/cache`; y
`@/lib/shared/request-scope` sustituido por el `createRequestScope` **real** con un
`renderStore` que devuelve un `Map` nuevo en cada llamada, o sea **sin** ambito de pintado, que
es el caso de la accion invocada desde el navegador.

**Detalle que decide si el test prueba algo:** se sustituye por **una sola** instancia, de la que
salen a la vez el `requestScoped` que consume `lib/composition` y el `runInRequestScope` que
consumen los 8 `currentActor`. Con dos instancias el conteo daria 2 siempre y no probaria nada.

La ficha doblada lleva `permissions: []`: el caso de uso rechaza en su primera linea y no toca el
`prisma` vacio, asi que el conteo no depende de doblar los datos de los 8 dominios. El test no
afirma nada sobre el resultado de las acciones, **solo** sobre el numero de lecturas.

Casos: las 8 acciones por `describe.each` (**1** lectura por invocacion, **2** con dos
invocaciones seguidas); un caso que fija que la lista cubre 8 archivos distintos, para que un
noveno `currentActor` no se cuele sin cobertura; sin ambito y con la cookie cambiando entre
llamadas la segunda ve la nueva (R7, R13); prueba de fuente de que `login-action.ts` no contiene
`runInRequestScope` (R13); y `getSessionUser.length === 0` / `getSessionContext.length === 0`
(R11).

```
pnpm exec vitest run tests/unit/identity/session-once-per-request-actions.test.ts
  Test Files  1 passed (1)
       Tests  21 passed (21)
pnpm typecheck  -> sin errores
pnpm lint       -> sin hallazgos
```

Sin cambios en codigo de produccion: el conteo da 1 con lo que ya habia de T3 y T4.

### T11 — nota en `docs/architecture.md`

Un parrafo nuevo en `## Permisos y autenticacion`, detras de «El layout privado sigue siendo la
ultima linea de defensa», que dice que esa lectura es **una sola por peticion** (QC-104), que
layout, corte por permiso y acciones invocadas al pintar la comparten, y que **nunca** se
reutiliza entre peticiones. El parrafo anterior queda intacto. No promete tiempos ni cache entre
peticiones: lo unico que afirma como probado es el **conteo**.

```
pnpm exec vitest run tests/guards/guard-arquitectura-modulos.test.ts
  Test Files  1 passed (1)
       Tests  61 passed (61)
```

Incluye el bloque 12, que lee este documento.

## 4. Archivos creados y modificados

**Nuevos**
- `lib/shared/request-scope.ts`
- `tests/unit/shared/request-scope.test.ts`
- `tests/unit/identity/session-once-per-request-actions.test.ts`
- `tests/unit/identity/session-once-per-request-render.test.tsx` (T5, en curso)

**Modificados**
- `lib/composition/index.ts` (8 lineas, dos bloques)
- los 8 `lib/modules/**/adapters/driving/*-actions.ts` de T4
- `docs/architecture.md` (un parrafo)
- `specs/QC-104-sesion-una-sola-vez-por-peticion/tasks.md` (marcado de tasks)

**Sin tocar, a proposito:** `package.json` (R20), `app/**` y `components/**` (decision 12),
`db/schema.prisma` y `db/migrations/` (no hay modelo de datos, `design.md > 4`),
`login-action.ts` y las otras 4 acciones de una sola lectura (`design.md > 2.7`).

## 5. BLOQUEO: el conteo en ejecucion (T1, T8, y con ellos T10 y R16)

**No se pudo ejecutar, y no se invento ningun numero.** Se sube al leader sin resolver, segun la
regla de no improvisar.

R16 pide contar las consultas de sesion **en la aplicacion real** (`next build && next start`)
contra la base local, antes y despues, en tres pantallas y un guardado. Eso exige **navegar como
una persona con sesion iniciada**, y en este entorno:

**RESUELTO el 2026-09-16 con base propia.** Lo que sigue es el historial de como se desbloqueo;
**la medicion esta hecha y R16 tiene cifras y test**. El detalle completo esta en
**`progress/medicion_QC-104-sesion-una-sola-vez-por-peticion.md`**.

### Resultado (ver el artefacto para el metodo y las trampas)

Mismo metodo y **misma base aislada** (`QuimiCloude_QC104`, clon de la plantilla de la rama), con el
control en reposo a **0** a los dos lados en las dos corridas:

| Caso | Antes | Despues |
|---|---|---|
| `/configuracion/usuarios` | 7 | **1** |
| `/pedidos` | 6 | **1** |
| `/configuracion/unidades` | 7 | **1** |
| guardado (alta de unidad) | 9 | **2** |

**R1 y R2 se cumplen en la aplicacion real.** Y **el hallazgo H3 era correcto**: la semilla decia
«tres lecturas por pagina» y eran **6-7**, porque los componentes de servidor invocan Server Actions
al pintarse. El guardado baja de 9 a 2, y esas 2 son **la accion y el repintado** de la misma
respuesta: el hallazgo H2 medido. **La Pregunta abierta 2 NO se cierra aqui**: el dato lo aporta
esta medicion, la decision es del humano.

### Como se llego (dos intentos fallidos antes)

1. **La navegacion FUNCIONO.** `next build && next start -p 3217`, sesion real por el formulario de
   login con un fixture de rol `Administrador`, y las tres pantallas mas el guardado servidas con
   HTTP 200. Sin dejar huerfanas y sin script en el repo (vivio en el scratchpad).
2. **La via (b) sigue sin ejecutarse: el ENTORNO la deniega.** `ALTER SYSTEM SET log_statement`
   cae en el permiso «Modify Shared Resources». **No se rodeo** —ni por `postgresql.conf` ni por
   ningun otro camino—, y **no se le pidio a otro agente que lo ejecutara**. `log_statement` nunca
   cambio: sigue en `none`, asi que **no hubo nada que revertir**.
3. **La via (c), `pg_stat_user_tables`, resulto INSERVIBLE sobre la base compartida.** El contador
   es exacto en aislamiento (validado: 1 -> 1, 3 -> 3, reposo -> 0), pero en la base de desarrollo
   **una ventana en reposo, con el navegador cerrado, sigue sumando 1-2**. Con ese suelo,
   `/configuracion/usuarios` salia **0** en tres rondas seguidas —imposible si de verdad hace una
   lectura—: las lecturas se atribuyen a la ventana vecina. **No se publico ninguna cifra.**

**Tres hallazgos que valen para quien lo retome**, todos en el artefacto: el contador **publica con
1,5-2 s de retraso** (leer una sola vez tras una espera corta da 0 en todo y «prueba» algo falso);
una recarga en produccion son **14-17 peticiones**, no una, porque Next precarga el menu, y R1/R2
hablan de **una peticion**; y `waitUntil: 'networkidle'` **no vale** con streaming de RSC.

**Como se desbloqueo:** el leader decidio **montar base propia** —`QuimiCloude_QC104`, clon de la
plantilla de la rama, que es el precedente del repo— y con eso la via (c) pasa a ser exacta **sin
tocar ninguna configuracion y sin necesitar el permiso denegado**. El control en reposo, que sobre
la base compartida daba 1-2, da **0**. La via (b) **sigue denegada y no se reintento**.

**Falto un ajuste mas del instrumento, y estaba en mi lado:** con base propia las cifras aun salian
en **0,75-0,80 lecturas por peticion**, que es imposible —una pantalla no se pinta con menos de una
lectura—. La causa era el piso de 3 s: basta para una consulta suelta y **no para una rafaga de 20
recargas**, porque la cola de publicacion de estadisticas se perdia. Con **piso de 12 s** las cifras
caen en enteros exactos. Esta escrito en el artefacto para que no se vuelva a pagar.

**Lo que si quedo resuelto, y ahorra trabajo a quien lo retome:**

- **Sobre las vias de conteo** *(historial del intento bloqueado; la via que se acabo usando es la
  **(c)**, `pg_stat_user_tables` — ver `progress/medicion_QC-104-...md > Metodo`, apartado 4)*.
  Medido contra la base local (PostgreSQL 16.1 en `localhost`, instalacion nativa, no Docker):

  | Comprobacion | Resultado |
  |---|---|
  | `pg_stat_statements` disponible | **si** (`pg_available_extensions`) |
  | `pg_stat_statements` instalada | **no** (`pg_extension` vacio para ella) |
  | `shared_preload_libraries` | **vacio** |
  | `log_statement` | `none` |
  | `logging_collector` | `on` |
  | usuario de la conexion | superusuario |

  O sea: **la via (a) NO esta disponible sin reiniciar el servidor de Postgres**
  (`pg_stat_statements` tiene que entrar en `shared_preload_libraries`, que solo se lee al
  arrancar). La via **(b) si es alcanzable sin reinicio**: siendo superusuario, un
  `ALTER SYSTEM SET log_statement` a `all` mas `SELECT pg_reload_conf()` basta, y con
  `logging_collector` en `on` las sentencias van a fichero. **Requiere tocar la configuracion del
  Postgres de la maquina y revertirla despues**, que es decision del humano, no del agente.

- **El marcador de `design.md > 6.1` punto 2 queda VALIDADO.** La consulta
  `SELECT ... FROM revoked_sessions WHERE user_id = ? AND session_id = ?` sale **una por lectura
  de sesion** y **ninguna otra pantalla la emite**: la relacion `revokedSessions` se lee en **un
  solo sitio** de todo el codigo de produccion,
  `lib/modules/identity/adapters/driven/persistence/session-user-prisma.ts:96`, dentro de
  `findActiveSessionUserById` —anidada en el mismo `findFirst`, que Prisma resuelve como
  sentencia aparte—. El unico otro uso de la tabla esta en el camino de **escritura**
  (`session-revocation-prisma.ts`), que no corre al pintar una pantalla. **El marcador sirve.**

- **El «antes» no se ha perdido.** La T1 de `tasks.md` admite medirlo sobre un checkout del
  merge-base con `dev`, y ademas el commit **`0d0e164`** (el merge, sin T3 ni T4) conserva el
  arbol previo al cambio intacto. Se puede medir antes y despues cuando haya navegador.

**Consecuencia en la trazabilidad:** **R16 se queda sin test** hasta que T8 y T10 se ejecuten.
Los otros 18 requisitos si quedan cubiertos (seccion 6).

## 6. Mapa de trazabilidad R(n) -> test (T12)

**19 requisitos: R1-R16 y R20-R22.** R17, R18 y R19 se retiraron en la revision de F1.4 y **sus
huecos no se reutilizan**. Abreviaturas de los tres archivos nuevos:

- **RENDER** = `tests/unit/identity/session-once-per-request-render.test.tsx` (7 casos, T5)
- **ACCIONES** = `tests/unit/identity/session-once-per-request-actions.test.ts` (21 casos, T6)
- **SCOPE** = `tests/unit/shared/request-scope.test.ts` (12 casos, T2)

| R | Test que lo cubre | Caso |
|---|---|---|
| R1 | RENDER | los tres casos de «lee la ficha de sesion exactamente 1 vez», que incluyen layout, cortes por permiso y las Server Actions que la pantalla invoca al pintarse |
| R2 | RENDER | «/configuracion/usuarios», «/configuracion/unidades» y «/pedidos lee la ficha de sesion exactamente 1 vez» |
| R3 | ACCIONES | `describe.each` de las **9** acciones: 1 lectura por invocacion. Ademas, un caso que recorre **el arbol** y falla si algun archivo de `driving/` con las dos caras no abre ambito |
| R4 | SCOPE | «al terminar el ambito de la accion, un ambito de PINTADO posterior lee de nuevo» (R4 **provisional**, ver seccion 7) |
| R5 | SCOPE + RENDER + ACCIONES | «dos ambitos SEGUIDOS no comparten»; «dos peticiones simuladas seguidas leen la ficha DOS veces»; «2 con dos invocaciones seguidas» |
| R6 | SCOPE | «dos ambitos SIMULTANEOS no comparten, y cada uno recibe lo suyo» |
| R7 | SCOPE + ACCIONES | «no memoiza: `compute` se evalua en cada llamada» y «tampoco memoiza DESPUES de que un ambito explicito haya terminado»; y sin ambito, con la cookie cambiando entre llamadas, la segunda ve la nueva |
| R8 | `e2e/session.spec.ts:352` (**existente**) | «una sesion abierta cuya ficha se da de baja tampoco rebota: sale al login en una sola redireccion». **Lo corre el leader**, no el subagente |
| R9 | RENDER + SCOPE | «layout y pagina resuelven sin sesion sin reintentar la consulta»; «comparte la promesa RECHAZADA y no reintenta `compute` dentro del ambito» |
| R10 | RENDER | el mismo caso de fallo: **UNA sola** linea `[session-check]` para toda la peticion |
| R11 | ACCIONES + `tests/unit/composition/identity-facade.test.ts` (**existente**) | `getSessionUser.length === 0` y `getSessionContext.length === 0`; y la paridad de `null` de las dos proyecciones |
| R12 | RENDER | «el id del usuario y el del contexto coinciden con una sola lectura» |
| R13 | ACCIONES | la cookie cambiando entre llamadas sin ambito, **mas** la prueba de fuente de que `login-action.ts` no contiene `runInRequestScope` |
| R14 | RENDER | «servir la pantalla sin fallos no llama a `console.*`» en las tres pantallas |
| R15 | RENDER + ACCIONES + **T7** | los dos tests de conteo son la comprobacion ejecutable del gate; que **muerden** esta probado con las dos mutaciones de la seccion 8. ACCIONES cubre las **9** acciones y, ademas, **recorre el arbol**: falla si aparece un archivo de `driving/` con las dos caras fuera de la lista o sin ambito (seccion 10) |
| R16 | `tests/unit/identity/session-count-artifact.test.ts` (T10) | 9 casos: existen las secciones `Metodo` y `Conteo en ejecucion`, hay fila por cada pantalla de R2 y por el guardado con «antes» y «despues» **numericos**, y no hay ninguna seccion de tiempos. Las cifras estan en `progress/medicion_QC-104-...md` |
| R20 | `tests/guards/guard-dependencias-aprobadas.test.ts` (**existente**) + SCOPE | la guardia vigila que toda dependencia declarada este aprobada; la prueba de fuente afirma que `request-scope.ts` solo importa `react` y `node:async_hooks`. `package.json` no cambia |
| R21 | `e2e/session.spec.ts` entero (**existente**) | sin E2E nuevo, decision cerrada 11. **Lo corre el leader** |
| R22 | `tests/unit/navegacion/pantallas-exigen-permiso.test.tsx`, `tests/unit/navegacion/private-layout-menu.test.tsx`, `tests/unit/identity/require-page-permission.test.ts`, `tests/unit/private-layout.test.tsx` (**existentes**) | redireccion al login con la marca, 404 dentro del layout privado y menu filtrado por permisos |

**Resumen: 19 de 19 requisitos con al menos un test.** R16 se cerro el 2026-09-16 con la medicion
sobre base propia (seccion 5) y su test de artefacto (T10).

**Preguntas abiertas del spec, al cerrar la implementacion:**

- **Pregunta abierta 1** (contra que Supabase se miden los tiempos): **cerrada sin objeto** por el
  humano el 2026-09-15 al quitar los tiempos en F1.4. La implementacion no la reabre: no se midio
  ningun tiempo y no se toco ningun Supabase real.
- **Pregunta abierta 2** (que es «una peticion» cuando una accion revalida): **sigue ABIERTA**.
  Rige **R4 provisional**, opcion (a): la accion y el repintado que provoca son **dos** ambitos, y
  esa respuesta HTTP cuesta hasta **dos** lecturas. El helper esta escrito con esa semantica y el
  caso de SCOPE citado en R4 la fija. **No se cerro aqui**: la decide el humano.

## 7. Desviaciones

- **Seccion 1** — el conflicto del merge se resolvio a `HEAD`; `dev` conserva una copia vieja del
  spec de QC-104 hasta que esta rama vuelva.
- **Seccion 2** — el worktree necesito `pnpm install`, `prisma generate`, `next typegen` y
  `db:migrate`. No es parte de la feature, pero sin ello ningun veredicto de gate valia.
- **Seccion 5** — T1, T8 y T10 estuvieron bloqueadas dos rondas y **se subieron sin resolver en vez
  de rellenarlas con supuestos**. Se cerraron el 2026-09-16, cuando el leader autorizo **base
  propia**: eso hizo exacta la via (c) sin tocar configuracion. La via (b) **sigue denegada por el
  entorno y no se reintento**.
- La **Pregunta abierta 2** sigue **abierta**: rige **R4 provisional** (accion y repintado son
  **dos** ambitos, hasta dos lecturas en esa respuesta). El helper esta escrito con esa semantica
  y `tests/unit/shared/request-scope.test.ts` la fija. **No se cerro aqui.**
- **T12 ya SI se marca**: su criterio de «Hecho» es «los 19 requisitos con al menos un test», y con
  R16 cerrado el mapa llega a **19/19**. Mientras falto R16 se dejo sin marcar a proposito, que es
  lo que evito autoaprobar un criterio incumplido.

## 10. Correccion tras la revision (F2.2)

El `reviewer` **RECHAZO** la ficha: 1 mayor y 5 menores
(`progress/review_QC-104-sesion-una-sola-vez-por-peticion.md`, commiteado sin editar).

### MAYOR 1 — el noveno `currentActor`, cerrado

`lib/modules/identity/adapters/driving/session-actions.ts` (`endAllSessionsAction`, de QC-101)
hacia el `Promise.all` de las dos proyecciones **sin ambito**: dos lecturas por invocacion, y se
invoca desde el navegador (`end-user-sessions-dialog.tsx:83`). Incumplia **R3** y **R15**.

**Por que se colo, sin adornos: es un fallo mio.** El hallazgo H4 grepeo el 2026-09-15 y conto
ocho. `session-actions.ts` **no existe en el merge-base** y **si en `origin/dev`**, o sea que entro
con **mi propia sincronizacion `0d0e164`**, antes de T4. La auditoria previa que T4 exigia se hizo
contra **la lista de ocho del `design.md`** en vez de volver a recorrer el arbol **ya mergeado**.
Delegue esa auditoria dando la lista por buena, que es precisamente lo que no habia que dar por
bueno despues de un merge.

**Y el caso que debia detectarlo no podia:** congelaba `expect(...size).toBe(8)` contando **las
filas de su propia lista**, no los `currentActor` del arbol. Con nueve en disco seguia verde. Un
numero escrito a mano no vigila nada.

**Arreglado:**

1. El noveno `currentActor` envuelto en `runInRequestScope`, identico a los otros ocho.
2. Su fila anadida a `ACCIONES` (`endAllSessionsAction` con un `FormData` con `id`).
3. **El numero congelado sustituido por DOS comprobaciones sobre el ARBOL**, que es lo que cierra
   el agujero de verdad. `archivosConLasDosCaras()` recorre `lib/modules/*/adapters/driving/*.ts`
   y recoge los que usan `identity.getSessionUser()` **y** `identity.getSessionContext()`:
   - *todo archivo con las dos caras esta en la lista* (R15), y
   - *todo archivo con las dos caras abre ambito* (R3).
   Los dos mensajes de fallo **nombran el archivo** y dicen que hacer.

**Probado por mutacion**, que es lo unico que demuestra que muerde: se creo un **decimo
sintetico** (`lib/modules/unidades/adapters/driving/qc104-sintetico.ts`, con las dos caras y sin
ambito) y **los dos casos se pusieron rojos** nombrandolo; borrado el sintetico, **24/24 en verde**.
La version anterior de ese caso habria seguido verde con el decimo en disco.

**R16 no se rehizo**, y el reviewer coincide: el guardado medido (alta de unidad) no pasa por esta
accion y sus cifras siguen valiendo.

### Los cinco menores

| # | Estado |
|---|---|
| 1 — `docs/architecture.md` llamaba «guardia del gate» a tests de `tests/unit/` | **CERRADO**: ahora dice «tests del gate» y precisa que los selecciona el grafo de imports, **no** el barrido de guardias. Ademas se corrigio la frase sobre «una accion», que el MAYOR 1 hacia falsa, y se dice que la lista **no se escribe a mano** |
| 2 — la nota de T11 envejece en silencio si alguien retira los tests de conteo | **ANOTADO, no cerrado.** Hacerla exigible pediria una guardia nueva que compruebe la frase, y eso es alcance de otra ficha. Queda dicho aqui en vez de fingir que no existe |
| 3 — la bitacora decia «via de conteo: la (b)» | **CERRADO**: marcado como historial del intento bloqueado y remitido a la via **(c)**, que es la del artefacto |
| 4 — el ambito envuelve solo el `Promise.all`, no la invocacion | **Riesgo aceptado ya en `design.md > 2.6` y `> 8`** (alternativa 6 descartada con razones). El MAYOR 1 demuestra que la red que lo cubre no se mantiene sola: por eso ahora la mantiene **el arbol**, no una lista |
| 5 — el metodo de R16 es repetible como prosa, no como herramienta | **Aceptado por el propio reviewer** y por la decision de F1.4 (sin script en el repo). Las trampas del artefacto son lo que hace repetible el metodo |

**Verificacion de la correccion:** `typecheck` y `lint` exit 0; los 4 archivos de QC-104
**52/52**; guardias **41 archivos / 445 tests** en verde, incluido el bloque 12 que lee
`docs/architecture.md`.

## 8. T7 — prueba de que el conteo MUERDE (R15)

`docs/verification.md > Probar que muerde, no que pasa`: un check probado solo con su caso verde
no esta probado. Se rompio el codigo de produccion **a mano**, se comprobo el rojo y se restauro
**desde copia con `cp`**, nunca con `git checkout`. Los tests **no se tocaron**: las mutaciones
van en produccion.

**Base de partida:** `Test Files 2 passed (2)` · `Tests 28 passed (28)`.

### Mutacion A — quitar `requestScoped` del cableado (T3)

Las dos proyecciones de `lib/composition/index.ts` vuelven a llamar a `resolveSession()` directo.

```
Test Files  2 failed (2)
     Tests  22 failed | 6 passed (28)
```

Pantallas, con los conteos reales frente al 1 exigido:

```
FAIL  /configuracion/usuarios lee la ficha de sesion exactamente 1 vez
FAIL  /configuracion/unidades lee la ficha de sesion exactamente 1 vez
      AssertionError: expected "vi.fn()" to be called 1 times, but got 7 times
FAIL  /pedidos lee la ficha de sesion exactamente 1 vez
      AssertionError: expected "vi.fn()" to be called 1 times, but got 12 times
FAIL  dos peticiones simuladas seguidas leen la ficha DOS veces
      AssertionError: expected "vi.fn()" to be called 2 times, but got 14 times
FAIL  el id del usuario y el del contexto coinciden con una sola lectura
      AssertionError: expected "vi.fn()" to be called 1 times, but got 3 times
FAIL  layout y pagina resuelven «sin sesion» sin reintentar la consulta
      AssertionError: expected "vi.fn()" to be called 1 times, but got 2 times
```

Acciones: **los 8 `currentActor` caidos en sus 2 casos** (16 fallos), todos con
`expected 1 times, but got 2 times` (R3) y `expected 2 times, but got 4 times` (R5).

**Restaurado desde la copia -> VERDE:** `Tests 28 passed (28)`, y `git diff -- lib/` vacio.

### Mutacion B — quitar `runInRequestScope` de UN solo `currentActor` (T4)

Solo `lib/modules/unidades/adapters/driving/unit-actions.ts`, con el `Promise.all` desnudo.

```
× 'listUnitsAction' > lee la ficha de sesion EXACTAMENTE una vez por invocacion (R3)
   -> expected "vi.fn()" to be called 1 times, but got 2 times
× 'listUnitsAction' > dos invocaciones seguidas leen DOS veces (R5)
   -> expected "vi.fn()" to be called 2 times, but got 4 times
✓ listProductsAction, listPresentationsAction, resendCredentialSetupLinkAction,
  listOrderResponsiblesAction, listWorkGroupsAction, listUsersAction, listRolesAction
✓ la lista cubre los OCHO archivos con `currentActor` (H4)
✓ fuera de todo ambito (R7, R13) · login-action sin runInRequestScope (R13)
✓ las dos proyecciones conservan su firma (R11)

Test Files  1 failed (1)
     Tests  2 failed | 19 passed (21)
```

**Esto es lo que demuestra que el conteo senala al culpable:** se rompio un solo adaptador y cayo
ese y **solo** ese; los otros 7 siguieron verdes.

**Restaurado desde la copia -> VERDE:** `Tests 21 passed (21)`.

### Prueba de que la restauracion fue exacta

```
=== git diff -- lib/ ===
=== fin diff ===        <- COMPLETAMENTE VACIO
```

La produccion quedo **identica** al commit `f23d312`, sin una linea de diferencia, asi que el
`git diff` de T3 y T4 es el mismo que quedo commiteado. Las copias `.bak` se borraron.

**Veredicto de R15:** ningun test paso por casualidad. El conteo del gate falla cuando alguna
pantalla o alguna accion supera UNA lectura, y lo hace senalando cual.

## 9. Verificacion final consolidada (sobre el arbol ya restaurado)

Corrida por el `implementer` al cerrar, con la produccion identica a `f23d312`. **No es el gate
completo**: `./init.sh` y los E2E los corre el **leader** (regla del gate, `AGENTS.md`).

```
pnpm typecheck                         exit=0   (sin errores)
pnpm lint                              exit=0   (sin hallazgos)

pnpm exec vitest run \
  tests/unit/shared/request-scope.test.ts \
  tests/unit/identity/session-once-per-request-actions.test.ts \
  tests/unit/identity/session-once-per-request-render.test.tsx
  Test Files  3 passed (3)
       Tests  40 passed (40)

pnpm exec vitest run guard
  Test Files  41 passed (41)
       Tests  445 passed | 9 skipped (454)
```

Las **guardias enteras en verde** importan aqui por dos razones concretas: ningun grafo de
imports las seleccionaria (`docs/verification.md`), y esta ficha toca justo lo que dos de ellas
vigilan — `guard-arquitectura-modulos` (bloque 9: `lib/shared` sigue siendo **hoja**; bloque 12:
lee `docs/architecture.md`, que T11 modifico) y `guard-dependencias-aprobadas` (R20: `package.json`
no cambia).

**Lo que esta corrida NO responde**, y por eso el gate completo no es opcional: si esta rama
rompio algo lejano que ningun test de los de arriba importa. Eso es `./init.sh` contra
`tests/baseline-rojos.json`, y es del leader.
