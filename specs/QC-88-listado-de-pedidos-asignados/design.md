# QC-88 — listado-de-pedidos-asignados · design.md

> Zona `fullstack` · complejidad `high` · rama `feature/QC-88-listado-de-pedidos-asignados`.
> Todo lo medido aqui se leyo **en disco el 2026-09-15**, en este worktree (HEAD `dd2eff1`), con
> `archivo:linea`. Lo que no esta en `docs/`, `specs/` o el codigo se marca como **desconocido** y
> no se rellena (regla 6 de `AGENTS.md`).

---

## 0. Hallazgos

Cosas medidas que el `requirements.md` sembrado no podia saber. **Ninguna se resuelve aqui por la
via de reabrir una decision cerrada**: las dos que rozan la semilla (H1, H2) se resuelven **dentro**
de lo que la semilla ya dice, y se dejan escritas para que el humano las vea en F1.4.

### H1 — La consulta en lote de QC-102 exige `pedidos.consultar`, que el Operador NO tiene

`lib/modules/asignaciones/domain/list-responsibles-for-orders.ts:98` abre con

```ts
requirePermission(actor, 'pedidos.consultar');
```

y su propia cabecera lo defiende como requisito (R2 de QC-102): «ver quien prepara un pedido es
informacion DEL PEDIDO». El Operador tiene **exactamente** `inventario.consultar` y
`asignaciones.consultar` (`lib/modules/identity/domain/permissions.ts:165`).

**Consecuencia:** si esta pantalla llamara a `listResponsiblesForOrdersAction`, **todo Operador
recibiria `unauthorized`** y la columna de responsables quedaria siempre vacia — en silencio, porque
QC-102 degrada el fallo del lote a «reparto vacio» (`order-list-section.tsx:149`).

**Por que NO contradice la semilla.** La decision cerrada 6 dice *«la composicion de responsables en
lote de QC-102 (`listByOrdersInCompany`)»*: nombra el **metodo del puerto**, no el caso de uso. Ese
metodo (`ports/order-assignment-repository.ts:71-74`) **si** es reutilizable tal cual, igual que
`compareResponsibles` y `toOrigin` (`domain/responsible-order.ts:42-65`), que QC-102 extrajo
precisamente para que dos lectores compartan una sola definicion.

**Lo que se hace:** el caso de uso nuevo de esta ficha **reutiliza el puerto y el comparador**, y
**no** invoca `listResponsiblesForOrders`. Queda escrito aqui porque «como QC-102» se lee facil como
«llama a lo de QC-102», y esa lectura esta rota.

### H2 — La guardia del modulo hoy prohibe `asignaciones.consultar` donde esta ficha debe escribirlo

`tests/unit/asignaciones/module-contract.test.ts:764-801` (regla **(e)**) afirma, con el codigo
actual, que esto **es un hallazgo**:

```
lib/modules/asignaciones/domain/list-order-responsibles.ts nombra 'asignaciones.consultar' (R29)
```

y ademas fija `isLegitimatePermissionConsumer(<un archivo de asignaciones/domain>, 'asignaciones.consultar') === false`
(`:798-800`). El comentario `:771-772` lo dice con todas las letras: **«Lo estrena QC-88»**.

**Consecuencia:** escribir `requirePermission(actor, 'asignaciones.consultar')` en el caso de uso
nuevo **pone esa guardia en rojo** hasta que la enmienda se haga. Es la misma clase de enmienda que
QC-87 hizo para `asignaciones.modificar`, y la ficha la **tensa, no la relaja** (R36): la puerta se
abre para **un archivo y un codigo**, y los tres portazos que el caso `:764` ya prueba siguen
cerrados. No es opcional ni «de paso»: sin ella la decision cerrada 9 no se puede cumplir.

### H3 — Esta pantalla cambia donde aterriza el Operador, y hay pruebas que lo afirman hoy

`firstVisibleNavHref` (`lib/shared/navigation/private-nav.ts:452`) devuelve el `href` del **primer**
enlace visible del menu ya filtrado, y el login aterriza ahi. Con el menu de hoy el Operador solo ve
`nav-inventario` (`:240-248`), asi que aterriza en `/inventario`. Lo afirman:

| Donde | Que afirma | Que le pasa |
|---|---|---|
| `e2e/permisos.spec.ts:214` | el Operador aterriza en `INVENTORY_ROUTE` | **ROJO** si el item nuevo va antes de inventario |
| `e2e/permisos.spec.ts:90-96` | `HIDDEN_NAV_TEST_IDS`: los items que el Operador **no** ve | sigue verde; el item nuevo **no** entra en esa lista |
| `e2e/permisos.spec.ts:218` | `nav-inventario` visible | sigue verde |
| `tests/guards/guard-e2e-landing.test.ts:66-71` | `permisos.spec.ts` esta **exento** de la regla de ruta fija, «porque es la suite que AFIRMA la regla de aterrizaje» | la excepcion sigue siendo valida; solo cambia **que** ruta se afirma |
| `tests/guards/guard-nav-permisos-declarados.test.ts:98-115` | ancla: **ocho** enlaces, nombrados uno a uno | **ROJO**: sube a nueve y hay que nombrar el nuevo (R35) |
| `tests/guards/guard-nav-permisos-declarados.test.ts:128` | catalogo de **15** permisos | **verde**: no se anade ningun permiso |
| `tests/unit/navegacion/nav-filtrado.test.ts:208-210` | con `['inventario.consultar']` el menu es `['nav-inventario']` | **verde**: ese conjunto no incluye `asignaciones.consultar` |

**Donde va el item, y por que ahi** (`> 7.2`): **entre «Dashboard» y «Inventario»**. Asi cambia el
aterrizaje del **Operador** —que no tiene `dashboard.consultar`— y **no** el del Administrador, que
sigue aterrizando en `/dashboard` porque ese item sigue siendo el primero. Ponerlo el primero del
array cambiaria el aterrizaje de **todos**, que nadie pidio.

