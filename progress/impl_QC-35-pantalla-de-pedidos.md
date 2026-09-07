# QC-35 — pantalla-de-pedidos · bitácora de implementación

> Zona `frontend` · complejidad `high` · rama `feature/QC-35-pantalla-de-pedidos`
> Worktree: `.worktrees/QC-35-pantalla-de-pedidos`
> Spec aprobado por el humano el 2026-09-07. Las 17 tasks (`T0`–`T16`) están cerradas.
> Implementado por `frontend_dev` en seis tandas, coordinadas por el `implementer`.

## 1. Veredicto

Las 17 tasks cerradas y los 49 requisitos mapeados a un test nombrado.

**Estado real, medido con la suite COMPLETA (seccion 4):** `227 archivos, 2687 tests, 0 fallos`,
typecheck y lint limpios, y `./init.sh --rapido` termina en `== init OK ==`.

**Correccion de una afirmacion falsa de una version anterior de esta bitacora.** Aqui se escribio
que la suite de QC-55 quedaba en "13 archivos, 148 tests, todos verdes". **Era falso**: el dato se
copio del reporte de un subagente sin correrlo, y el estado real era `1 failed / 12 passed`. La
regla que sale de ahi, y que se aplica en el resto del documento: **cada afirmacion de verde va con
el comando exacto y su salida; lo que no se ha corrido se escribe "no corrido", nunca "verde"**.

## 2. Archivos

### 2.1 Creados — la pantalla (`app/(private)/pedidos/`)

| Archivo | Qué es |
| --- | --- |
| `page.tsx` | Server Component: `metadata`, `searchParams` como `Promise`, sin landmark propio, `<Suspense>` con `key` derivada de la consulta |
| `components/index.ts` | Barrel de la ruta (R40) |
| `components/order-list-params.ts` | `parseOrderListParams` / `buildOrderListQuery`, puros |
| `components/order-list-section.tsx` | Server Component `async`: una sola llamada a `listOrdersAction`, despacho a los tres estados |
| `components/order-list-empty.tsx` | Estado vacío propio de pedidos, con el alta del primero |
| `components/order-list-error.tsx` | Estado de error con el mensaje devuelto y reintento |
| `components/order-list-skeleton.tsx` | Fallback del `<Suspense>`, con tantas filas como `pageSize` |
| `components/order-status-badge.tsx` | Estado y prioridad por etiqueta legible, mapa exhaustivo tipado |
| `components/order-columns.tsx` | **Cliente.** `buildOrderColumns({recipes, units})`: las diez columnas como datos |
| `components/order-table.tsx` | **Cliente.** `<DataTable searchable={false}>`, traduce `onParamsChange` a `router.push` |
| `components/order-row-actions.tsx` | **Cliente.** Editar/cancelar/borrar; `isFinalOrderStatus`, `FINAL_ORDER_REASON` |
| `components/order-field.tsx` | Campo con label y error accesible |
| `components/order-form.tsx` | **Cliente.** `<form action>` + `useActionState`, validado con los esquemas del contrato |
| `components/order-sheet.tsx` | **Cliente.** Panel lateral de alta/edición + `OrderRowSheetActions` |
| `components/recipe-picker.tsx` | **Cliente.** Selector de receta con búsqueda **al servidor** |
| `components/unit-select.tsx` | **Cliente.** Selector de unidad, no controlado, sin alta |
| `components/cancel-order-dialog.tsx` | **Cliente.** Diálogo de cancelación con motivo obligatorio |
| `components/delete-order-dialog.tsx` | **Cliente.** Confirmación que nombra el correlativo |

### 2.2 Modificados — archivos heredados, uno por uno

Son **exactamente** los que `R46` autoriza, más los cuatro de la tabla compartida que
`design.md > 6` justifica:

