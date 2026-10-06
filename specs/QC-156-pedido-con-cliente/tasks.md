# QC-156 — pedido-con-cliente · tasks.md

> Zona `fullstack` · Complejidad `medium` · Rama `feature/QC-156-pedido-con-cliente`
>
> El **qué** está en `requirements.md` (R1–R40) y el **cómo**, en `design.md`.
>
> **Orden:**
> 1. **T0**, el contrato: secuencial y bloquea todo lo demás.
> 2. **Pista B** (`backend_dev`) y **pista F** (`frontend_dev`), **en paralelo**.
> 3. **TI**, la integración: actions reales y E2E.
> 4. **TZ**, el cierre.
>
> `[P]` marca lo que puede correr en paralelo con las demás `[P]` de su pista una vez cumplidas sus
> dependencias. Cada task es un commit (`feat(QC-156): …` / `test(QC-156): …`) con su criterio de
> «hecho».
>
> **Las pistas B y F no comparten ningún archivo.** Lo que las dos tocarían lo toca T0 (tipos, barrels,
> stubs, firmas) o TI (actions reales, E2E). Si una task descubre que necesita un archivo de la otra
> pista, **para y vuelve al leader**: es un cambio de contrato (`design.md > 1`).
>
> **Antes de empezar:**
> - El spec tiene que estar **aprobado** (F1.4). Las preguntas P2, P4, P5 y P6 las cerró el humano
>   el 2026-10-06 (`requirements.md > Decisiones cerradas`): P5 aprueba `CustomerCatalog`, así que
>   T0 ya no está bloqueada. P2 («Sin cliente» en el filtro) cae en T0, B5, B6, F2, F3 y F7; P6 (la
>   edición que solo cambia el cliente no recalcula) cae en T0 y B3; P4 no cambia nada.
> - **Base de datos propia: `QuimiCloude_QC156`.** La integración corre con `DATABASE_URL` y
>   `DIRECT_URL` sobrescritos en el entorno del comando, **nunca** contra la del `.env` (lección de
>   QC-147).
> - Los comentarios de producción **no citan fichas ni requisitos** (`docs/conventions.md >
>   Comentarios`). `R<n>` va solo en los nombres de los tests.
> - En `app/` fuera de `app/(private)/clientes/` está prohibido escribir `customers` (plural), la
>   ruta `/clientes`, los permisos `clientes.*`, `'Clientes'` entre comillas, y crear archivos con
>   «cliente» en el nombre (`design.md > 8`). Los archivos nuevos se llaman `order-customer-*`.
> - Tanda cerrada = `./init.sh --rapido` en verde. Feature cerrada, y **siempre antes del PR** =
>   `./init.sh` completo.

---

## T0 — Publicar el contrato en código (secuencial; bloquea todo)

**Agente:** `backend_dev` · **R:** R37 (forma), R9 (lista de sesión), R36 (frontera), R11 (`requireAliveCustomer`)

Archivos:

- `lib/modules/clientes/domain/customer-catalog.ts` (nuevo): `CustomerRef`, `CustomerRefSearch` y
  `CustomerCatalog`, reales (`design.md > 1.1`).
- `lib/modules/clientes/adapters/driven/persistence/customer-catalog-prisma.ts` (nuevo, **stub**):
  `findCustomerRefsIncludingDeleted`, `findAliveCustomerRefById` y `searchCustomerRefs`. Ya declaran
  `scope: CustomerScope` y su cuerpo lanza «sin implementar».
- `lib/modules/clientes/index.ts` (modifica): reexporta los tres tipos, solo como tipos.
- `lib/modules/pedidos/domain/order-customer.ts` (nuevo): `OrderCustomer`,
  `OrderCustomerSearchPurpose`, `ORDER_CUSTOMER_FILTER_FIELD`,
  `ORDER_CUSTOMER_PRESENCE_FILTER_FIELD`, `ORDER_CUSTOMER_PRESENCE_NONE`,
  `ORDER_CUSTOMER_PRESENCE_VALUES`, y `formatOrderCustomerName`, `toOrderCustomer`,
  `isCustomerIdShape` y `requireAliveCustomer`, **reales** (`design.md > 1.2`).