### H4 — `orders` no tiene `company_id`, y eso reparte el aislamiento de forma asimetrica

`db/schema.prisma:1080-1105`: `Order` no tiene columna de empresa (es la deuda de la epica QC-46,
ficha **QC-60**). `OrderAssignment` **si** la tiene (`:1192`), con FK compuestas hacia `users` y
`work_groups` (`:1125-1126`).

**Consecuencia util:** la lista **si** queda acotada por empresa, porque el conjunto de pedidos sale
de `order_assignments` filtrando por `(user_id, company_id)`. La empresa entra por la asignacion, no
por el pedido (R7, R8).

**Consecuencia incomoda, declarada:** la lectura de los **datos** de esos pedidos (`prisma.order`)
no puede filtrar por empresa porque la columna no existe. No abre fuga **en esta pantalla** —los ids
ya vienen acotados—, pero es la misma nota que la review de QC-87 dejo abierta
(`progress/current.md > Un pedido de OTRA empresa es distinguible…`). Se cierra en QC-60, no aqui.

### H5 — El destino del disparador «entrar» es DESCONOCIDO: QC-63 no existe

La decision 2 exige que el disparador se vea deshabilitado con su motivo cuando el pedido esta
`EN_CURSO`; no dice **a donde lleva** cuando esta habilitado, y **no puede**: ejecutar la receta es
QC-63 (`feature_list.json:893-908`, `status: pending`, y `depends_on` incluye **QC-88**).

**Propuesta, no decision** (`> 7.3`): el disparador habilitado navega a una direccion **derivada de
la constante de R1** (un `<id>` colgando de la lista), que hoy responderia **404** hasta que QC-63
monte su `page.tsx`. Hay precedente escrito en el repo para exactamente esto: `FORMULAS_ROUTE` vivio
como ruta de 404 hasta QC-26 (`lib/shared/navigation/private-nav.ts:16-18`) y `FORGOT_PASSWORD_ROUTE`
sigue asi (`lib/shared/routes.ts:179-180`). **No anade prefijo privado** —la comparacion de
`guard-rutas-privadas-cubiertas.test.ts:102-104` es por segmentos, asi que el prefijo de R2 ya cubre
el subcamino— y **no anade carpeta**, asi que esa guardia sigue verde en sus dos sentidos.
Se confirma junto con `[PA1]` en F1.4.

### H6 — El componente de avatares ya existe, pero vive dentro de la ruta `/pedidos`

`app/(private)/pedidos/components/responsible-avatars.tsx` (QC-102) hace exactamente lo que R18 y
R19 piden, incluido el nombre accesible completo y el ancho constante. **Es de otra ruta**, y
`docs/architecture.md > Componentes` prohibe importarlo por ruta profunda desde aqui. La misma seccion
dice que un componente **se promueve a `components/shared/` cuando al menos DOS features lo
necesitan con la misma API** — que es literalmente el caso hoy. Decision y su coste en `> 8.3`.

### H7 — `docs/orquestacion.md` no existe en este worktree

`AGENTS.md` y el mapa rapido lo citan como el sitio del flujo F0→F2.6 y de la regla de paralelismo,
y `Glob docs/*.md` devuelve siete archivos **sin el**. No afecta al diseno de la feature; se anota
porque la coordinacion de `> 13` cita esa regla y conviene saber que aqui se leyo de `AGENTS.md`.

---

## 1. La forma de la solucion, en una frase

Una pantalla propia, servida por un Server Component que llama **una** operacion de listado; esa
operacion **exige `asignaciones.consultar`**, lee de `order_assignments` **los ids de los pedidos de
esa persona en esa empresa** (indice `order_assignments_user_id_idx`, `db/schema.prisma:1199`), pide
a `pedidos` **los datos de esos ids** acotados a `PENDIENTE`/`EN_CURSO` y paginados, y compone **los
demas responsables** con el metodo en lote que QC-102 ya dejo montado. Ni un JOIN, ni una consulta
por fila, ninguna tabla nueva.

---

## 2. Las dos preguntas abiertas: propuestas para F1.4

**No se cierran aqui.** Se proponen con su coste y su alternativa, como pidio el encargo.

### 2.1 `[PA1]` — Como se llama la ruta y su item de menu

**Propuesta:** constante **`ASSIGNED_ORDERS_ROUTE`** en `lib/shared/routes.ts` con el valor
**`/mis-pedidos`**, y etiqueta de menu **`ASSIGNED_ORDERS_LABEL = 'Mis pedidos'`** en
`lib/shared/navigation/private-nav.ts` (donde viven ya las otras seis etiquetas, `:55-105`).

| Candidata | A favor | En contra |
|---|---|---|
| **`/mis-pedidos`** (propuesta) | dice de quien es la lista, que es lo unico que la distingue de `/pedidos`; no colisiona por segmentos con `ORDERS_ROUTE = '/pedidos'` (la comparacion de prefijos es por segmentos, `guard-rutas-privadas-cubiertas.test.ts:102-104`) | introduce el posesivo, que no usa ninguna otra ruta del repo |
| `/pedidos-asignados` | vocabulario de la ficha y de la epica | mas largo, y «asignados» tambien describe la pantalla de QC-102, que es otra |
| `/trabajo` / `/mi-trabajo` | sirve para lo que venga despues (QC-63) | inventa un area que no existe en `docs/architecture.md` |
| `/pedidos/mios` | agrupa por modulo | **la descarto tecnicamente**: cae dentro del prefijo `ORDERS_ROUTE`, asi que quedaria cubierta por el prefijo de `/pedidos` y `findUnusedPrefixes` marcaria como sobrante el prefijo nuevo. Ademas convive con la carpeta de la ruta de pedidos |