| Archivo | Cambio | Autoriza |
| --- | --- | --- |
| `lib/shared/routes.ts` | `ORDERS_ROUTE` + entrada en `PRIVATE_ROUTE_PREFIXES` | R2, R4 |
| `lib/shared/navigation/private-nav.ts` | `ORDERS_LABEL` + `NavLink` en `NAV_SECTION_OPERATION` | R3 |
| `lib/composition/route-role-rules.ts` | Cuarta fila, solo Administrador | R5 |
| `components/shared/data-table/data-table-types.ts` | Dos props opcionales | 6.2, 6.3 |
| `components/shared/data-table/data-table.tsx` | Cablea las dos props | idem |
| `components/shared/data-table/data-table-filters.tsx` | No monta la búsqueda si `searchable === false` | 6.2 |
| `components/shared/data-table/use-pinned-columns.ts` | Fijado inicial cuando no hay nada persistido | 6.3 |
| `tests/unit/app-sidebar.test.tsx` | Centinela de lista exacta **ampliado** (4→5) | R3 |
| `tests/unit/identity/route-role-rules.test.ts` | Centinela de lista exacta **ampliado** (3→4) | R5 |
| `tests/unit/shared/data-table.test.tsx` | **Solo casos nuevos** | 6.3 |
| `tests/unit/shared/data-table-filters.test.tsx` | **Solo casos nuevos** | 6.2 |

`components/shared/data-table/index.ts` **no cambia**: los tipos ya salían por ahí.

**No se abrió `lib/modules/`, `db/` ni `lib/composition/index.ts`** (R46). De `lib/modules/`
solo se **leyó** el contrato público. **`package.json` y `pnpm-lock.yaml` sin cambios**: ninguna
dependencia nueva, ningún `shadcn add` (R42).

### 2.3 Tests creados

`tests/unit/pedidos-ui/`: `order-route-contract.test.ts`, `private-nav-pedidos.test.ts`,
`route-role-pedidos.test.ts`, `order-list-params.test.ts`, `order-list-section.test.tsx`,
`order-columns.test.tsx`, `order-table.test.tsx`, `order-row-actions.test.tsx`,
`order-row-wiring.test.tsx`, `recipe-picker.test.tsx`, `unit-select.test.tsx`,
`order-form.test.tsx`, `order-sheet.test.tsx`, `cancel-order-dialog.test.tsx`,
`delete-order-dialog.test.tsx`, `pedidos-convenciones.test.ts`, `pedidos-viewport.test.tsx`.
Más `e2e/pedidos.spec.ts`.

## 3. Mapa de trazabilidad R1-R49 a test

Los 49, sin saltos. `pu` = `tests/unit/pedidos-ui/`.

