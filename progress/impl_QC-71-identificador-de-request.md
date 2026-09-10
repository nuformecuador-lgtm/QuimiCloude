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