**Coste de equivocarse:** bajo y acotado. El literal aparece en **un** sitio (la constante) mas el
**nombre de la carpeta**, que lo impone el framework; el test de contrato de R33 deriva la carpeta de
la constante, asi que un cambio de nombre es renombrar carpeta + constante y nada mas.

**Mientras no haya respuesta:** el `implementer` **no** inventa el nombre definitivo. Toma el de
esta propuesta **solo si el humano la aprueba en F1.4**; cualquier otro valor entra cambiando la
constante, sin tocar ningun otro archivo de producto.

### 2.2 `[PA2]` — Donde se compone la lista

Hacen falta **dos lecturas** que hoy no se pueden hacer en un solo sitio: «que pedidos tengo» vive en
`asignaciones`, y «como es ese pedido» vive en `pedidos` —y `prisma.order` solo lo puede consultar
`pedidos` (`guard-arquitectura-modulos`, y `db/schema.prisma:1079` `/// @module pedidos`)—.

**El dato que decide, y que conviene leer antes de elegir:** la autorizacion de esta pantalla es
`asignaciones.consultar`, y ese codigo **no se puede escribir dentro de `pedidos`**: la regla (e) de
`tests/unit/asignaciones/module-contract.test.ts:732-756` lo marca como hallazgo en cualquier modulo
que no sea `asignaciones` — con ese mismo ejemplo literal (`:747-748`). O sea: **un caso de uso en
`pedidos` no puede ser la frontera de autorizacion de esta pantalla**, y el caso de uso de `pedidos`
que si existe (`list-orders.ts:127`) exige `pedidos.consultar`, que el Operador no tiene.

#### Opcion B — **desde `asignaciones`, con `pedidos` aportando solo una lectura de catalogo** (propuesta)

- `asignaciones` gana **un** caso de uso, `listAssignedOrders`, con `requirePermission(actor,
  'asignaciones.consultar')` en su primera linea (R5).
- `pedidos` **extiende su `OrderCatalog`** —el contrato que ya publica para otros modulos
  (`lib/modules/pedidos/domain/order-catalog.ts:30-35`, consumido por `asignaciones` desde QC-87)—
  con una lectura **en lote por ids, acotada por estado y paginada**. Es un **catalogo**, no un caso
  de uso: no autoriza (igual que `findAliveById` hoy, y que `RecipeCatalog`), porque quien autoriza
  es el caso de uso que lo invoca.
- El nombre de la receta lo resuelve el caso de uso con `RecipeCatalog`, el mismo contrato y el mismo
  patron que `list-orders.ts:145`.
- **Consultas por pagina: 4, constantes** (R14) — asignaciones de la persona · pedidos de esos ids ·
  recetas de esos pedidos (ids deduplicados) · responsables en lote.
- **No crea ciclo**: la flecha `asignaciones → pedidos` **ya existe** (QC-87, `composition:919`), y
  no aparece ninguna en sentido contrario.
- **Superficie de conflicto con QC-60**: `order-catalog-prisma.ts` y `db/schema.prisma` (ver `> 13`).

#### Opcion A — **ampliando `pedidos`**: un listado nuevo en ese modulo

- `pedidos` gana un caso de uso «lista de pedidos por conjunto de ids» con su propia pipeline.
- **Problemas medidos**, y por eso no es la propuesta:
  1. **La autorizacion no cabe.** El caso de uso tendria que exigir `asignaciones.consultar`
     (prohibido ahi, regla (e)) o `pedidos.consultar` (que el Operador no tiene, R4/R5 incumplidos).
     Dejarlo sin permiso convierte el corte de ruta en la unica frontera, que es exactamente lo que
     `docs/architecture.md > Acceso a datos y autorizacion` y `CHECKPOINTS.md` no admiten.
  2. **`ORDER_QUERYABLE` no sabe de ids** (`order-queryable.ts:31-37`: `sortable` cinco campos,
     `filterable` tres, `searchable: false`). Meter «ids» en el contrato generico de listas tocaria
     el archivo que esta **duplicado a proposito en los cinco modulos** (`list-query.ts:5-15`: «si
     tocas este archivo, tocas los cinco») y su guardia `guard-contrato-listados`.
  3. **Maxima colision con QC-60**, que va a reescribir justo `listAlive`, el adaptador y el
     repositorio de `pedidos` para meterles `company_id`.
- **A favor:** todo el vocabulario de pedido (numero, receta, prioridad) se quedaria dentro de
  `pedidos`, sin que `asignaciones` conozca `RecipeCatalog`.

**Recomendacion: B.** Coste que B acepta y hay que decir: `asignaciones` pasa a conocer **tres**
contratos publicos (`pedidos`, `identity`, `recetas`) en vez de dos, y su caso de uso nuevo es el mas
gordo del modulo.

---

## 3. Modelo de datos: **ninguna migracion**

- **Ninguna tabla nueva, ninguna columna nueva, ningun `down.sql`** (R24, decision 3). La lista se
  arma con lo que ya existe.
- **El indice ya esta**: `order_assignments_user_id_idx` (`db/schema.prisma:1199`), creado por QC-86
  citando literalmente esta ficha («que pedidos tengo asignados» (QC-88, R22), `:1114-1115`). La
  lectura de R9 entra por el.
- **RLS**: `order_assignments` ya nace con RLS activado y forzado (QC-86). No se toca, y **no
  autoriza nada** (`docs/architecture.md > Acceso a datos y autorizacion`): la frontera es R5.
- **`deleted_at` en asignaciones no existe y no se anade** (QC-86 R15, `db/schema.prisma:1170-1182`).
  Ese mismo comentario dice que **quien filtra al leer es QC-88**: por eso R11 descarta los estados
  finales **en la consulta**, no en la pantalla, y por eso un pedido dado de baja no aparece (la
  lectura de `pedidos` filtra `deleted_at IS NULL`, igual que `order-catalog-prisma.ts:41`).