| Req | Test |
| --- | --- |
| R1 | `pu/order-route-contract.test.ts` - existe la page.tsx derivada de la constante de ruta |
| R2 | `pu/pedidos-convenciones.test.ts` - ningun archivo de la ruta contiene el literal de ORDERS_ROUTE (+ caso negativo); `pu/order-list-params.test.ts` - el destino se DERIVA de ORDERS_ROUTE |
| R3 | `pu/private-nav-pedidos.test.ts` - item de nivel superior con href, label y testId derivados de las constantes; `tests/unit/app-sidebar.test.tsx` - PRIVATE_NAV_ITEMS tiene exactamente cinco entradas en orden |
| R4 | `tests/guards/guard-rutas-privadas-cubiertas.test.ts` (existente, verde); `pu/order-route-contract.test.ts` - ORDERS_ROUTE en PRIVATE_ROUTE_PREFIXES exactamente una vez |
| R5 | `pu/route-role-pedidos.test.ts` - Administrador allow / Operador redirect / anonimo a login / trampa de limite de segmento; `tests/unit/identity/route-role-rules.test.ts` - declara exactamente cuatro reglas |
| R6 | `pu/order-list-section.test.tsx` - con unauthorized no se muestra NI UN DATO de pedidos |
| R7 | `pu/order-table.test.tsx` - monta DataTable con una fila por pedido; `pu/order-list-section.test.tsx` - se invoca listOrdersAction UNA vez, con los parametros enteros y sin traducir |
| R8 | `pu/order-columns.test.tsx` - en positivo: los diez ids en orden; en negativo: ninguna columna es total, createdBy ni updatedBy |
| R9 | `pu/order-columns.test.tsx` - sin nombre de receta/unidad se pinta el marcador y NUNCA el uuid |
| R10 | `pu/order-columns.test.tsx` - la celda es exactamente formatOrderNumber(order.number) y no el identificador tecnico |
| R11 | `pu/order-columns.test.tsx` - con el pedido cancelado se presenta su motivo; sin cancelar, marcador de ausencia |
| R12 | `pu/order-columns.test.tsx` - en positivo: correlativo, estado, prioridad y fecha; en negativo: ninguna otra es ordenable, ni cantidad ni precio |
| R13 | `pu/order-table.test.tsx` - no se reordena, ni se filtra, ni se recorta en el cliente |
| R14 | `pu/order-columns.test.tsx` - estado y prioridad como seleccion de los conjuntos cerrados, fecha como rango; ninguna otra declara filtro. `pu/order-table.test.tsx` - marcar un valor del filtro de estado navega |
| R15 | `pu/order-table.test.tsx` - ordenar / filtrar / avanzar de pagina navega con la consulta esperada; `pu/order-list-params.test.ts` - parse(build(params)) devuelve params |
| R16 | `pu/order-list-params.test.ts` - un tamano de pagina fuera de las dos opciones, incluido por encima del tope, cae al defecto |
| R17 | `pu/order-table.test.tsx` - avanzar de pagina; `pu/order-list-params.test.ts` - ida y vuelta |
| R18 | `pu/order-list-params.test.ts` - pagina invalida/negativa/decimal/fuera de rango no lanza; campo de orden no declarado se descarta; direccion desconocida se descarta; valores de filtro fuera del conjunto se descartan uno a uno; fecha no parseable deja ese extremo a null |
| R19 | `tests/unit/shared/data-table.test.tsx` - columna fijada por defecto (QC-35 R19), 5 casos; `pu/order-columns.test.tsx` - el correlativo es la unica fijada por defecto; `pu/order-table.test.tsx` - su cabecera y sus celdas nacen fijadas a la izquierda |
| R20 | `tests/unit/shared/data-table-filters.test.tsx` - campo de busqueda opcional (QC-35 R20), 4 casos; `pu/order-table.test.tsx` - no esta en el DOM, y ninguna navegacion escribe un termino de busqueda; `pu/order-list-params.test.ts` - buildOrderListQuery NUNCA emite un parametro search |
| R21 | `pu/order-list-section.test.tsx` - cargando / vacio / lista / error con data-testid distintos; el error NO pinta una tabla vacia; pagina vacia con page mayor que 1 ofrece el enlace a la primera |
| R22 | `pu/pedidos-viewport.test.tsx` - el desbordamiento se resuelve DENTRO de la tabla, no en el documento; las acciones de fila siguen alcanzables (angosto y ancho) |
| R23 | `pu/order-row-actions.test.tsx` - las tres acciones existen sin interaccion previa; ninguna se descubre con hover. `pu/order-row-wiring.test.tsx` - la fila trae los tres controles |
| R24 | `pu/order-row-actions.test.tsx` - con ENTREGADO/CANCELADO los tres disabled, motivo visible y ninguna operacion invocada (dobles que lanzan); `pu/order-row-wiring.test.tsx` - estado final: ningun panel ni dialogo montado |
| R25 | `pu/order-sheet.test.tsx` - panel sobre la lista sin navegar; al cerrar la URL conserva page/pageSize/sort/filtro. `pu/order-row-wiring.test.tsx` - pulsar editar abre el panel lateral |
| R26 | `pu/order-form.test.tsx` - cinco campos al alta; alta sin selector de estado |
| R27 | `pu/order-form.test.tsx` - prioridad por defecto preseleccionada y visible; las cuatro prioridades del contrato |
| R28 | `pu/order-form.test.tsx` - edicion precargada con reemplazo completo y bind(null,id); `pu/unit-select.test.tsx` - precarga |
| R29 | `pu/order-form.test.tsx` - edicion sin CANCELADO; alta sin selector de estado. Negativo en `pu/order-row-actions.test.tsx` |
| R30 | `pu/order-form.test.tsx` - ningun campo de fecha de solicitud, motivo, correlativo ni autoria (negativo) |
| R31 | `pu/recipe-picker.test.tsx` - dispara la action con search; no recorta en memoria; alcanza una receta fuera de la primera pagina |
| R32 | `pu/unit-select.test.tsx` - solo unidades existentes y sin opcion vacia; envia el id elegido; sin action de creacion |
| R33 | `pu/order-form.test.tsx` - el rechazo del esquema no llama a la action; `pu/pedidos-convenciones.test.ts` - no cambia package.json |
| R34 | `pu/order-form.test.tsx` - recipe_not_found junto al selector de receta, unit_not_found e invalid_transition en su campo, codigo sin campo a la region de aviso sin perder lo escrito; `pu/cancel-order-dialog.test.tsx` - not_cancellable; `pu/delete-order-dialog.test.tsx` - not_deletable |
| R35 | `pu/order-sheet.test.tsx` - exito cierra, avisa por toast y refresca; `pu/cancel-order-dialog.test.tsx` y `pu/delete-order-dialog.test.tsx` - cierra, avisa y refresca sin navegar |
| R36 | `pu/order-sheet.test.tsx` - exactamente una region de avisos renderizando layout mas pantalla |
| R37 | `pu/cancel-order-dialog.test.tsx` - confirmar deshabilitado y no llama a cancelOrderAction; motivo de solo espacios tampoco; con motivo llama a ESA action y ninguna otra. `pu/order-row-wiring.test.tsx` - pulsar cancelar abre el dialogo de motivo, y solo ese |
| R38 | `pu/delete-order-dialog.test.tsx` - el texto contiene el correlativo derivado del contrato; en negativo, el uuid NO aparece; abrir no llama a deleteOrderAction; confirmar la invoca. `pu/order-row-wiring.test.tsx` - pulsar borrar abre la confirmacion |
| R39 | `pu/order-form.test.tsx` - 0.1005 llega a la action como esa misma cadena, y los controles son de texto con inputMode decimal; `pu/order-columns.test.tsx` - la cadena decimal no se reformatea ni pierde ceros; `pu/pedidos-convenciones.test.ts` - la ruta no convierte a coma flotante ni usa el control numerico (+ negativo) |
| R40 | `pu/order-route-contract.test.ts` - componentes en components/ con su barrel, y la pagina importa desde el barrel y nunca por ruta profunda; `pu/pedidos-convenciones.test.ts` - nadie importa por ruta profunda (+ negativo) |
| R41 | `pu/order-route-contract.test.ts` - la seccion importa la action por su RUTA EXACTA; `pu/pedidos-convenciones.test.ts` - ninguna action desde el barrel del modulo, ninguna sin ruta exacta, ningun fetch a ruta propia, ningun route handler (+ negativos) |
| R42 | `pu/pedidos-convenciones.test.ts` - no edita ni crea nada en components/ui/, y no cambia package.json; `tests/guards/guard-dependencias-aprobadas.test.ts` (existente, verde) |
| R43 | `pu/pedidos-convenciones.test.ts` - ningun componente de cliente importa la composicion, Prisma ni el cliente de BD (+ negativo); `pu/recipe-picker.test.tsx` y `pu/unit-select.test.tsx` - catalogos por props |
| R44 | `pu/private-nav-pedidos.test.ts` - afirma sobre las constantes y el testId, con cero asserts sobre el copy; `pu/cancel-order-dialog.test.tsx` - region del dialogo localizable por rol o testid |
| R45 | `pu/pedidos-viewport.test.tsx` - ningun control se descubre solo con hover; controles tactiles de 44x44; campos de 16 px; la pantalla no usa 100vh |
| R46 | `pu/pedidos-convenciones.test.ts` - no modifica los modulos, el esquema de datos ni el punto de composicion (+ negativo por diff) |
| R47 | `pu/pedidos-convenciones.test.ts` - la ruta no declara su propio layout, barra lateral ni navegacion; no monta una segunda region de avisos; no duplica la tabla compartida; un solo helper de viewport |
| R48 | `e2e/pedidos.spec.ts` - el Administrador entra, da de alta un pedido, lo ve por su correlativo y lo cancela con motivo (R48) |
| R49 | `e2e/pedidos.spec.ts` - un usuario que no es Administrador acaba fuera y no ve ningun dato de pedidos (R49) |