- `lib/modules/pedidos/ports/order-write-repository.ts` (modifica): `setCustomerAlive`
  (`design.md > 1.2`). Lo usan B3 y B4 en paralelo, por eso entra aquí y no en B6.
- `lib/modules/pedidos/domain/order-view.ts` (modifica): `customerId` en `OrderRow`, `NewOrder` y
  `OrderEdit`; `customer` en `OrderView`.
- `lib/modules/pedidos/domain/errors.ts` (modifica): `CustomerNotFoundError` (`'customer_not_found'`).
- `lib/modules/pedidos/domain/set-order-customer.ts`, `search-order-customers.ts` y
  `get-order-customer-filter-option.ts` (nuevos, **stub**): factorías con la firma de
  `design.md > 1.3` y su tipo `*Deps`. El cuerpo lanza «sin implementar».
- `lib/modules/pedidos/index.ts` (modifica): reexporta lo anterior. **Es la única vez que la feature
  toca este barrel.**
- `lib/modules/pedidos/adapters/driving/order-customer-fixtures.ts` (nuevo, temporal): opciones fijas
  con un cliente vivo, uno dado de baja y una segunda página.
- `lib/modules/pedidos/adapters/driving/order-actions.ts` (modifica): las tres actions de
  `design.md > 1.4`, con su tipo de resultado. Cada una llama a `currentActor()` y devuelve fixtures
  (stub).
- Compilación mínima, con valores nulos temporales que B rellena:
  - `get-order.ts`: `toOrderView` devuelve `customer: null`.
  - `create-order.ts` y `update-order.ts`: pasan `customerId: null`.
  - `order-prisma.ts`: `toOrderRow` devuelve `customerId: null`, y `setCustomerAlive` es un stub
    que lanza «sin implementar».
- Tests:
  - `tests/unit/pedidos/order-customer-contract.test-d.ts` (nuevo): con `expectTypeOf` fija las
    formas de `OrderCustomer`, `OrderView.customer` y `CustomerRef` (sin `city`, `phone`, `email`
    ni `address`) y las firmas de las tres factorías y las tres actions.
  - `tests/unit/pedidos/order-actions.test.ts` (modifica): listas de aridad y firma (`:905`, `:921`).
  - `tests/unit/identity/session-once-per-request-actions.test.ts` (modifica): las tres actions en
    `ACCIONES`.
  - `tests/unit/clientes/scope.test.ts` (modifica): `ARCHIVOS_ESPERADOS` con los dos archivos
    nuevos de `clientes`, y el bloque R40 reescrito (`design.md > 9`) con sus dos casos de
    sensibilidad: el barrel no dispara y la ruta profunda sí.
  - `tests/unit/pedidos/order-customer.test.ts` (nuevo): `formatOrderCustomerName`,
    `isCustomerIdShape` y `requireAliveCustomer` (sin forma de uuid, cero llamadas al catálogo).
  - Fixtures existentes que construyen `OrderRow` u `OrderSummary` en `tests/unit/pedidos/**` y
    `tests/unit/pedidos-ui/**`: `customerId: null` y `customer: null`; dobles de
    `OrderWriteRepository`: `setCustomerAlive`. Mecánico; la lista la da `pnpm typecheck`.

**Hecho cuando:**
- `pnpm typecheck` y `pnpm lint` están en verde;
- el test de contrato, `order-actions.test.ts`, `session-once-per-request-actions.test.ts` y
  `clientes/scope.test.ts` pasan;
- `guard-arquitectura-modulos` está en verde (el barrel de `clientes` sigue sin `'use server'` ni
  Prisma en su cierre de imports);