---

## 4. El puerto y su adaptador (R9, R10)

En `lib/modules/asignaciones/ports/order-assignment-repository.ts`, **un metodo nuevo al final de la
interfaz** (no se reordena ni se reescribe ninguno de los cinco que hay):

```ts
/** QC-88 (R9): los pedidos que esta persona tiene asignados en ESA empresa. `companyId` primero,
 *  como los otros cuatro: una llamada que lo olvide no compila. Devuelve SOLO identificadores de
 *  pedido, deduplicados y ordenados por el adaptador: quien pregunta ya sabe de quien son. */
listOrderIdsByUserInCompany(companyId: string, userId: string): Promise<readonly string[]>;
```

- **Por que devuelve solo ids y no filas**: la unica columna util aqui es `order_id`; devolver la
  fila entera invitaria a leer de ella `work_group_name` y a componer los responsables «de paso»,
  que es el trabajo de `listByOrdersInCompany` y tiene su propio orden (R15).
- **Adaptador** (`adapters/driven/persistence/order-assignment-prisma.ts`, metodo nuevo al final):
  un `findMany` con `where: { userId, companyId }`, `select: { orderId: true }`,
  `orderBy: { orderId: 'asc' }`. **Sin `include`** (R37): `guard-lote-sin-join.test.ts:119-125` da
  hallazgo ante cualquier `include:` en el modulo, y ademas afirma que no existe `@relation` entre
  `Order` y `OrderAssignment` — esta ficha no crea ninguna.
- **El orden del adaptador no es el orden de la lista**: es solo determinismo barato antes de
  paginar. El orden que ve el usuario lo pone `pedidos` (`> 5.3`).

---

## 5. El caso de uso (R5-R8, R11, R14, R15)

`lib/modules/asignaciones/domain/list-assigned-orders.ts`, factoria como los otros cinco:

```ts
export type ListAssignedOrdersDeps = {
  readonly assignments: OrderAssignmentRepository;  // propio: ids de la persona + lote de responsables
  readonly orders: OrderCatalog;                    // `pedidos`: los datos de esos ids (extendido, > 6)
  readonly recipes: RecipeCatalog;                  // `recetas`: el nombre, como en list-orders.ts:145
  readonly people: PeopleDirectory;                 // `identity`: nombres mostrables, incluidos los de baja
  readonly now?: () => Date;
};

createListAssignedOrders(deps): (actor, input: unknown) => Promise<Page<AssignedOrderView>>
```

### 5.1 El orden de las operaciones, que es el requisito

1. **`requirePermission(actor, 'asignaciones.consultar')`** — primera linea, antes de `zod` y antes
   de tocar ningun puerto (R5, R6). Es lo que H2 obliga a enmendar en la guardia.
2. `zod` sobre la entrada: solo `page` y `pageSize` (`> 9.1`). Rechazo sin tocar puerto.
3. `assignments.listOrderIdsByUserInCompany(actor.companyId, actor.id)` — la empresa y la persona
   **salen del actor**, nunca de la entrada (R7).
4. **Corte seco:** si no hay ni un id, se devuelve la pagina vacia **sin tocar ningun otro puerto**
   (mismo criterio que `list-responsibles-for-orders.ts:109`).
5. `orders.listAliveSummariesByIds(actor.companyId, ids, ['PENDIENTE','EN_CURSO'], page, pageSize)`
   — la empresa **sale del actor**, como en el paso 3 (sincronizacion del 2026-09-16, `> 6`); el
   filtro de estado y la paginacion ocurren **en SQL, sobre el conjunto completo y antes de
   paginar** (R11), de modo que `total` describe lo que se muestra.
6. Nombres de receta: ids **deduplicados** y **una** llamada a `recipes.findRefsIncludingDeleted`
   (igual que `list-orders.ts:140-147`): una receta dada de baja sigue apareciendo con su nombre.
7. Responsables: **una** llamada a `assignments.listByOrdersInCompany(actor.companyId, idsDeLaPagina)`
   —el metodo de QC-102, R14— y composicion **en memoria** con `toOrigin` y `compareResponsibles`
   (`domain/responsible-order.ts`), que es lo que garantiza el **mismo** orden que las otras dos
   lecturas de responsables del repo.
8. Se descarta al propio actor de los responsables de cada fila (R20), **al final**, para que el
   orden no dependa de quien mira.

### 5.2 Por que la autorizacion va aqui y no en la pagina

`requirePagePermission` (`lib/modules/identity/adapters/driving/require-page-permission.ts:48-56`)
decide si la pantalla se **ensena**; el caso de uso decide si el dato se puede **leer**. Los permisos
de la sesion son una foto del login y envejecen hasta 8 h (`docs/architecture.md > Permisos`), asi
que una pantalla puede pintarse para alguien a quien el service ya deniega. R40 exige el test que
llama a la operacion con un actor sin permiso y comprueba que **no se llego al repositorio**.

### 5.3 El orden de la lista (R15)

**El de `pedidos` y ninguno nuevo**: `priority DESC, created_at ASC, order_year ASC,
order_sequence ASC` (`ports/order-repository.ts:63-66`), que ya es total y por tanto estable. El
Operador ve primero lo urgente y, dentro de lo urgente, lo mas antiguo, que es el orden util para una
lista de trabajo. **No se anade ordenacion por columna** (`> 10`, alternativa D).

### 5.4 El tope del lote de responsables