Ningun requisito queda huerfano: R1-R49, sin saltos.

## 4. Salida real de los tests

Cada bloque es el comando tal cual se corrio y su salida tal cual la devolvio.

```
$ pnpm run typecheck
> tsc --noEmit
(sin salida: cero errores)

$ pnpm run lint
> eslint
(sin salida)

$ pnpm exec vitest run                    # LA SUITE COMPLETA
 Test Files  227 passed (227)
      Tests  2687 passed (2687)
   Duration  93.49s

$ ./init.sh --rapido
 ...
 v test:rapido paso
 v todas las migraciones tienen down.sql
 v .env presente
 == init OK ==

$ pnpm exec vitest run guard              # todas las guardias
 Test Files  16 passed (16)
      Tests  168 passed (168)

$ pnpm exec vitest run tests/unit/pedidos-ui
 Test Files  17 passed (17)
      Tests  172 passed (172)

$ pnpm exec vitest run <los NUEVE centinelas de alcance del repo>
 Test Files  9 passed (9)
      Tests  69 passed (69)

$ pnpm exec vitest run tests/unit/pedidos/scope.test.ts     tests/unit/pedidos/module-contract.test.ts     tests/unit/shared/data-table-alcance.test.ts
 Test Files  3 passed (3)
      Tests  33 passed (33)

$ pnpm run e2e e2e/pedidos.spec.ts
  ok  2 [chromium] - no ve ningun dato de pedidos (R49) (8.7s)
  ok  1 [webkit]   - no ve ningun dato de pedidos (R49) (9.1s)
  ok  3 [chromium] - lo cancela con motivo (R48) (13.9s)
  ok  4 [webkit]   - lo cancela con motivo (R48) (17.1s)
  4 passed (24.9s)
```