- `./init.sh --rapido` está en verde.

Commit propio: `feat(QC-156): T0 contrato pedido-cliente`.

---

## Pista B — backend (`backend_dev`)

Ningún archivo de esta pista está en `app/`, en `components/` ni en `tests/unit/pedidos-ui/`.

### B1 [P] — Esquema y migración · depende de: T0 · R1, R2, R3, R4, R5

- `db/schema.prisma`: `Order.customerId`, `@@index` y el comentario de cabecera
  (`design.md > 2.1`).
- `db/migrations/20261006160000_orders_customer/migration.sql` y `down.sql`, a mano. Antes de crearla
  se **comprueba** que `20261006160000` sigue siendo mayor que la última migración de `origin/dev` y
  de las ramas de QC-209 y QC-213. Si no lo es, se sube el timestamp y se anota.
- `tests/unit/pedidos/schema/pedidos-schema.test.ts:229` (reescrito a R5).
- `tests/unit/pedidos/schema/orders-customer-migration.test.ts` (nuevo): el UP añade la columna
  nullable sin `DEFAULT` ni `UPDATE`, crea la FK compuesta hacia
  `customers("company_id","id")` y el índice, y no nombra otra tabla. El DOWN revierte exactamente
  esas tres cosas en orden inverso.
- `tests/integration/pedidos/orders-customer-constraints.int.test.ts` (nuevo), contra
  `QuimiCloude_QC156`:
  - un pedido con cliente de otra empresa da `23503`;
  - un pedido con `NULL` es válido;
  - los pedidos previos quedan en `NULL`;
  - aplicar el DOWN y volver a subir deja el esquema igual.
- `tests/integration/aislamiento.json`: la entrada del archivo de integración anterior.

**Hecho cuando:** `pnpm run db:migrate` sobre `QuimiCloude_QC156` aplica y `pnpm run db:rollback` la
revierte limpia, y los tres tests están en verde. Salida pegada en
`progress/impl_QC-156-pedido-con-cliente.md`.

### B2 [P] — Servicio de clientes real · depende de: T0 · R27, R28, R37

- `customer-catalog-prisma.ts`, real (`design.md > 3`): reutiliza `searchCondition` de
  `customer-prisma.ts` exportándola, y no la copia.
- `customer-prisma.ts` (modifica): **solo** `export` de `searchCondition`. Ningún cambio de
  comportamiento.
- `tests/guards/guard-ambito-empresa-clientes.test.ts` (modifica, si su lista de adaptadores es
  cerrada): `customer-catalog-prisma.ts`.
- `tests/unit/clientes/customer-catalog.test.ts` (nuevo): el `select` mínimo y la lista vacía sin
  consulta.
- `tests/integration/clientes/customer-catalog.int.test.ts` (nuevo): empresa propia frente a ajena;
  bajas incluidas o excluidas según `includeDeleted`; orden; búsqueda sin acentos por palabra;
  páginas de 10 y tope de 25. Su entrada en `aislamiento.json`.

**Hecho cuando:**
- los dos tests nuevos están en verde;
- **todos** los tests de `tests/unit/clientes/**`, `tests/unit/clientes-ui/**` y
  `tests/integration/clientes/**` de QC-153, QC-154 y QC-155 siguen en verde sin editarlos, aparte
  de los cambios ya hechos en T0 y de la lista de la guardia.

### B3 [P] — Alta y edición con cliente · depende de: T0 · R10, R11, R12, R13, R15

- `lib/modules/pedidos/domain/order-input.ts`: `customerId` en los dos esquemas, con el vacío como
  `null` y sin `.uuid()`.
- `create-order.ts` y `update-order.ts`: la comprobación de `design.md > 4.1` con
  `requireAliveCustomer`, y el paso de `customerId` al puerto.
- `update-order.ts`: el **atajo** de la edición que solo cambia el cliente (`design.md > 4.1.1`),
  después de `assertTransition` y antes de leer recetas y calcular el coste.