`MAX_ORDERS_PER_BATCH = 25` (`list-responsibles-for-orders.ts:57`) y `MAX_PAGE_SIZE = 25`
(`lib/shared/pagination.ts:17`) son el mismo numero, y R31 fija los tamanos en **10 y 25**: una
pagina entera cabe **siempre** en un lote. El caso de uso **no recorta** la lista de ids antes de
pedir los responsables —recortar dejaria filas sin resolver en silencio, que es el hallazgo H4 de
QC-102—. Como el metodo de puerto no declara tope propio, aqui no hay nada nuevo que atar.

---

## 6. Lo que `pedidos` aporta (opcion B)

En `lib/modules/pedidos/domain/order-catalog.ts`, **un metodo nuevo en la interfaz existente** y su
tipo de salida; el barrel (`lib/modules/pedidos/index.ts:24`) exporta el tipo nuevo junto a los dos
que ya exporta.

```ts
/** QC-88: lo que otro modulo puede saber de un pedido para LISTARLO. Sigue sin traer autoria,
 *  motivo de cancelacion ni marcas de tiempo: lo que no esta en el tipo no se filtra por descuido. */
export type AssignedOrderSummary = {
  readonly id: string;
  readonly number: OrderNumber;   // el par (year, sequence); el texto lo compone formatOrderNumber
  readonly recipeId: string;
  readonly quantity: string;      // CADENA decimal, nunca number (docs/architecture.md > Anti-patrones)
  readonly priority: OrderPriority;
  readonly status: OrderStatus;
};

listAliveSummariesByIds(
  companyId: string,   // AÑADIDO en la sincronizacion del 2026-09-16: QC-60 ya le dio `company_id` a
                       // `orders`. Primero, como en `findAliveById` y en `listOrderIdsByUserInCompany`:
                       // una llamada que lo olvide no compila.
  ids: readonly string[],
  statuses: readonly OrderStatus[],
  page: number,
  pageSize?: number,
): Promise<Page<AssignedOrderSummary>>;
```

- **Devuelve `Page` ya armada**, como `OrderRepository.listAlive`: `toOffsetLimit`/`buildPage` viven
  en `lib/shared/pagination`, que `domain/` no puede importar, asi que **pagina el adaptador**
  (mismo reparto que `ports/order-repository.ts:56-62`).
- **Implementacion** en `adapters/driven/persistence/order-catalog-prisma.ts` (funcion nueva al
  final): un `count` + un `findMany` con
  `where: { AND: [orderCompanyScope({ companyId }), { id: { in }, status: { in }, deletedAt: null }] }`
  (mismo patron que `findAliveOrderTargetById`, `./company-scope`). Son **dos sentencias** para
  **una** lectura logica, como cualquier listado paginado del repo; R14 cuenta consultas **por
  pagina**, no sentencias por lectura, y el numero sigue sin depender del tamano de la pagina. Se
  declara aqui para que nadie lo lea como una lectura extra.
- **`ids` vacio no llega**: el caso de uso corta en el paso 4.
- **No se toca `OrderRepository`, ni `listAlive`, ni `ORDER_QUERYABLE`, ni `list-query.ts`.** Es la
  mitad del diseno que mantiene la superficie de conflicto con QC-60 pequena (`> 13`).

**Cableado** (`lib/composition/index.ts`, bloque nuevo al final, sin reordenar nada): el
`OrderCatalog` que ya se construye en `:919` gana la funcion nueva, y la fachada `asignaciones`
(`:960-1000`) gana la clave `listAssignedOrders` con sus cuatro dependencias. Es el **unico** archivo
que ata puerto → implementacion (R13).

---

## 7. Ruta, menu y aterrizaje

### 7.1 La ruta (R1, R2, R33)

- Constante en `lib/shared/routes.ts`, con el comentario de siempre —vive ahi y no en la navegacion
  porque el middleware la necesita y no puede depender de etiquetas ni iconos—.
- Una fila en `PRIVATE_ROUTE_PREFIXES`, **exactamente una** (R2). `guard-rutas-privadas-cubiertas`
  se pone roja en los **dos** sentidos, asi que la constante, la fila y la carpeta
  `app/(private)<constante>/page.tsx` **tienen que entrar en el mismo commit**.
- Test de contrato de R33 calcado de `tests/unit/pedidos-ui/order-route-contract.test.ts`, derivando
  la carpeta esperada **de la constante** (`:101-104`) en vez de escribir el literal.

### 7.2 El item de menu (R3, R34, R35)

Entrada nueva en `PRIVATE_NAV_ITEMS` **entre `DASHBOARD_ROUTE` y `INVENTORY_ROUTE`**
(`private-nav.ts:231-248`), seccion `NAV_SECTION_OPERATION`, `permission: 'asignaciones.consultar'`,
`testId: 'nav-mis-pedidos'` (deriva del nombre que se apruebe en `[PA1]`).

- **Icono**: `clipboard-list` ya existe en `NavIconName` y en `NAV_ICONS` (`:151`) y hoy lo usa
  `nav-pedidos`. Reutilizarlo es coherente —las dos pantallas hablan de pedidos— y **no anade
  dependencia**; si el humano prefiere distinguirlas, el icono nuevo entra en `NavIconName` +
  `NAV_ICONS` y `lucide-react` ya esta instalado (no seria dependencia nueva tampoco).
- **Efecto en el aterrizaje** (H3): el Operador pasa a aterrizar en esta pantalla. Es coherente con
  el alcance —«esta pantalla **es** la puerta del Operador»— y **hay que actualizar
  `e2e/permisos.spec.ts`** en el mismo cambio (R34): el aterrizaje afirmado deja de ser
  `INVENTORY_ROUTE`, `nav-inventario` sigue visible, y el item nuevo **no** entra en
  `HIDDEN_NAV_TEST_IDS`. El 404 de ese spec sigue apuntando a `ORDERS_ROUTE`, que el Operador sigue
  sin poder consultar: **ese caso no cambia y es importante que no cambie**, porque es lo que
  demuestra que tener `asignaciones.consultar` **no** abre `/pedidos`.