**Nota sobre la suite de QC-55.** No se declara por separado: entra en la corrida completa de
arriba, que es la unica cifra que esta bitacora respalda. Medida aparte, tras invertir
`data-table-alcance.test.ts`:

```
$ pnpm exec vitest run tests/unit/shared/
 Test Files  13 passed (13)
      Tests  149 passed (149)
```

(149, no 148: el centinela invertido aporta un caso mas que el original.)

## 5. Los rojos que hubo, y como quedaron

### 5.1 Dos errores de typecheck ajenos: RESUELTOS por el merge de F2.3

Eran dos tests de QC-57 que creaban usuarios sin `companyId`, obligatorio desde QC-47, anticipados
en `design.md` seccion 15.8. **No eran de esta feature.** El merge de `origin/dev` (F2.3, sin
conflictos) trajo su arreglo. `pnpm run typecheck` ahora **no reporta ni un error**.

### 5.2 Las dos guardias de recetas: AJUSTADAS por decision humana del 2026-09-07

`tests/unit/recetas/scope.test.ts` y `tests/unit/recetas/module-contract.test.ts` reconocian una
"pantalla de recetas" por que el **nombre** o el **contenido** de un archivo mencionara
`recet|recipe` en cualquier sitio de `app/` fuera de la carpeta de formulas. Las disparo
`recipe-picker.tsx`, el selector de receta que **R31 exige** y que el humano aprobo el 2026-09-06.

**La decision, y su razon:** "pedidos tiene su propia ruta separada, con acceso solo para el
administrador". Eso descarta mover el picker bajo la carpeta de formulas -seria poner un componente
de pedidos bajo otra pantalla y otra superficie de permiso- y fija el criterio: **una pantalla se
reconoce por tener RUTA PROPIA, no por mencionar una palabra**.

**Que se cambio.** El criterio pasa a derivarse del arbol: un archivo pertenece a una pantalla si
cuelga de una carpeta que declara su propio `page.tsx` (`screenRootOf`). **No hay lista blanca de
rutas escrita a mano**: envejeceria y habria que tocarla en cada ficha, que es justo lo que esto
evita. `app/` no cuenta como carpeta de pantalla, para que un archivo suelto en la raiz o en un
route group siga siendo goteo. En `module-contract` se anade ademas que el consumo sea **solo del
contrato publico** (`@/lib/modules/recetas`) o de sus **adaptadores driving por ruta exacta**, que
es lo que manda `docs/architecture.md`.

**Que sigue prohibido** -escrito en el comentario de cada guardia, con la fecha y con quien lo
decide, para que nadie lo lea manana como permiso general-:

- una **segunda pantalla de recetas**: ningun `page.tsx` ni `layout.tsx` fuera de la carpeta
  derivada de `FORMULAS_ROUTE` puede renderizar recetas;
- el **goteo suelto**: un archivo de recetas que no cuelgue de ninguna pantalla con ruta propia;
- **`components/` sigue con CERO menciones**, sin aflojar: ahi no hay ruta ni ficha que respalde
  nada;
- **consumir el modulo por dentro**: nunca `domain/` ni `adapters/driven/`.

Lo que **no** se toco: la carpeta permitida se sigue **derivando de `FORMULAS_ROUTE`**, nunca de un
literal, y el `existsSync` de que **la pantalla de recetas siga existiendo** se queda -esta ahi para
que la guardia no pase en verde sobre un repo sin pantalla-.