- `lib/modules/pedidos/domain/order-edit-change.ts` (nuevo): `isCustomerOnlyEdit` y
  `ComparableEdit`, puros.
- `lib/modules/pedidos/domain/order-distribution.ts` (modifica): **solo** exporta
  `sameDecimal(a, b)` sobre `parseDecimal` y `rescale`, que ya existen. Ningún cambio de
  comportamiento.
- `tests/unit/pedidos/order-edit-change.test.ts` (nuevo): cada fila de la tabla de «igual» de
  `design.md > 4.1.1`: `"10"` frente a `"10.0000"`, reparto en otro orden, línea con envase y línea
  antigua, unidad guardada `null`, receta frente a versión, prioridad, y una línea de más o de menos.
- `tests/unit/pedidos/order-customer-write.test.ts` (nuevo):
  - alta con un cliente vivo, sin cliente y con cliente vacío;
  - las cuatro causas de `customer_not_found`, y con el id sin forma **cero** llamadas al catálogo;
  - en la edición, el mismo cliente dado de baja se acepta y uno distinto dado de baja se rechaza;
  - en la edición, sin cliente queda `null`;
  - en todos los rechazos, ninguna escritura;
  - **atajo (R13)**: los casos límite de `design.md > 4.1.1`. Cuando aplica, el `unitOfWork` solo ve
    `setCustomerAlive(id, customerId, actor.id, now, scope)`, y los dobles de `recipes`, `products`,
    `units`, `presentations` y `packaging` **fallan si se les llama**. Cuando no aplica (cambia otro
    dato, o no cambia nada), se llama a `updateAlive` y `syncForOrder` como hoy. En estado cerrado,
    `assertTransition` rechaza antes del atajo.
- `tests/unit/pedidos/order-input.test.ts` (modifica, si fija las claves del esquema).

**Hecho cuando:** los tests están en verde, y `order-service.test.ts`, `update-order.test.ts` y los
tests de `order-distribution` siguen en verde sin editarlos.

### B4 [P] — Cambio de cliente y búsqueda de opciones · depende de: T0 · R6, R7, R8, R14–R18, R27, R28, R29

- `set-order-customer.ts`, `search-order-customers.ts` y `get-order-customer-filter-option.ts`,
  reales (`design.md > 4.2`, `> 4.3`).
- `tests/unit/pedidos/set-order-customer.test.ts` (nuevo):
  - los **siete** estados aceptan el cambio;
  - quitar el cliente;
  - el mismo cliente no escribe;
  - `order_not_found` en sus tres causas;
  - claves extra sin efecto;
  - el `unitOfWork` solo recibe `setCustomerAlive`, con `(id, customerId, actor.id, now, scope)`;
  - las dependencias no incluyen catálogos de recetas, inventario ni unidades.
- `tests/unit/pedidos/search-order-customers.test.ts` (nuevo): `includeDeleted` según `purpose`, un
  `purpose` desconocido falla cerrado, la respuesta nunca trae una opción «Sin cliente» (R27), y la
  opción de filtro con un id sin forma devuelve `null` sin consultar.
- `tests/unit/pedidos/order-customer-authorization.test.ts` (nuevo): la matriz de
  `design.md > 10` (R6, R7, R8), con dobles que fallan si se les llama.

**Hecho cuando:** los tres tests están en verde.

### B5 [P] — Listado, ficha y filtro · depende de: T0 · R19–R26

- `order-queryable.ts`: `customerId: 'select'` y `customerPresence: 'select'`
  (`design.md > 4.4`, `> 4.4.1`).
- `list-orders.ts`: `customerPresence` en `CLOSED_SELECT_VALUES`, la poda de uuid de `customerId` y
  la resolución con una llamada por página.