- La excepcion de `guard-e2e-landing.test.ts:66-71` **se conserva con su motivo**: sigue siendo la
  suite cuyo sujeto es la regla de aterrizaje. No se anade ninguna excepcion nueva; el E2E de R38
  entra con `loginAndLand`, que deriva el destino de los permisos reales (`e2e/helpers/landing.ts:72`).

### 7.3 El disparador «entrar» (R21, R22, H5)

Destino **derivado de la constante de R1** (`assignedOrderRoute(id)` en `lib/shared/routes.ts`, mismo
patron que `recipeEditRoute` y `supplierDetailRoute`, `:52` y `:74`). Hoy responde 404 —QC-63 monta
la pantalla— y eso **no rompe ninguna guardia** (H5). Pendiente de confirmacion humana con `[PA1]`.

---

## 8. La pantalla

### 8.1 Estructura (R26-R30, patron QC-56)

```
app/(private)<ASSIGNED_ORDERS_ROUTE>/
  page.tsx                          # requirePagePermission('asignaciones.consultar') PRIMERA LINEA
  components/
    index.ts                        # barrel, SIN 'use client'
    assigned-orders-list-params.ts  # parser/serializador puros (page, pageSize) -> href
    assigned-orders-list-section.tsx# Server Component: pide la lista y despacha a los 3 estados
    assigned-orders-table.tsx       # 'use client': DataTable + navegacion por URL
    assigned-orders-columns.tsx     # 'use client': columnas como FACTORIA (QC-56)
    assigned-orders-empty.tsx       # vacio, FUERA de la tabla
    assigned-orders-error.tsx       # error, FUERA de la tabla
    assigned-orders-skeleton.tsx    # esqueleto, FUERA de la tabla (fallback del <Suspense>)
    assigned-order-enter-trigger.tsx# el disparador de R21/R22 con su motivo
```

Copiado de `app/(private)/proveedores/components/` y `app/(private)/pedidos/components/` (QC-56 D12):
`status="idle"` **siempre** en `<DataTable>`, los tres estados fuera, `searchable={false}` —no hay
busqueda que ofrecer—, y `<Suspense>` **sin `key`** (remontarlo borra el foco; la leccion esta
escrita en `pedidos/page.tsx:40-43`).

### 8.2 Columnas

Numero · Receta · Cantidad · Prioridad · Estado · Responsables · Entrar. **Ninguna ordena y ninguna
filtra** (`> 10`, alternativa D), y el esqueleto declara **el mismo numero de columnas** que la tabla,
con un test que ata las dos cifras (precedente: `order-list-skeleton.tsx:28-41`).

### 8.3 Los avatares (H6)

**Propuesta: promover** `ResponsibleAvatars` de `app/(private)/pedidos/components/responsible-avatars.tsx`
a `components/shared/` sin cambiar su API, y dejar la ruta de pedidos importandolo de ahi. Es lo que
`docs/architecture.md > Regla: sin sobre-ingenieria` manda en el **segundo** consumidor, y evita dos
definiciones del mismo avatar que divergirian en silencio.

**Condicion y plan B, porque hay un riesgo de coordinacion real:** QC-102 figura como `in_progress`
con **PR #68 abierto y sin mergear** (`progress/current.md`). Mover sus archivos antes de que ese PR
entre en `dev` crea conflicto. Por eso: **el leader comprueba en F2.0 si QC-102 esta mergeado**; si
lo esta, se promueve; si no, se escribe un componente propio en esta ruta —reutilizando `getInitials`
de `lib/shared/ui/initials.ts`, que es la unica logica de verdad— y **se anota la duplicacion como
deuda con destinatario**, no en silencio. No se toca `components/shared/data-table/` en ninguno de
los dos casos.

### 8.4 Multiplataforma (R32)

Objetivos tactiles `min-h-11 min-w-11` (el disparador «entrar» y el `+N` de los avatares), el motivo
de R21 **como texto visible y `aria-describedby`**, no solo como `title` —un `tooltip` por `:hover`
no llega en tactil, que es el hallazgo H5 de QC-102—, y ningun `100vh`. **Sin excepcion de
escritorio** (decision 11).

---

## 9. Contratos de entrada y salida

### 9.1 Entrada de la operacion

```ts
{ page: number; pageSize?: number }   // z.strictObject; nada mas
```

**No se usa el contrato generico `ListQuery`** y es deliberado: esta lista no ordena, no filtra y no
busca, y `createListQuerySchema()` es un `strictObject` cuyo saneado se apoya en una lista blanca
(`ORDER_QUERYABLE`) que no puede expresar «mis ids» (`> 2.2`, problema 2). El actor **no** viaja en la
entrada: va por parametro, como en los seis modulos (R7).

### 9.2 Salida

```ts
type AssignedOrderView = {
  readonly id: string;
  readonly numberText: string;                       // formatOrderNumber, la UNICA definicion (R16)
  readonly recipeName: string | null;                // null -> marcador de ausencia, nunca el id (R17)
  readonly quantity: string;                         // cadena decimal
  readonly priority: OrderPriority;
  readonly status: 'PENDIENTE' | 'EN_CURSO';         // el TIPO impide expresar un estado final (R11)
  readonly otherResponsibles: readonly OrderResponsible[];  // sin el actor (R20)
};
// La pagina: { items, total, page, pageSize, totalPages }
```

`status` acotado a dos literales **no es cosmetico**: hace que «se colo un ENTREGADO» sea un error de
compilacion en quien construya la fila, y no un test que alguien tiene que acordarse de escribir.
`OrderResponsible` es el tipo de `asignaciones` (`domain/assignment-view.ts:32`), **reutilizado y no
redefinido**: tres claves, sin correo, sin documento y sin estado de cuenta.

### 9.3 La Server Action