**Falsabilidad comprobada**, mutando el arbol real y restaurandolo (`git status` limpio despues).
Las cuatro prohibiciones se vieron en rojo, una a una: una segunda pantalla
(`app/(private)/pedidos/recetas/page.tsx`), un archivo suelto
(`app/(private)/recetas-suelto.tsx`), `components/recipe-card.tsx`, y un import de las tripas
(`@/lib/modules/recetas/domain/recipe-name`). La comparacion se hace sobre el **codigo, no sobre la
prosa**: la pagina de proveedores menciona recetas en un comentario y eso no es una violacion, asi
que `scope.test.ts` gano el mismo filtro de comentarios que `module-contract.test.ts` ya tenia.

Suite de recetas entera tras el ajuste: **26 archivos, 289 tests, todos verdes**. Ninguna otra
guardia de recetas se puso roja por arrastre.

### 5.3 Un rojo del GATE que no es de esta feature y no se ha tocado

```
./init.sh --rapido
  X feature_list.json invalido:
    faltan specs para features sdd en vuelo: QC-48
```

El merge de F2.3 trajo un `feature_list.json` en el que **QC-48 (`tenant-en-la-sesion`) figura en
vuelo**, pero `specs/QC-48-tenant-en-la-sesion/` **no existe en esta rama**: vive en el worktree de
esa ficha. Es estado de **otra sesion**, no de QC-35, y editar `feature_list.json` seria improvisar
sobre el trabajo de otro. **Se para y se avisa** (regla 6).

Por eso el gate se corrio replicando sus pasos a mano, que es donde de verdad se mide esta feature:

```
$ pnpm run typecheck      -> limpio, cero errores
$ pnpm run lint           -> limpio, sin salida
$ pnpm run test:rapido    -> Test Files 69 passed (69) | Tests 773 passed (773)
                             guardias: Test Files 15 passed (15) | Tests 157 passed (157)
```

### 5.4 Cuatro centinelas de alcance ajenos, INVERTIDOS (rechazo del reviewer, 2026-09-07)

El reviewer rechazo la feature con seis tests en rojo que el gate rapido nunca senalo. Los seis eran
centinelas de **limite de alcance** cuya premisa esta ficha derriba **por decision del humano**, no
invariantes permanentes. Se **invierten**, como ya se hizo con inventario (QC-22) y recetas (QC-26):
no se borran, no se relajan en bloque y no entran en ningun baseline.

| Archivo | Premisa que cayo | Que sigue protegiendo |
| --- | --- | --- |
| `tests/unit/pedidos/scope.test.ts` | QC-34 R57 difirio la pantalla y el E2E a QC-35 | La pantalla existe **donde la declara `ORDERS_ROUTE`** y en ningun otro sitio; `components/` sigue sin una pieza de pedidos; el spec E2E es lista **cerrada** de uno; solo la pantalla consume el modulo |
| `tests/unit/pedidos/module-contract.test.ts` | idem | Las actions siguen en **un solo** archivo driving; **ninguna ruta HTTP**; se consume **solo** por contrato publico o driving por ruta exacta, nunca `domain/`, `ports/` ni `driven/` |
| `tests/unit/shared/data-table-alcance.test.ts` | QC-55 R34/R36: no tenia **ningun** consumidor | **La pantalla de pedidos es el UNICO consumidor.** Productos y recetas siguen **sin** tocarlo hasta que QC-56 los migre; y solo el E2E de pedidos referencia `data-table` |
| `tests/unit/recetas-ui/recipe-route-contract.test.ts` | QC-64 R12: lista exacta de constantes de `routes.ts` | La lista sigue **exacta** (se le anade `ORDERS_ROUTE`, que es lo que su propio comentario pide: "pasar por aqui y por quien la revise"). Lo que R12 protege —que el asistente de lectura no gane ruta— queda intacto |

La inversion de `data-table-alcance` es la delicada, y **no** es "ya puede importarlo cualquiera":
eso habria tirado el centinela. Protege el alcance de **QC-56**, asi que se escribio como "pedidos
es el unico consumidor" con una comprobacion explicita de que `inventario` y `produccion` siguen
limpios.

**Falsabilidad: 13 mutaciones del arbol real, todas en rojo, todas restauradas.**

```
ROJO  <- 1. segunda pantalla de pedidos fuera de su carpeta
ROJO  <- 2. componente de pedidos bajo components/
ROJO  <- 3. consumidor del modulo fuera de la pantalla (scope)
ROJO  <- 3b. consumidor del modulo fuera de la pantalla (module-contract)
ROJO  <- 4. consumo del modulo POR DENTRO (scope)
ROJO  <- 4b. consumo del modulo POR DENTRO (module-contract)
ROJO  <- 5. inventario consume la tabla compartida (territorio de QC-56)
ROJO  <- 6. formulas consume la tabla compartida (territorio de QC-56)
ROJO  <- 7. un segundo E2E referencia data-table
ROJO  <- 8. un segundo spec E2E de pedidos
ROJO  <- 9. la pantalla de pedidos desaparece (scope)
ROJO  <- 9b. la pantalla de pedidos desaparece (module-contract)
ROJO  <- 13. una constante nueva sin ficha en routes.ts
```