- `get-order.ts`: `toOrderView` con clientes; `getOrder` hace una llamada.
- `tests/unit/pedidos/list-orders-customer.test.ts` (nuevo):
  - una llamada por página con ids sin repetir, y cero llamadas sin clientes;
  - el cliente dado de baja llega con `isDeleted`;
  - la poda y el log de valores sin forma en `customerId`, y de valores distintos de `'none'` en
    `customerPresence` (con la lista vacía, el filtro desaparece);
  - `customerId` y `customerPresence` llegan juntos al puerto sin tocarse;
  - la búsqueda no consulta clientes;
  - el orden por `customerId` se omite;
  - la salida no lleva datos personales.
- `tests/unit/pedidos/get-order.test.ts` y `list-orders.test.ts` (modifican: dependencia nueva y
  conteo de llamadas).
- `tests/unit/pedidos/order-view.test.ts:119` (modifica: `filterable` exacto con `customerId` y
  `customerPresence`).
- `tests/unit/pedidos/order-customer-boundaries.test.ts` (nuevo, R22): estático sobre
  `order-catalog.ts` y `order-catalog-prisma.ts`.

**Hecho cuando:** los tests están en verde.

### B6 — Adaptador y composición · depende de: B1, B2, B3, B4, B5 · R3, R13, R15, R23, R24

- `adapters/driven/persistence/order-prisma.ts`: el `select`, `toOrderRow`, `create`,
  `updateAlive`, `orderCustomerFilterWhere` (los dos campos del filtro juntos en un solo término,
  `design.md > 4.4.1`) y `setCustomerAlive` real en lugar del stub de T0 (`design.md > 5`).
- `tests/unit/pedidos/order-customer-filter-where.test.ts` (nuevo): los tres casos de la tabla de
  `design.md > 4.4.1`, y que el `OR` queda dentro de su propio término, nunca al nivel del ámbito.
- `lib/composition/index.ts`: el bloque de `customerCatalog` al final y las dependencias y la
  fachada en el bloque de `pedidos` (`design.md > 6`). **Una sola tanda.**
- `tests/integration/pedidos/order-customer.int.test.ts` (nuevo):
  - `setCustomerAlive`, comparando la fila completa antes y después: solo cambian `customer_id`,
    `updated_by` y `updated_at`;
  - `reserved_at`, `ingredients_cost`, `packaging_cost`, `status`, `packed_by` y `finished_at` no
    cambian;
  - las filas de reserva, `inventory_movements` y `order_assignments` del pedido no cambian;
  - el filtro por cliente en base: total, combinación con estado y con la búsqueda por receta, y
    otra empresa da 0;
  - el filtro «sin cliente» en base: solo pedidos sin cliente de la empresa (un pedido sin cliente
    de **otra** empresa no aparece), y con los dos filtros, la unión;
  - la edición general que solo cambia el cliente (R13): `ingredients_cost`, `packaging_cost`,
    `reserved_at`, `status` y las filas de reserva no cambian; solo `customer_id`, `updated_by` y
    `updated_at`.

  Su entrada en `aislamiento.json`.
- `tests/unit/pedidos/company-scope.test.ts` o `guard-ambito-empresa-pedidos` (lo que mida el
  `scope` final de los puertos): debe seguir en verde con el método nuevo.

**Hecho cuando:** la integración está en verde contra `QuimiCloude_QC156` y `./init.sh --rapido`
está en verde.

---

## Pista F — frontend (`frontend_dev`)

Ningún archivo de esta pista está en `lib/`, `db/` ni `tests/unit/pedidos/` (sin el sufijo `-ui`).
Todo se prueba contra las actions **stub** de T0, mockeadas en los tests con `vi.mock` como hacen
los tests existentes de `pedidos-ui`.

### F1 [P] — `AsyncAutocomplete.defaultInputValue` · depende de: T0 · R29, R31