Una funcion nueva al final de
`lib/modules/asignaciones/adapters/driving/order-assignment-actions.ts`, con **argumento ya tipado**
(no viene de un `<form>`), que resuelve el actor de las dos caras de la sesion con el `currentActor()`
que ya vive ahi (`:76-87`) y traduce el error **por su `code`** con el traductor unico de QC-70.
**No comprueba ningun permiso** —seria una segunda definicion de la autorizacion— y **no se
reexporta** desde el barrel del modulo: `app/**` la importa por su ruta exacta.

---

## 10. Alternativas descartadas

Ademas de la **opcion A** de `> 2.2` y de las candidatas de ruta de `> 2.1`:

- **(C) Un JOIN entre `orders` y `order_assignments`, o un `include`.** Es lo mas corto de escribir y
  **esta prohibido**: QC-33 R53, y QC-33/QC-86 dejaron las FK como escalares sin `@relation`
  justamente para que no hubiera relacion que navegar. Ademas `guard-lote-sin-join.test.ts` se pone
  roja por los dos lados (esquema y `include`). Descartada por regla, no por gusto.
- **(D) Ofrecer ordenacion y filtros por columna, como `/pedidos`.** Tentador porque la tabla
  compartida lo sabe hacer. Se descarta: (1) ninguna decision cerrada lo pide, y declararlo seria
  inventar alcance; (2) obligaria a meter «ids» en el contrato generico de listas, que esta duplicado
  a proposito en los cinco modulos y tiene guardia propia; (3) la lista de trabajo de una persona es
  corta y ya viene ordenada por prioridad, que es el criterio util. **Coste aceptado**: quien tenga
  muchos pedidos asignados solo puede paginar.
- **(E) Una consulta por fila para los responsables** (`listOrderResponsibles` por pedido). Es lo que
  QC-102 existe para no hacer y lo que R14 prohibe; ademas ese caso de uso exige `pedidos.consultar`
  (H1), asi que ni siquiera funcionaria para un Operador.
- **(F) Reutilizar `/pedidos` con un filtro «solo los mios».** La decision cerrada 1 ya la descarta
  —exige `pedidos.consultar`, que abriria el listado completo de la empresa—, y se anota aqui porque
  es la idea que vuelve sola cuando se ve cuanto codigo de lista ya existe.
- **(G) Guardar quien abrio el pedido para decidir el disparador.** Descartada por la decision 3 (no
  se anade el dato) y por la 2 (la regla de verdad la aplica QC-63 en el servidor). Esta pantalla
  **no** afirma quien lo abrio: solo que **esta** en curso (R25).
- **(H) Filtrar los estados finales en la pantalla, despues de traerlos.** Haria que `total` y
  `totalPages` mintieran y que una pagina llegara medio vacia. R11 exige el descarte antes de paginar.

---

## 11. Dependencias de terceros

**Ninguna** (R39, decision 13). Todo lo que hace falta ya esta en el repo y verificado en disco: la
tabla compartida (QC-55), el primitivo `avatar` y `tooltip` (`components/ui/`), `getInitials`
(`lib/shared/ui/initials.ts`), la paginacion (`lib/shared/pagination.ts`) y los iconos de
`lucide-react`. **No hay que anadir ninguna fila a `docs/dependencias.md`** y los cuatro checks de
`docs/architecture.md > Dependencias de terceros` no aplican porque no se propone ninguna libreria.

---

## 12. Lo que esta feature **no** hace

Ejecutar la receta (QC-63) · asignar o desasignar responsables (QC-87/QC-102) · cambiar el estado del
pedido (QC-34) · anadir `company_id` a `orders` (QC-60) · tocar `components/shared/data-table/` ·
tocar `ORDER_QUERYABLE`, `list-query.ts` o `OrderRepository`.

---

## 13. Coordinacion con lo que corre en paralelo (declarada, no resuelta)

**El leader valida el conflicto antes de F2.0**; aqui solo se declara con precision.