Se conserva la tecnica de QC-34: cada regla es un **predicado puro** aplicado dos veces, al arbol
real y a ese mismo arbol mas una entrada sintetica que la viola.

### 5.5 Por que se colaron, y la leccion operativa

`test:rapido` no los vio porque **`vitest related` no puede relacionarlos**: estos centinelas
recorren el disco con `node:fs`, asi que **no tienen arista en el grafo de imports** y ningun cambio
de codigo los "relaciona". Ya estaba documentado en `progress/current.md` como "El gate rapido no ve
los tests de alcance de otros modulos (2026-09-03, confirmado por QC-33)"; esta es la **tercera**
confirmacion.

**Regla operativa que sale de aqui:** cuando una feature **estrena una pantalla, una ruta o el primer
consumo de algo compartido**, los centinelas de alcance ajenos **se corren a mano**, buscandolos por
nombre, porque el gate rapido no los va a senalar nunca:

```
$ find tests e2e -type f \( -name "*scope*" -o -name "*alcance*" -o -name "*module-contract*" \)
```

Los **nueve** del repo se corrieron: los cuatro invertidos mas `inventario/scope`,
`proveedores/scope`, `proveedores/module-contract`, `recetas/scope`, `recetas/module-contract`,
`unidades/module-contract`. **Ningun otro mordia.** Y la suite **completa** se corrio al final, que
es la unica forma de saber que no queda un rojo donde `related` no llega: fue asi como aparecieron
los dos ultimos (seccion 5.6).

### 5.6 Dos rojos mas que solo vio la suite completa, y no eran de codigo

`pedidos-ui/pedidos-convenciones.test.ts` y `proveedores-ui/guard-convenciones-proveedores.test.ts`
comparan `package.json` **contra `origin/dev`**, y los dos cayeron a la vez. **No era de esta
feature**: `git diff <merge-base> HEAD -- package.json` sale **vacio** —esta rama no toca
`package.json`— y el segundo test es de proveedores, anterior a QC-35. `dev` habia avanzado 28
commits anadiendo nueve dependencias de `@tiptap/*` (QC-64). Se resolvio **re-sincronizando**
(`git merge origin/dev`, sin conflictos) mas `pnpm install`. El merge trajo ademas
`specs/QC-48-tenant-en-la-sesion/`, con lo que **desaparecio el bloqueo de `./init.sh`** descrito
antes en la seccion 5.3.

## 6. Lo que el PR tiene que declarar

1. **Esta feature modifica `components/shared/data-table/`, que es de QC-55**, con dos props
   opcionales (`searchable`, `defaultPinnedColumns`) cuya ausencia deja el comportamiento actual
   exacto. **Ningun test de QC-55 se modifico ni se borro** -solo se anadieron casos- y su suite
   sigue entera en verde: `pnpm exec vitest run tests/unit/shared/` -> 13 archivos, 149 tests. **QC-56 hereda las dos props.**
2. **P1 de QC-55 (columna de acciones) queda resuelta SIN tocar el componente**
   (`design.md` seccion 6.1): es una columna normal cuyo `cell` devuelve `ReactNode`. Era el bloqueo
   declarado de QC-56. **Es lo que QC-56 va a adoptar**, y por eso queda escrito aqui y no en un
   comentario del componente.
3. El rojo de las guardias de recetas de la seccion 5.2, **sin resolver y a la espera de decision
   humana**.

## 7. Desviaciones respecto de `design.md` (anotadas, no silenciadas)

1. **El diseno pide `type="text"` mas `inputMode="decimal"` "y el patron del esquema". No se puso
   `pattern`.** `DECIMAL_14_4` es una constante local de `order-input.ts` y el contrato publico no
   la exporta; escribirla a mano seria la segunda copia de la regla que **R33 prohibe**. La
   validacion la hace el mismo esquema, en cliente y en servidor.