- `components/shared/async-autocomplete.tsx`: la prop opcional (`design.md > 8`).
- `tests/unit/async-autocomplete.test.tsx` (modifica): con la prop, el campo arranca con ese texto
  y no consulta hasta que se abre; sin ella, todo sigue igual que hoy (los casos existentes, sin
  tocar).

**Hecho cuando:** el test está en verde y nadie más que `pedidos` pasa la prop.

### F2 — Etiqueta y selector · depende de: F1 · R20, R27, R28, R34, R35

- `app/(private)/pedidos/components/order-customer-label.ts` (nuevo, con
  `ORDER_CUSTOMER_NONE_LABEL` y `orderCustomerChoiceLabel`) y `order-customer-picker.tsx` (nuevo,
  sobre `OrderCustomerChoice`, `design.md > 8`).
- `app/(private)/pedidos/components/index.ts`: reexporta los dos.
- `tests/unit/pedidos-ui/order-customer-picker.test.tsx` (nuevo):
  - `fetchPage` llama a la action con el `purpose` que recibe;
  - el oculto lleva el **id** y no la etiqueta (vacío con «Sin cliente»);
  - muestra el sufijo «(eliminado)»;
  - con `purpose="filter"`, «Sin cliente» va primero en la página 1 sin término y con un término
    que casa («sin», «CLIENTE», «sín»); no aparece con un término que no casa ni en la página 2;
  - con `purpose="assign"`, «Sin cliente» no aparece nunca;
  - el objetivo táctil.

**Hecho cuando:** el test está en verde.

### F3 [P] — Parámetro de la dirección · depende de: T0 · R24, R34

- `order-list-params.ts`: `CUSTOMER_PARAM`, `CUSTOMER_COLUMN_ID`, `CUSTOMER_PRESENCE_COLUMN_ID` y
  `CUSTOMER_NONE_PARAM_VALUE`, con lectura y escritura (`design.md > 8`).
- `tests/unit/pedidos-ui/order-list-params.test.ts` (modifica): un uuid válido entra como
  `customerId`, `none` entra como `customerPresence`, otro valor o vacío no entra, el parámetro
  repetido toma el primero, `parse(build(p))` devuelve `p` con cada uno de los dos filtros, y con
  los dos a la vez la dirección lleva el uuid.

**Hecho cuando:** el test está en verde.

### F4 — Columna «Cliente» · depende de: F2 · R20, R26, R30

- `order-columns.tsx`.
- `tests/unit/pedidos-ui/order-columns.test.tsx` (modifica): el nombre, el sufijo de baja, el
  marcador de ausencia, sin `sortable` y sin `filter`, y la posición detrás de «Receta».

### F5 — Campo en el formulario · depende de: F2 · R31

- `order-form.tsx`.
- `tests/unit/pedidos-ui/order-form-customer.test.tsx` (nuevo): el alta envía `customerId` vacío o
  con id, la edición viene precargada, y vaciar el campo envía vacío.

### F6 — Diálogo y acción de fila · depende de: F2 · R32, R33, R35

- `order-customer-dialog.tsx` (nuevo), `order-row-actions.tsx`, `order-sheet.tsx` e `index.ts`.
- `tests/unit/pedidos-ui/order-customer-dialog.test.tsx` (nuevo):
  - guardar, quitar, el éxito (cierra, toast, `refresh`) y el error (mensaje del catálogo y sigue
    abierto);
  - solo se monta mientras está abierto.
- `tests/unit/pedidos-ui/order-row-actions.test.tsx` (modifica): «Cliente» aparece y está habilitada
  en los siete estados con `canEditCustomer`, y no aparece sin él.
- `tests/unit/pedidos-ui/order-row-wiring.test.tsx` y `read-only.test.tsx` (modifican si fijan la
  lista de items).

### F7 — Filtro en la barra · depende de: F2, F3 · R29, R34, R35

