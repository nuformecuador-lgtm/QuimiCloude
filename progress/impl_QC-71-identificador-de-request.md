# QC-71 — identificador-de-request · bitacora de implementacion

> Worktree `.worktrees/QC-71-identificador-de-request`, rama `feature/QC-71-identificador-de-request`,
> nacida en `192842a` (merge del PR #52 de QC-70) + `1feb02b` (el spec).
> Spec: `specs/QC-71-identificador-de-request/{requirements,design,tasks}.md`.

## T1 — lo que QC-70 dejo, leido del disco (no de `origin/dev`, ya esta en este arbol)

El briefing simplifica T1: el merge de QC-70 **si** esta aqui, asi que los cinco nombres se leen
del codigo, no se infieren.

| Lo que el spec pedia fijar | Nombre real | Ruta y linea |
|---|---|---|
| (a) modulo y archivo del **catalogo** | modulo `errores`; `ERROR_CODES` (lista cerrada de **25** codigos) y el par clave->texto | `lib/modules/errores/domain/error-codes.ts:16-42`; `lib/modules/errores/domain/error-catalog.ts:14` (`ERROR_MESSAGE_KEY`) y `:57` (`ERROR_MESSAGES_ES`) |
| (b) el tipo `ErrorCode` cerrado | `ErrorCode = (typeof ERROR_CODES)[number]` | `lib/modules/errores/domain/error-codes.ts:45` |
| (c) el **codigo del error generico** | `UNEXPECTED_ERROR_CODE = 'unexpected' satisfies ErrorCode` | `lib/modules/errores/domain/error-codes.ts:54` |
| (d) el **traductor unico** y su firma | `createErrorStateTranslator(base: DomainErrorClass, log?: (entry: ErrorLogEntry) => void): (error: unknown) => ErrorState` | `lib/modules/errores/domain/error-state.ts:49-76` |
| (e) el archivo del **tipo del estado de error** | `type ErrorState` (mismo archivo que el traductor) | `lib/modules/errores/domain/error-state.ts:12-18` |

Contrato publico: `lib/modules/errores/index.ts:11-20`. Traductor a mano de la traduccion: la
funcion `errorMessage(code)` en `lib/modules/errores/domain/error-message.ts:11`.

### La parada de T1: ¿pasa TODO error no catalogado por un unico punto?

**Si.** Confirmado leyendo el codigo, no supuesto:

- `createErrorStateTranslator` es una **fabrica** parametrizada por la clase base de cada modulo,
  pero la **implementacion es una sola**, y el camino del error ajeno al catalogo es **una unica
  rama** — `lib/modules/errores/domain/error-state.ts:69-74` — que loguea y devuelve
  `UNEXPECTED_ERROR_CODE`. No hay una segunda copia.
- Los **siete** adaptadores driving la consumen y ninguno vuelve a escribir la suya:
  `inventario/presentation-actions.ts:52`, `inventario/product-actions.ts:129`,
  `pedidos/order-actions.ts:111`, `proveedores/supplier-actions.ts:78`,
  `proveedores/supplier-catalog-actions.ts:58`, `recetas/recipe-actions.ts`,
  `unidades/unit-actions.ts:52`.
- Que siga siendo asi lo vigila `tests/guards/guard-catalogo-de-errores.test.ts` (caso 2: ningun
  driving vuelve a declarar su `toErrorState`).

**No se para.** El riesgo declarado en `design.md > 9` no se materializa.

### Cuatro hallazgos de T1 que el spec no podia conocer, con la decision tomada

1. **El nombre del campo es `reference`, no `requestId`.** QC-70 dejo el hueco ya nombrado y
   documentado (`error-state.ts:16-17`: «Hueco de QC-71: el identificador de peticion») y su
   guardia lo fija por texto (`guard-catalogo-de-errores.test.ts:241`,
   `ERROR_STATE_FIELDS = ['status','code','message','reference']`). `design.md > 4` marca su
   fragmento como «forma, no nombres definitivos: los simbolos de QC-70 los fija T1». Se conserva
   `reference`: renombrarlo obligaria a tocar la guardia de otra ficha sin ganar nada.
2. **El traductor pasa a ser `async`.** `design.md > 2` manda leer la cabecera con `headers()` de
   `next/headers`, que en **Next 16.3.0** (`package.json:43`) es asincrono. Los `return
   toErrorState(error)` de los siete adaptadores siguen valiendo tal cual (estan dentro de
   funciones `async`).
3. **El traductor NO puede leer `next/headers` el mismo**, aunque `design.md > 2` lo describa asi:
   vive en `lib/modules/errores/domain/**` y `docs/architecture.md > La regla de dependencias`
   prohibe `next/*` en `domain/**` (lo vigila `guard-arquitectura-modulos`). Se resuelve **sin
   declarar ningun puerto** (R9): la lectura se inyecta como parametro de la fabrica, y su
   implementacion vive en un adaptador **driven** de `observabilidad`, cableado en
   `lib/composition/index.ts` — el camino que la tabla de dependencias ya autoriza. El respaldo de
   R8 sigue dentro del traductor, que puede importar el **barrel** de `observabilidad` (permitido
   entre modulos desde `domain/`).
4. **La lectura de R9 se acota, y se deja escrito.** Literal, R9 prohibiria el identificador en
   `lib/modules/*/domain/**` — pero el propio `design.md > 1` lo coloca en
   `lib/modules/observabilidad/domain/request-id.ts` y el traductor vive en
   `errores/domain/`. Lo que R9 protege es que el identificador no atraviese el contrato de los
   modulos **de negocio** hacia adentro. La guardia nueva lo comprueba sobre `identity`,
   `inventario`, `pedidos`, `proveedores`, `recetas` y `unidades`, y **no** sobre `errores` ni
   `observabilidad`, que son sus dos duenos legitimos. Ningun puerto nuevo, en ninguno de los ocho.
5. **Choque real entre R11 (QC-71) y R28 (QC-70): decidido y elevado.** R11 dice «ninguna linea de
   log ... ni al traducir un error que **si** esta en el catalogo». Pero QC-70 **ya** escribe una
   linea para el error catalogado que trae `diagnostic` (`error-state.ts:57-60`), y su test lo
   exige (`tests/unit/errores/to-error-state.test.ts:132-146`, «R28, R29»). Cumplir R11 al pie de
   la letra seria **borrar una funcion de QC-70 y aflojar su test**, que es justo lo que el arnes
   prohibe. **Decision tomada:** R11 se cumple para **la linea de QC-71** —el error catalogado no
   produce ninguna linea con identificador, y el camino feliz y el catalogado sin diagnostico no
   producen **ninguna** llamada a `console.*`—, y la linea de diagnostico de QC-70 se conserva
   intacta. Queda **para el humano** si prefiere lo contrario. Ver «Abiertas».

---

## TANDA A — T2, T3, T4, T5 (la generacion y el borde)

### Archivos creados

| Archivo | Que es |
|---|---|
| `lib/modules/observabilidad/domain/request-id.ts` | `newRequestId()` (global `crypto.randomUUID()`) y `REQUEST_ID_HEADER`. **Cero `import`** |
| `lib/modules/observabilidad/index.ts` | contrato del modulo: solo reexporta de `./domain/request-id` |
| `tests/unit/observabilidad/request-id.test.ts` | R1, R2 (7 casos) |
| `tests/unit/identity/route-guard-request-id.test.ts` | R4, R5, R6 (9 casos) |
| `tests/guards/guard-identificador-de-request.test.ts` | R9 (acotado), R19, R20, R21 + centinela de version de `next` |

### Archivos modificados

| Archivo | Cambio |
|---|---|
| `lib/composition/edge.ts` | + `observabilidadEdge = { newRequestId, requestIdHeader }` (importa del barrel) |
| `lib/modules/identity/adapters/driving/route-guard-middleware.ts` | camino `allow`: clona `request.headers`, `set(...)` y `NextResponse.next({ request: { headers } })`. El `redirect` no cambia. Comentario de cabecera con el por que (R6, `design.md > 1`) |
| `tests/guards/guard-middleware-edge.test.ts` | **solo se anadio** una asercion: el cierre alcanza `lib/modules/observabilidad/domain/request-id.ts`. Ni `FORBIDDEN_PACKAGES` ni `FORBIDDEN_INTERNAL_FILES` se tocaron |

**No se tocaron:** `middleware.ts`, `tests/unit/middleware-root-contract.test.ts`, `db/**`,
`package.json`, `docs/dependencias.md`, `e2e/**`, `app/**`, `components/**`, `lib/shared/**`,
`lib/modules/errores/**`, `lib/composition/index.ts`.

### El mecanismo de Next, verificado a mano (no supuesto)

Ejecutado contra **next@16.3.0** instalado en este worktree, con `NextResponse.next({ request:
{ headers } })` sobre una `NextRequest` real. La respuesta devuelta lleva:

```
x-middleware-next: 1
x-middleware-override-headers: foo,x-request-id     <- LISTA de nombres, separados por coma
x-middleware-request-foo: bar
x-middleware-request-x-request-id: nuevo-id         <- el VALOR, con prefijo x-middleware-request-
```

Y `response.headers.get('x-request-id')` es `null`. Un `NextResponse.next()` sin argumento solo
lleva `x-middleware-next: 1`. **Es interno de Next**: por eso el centinela de version de
`guard-identificador-de-request.test.ts` (`VERSION_DE_NEXT_VERIFICADA = '16.3.0'`,
`FECHA_DE_LA_VERIFICACION = '2026-09-10'`) pide repetir la comprobacion manual de T10 si `next`
sube de version.

### Que muerde, comprobado por mutacion

Se sustituyo el cuerpo del camino `allow` por el **error clasico** —`NextResponse.next()` +
`response.headers.set('x-request-id', ...)`— y `route-guard-request-id.test.ts` paso a
**7 rojos de 9**, incluido el de R6. Revertido despues. La guardia nueva trae ademas su caso rojo
sintetico por cada comprobacion (`docs/verification.md > Probar que muerde`).

### Mapa `R<n>` -> test de esta tanda

| R | Test |
|---|---|
| R1 | `tests/unit/observabilidad/request-id.test.ts` (dos llamadas distintas; cien sin repetir) + `route-guard-request-id.test.ts` (dos invocaciones, ids distintos) |
| R2 | `tests/unit/observabilidad/request-id.test.ts` (UUID v4 de 36 caracteres; el fuente no declara ningun `import`) |
| R3 | `tests/guards/guard-middleware-edge.test.ts` (sin relajar; + la asercion de que el cierre alcanza `request-id.ts`) |
| R4 | `tests/unit/identity/route-guard-request-id.test.ts` (`x-middleware-override-headers` + `x-middleware-request-x-request-id`) |
| R5 | `tests/unit/identity/route-guard-request-id.test.ts` (`x-request-id` entrante -> sale otro, y no se acumula) |
| R6 | `tests/unit/identity/route-guard-request-id.test.ts` (`response.headers.get('x-request-id')` === `null`, en `allow` y en los dos `redirect`) |
| R9 (parcial) | `tests/guards/guard-identificador-de-request.test.ts` (domain/ports de los seis modulos de negocio; ningun puerto nuevo en los ocho) |
| R19 | `tests/guards/guard-identificador-de-request.test.ts` (schema sin mencion + lista cerrada de migraciones) |
| R20 | `tests/guards/guard-identificador-de-request.test.ts` (conteos 30/20 y ningun nombre con `uuid`/`nanoid`/`cuid`/`crypto`) + `guard-dependencias-aprobadas.test.ts` |
| R21 | `tests/guards/guard-identificador-de-request.test.ts` (lista cerrada de `e2e/`, sin rango git; y existe el test del cruce) |

Pendientes de otras tandas: R7, R8, R10-R18 (bloques 2 y 3) y la comprobacion manual de T10.

### Verificacion de la tanda (salida real)

```
$ pnpm run typecheck      -> sin salida, exit 0
$ pnpm run lint           -> sin salida, exit 0
$ pnpm run test:guardias  -> Test Files 28 passed (28) | Tests 287 passed | 4 skipped (291)
$ pnpm exec vitest run tests/unit/observabilidad tests/unit/identity
                          -> Test Files 38 passed (38) | Tests 553 passed | 3 skipped (556)
```

**Ninguna asercion de un test existente se relajo ni se toco.** Los 537 tests de
`tests/unit/identity` que ya habia siguen verdes con `next({ request })` en lugar de `next()`.

**Nota de entorno (no es codigo):** el worktree se monto sin `node_modules`. Para poder ejecutar
la verificacion se corrio `pnpm install --frozen-lockfile --ignore-scripts`, `pnpm exec prisma
generate` y `pnpm exec next typegen` (este ultimo porque sin los tipos de ruta generados
`app/layout.tsx` no encuentra `LayoutProps` y el typecheck falla por un motivo ajeno a la ficha).
`package.json` y `pnpm-lock.yaml` quedaron sin cambios.

**Veredicto de la tanda:** el identificador se genera sin importar nada, viaja en la cabecera de
**peticion** reescrita, sustituye al del cliente, no vuelve al navegador, y las tres guardias del
borde muerden. Listo para el bloque 2.


---

## TANDA B — T6, T7 (el tipo cerrado y el traductor)

> **Nota de proceso, y no es un detalle.** El subagente que escribio esta tanda se corto por un
> limite de la API **antes de verificar nada**, y su trabajo a medio terminar entro dentro del
> commit `d9fe0ed` que el leader hizo para no perder la tanda A. O sea que `d9fe0ed` mezcla una
> tanda verificada (A) con una sin verificar (B). La verificacion de B se hizo **despues**, sobre
> el arbol ya commiteado, y esta abajo con su salida real; la limpieza que hizo falta va en
> `3d8f872`. Queda escrito porque el reviewer va a ver dos tandas en un commit.

### Archivos creados
- `lib/modules/observabilidad/adapters/driven/request-id-headers.ts` — `readRequestIdHeader()`:
  `(await headers()).get(REQUEST_ID_HEADER)`. Vive en un **driven** y no en el traductor porque el
  dominio no puede importar `next/*`. **No entra en el cierre del borde** (el barrel solo reexporta
  `./domain`), asi que R3 sigue en pie.
- `tests/unit/observabilidad/error-state.test.ts` — R7, R8, R10, R11, R12, R13, R14, R15.
- `tests/unit/observabilidad/error-state-types.test-d.ts` — las dos formas prohibidas de R16, cada
  una con su `@ts-expect-error`. **Vitest no ejecuta este archivo** (`vitest.config.mts` incluye
  `tests/**/*.test.ts`, y `*.test-d.ts` no casa): su mordisco entero lo da `tsc`, que si lo compila
  porque `tsconfig.json` incluye `**/*.ts`. Esta escrito en su cabecera.
- `tests/unit/observabilidad/error-state-types.test.ts` — el que si corre vitest: vigila por texto
  que la declaracion siga siendo una union de dos ramas con `reference` **solo** en la del generico
  y **sin `?`**, y que las dos construcciones prohibidas sigan en el `.test-d.ts` y sigan marcadas.
  Sin el, borrar el `.test-d.ts` entero saldria en verde.

### Archivos modificados
- `lib/modules/errores/domain/error-state.ts` — `ErrorState` pasa de objeto con `reference?: string`
  a **union cerrada**; el traductor pasa a `async`, resuelve el identificador (cabecera, o respaldo
  con `origen=respaldo`), escribe **una** linea con el formato de `design.md > 5` y devuelve
  `reference`. `ErrorLogEntry` se parte tambien en dos formas.
- `lib/composition/index.ts` — fachada `observabilidad` con `readRequestIdHeader`. **Ningun puerto
  nuevo** (R9).
- `lib/modules/errores/index.ts` — publica lo nuevo.
- Los **siete** adaptadores driving — reciben la lectura desde `@/lib/composition` y sus ramas de
  error inline (`{ status:'error'; code: ErrorCode; message: string }`) pasan a ser `ErrorState`,
  que es lo que hace que el `reference` llegue de verdad hasta la pantalla.
- `tests/guards/guard-catalogo-de-errores.test.ts` (caso 8) — **endurecido, no relajado**: su
  extractor entiende la union, sigue exigiendo que el conjunto de campos sea exactamente
  `status/code/message/reference`, y gana dos exigencias nuevas (`reference` solo en la rama del
  generico, y no opcional), cada una con su caso rojo.
- `tests/unit/errores/to-error-state.test.ts` y los tests de los adaptadores — adaptados a la
  fabrica `async` y al tipo cerrado. La unica asercion que **cambia de sentido** es la de
  «R15 — QC-70 no la rellena»: ahora el camino inesperado si trae `reference` y el catalogado
  sigue sin ella, que es exactamente lo que QC-71 vino a hacer.

### R16 probado POR MUTACION, en los dos sentidos (salida real de `tsc`)

Quitando los `@ts-expect-error` del `.test-d.ts` —o sea, afirmando que las dos formas prohibidas
compilan—:

```
tests/unit/observabilidad/error-state-types.test-d.ts(25,14): error TS2322: Type '{ status: "error"; code: "unexpected"; message: string; }' is not assignable to type 'ErrorState'.
tests/unit/observabilidad/error-state-types.test-d.ts(42,3): error TS2353: Object literal may only specify known properties, and 'reference' does not exist in type '{ status: "error"; code: "unauthorized" | ... 16 more ... | "incompatible_units"; message: string; }'.
```

Y al reves, reabriendo el tipo a `{ status:'error'; code: ErrorCode; message: string; reference?: string }`
—el opcional que QC-70 dejo y que esta ficha cierra—:

```
tests/unit/observabilidad/error-state-types.test-d.ts(28,1): error TS2578: Unused '@ts-expect-error' directive.
tests/unit/observabilidad/error-state-types.test-d.ts(47,3): error TS2578: Unused '@ts-expect-error' directive.
tests/unit/observabilidad/error-state-types.test-d.ts(77,41): error TS2344: Type '{ reference: string; }' does not satisfy the constraint '"Expected: ..., Actual: never"'.
tests/unit/observabilidad/error-state-types.test-d.ts(78,59): error TS2344: Type 'string' does not satisfy the constraint '"Expected: string, Actual: never"'.
tests/unit/observabilidad/error-state.test.ts(94,3): error TS2322: Type 'string | undefined' is not assignable to type 'string'.
```

El arbol se restauro tras cada mutacion (`git status` limpio). **R16 queda cerrado: las dos formas
prohibidas rompen el typecheck, y volver a abrir el tipo tambien lo rompe.**

### Verificacion de la tanda (salida real)

```
$ pnpm run typecheck      -> sin salida, exit 0
$ pnpm run lint           -> sin salida, exit 0 (los 4 avisos de imports muertos, limpiados en 3d8f872)
$ pnpm run test:guardias  -> Test Files 28 passed (28) | Tests 290 passed | 4 skipped (294)
$ pnpm exec vitest run tests/unit/{errores,observabilidad,unidades,pedidos,inventario,proveedores,recetas,configuracion-ui}
                          -> Test Files 162 passed (162) | Tests 2135 passed | 13 skipped (2148)
```

---

## TANDA C — T8, T9 (la vuelta al navegador)

### El componente
`components/shared/unexpected-error-notice.tsx` — `UnexpectedErrorNotice`, con
`UNEXPECTED_ERROR_NOTICE_TESTID`, `..._MESSAGE_TESTID`, `..._REFERENCE_TESTID` y
`UNEXPECTED_ERROR_NOTICE_REFERENCE_LABEL = 'Código para soporte:'`. Texto estatico, `select-all
break-all font-mono` en el uuid, **sin boton de copiar** (`design.md > 6` lo deja fuera), sin
`:hover` como unica via, sin `100vh`, **sin dependencia nueva**. `components/shared/` no tiene
barrel: no hay donde registrarlo.

Ayudante de test compartido: `tests/helpers/identificador-de-request.ts` (`REFERENCIA_DEL_CASO`,
`errorInesperado()`, `esperarSinIdentificador()`, que afirma en negativo sobre el nodo, la etiqueta,
el uuid del caso y **cualquier** uuid).

### La lista cerrada de superficies (T9)

Criterio de entrada: **componentes que pintan al usuario el `message` de un `ErrorState` devuelto
por una Server Action**. R17 no distingue lectura de mutacion, y una consulta fallida tambien puede
traer el codigo generico, asi que entran las tres superficies de cada pantalla —formulario, dialogo
y **lista**— y no solo las mutaciones. Son **24 componentes** en las siete pantallas (inventario,
pedidos, proveedores, catalogo de proveedor, presentaciones, unidades, formulas), mas **3
`page.tsx`** (`produccion/formulas/nueva`, `produccion/formulas/[id]`, `proveedores/[id]`) que
entraron **porque el compilador los delato** al cerrar el prop de los `*ListError` — el efecto que
`design.md > 9` predijo.

**Fuera, con motivo:** los cuatro *pickers* (`product-name-picker`, `recipe-picker`,
`product-picker`, `presentation-select`) y la tabla de ingredientes de `order-form`, que no pintan
region de error: mueren en un canal auxiliar tipado `string` (`AsyncAutocomplete`), y cambiar ese
contrato no esta en la lista de archivos de la ficha. Tambien fuera `data-table-states.tsx` (su
`status` no es un `ErrorState`) y los `*-list-empty` / `*-not-found`.

### Como llega el `reference` hasta la pantalla
Seis formularios copiaban el error **campo a campo** a su estado local
(`{ status:'error'; code; message; fieldErrors; values }`) y esa copia **perdia el identificador**.
Pasan a guardar la union entera: `{ status:'error'; serverError: ErrorState; fieldErrors; values }`.
En `recipe-form` `type SaveError = ErrorState`; en `delete-recipe-dialog`,
`useState<ErrorState | null>`. **Ningun `reference?`, ningun `as`, ningun `any`, ningun
`'reference' in state`**: el estrechamiento es siempre por `code`.

Dos efectos de tipos, resueltos sin cast: el `submit(...)` de cuatro formularios devuelve ahora
`{ status:'success' } | ErrorState`; y `const INVALID_INPUT_CODE: ErrorCode = 'invalid_input'` pasa
a `satisfies ErrorCode` (la anotacion ancha no compila dentro de la union, porque incluye el
generico, que exige `reference`).

### Guardia ajena respetada
`configuracion-convenciones.test.ts` y `unidades-convenciones.test.ts` prohiben `ByText` en
`tests/unit/configuracion-ui/**`. **No se relajaron**: esos seis casos afirman con
`getByTestId(UNEXPECTED_ERROR_NOTICE_REFERENCE_TESTID)` + `toHaveTextContent(uuid)`, que sigue
probando que el uuid esta **renderizado como texto**. En las otras cinco pantallas se usa
`getByText(uuid)`.

### Que muerde, comprobado por mutacion (revertida)
1. El componente pinta la etiqueta y un uuid tambien para el catalogado ->
   `unexpected-error-notice.test.tsx > pinta su mensaje, y NINGUN identificador` **rojo**.
2. `delete-order-dialog.tsx` renderiza el aviso incondicionalmente ->
   `delete-order-dialog.test.tsx > un error del catalogo no ensena identificador ninguno` **rojo**.

### Verificacion de la tanda (salida real)
```
$ pnpm run typecheck   -> sin salida, exit 0
$ pnpm run lint        -> sin salida, exit 0 (0 errores, 0 warnings)
$ pnpm run test:guardias -> Test Files 28 passed (28) | Tests 290 passed | 4 skipped (294)
$ pnpm exec vitest run tests/unit/{shared-ui,inventario,pedidos-ui,configuracion-ui,proveedores-ui,recetas-ui}
  Test Files  87 passed (87) | Tests  1182 passed | 7 skipped (1189)   (antes: 1138 -> +50 casos)
```

---

## T10 — LA COMPROBACION MANUAL DEL CRUCE, EJECUTADA (R21)

**Se hizo de verdad, sobre `next build` + `next start`.** Es lo que sustituye al E2E que la decision
cerrada difiere, y sin ella la ficha no cierra.

### Como se provoco el error inesperado, y por que asi
`design.md > 3.4` sugeria apuntar `DATABASE_URL` a un puerto muerto. **No sirve para este cruce**:
Prisma lee la URL al arrancar el proceso, y con la base caida no se puede ni llegar a una pantalla
autenticada para disparar la accion. Lo que se hizo en su lugar prueba **exactamente la misma
propiedad y de forma mas directa**: una **sonda temporal** en la pagina publica de login
—`/login` esta **dentro** del `matcher` del middleware— que llama al traductor unico con un
`TypeError` sintetico y pinta el `reference` que devuelve. Asi la cadena que se comprueba es la
completa: middleware del borde -> cabecera de **peticion** reescrita -> `headers()` en el runtime
Node -> traductor -> identificador en el HTML que recibe el navegador.

Comandos: `pnpm exec next build` (no `pnpm build`, que ademas corre `prisma migrate deploy` y el
seed contra la base compartida) y `pnpm exec next start -p 3717`, con el `.env` cargado.

### La evidencia — las dos cadenas, iguales

**(1) Lo que recibe el navegador**, de `curl http://localhost:3717/login`:
```
<p data-qc71-reference="true">75919411-5818-4a1b-9886-7c8b7ebdd491</p>
```

**(2) La linea del log del servidor**, en la salida de `next start`:
```
[error] requestId=75919411-5818-4a1b-9886-7c8b7ebdd491 origen=borde code=unexpected error=TypeError: QC-71 T10 comprobacion manual del cruce
TypeError: QC-71 T10 comprobacion manual del cruce
    at q (...\.next\server\chunks\ssr\[root-of-the-server]__0cs4gma._.js:1:3122)
    ...
```

**Son el mismo uuid** (R13) y la linea dice **`origen=borde`** (R8): el identificador que la
pantalla ensena nacio en el middleware y cruzo al runtime Node por la cabecera de peticion. **El
mecanismo de `NextResponse.next({ request })` funciona en un build de produccion real de
next@16.3.0**, que es justo lo que ningun test unitario puede afirmar.

**(3) R6 en produccion:** las cabeceras de esa misma respuesta HTTP **no** traen `x-request-id`:
```
$ curl -D - http://localhost:3717/login | grep -i x-request-id   -> (nada)
HTTP/1.1 200 OK
```

**La sonda se retiro** y el arbol quedo limpio (`git status --porcelain` vacio). No queda ni una
linea de ella en el codigo: el archivo se restauro desde copia, no con `git checkout`.

---

## T11 — TRAZABILIDAD: los 21 requisitos, cada uno a un test ejecutado

Los nombres son los archivos reales de esta rama. Confirma y sustituye la tabla provisional de
`requirements.md`.

| R | Test que lo cubre (archivo → caso) |
|---|---|
| R1 | `tests/unit/observabilidad/request-id.test.ts` → «dos llamadas seguidas devuelven valores distintos» y «cien llamadas seguidas no repiten ninguno»; `tests/unit/identity/route-guard-request-id.test.ts` → «cada peticion recibe el suyo» |
| R2 | `tests/unit/observabilidad/request-id.test.ts` → «devuelve un UUID canonico de 36 caracteres», «no hay ninguna declaracion `import`…» y «usa el global `crypto.randomUUID`…» (con su caso rojo: el detector dispara sobre un fuente con import) |
| R3 | `tests/guards/guard-middleware-edge.test.ts` (existente, **no relajado**: `FORBIDDEN_PACKAGES` y `FORBIDDEN_INTERNAL_FILES` intactos) → el cierre de imports desde `middleware.ts`, mas la asercion **anadida** de que ese cierre alcanza `lib/modules/observabilidad/domain/request-id.ts` |
| R4 | `tests/unit/identity/route-guard-request-id.test.ts` → «la peticion sigue hacia el servidor con `x-request-id` en sus cabeceras reescritas» y «no reescribe la peticion vaciandola» |
| R5 | idem → «sustituye el `x-request-id` entrante por uno nuevo» y «lo sustituye, no lo acumula: es `set` y no `append`» |
| R6 | idem → «la respuesta del camino que deja pasar no lleva la cabecera `x-request-id`», mas los dos casos del redirect. **Y la comprobacion manual (3) sobre el servidor real** |
| R7 | `tests/unit/observabilidad/error-state.test.ts` → «el identificador que resuelve es el de la cabecera, no uno nuevo» |
| R8 | idem → «genera uno nuevo y lo marca como respaldo», «una cabecera VACIA cuenta como ausente» y «dos invocaciones sin cabecera no comparten identificador» |
| R9 | `tests/guards/guard-identificador-de-request.test.ts` → «ningun `domain/` ni `ports/` de los modulos de negocio menciona el identificador» y «ninguno de los ocho modulos declara un puerto para el identificador», los dos con su caso rojo sintetico; mas `tests/guards/guard-arquitectura-modulos.test.ts` (existente) |
| R10 | `tests/unit/observabilidad/error-state.test.ts` → «un solo `console.error`, con los cuatro campos y la traza del error» y «un valor lanzado que no es `Error` tambien deja su linea» |
| R11 | idem → «el camino feliz no escribe ninguna linea», «un error DEL CATALOGO (sin diagnostico) no escribe ninguna linea» y «el error del catalogo tampoco lee la cabecera» |
| R12 | idem → «del error solo salen nombre, mensaje y traza» (afirma sobre el texto completo de la linea) |
| R13 | idem → «coinciden con cabecera y coinciden sin ella». **Y la comprobacion manual (1) vs (2)** |
| R14 | idem → «el estado inesperado son cuatro campos y ninguno filtra nada»; mas `tests/unit/errores/to-error-state.test.ts` |
| R15 | idem → «ni como campo, ni al serializar, ni con cabecera presente» |
| R16 | `tests/unit/observabilidad/error-state-types.test-d.ts` (lo compila `tsc`, **no** vitest) + `tests/unit/observabilidad/error-state-types.test.ts` (5 casos, 4 de ellos «muerde») + **la mutacion de la tanda B, con la salida real de `tsc` pegada arriba** |
| R17 | `tests/unit/shared-ui/unexpected-error-notice.test.tsx` + un caso por pantalla en los 17 archivos de UI listados en la tanda C |
| R18 | idem, en negativo (`esperarSinIdentificador()`), con su mutacion en dos niveles |
| R19 | `tests/guards/guard-identificador-de-request.test.ts` → «`db/` no gana ni una migracion ni una mencion al identificador», con su rojo |
| R20 | idem → «`package.json` no gana ninguna dependencia, ni una libreria de identificadores», con su rojo; mas `tests/guards/guard-dependencias-aprobadas.test.ts` (existente) |
| R21 | idem → «no hay ningun archivo nuevo en `e2e/` y existe el test que lo sustituye», mas el **centinela de version de `next`** («la version de next es la que se verifico a mano»), mas **T10 ejecutada y pegada arriba** |

**Ningun requisito queda sin test ejecutado.**

---

## T11 — EL GATE COMPLETO (`./init.sh`), salida real

Corrido sobre el arbol final, con la sonda de T10 ya retirada y el arbol limpio.

```
== Arnes SDD :: init (modo: completo) ==
✓ node v22.x · dependencias presentes
✓ feature_list.json valido
-> pnpm run typecheck
✓ typecheck paso
-> pnpm run lint
✓ lint paso
-> pnpm run test:json

 Test Files  302 passed (302)
      Tests  3883 passed | 18 skipped (3901)
   Duration  124.95s

aviso: 5 archivo(s) del baseline ya pasan; toca limpiarlos:
  tests/integration/inventario/product-crud.int.test.ts
  tests/unit/recetas-ui/recipe-route-contract.test.ts
  tests/unit/recetas/module-contract.test.ts
  tests/unit/unidades/modulo-intacto.test.ts
  tests/unit/unidades/unidades-convenciones.test.ts
✓ tests: sin rojos nuevos (0 rojos, todos en el baseline de 5); 5 por limpiar
✓ todas las migraciones tienen down.sql
✓ .env presente
== init OK ==            (exit 0)
```

**302 archivos, 3883 tests, cero rojos, exit 0.**

Sobre el aviso de los 5 del baseline: **no se tocan aqui, y no es descuido.** Cuatro de los cinco
fallan **en `dev`** porque sus guardias se apoyan en `git diff origin/dev...HEAD` y alli el rango
esta vacio; en una rama de feature el rango si existe y por eso pasan. Limpiar la lista desde aqui
las pondria rojas en `dev` en cuanto esta rama se mergee. El quinto
(`product-crud.int.test.ts`) es el flake de saturacion que documenta su propio `motivo`. La salida
limpia de las cinco es la que ya esta escrita en `docs/verification.md` y en cada `motivo`, y es
otra ficha.

### Un rojo que aparecio en la primera pasada del gate, y era nuestro
`tests/unit/navegacion/pantallas-exigen-permiso.test.tsx` cayo con
`No "observabilidad" export is defined on the "@/lib/composition" mock`: llega a
`presentation-actions.ts` a traves de `components/shared/presentation-select.tsx`, y su doble de la
composicion no tenia la lectura de la cabecera que T7 anadio. **Se completo el doble** —una entrada
`observabilidad.readRequestIdHeader` que devuelve `null`— y **no se relajo ninguna asercion**: esa
pantalla prueba el corte por permiso y no llega a invocar el traductor. Es exactamente el tipo de
acoplamiento que `docs/verification.md` avisa que `--rapido` no ve y el completo si.

---

## Lo que queda ABIERTO, para el humano

1. **R11 contra R28 de QC-70 — la unica decision de diseno que tome yo y que el humano puede
   revertir.** R11 dice «ninguna linea de log ... ni al traducir un error que **si** esta en el
   catalogo», pero QC-70 **ya** escribe una linea para el catalogado que trae `diagnostic`, y su
   test lo exige. Cumplir R11 literalmente era borrar una funcion de QC-70 y aflojar su test.
   **Lo implementado:** el camino catalogado no produce **ninguna** linea de QC-71 —ni identificador,
   ni lectura de cabecera— y el camino feliz y el catalogado sin diagnostico no producen **ninguna**
   llamada a `console.*`; la linea de diagnostico de QC-70 sigue intacta. Si el humano prefiere lo
   contrario, es un cambio de una linea en `error-state.ts` y un caso en dos tests.
2. **La lectura acotada de R9.** Literal, R9 prohibiria el identificador en `lib/modules/*/domain/**`
   — pero el propio `design.md > 1` coloca `newRequestId` en `observabilidad/domain/` y el traductor
   vive en `errores/domain/`. La guardia barre los **seis modulos de negocio** y deja fuera a
   `errores` y `observabilidad`, sus dos duenos legitimos. Ningun puerto nuevo en ninguno de los
   ocho, que es la mitad de R9 que si se puede leer literal.
3. **El campo se llama `reference` y no `requestId`.** Es el nombre que QC-70 dejo reservado y que
   su guardia fija por texto; `design.md > 4` marcaba su fragmento como «forma, no nombres
   definitivos».
4. **Los cuatro *pickers* y la tabla de ingredientes no ensenan identificador**, porque su canal de
   error esta tipado `string` (`AsyncAutocomplete`) y el `ErrorState` muere antes de llegar. No es
   un olvido: cambiar ese contrato no esta en la lista de archivos de la ficha. **Es candidato a
   ficha propia** si se quiere R17 tambien ahi.
5. **`d9fe0ed` mezcla dos tandas**, una verificada (A) y otra que se commiteo sin verificar (B)
   porque un limite de la API corto al subagente. B quedo verificada despues, sobre el arbol ya
   commiteado; la limpieza que hizo falta esta en `3d8f872`.
6. **No se abrio PR y no se hizo push**, como manda la instruccion: eso lo autoriza el humano.

---

# RONDA 2 — respuesta al rechazo del reviewer (2026-09-10)

> **Nada de lo anterior se reescribe.** El `reviewer` rechazó la primera entrega con **2 mayores y
> 4 menores** (`progress/review_QC-71-identificador-de-request.md`) y **ninguno era un defecto de
> implementación**: confirmó los números del gate corriéndolo él, reprodujo la mutación de R16 en
> los dos sentidos, verificó que la guardia de QC-70 se endureció en vez de aflojarse y que la
> sonda de T10 no quedó en el árbol. Lo que fallaba era **el contrato escrito**, en dos sitios.
> El humano tomó las dos decisiones; esta ronda las ejecuta.

## Qué se tocó del SPEC (`specs/QC-71-identificador-de-request/requirements.md`)

Cabecera nueva «Enmiendas del 2026-09-10 (revisión F2.2)» con la tabla de las seis decisiones, y
cinco requisitos reescritos. **Cada enmienda lleva su fecha y su motivo dentro del propio
requisito**, para que se lea donde se rompe y nadie lo reabra por desconocimiento:

- **R11 — mayor 1, Opción A.** Ahora dice «ninguna línea de log **de esta ficha**… salvo la línea
  de diagnóstico que R28/R29 de QC-70 ya exige». Queda escrito que la redacción anterior chocaba de
  frente con `specs/QC-70-errores-centralizados/requirements.md:167` y que **manda QC-70**, porque
  cumplir R11 literal obligaba a borrar una función de otra ficha y aflojar su test. **Cero cambios
  de código: la salida entregada era la correcta.** Se anota además, dentro de R11, el `console.warn`
  por cookie ilegible de `route-guard-middleware.ts` (menor 3): es de **QC-9**, no lleva
  identificador, **esta ficha no lo toca**, y se deja escrito para que no sorprenda a quien lea
  «ni al entrar».
- **R17 — mayor 2, Opción B, las dos mitades.** Acotado por escrito a «una superficie que pinta la
  región de error de la pantalla», con la lista de las cinco superficies que aplanan a `string` y
  la constancia de que **la Opción A —ampliar el contrato `error` de `AsyncAutocomplete`— queda
  descartada por el humano**. La otra mitad, la que de verdad cierra el agujero, es la guardia
  nueva (abajo).
- **R9 — menor 1.** Reescrito nombrando a los **seis módulos de negocio** que sí barre y a los dos
  dueños que quedan fuera (`errores` y `observabilidad`), más «ningún puerto nuevo **en ninguno de
  los módulos**». La redacción anterior prohibía el diseño que el propio `design.md > 1` aprobó.
  Ahora el requisito y la guardia dicen lo mismo.
- **R13 y R16 — menor 2.** Donde decían «identificador» a secas ahora nombran el símbolo real,
  **`reference`**, y R16 añade explícito el «nada de `reference?: string`».
- **Tabla de trazabilidad:** actualizadas las filas de R9, R11 y R17.

## Qué se tocó del CÓDIGO

**Ninguna línea de producción.** Los dos cambios son de test:

1. `tests/guards/guard-identificador-de-request.test.ts` — la comprobación nueva de las superficies
   que aplanan un `ErrorState` a `string` (mayor 2, la mitad que cierra el agujero).
2. `tests/unit/observabilidad/error-state.test.ts` — el caso de R11 «camino feliz», que construía
   el traductor sin invocarlo (menor 4).

### La guardia nueva: las superficies que aplanan un `ErrorState` a `string` (mayor 2)

`tests/guards/guard-identificador-de-request.test.ts` gana una sección (el archivo pasa de 9 a
**21** casos). Símbolos exportados: `SUPERFICIES_QUE_APLANAN`, `detectarAplanados`,
`hallazgosDeAplanado`, `IdiomaDeAplanado`, `Aplanado`, `SuperficieAplanada`.

**Cómo está clavada la lista: archivo + idioma + conteo, nunca por número de línea.** Un gate que
se pone rojo porque alguien añadió un comentario tres líneas arriba se ignora a la semana
(`docs/verification.md`: un check que grita en falso se ignora). El **conteo** sí entra, porque un
aplanado *de más* en un archivo que ya aplanaba es una superficie nueva aunque el archivo ya esté
listado. Son **6 entradas para 5 archivos** —`presentation-select.tsx` aparece dos veces, una por
idioma—, **cada una con su `motivo`**, y hay un caso que exige que el motivo exista de verdad
(longitud mínima): una lista de rutas sin el porqué es una lista de excusas.

**Los dos idiomas detectados**, fijados leyendo los seis sitios y no de memoria:
`throw new Error(<id>.message)` y `set<Algo>(<id>.message)`. Y una condición que evita el falso
positivo: **el mismo identificador tiene que discriminarse en el archivo con
`<id>.status === 'error'`**. Sin ella entraban como sexta superficie falsa
`components/shared/file-field.tsx:186` (`setError(validation.message)`, una validación local
`{ ok, message }` que nunca fue un `ErrorState`) y el `toast.error(state.message)` de
`login-form.tsx:66`.

**Dos desenlaces rojos, no uno:**
- (a) aparece una superficie que no está en la lista —o un aplanado de más en un archivo que ya
  estaba—: *«…y NO esta en SUPERFICIES_QUE_APLANAN. Ahi el `reference` de R13/R17 se pierde en
  silencio… Decide: o la superficie recibe el ErrorState entero y pinta el identificador, o entra
  en la lista CON su motivo. Anadirla sin motivo no es decidir, es callar el aviso.»*
- (b) una entrada de la lista **ya no aplana** (se arregló y nadie la borró): *«…una lista con
  entradas muertas deja de decir la verdad y acaba siendo un vertedero.»*

**El verde sobre el repo real no puede ser vacío**, por dos vías: `toBeGreaterThan(100)` sobre los
archivos barridos (hoy 147 `.tsx` entre `app/` y `components/`), y el desenlace (b), que hace que
un detector roto —que encuentre cero— dispare los 6 hallazgos de la lista.

#### Probada con una SEXTA superficie real (mutación, revertida)

En `app/(private)/inventario/components/product-list-section.tsx:39`, cambiando
`return <ProductListError error={result} />` por `throw new Error(result.message)`:

```
 ❯ tests/guards/guard-identificador-de-request.test.ts (21 tests | 1 failed)
     × las superficies que aplanan un ErrorState a string son las declaradas, y solo esas (R17)

AssertionError: expected [ Array(1) ] to deeply equal []
+ [ "app/(private)/inventario/components/product-list-section.tsx: aplana un ErrorState a string
+    con 'throw-new-error' y NO esta en SUPERFICIES_QUE_APLANAN. ..." ]
 Test Files  1 failed (1) | Tests  1 failed | 20 passed (21)
```

Revertido con `cp` desde copia, **no** con `git checkout` (el árbol podía tener cambios ajenos).

### El caso de R11 «camino feliz», que ya no es vacuo (menor 4)

`tests/unit/observabilidad/error-state.test.ts` — el caso pasa a llamarse «una operacion que
funciona no escribe ninguna linea y ni lee la cabecera» y **cablea el traductor en el `catch` de
una acción real**: ejercita una operación que resuelve y afirma que el resultado es
`{ status: 'success', data: { id: 42 } }`, que **el lector de la cabecera no se llamó**, y que no
hubo ninguna llamada a `console.error/log/warn/info/debug` (espías reales). Probado que muerde
haciendo que la operación lance. Los otros dos casos del `describe` quedaron intactos.

### Verificación de la ronda (antes del gate)
```
$ pnpm run typecheck   -> sin salida, exit 0
$ pnpm run lint        -> sin salida, exit 0 (0 errores, 0 warnings)
$ pnpm run test:guardias -> Test Files 28 passed (28) | Tests 296 passed | 4 skipped (300)
$ pnpm exec vitest run tests/unit/observabilidad -> Test Files 3 passed (3) | Tests 29 passed (29)
```

## El gate completo de la ronda 2 (`./init.sh`), salida real

```
== Arnes SDD :: init (modo: completo) ==
-> pnpm run typecheck   ✓ typecheck paso
-> pnpm run lint        ✓ lint paso
-> pnpm run test:json
 Test Files  302 passed (302)
      Tests  3889 passed | 18 skipped (3907)
   Duration  162.57s
✓ tests: sin rojos nuevos (0 rojos, todos en el baseline de 5); 5 por limpiar
✓ todas las migraciones tienen down.sql
✓ .env presente
== init OK ==            (exit 0)
```

**302 archivos, 3889 tests, cero rojos, exit 0.** Seis casos más que la ronda 1 (3883 -> 3889):
los cinco de la guardia de superficies y el de R11 rehecho. Los 5 avisos del baseline son los
mismos de siempre y **no se tocan**, por el motivo ya escrito arriba (cuatro fallan en `dev` por
el rango git vacío; limpiarlos desde una rama los pondría rojos al mergear).

## Lo que queda ABIERTO tras la ronda 2

1. **Llevar el `ErrorState` entero a las cinco superficies que hoy lo aplanan** —los tres
   *pickers*, `presentation-select` y la tabla de ingredientes de `order-form`— sigue **sin hacer,
   y ahora está vigilado**: la lista es cerrada y la sexta pone el gate en rojo. Es candidato a
   ficha propia; exige ampliar el contrato `error` de `AsyncAutocomplete`, que fue la **Opción A
   descartada** por el humano en esta revisión.
2. Los tres **menores ya cerrados** (R9, R13/R16, el `console.warn` de QC-9) no dejan nada
   pendiente: los dos primeros eran redacción, el tercero es de QC-9 y queda anotado en R11.
3. **Sigue sin abrirse PR y sin hacerse push.** Eso lo autoriza el humano.