2. **La seccion 1 del diseno no listaba `order-list-section.tsx` entre los archivos de T9/T10**,
   pero hubo que tocarlo: es quien pide una vez los catalogos de recetas y unidades y los baja
   **por props** (R43) al panel lateral.
3. **`order-columns.tsx` paso de array estatico a factoria `buildOrderColumns({recipes, units})`**
   en T11/T12. Sin ello la celda de acciones no podia recibir los catalogos y editar, cancelar o
   borrar desde una fila no abria nada. Los tests de T7/T8 se adaptaron **solo** a ese cambio de
   forma: ningun assert se relajo y no se borro ningun caso.
4. **Un archivo de test mas de los previstos**: `pu/order-row-wiring.test.tsx`, que prueba la fila
   viva de punta a punta (editar abre el panel, cancelar el dialogo de motivo, borrar la
   confirmacion, y en estado final ninguno de los tres).

## 8. Deudas que esta feature deja registradas

- **P2 de QC-55 (ancho de columna): comprobada formalmente y NO bloquea.** Ninguna de las diez
  columnas emite `size`/`width`/`minSize`/`maxSize`, ninguna celda recibe ancho en linea, la tabla
  dimensiona por contenido (`whitespace-nowrap`, sin `table-fixed`) y los 150 px por defecto de la
  libreria solo alimentan los offsets sticky, con la unica columna fijada en offset 0. **No se
  propone la tercera prop de ancho**; P2 se arrastra sin cambio de estado.
- **P3 de QC-55 (`focusColumnFilter` sin acotar por `tableId`): se arrastra.** Esta pantalla monta
  una sola tabla, asi que no la puede destapar.
- **P4 y P5 de `requirements.md`** (devolucion de un pedido entregado, exportacion a un contable
  externo) siguen abiertas y **no se rellenan con supuestos** (regla 6).
- **QC-68** (busqueda por nombre de receta y columna de total) no se espero, y **no se crea aqui**
  la ficha de frontend que las enchufe.
- **Deuda de entorno del worktree, conocida y ahora con un detalle mas:** un worktree recien
  sincronizado no arranca solo. Necesita `pnpm install`, `npx prisma generate` **y
  `pnpm exec next typegen`** -sin este ultimo, `tsc` da un falso
  `TS2304: Cannot find name 'LayoutProps'` en `app/layout.tsx`, porque ese tipo global lo genera
  Next en `.next/types`-. Para el E2E hace falta ademas un `.env` presente **antes** de
  `prisma generate`: si el cliente se genera sin el, queda sin `schemaEnvPath` y nunca carga
  `DATABASE_URL`.

## 9. CHECKPOINTS.md: lo que no aplica, declarado en vez de omitido

- **Datos y seguridad (Supabase)** -tablas nuevas, columna de empresa, RLS con FORCE, migraciones
  con `down.sql`, secretos, webhooks-: **NO APLICA**. Cero cambios en `db/`, ninguna migracion y
  ninguna variable de entorno nueva.
- **"Cada permiso se valida en el SERVICE y tiene su test"**: **ya cumplido por QC-34**; esta ficha
  no lo repite y lo declara (R6).
- **"Paginas protegidas validan permisos en el servidor"**: **SI APLICA** (R4, R5).
- **"Componentes private/ reciben datos por props"**: **SI APLICA** y es requisito duro (R43).
- **"Mutaciones internas usan Server Actions, no fetch a API routes"**: **SI APLICA** (R41).
- **Modulos hexagonales**: **NO APLICA** como trabajo propio; esta ficha no abre `lib/modules/`
  (R46).
- **E2E de flujo critico**: **SI APLICA** -permisos e importes- y esta (R48, R49).
- **Dependencias nuevas**: **ninguna**. `package.json` y `pnpm-lock.yaml` sin cambios.

## 10. Pendiente antes del PR

- **F2.3: HECHO.** `git merge origin/dev` **sin conflictos**; trajo el arreglo de los dos errores de
  typecheck ajenos.
- **Decision sobre las guardias de recetas: HECHA y aplicada** (seccion 5.2).
- **Desbloquear `./init.sh`**: hoy se para en la validacion de `feature_list.json` por el spec
  ausente de **QC-48**, que es de otra sesion (seccion 5.3). No lo arregla esta feature.
- **`./init.sh` completo**, una sola vez, **antes de abrir el PR, sin excepcion**, cuando lo
  anterior este resuelto.
- El PR **no se abre aqui**: va primero el `reviewer` (F2.2) y lo coordina el leader.