- `order-customer-filter.tsx` (nuevo), `order-table.tsx`, `order-list-section.tsx` e `index.ts`.
- `tests/unit/pedidos-ui/order-customer-filter.test.tsx` (nuevo):
  - elegir navega a la primera página y conserva estado, prioridad, fecha, orden y `q`;
  - elegir «Sin cliente» navega a `customer=none`; elegir después un cliente lo sustituye, y al
    revés (un solo valor);
  - limpiar quita solo `customer`;
  - viene precargado con la opción del servidor, o con «Sin cliente».
- `tests/unit/pedidos-ui/order-list-section.test.tsx` (modifica):
  - con `customer=<uuid>` en los parámetros, pide la opción **en paralelo** al listado;
  - con `null`, lista sin el filtro;
  - con `customer=none`, **no** llama a la action de opción y lista con `customerPresence`;
  - `canEditCustomer` sale de la misma comprobación que `canEditDistribution`.
- `tests/unit/pedidos-ui/order-table.test.tsx` (modifica): el filtro está en `toolbarActions`.
- `tests/unit/pedidos-ui/pedidos-viewport.test.tsx` (modifica si cubre la barra).

**Hecho cuando** (F4–F7): sus tests y los existentes de `tests/unit/pedidos-ui/**` están en verde, y
`clientes/scope.test.ts` (R38 de QC-154) sigue en verde, es decir, ningún archivo de `app/` nombra
lo prohibido.

---

## TI — Integración (secuencial; depende de: B6, F7)

**Agente:** `backend_dev` para las actions y `frontend_dev` para el E2E, en este orden.

- `order-actions.ts`: las tres actions llaman a `pedidos.*` de verdad, y `buildCreateCandidate` lee
  `customerId`.
- `order-customer-fixtures.ts`: **se borra**.
- `tests/unit/pedidos/order-actions-customer.test.ts` (nuevo): traducción de errores, propagación del
  actor y una sola lectura de sesión.
- `e2e/pedido-con-cliente.spec.ts` (nuevo), con los cuatro casos de R40:
  - crea su empresa, cliente y rol efímeros con el prefijo del worker, siguiendo el patrón de
    `e2e/inventario.spec.ts:478`, y los limpia en `afterAll`;
  - (c) lleva el pedido a `CANCELADO` con la cancelación existente y comprueba que el estado no
    cambia tras el cambio de cliente;
  - (d) entra con el rol efímero que tiene **solo** `pedidos.consultar`, comprueba que el menú no
    tiene «Cliente», e invoca la action directamente para ver `unauthorized`.

**Hecho cuando:**
- `pnpm exec playwright test e2e/pedido-con-cliente.spec.ts` está en verde en Chromium y WebKit;
- `e2e/pedidos.spec.ts` sigue en verde;
- el resultado está anotado en la bitácora.

---

## TZ — Cierre (depende de: TI)

- `progress/impl_QC-156-pedido-con-cliente.md`: el mapa **R1–R40 → test**, archivo y nombre del
  caso (`design.md > 10` como guía, contrastado con lo escrito de verdad).
- `./init.sh` **completo** en verde y la salida en la bitácora.
- `CHECKPOINTS.md` revisado: trazabilidad, permisos con E2E y migración con `down.sql`.

**Hecho cuando:** las tres cosas están hechas y no queda ningún stub (comprobado con `grep` de
«sin implementar» y de `order-customer-fixtures`).

---

## Archivos que toca la feature (para el cruce de F2.0)

**Nuevos**

- `db/migrations/20261006160000_orders_customer/{migration.sql,down.sql}`
- `lib/modules/clientes/domain/customer-catalog.ts`
- `lib/modules/clientes/adapters/driven/persistence/customer-catalog-prisma.ts`
- `lib/modules/pedidos/domain/order-customer.ts`, `set-order-customer.ts`,
  `search-order-customers.ts`, `get-order-customer-filter-option.ts`, `order-edit-change.ts`