| Ficha | Estado | Archivos que previsiblemente toca | ¿Choca con QC-88? |
|---|---|---|---|
| **QC-60** `aislamiento-por-empresa-en-pedidos` (`backend`, `pending`) | anade `company_id` a `orders` | `db/schema.prisma` (model `Order`), migracion nueva, `lib/modules/pedidos/ports/order-repository.ts`, `adapters/driven/persistence/order-prisma.ts`, `domain/list-orders.ts`, `domain/actor.ts`, **`adapters/driven/persistence/order-catalog-prisma.ts`** | **SI, en dos archivos**: `db/schema.prisma` y `order-catalog-prisma.ts` |
| **QC-81** `lote-y-fecha-de-compra` (`backend`, `spec_ready`) | lote obligatorio y correlativo | `db/schema.prisma` (model `ProductBatch`), `lib/modules/inventario/**` | **No**: ningun archivo en comun salvo `db/schema.prisma`, y en **modelos distintos** |
| **QC-102** `responsables-en-la-pantalla-de-pedidos` (`fullstack`, PR #68 abierto) | ya en esta rama | `app/(private)/pedidos/components/**` | **Solo si se promueve el avatar** (`> 8.3`); con el plan B, cero |

### Que se rompe si `orders` gana `company_id` mientras tanto

1. **Lo que NO se rompe:** el aislamiento de esta pantalla. La empresa entra por
   `order_assignments.company_id`, que ya existe (H4), asi que R7/R8 se cumplen con o sin QC-60.
2. **Lo que se rompe seguro:** `listAliveSummariesByIds` quedaria como **la unica lectura de
   `prisma.order` sin `company_id` en el `where`** el dia que la columna exista. QC-60 debe anadirselo
   —una linea—, y si no lo hace, **la guardia que QC-61 traiga lo dira**. Se anota aqui para que el
   `where` no se quede atras en silencio: es exactamente la forma en que un aislamiento «desaparece
   en silencio» que QC-86 dejo advertida (`db/schema.prisma:1144-1149`).
3. **Conflicto de texto**, no de semantica: si QC-60 entra primero, esta ficha rebasa su metodo nuevo
   sobre el archivo ya modificado y le anade el filtro; si entra despues, QC-60 encuentra un metodo
   mas que tocar. En los dos sentidos es un merge de una funcion, porque el metodo nuevo va **al final
   del archivo** y no reordena nada.
4. **`db/schema.prisma`**: QC-88 **no escribe ni una linea** ahi (R24). Lo que hay que saber es que
   las FK y los CHECK de `orders` y `order_assignments` son **drift para Prisma** y toda migracion que
   los toque emite `DROP CONSTRAINT` que hay que borrar a mano (`db/schema.prisma:1133-1137`). Eso es
   carga de QC-60, no de esta ficha.

### Nota del merge de sincronizacion, 2026-09-16

QC-60 ya esta en `dev` y se fusiono en esta rama sin conflicto de texto en
`order-catalog-prisma.ts` (git lo resolvio solo: el metodo nuevo de esta ficha, T5, todavia no
existia cuando se fusiono). Lo que SI cambio, medido en disco tras el merge:

- `orders` **ya tiene `company_id`** (migracion `20260915120000_orders_company_scope`) y
  `findAliveOrderTargetById` (el UNICO metodo de `OrderCatalog` que existe hoy) ya filtra por
  `orderCompanyScope({ companyId })` (`order-catalog-prisma.ts:44`, `company-scope.ts`). El punto 2
  de arriba se cumplio: QC-60 SI le anadio el filtro a lo que ya existia.
- **`listAliveSummariesByIds` (T4/T5, `> 6`) sigue sin escribirse.** Cuando T5 la implemente, su
  `where` DEBE llevar `orderCompanyScope({ companyId })` en `AND` junto a `id: { in }`,
  `status: { in }` y `deletedAt: null` —el mismo patron que `findAliveOrderTargetById`, reutilizando
  `orderCompanyScope` de `./company-scope` en vez de escribir `{ companyId }` a mano—. El caso de uso
  (T6) ya tiene `actor.companyId` disponible (paso 3 de `> 5.1`), asi que **T4 anade `companyId` como
  parametro de `listAliveSummariesByIds`** igual que hizo T1 con `listOrderIdsByUserInCompany`: una
  llamada que lo olvide no compila. Esto TENSA el "Hecho cuando" de T5 (`tasks.md`), que se anota ahi
  con fecha.
- Ningun otro archivo de la superficie declarada en la tabla de arriba cambio su forma: sigue siendo
  un merge de una funcion nueva al final del archivo cuando T5 llegue.

---

## 14. Riesgos

1. **La lista de ids de una persona no tiene tope.** El paso 3 lee **todas** las asignaciones vivas
   de esa persona antes de paginar. Con el indice `order_assignments_user_id_idx` es barato y son
   uuid, pero **crece sin limite** con el historial. No se inventa un tope aqui (regla 6): se declara,
   y si el humano quiere uno, es decision suya en F1.4. Mitigacion natural: los pedidos terminan en
   `ENTREGADO` y salen de la lista, pero **su fila de asignacion no se borra** (QC-86 R15), asi que lo
   que crece es el conjunto leido, no el mostrado.
2. **La enmienda de la guardia (H2) se puede ensanchar de mas.** Si alguien la «arregla» permitiendo
   el modulo entero o los dos codigos, se cae la garantia que R36 protege. El caso `:764` de esa
   guardia esta escrito justo para eso y **hay que conservarlo con sus tres portazos**.
3. **Que el aterrizaje cambie y nadie lo note.** Si el item se coloca sin actualizar
   `e2e/permisos.spec.ts`, el rojo aparece en un E2E que el gate rapido **no corre** (Playwright no
   entra en `init.sh --rapido`). Por eso R34 lo exige **en el mismo cambio** y la task lo lista.
4. **Dos definiciones del avatar** si se toma el plan B de `> 8.3`. Declarado, con destinatario.
5. **El 404 del disparador** hasta que llegue QC-63 (H5). Tiene precedente, pero es una pantalla que
   ofrece un boton que hoy no lleva a ninguna parte util. Si el humano prefiere que **no** se pinte
   hasta QC-63, es cambiar una condicion — pero entonces R22 se queda sin nada que afirmar y hay que
   decirlo al aprobar.

---

## 15. Mapa decision → requisito (cobertura de la tabla de la semilla)

| Decision cerrada | Requisitos |
|---|---|
| D1 pantalla propia, ruta, item de menu, `asignaciones.consultar` | R1, R2, R3, R4, R33, R34, R35 |
| D2 `EN_CURSO` visible, disparador deshabilitado con motivo | R21, R22, R23 |
| D3 no se guarda quien prepara el pedido | R24, R25 |
| D4 solo `PENDIENTE` y `EN_CURSO` | R11 |
| D5 que muestra cada fila | R16, R17, R18, R19, R20 |
| D6 tabla compartida + responsables en lote | R10, R14, R15, R26, R37 |
| D7 vacio, error y carga fuera de la tabla | R28, R29, R30 |
| D8 los datos los trae la pantalla, en el servidor, por props | R27 |
| D9 permisos validados en el caso de uso | R4, R5, R6, R36, R40 |
| D10 aislamiento por empresa | R7, R8, R9 |
| D11 tamano de pagina 10 y 25, sin excepcion de escritorio | R31, R32 |
| D12 hace falta E2E (Chromium y WebKit) | R38 |
| D13 ninguna dependencia nueva | R39 |
| D14 `fullstack`/`high`: puerto, adaptador, caso de uso, barrel | R9, R10, R12, R13, R37, R40 |