- `lib/modules/pedidos/adapters/driving/order-customer-fixtures.ts` (temporal, se borra en TI)
- `app/(private)/pedidos/components/order-customer-label.ts`, `order-customer-picker.tsx`,
  `order-customer-dialog.tsx`, `order-customer-filter.tsx`
- `e2e/pedido-con-cliente.spec.ts`
- Tests:
  - `tests/unit/pedidos/order-customer-contract.test-d.ts`, `order-customer-write.test.ts`,
    `set-order-customer.test.ts`, `search-order-customers.test.ts`,
    `order-customer-authorization.test.ts`, `list-orders-customer.test.ts`,
    `order-customer-boundaries.test.ts`, `order-actions-customer.test.ts`,
    `order-customer.test.ts`, `order-edit-change.test.ts`, `order-customer-filter-where.test.ts`
  - `tests/unit/pedidos/schema/orders-customer-migration.test.ts`
  - `tests/unit/clientes/customer-catalog.test.ts`
  - `tests/unit/pedidos-ui/order-customer-picker.test.tsx`, `order-form-customer.test.tsx`,
    `order-customer-dialog.test.tsx`, `order-customer-filter.test.tsx`
  - `tests/integration/pedidos/orders-customer-constraints.int.test.ts`,
    `tests/integration/pedidos/order-customer.int.test.ts`
  - `tests/integration/clientes/customer-catalog.int.test.ts`

**Modificados**

- `db/schema.prisma` ⚠ (QC-209, QC-213)
- `lib/composition/index.ts` ⚠ (QC-209)
- `tests/integration/aislamiento.json` ⚠ (QC-209, QC-213)
- `tests/unit/identity/session-once-per-request-actions.test.ts` ⚠ (QC-209)
- `lib/modules/clientes/index.ts`; `lib/modules/clientes/adapters/driven/persistence/customer-prisma.ts`
  (solo `export`)
- `lib/modules/pedidos/index.ts`
- `lib/modules/pedidos/domain/`: `order-view.ts`, `errors.ts`, `order-input.ts`, `create-order.ts`,
  `update-order.ts`, `get-order.ts`, `list-orders.ts`, `order-queryable.ts`, `order-distribution.ts`
  (solo `export` de `sameDecimal`)
- `lib/modules/pedidos/ports/order-write-repository.ts`
- `lib/modules/pedidos/adapters/driven/persistence/order-prisma.ts`
- `lib/modules/pedidos/adapters/driving/order-actions.ts`
- `components/shared/async-autocomplete.tsx`
- `app/(private)/pedidos/components/`: `index.ts`, `order-columns.tsx`, `order-form.tsx`,
  `order-row-actions.tsx`, `order-sheet.tsx`, `order-table.tsx`, `order-list-section.tsx`,
  `order-list-params.ts`
- Tests:
  - `tests/unit/pedidos/schema/pedidos-schema.test.ts`
  - `tests/unit/clientes/scope.test.ts`
  - `tests/guards/guard-ambito-empresa-clientes.test.ts` (si su lista es cerrada)
  - `tests/unit/pedidos/`: `order-actions.test.ts`, `order-view.test.ts`, `order-input.test.ts`,
    `list-orders.test.ts`, `get-order.test.ts`, y los dobles de `OrderWriteRepository`
    (`setCustomerAlive`, mecánico, T0)
  - `tests/unit/async-autocomplete.test.tsx`
  - `tests/unit/pedidos-ui/`: `order-list-params.test.ts`, `order-columns.test.tsx`,
    `order-row-actions.test.tsx`, `order-list-section.test.tsx`, `order-table.test.tsx`, y los que
    construyen `OrderSummary` a mano (mecánico, T0)

⚠ = compartido con una ficha `fullstack` en curso. Detalle del riesgo y de cómo resolverlo en
`design.md > 13`. Ninguno de los dos toca `lib/modules/pedidos/`, `lib/modules/clientes/`,
`app/(private)/pedidos/` ni `components/shared/async-autocomplete.tsx`.
