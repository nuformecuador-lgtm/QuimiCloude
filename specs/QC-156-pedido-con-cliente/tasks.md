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
> - El spec tiene que estar **aprobado** (F1.4), y la aprobación tiene que responder **P5**: si
>   `clientes` puede publicar el servicio de lectura aditivo. **T0 no se empieza sin esa
>   respuesta.** P2, P4 y P6 tienen posición por defecto escrita y no bloquean. Si F1.4 las cambia,
>   el cambio cae en B4/B5/F3 (P2), en T0/B2/F2 (P4) o en B3/F5 (P6).
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

**Agente:** `backend_dev` · **R:** R37 (forma), R9 (lista de sesión), R36 (frontera)

Archivos:

- `lib/modules/clientes/domain/customer-catalog.ts` (nuevo): `CustomerRef`, `CustomerRefSearch` y
  `CustomerCatalog`, reales (`design.md > 1.1`).
- `lib/modules/clientes/adapters/driven/persistence/customer-catalog-prisma.ts` (nuevo, **stub**):
  `findCustomerRefsIncludingDeleted`, `findAliveCustomerRefById` y `searchCustomerRefs`. Ya declaran
  `scope: CustomerScope` y su cuerpo lanza «sin implementar».
- `lib/modules/clientes/index.ts` (modifica): reexporta los tres tipos, solo como tipos.
- `lib/modules/pedidos/domain/order-customer.ts` (nuevo): `OrderCustomer`,
  `OrderCustomerSearchPurpose`, `ORDER_CUSTOMER_FILTER_FIELD`, y `formatOrderCustomerName`,
  `toOrderCustomer` e `isCustomerIdShape`, **reales**.
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
  - `order-prisma.ts`: `toOrderRow` devuelve `customerId: null`.
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
  - Fixtures existentes que construyen `OrderRow` u `OrderSummary` en `tests/unit/pedidos/**` y
    `tests/unit/pedidos-ui/**`: `customerId: null` y `customer: null`. Mecánico; la lista la da
    `pnpm typecheck`.

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

### B3 [P] — Alta y edición con cliente · depende de: T0 · R10, R11, R12, R13

- `lib/modules/pedidos/domain/order-input.ts`: `customerId` en los dos esquemas, con el vacío como
  `null` y sin `.uuid()`.
- `create-order.ts` y `update-order.ts`: la comprobación de `design.md > 4.1` y el paso de
  `customerId` al puerto.
- `tests/unit/pedidos/order-customer-write.test.ts` (nuevo):
  - alta con un cliente vivo, sin cliente y con cliente vacío;
  - las cuatro causas de `customer_not_found`, y con el id sin forma **cero** llamadas al catálogo;
  - en la edición, el mismo cliente dado de baja se acepta y uno distinto dado de baja se rechaza;
  - en la edición, sin cliente queda `null`;
  - en todos los rechazos, ninguna escritura.
- `tests/unit/pedidos/order-input.test.ts` (modifica, si fija las claves del esquema).

**Hecho cuando:** los tests están en verde y `order-service.test.ts` y `update-order.test.ts`
siguen en verde.

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
  `purpose` desconocido falla cerrado, y la opción de filtro con un id sin forma devuelve `null` sin
  consultar.
- `tests/unit/pedidos/order-customer-authorization.test.ts` (nuevo): la matriz de
  `design.md > 10` (R6, R7, R8), con dobles que fallan si se les llama.

**Hecho cuando:** los tres tests están en verde.

### B5 [P] — Listado, ficha y filtro · depende de: T0 · R19–R26

- `order-queryable.ts`: `customerId: 'select'`.
- `list-orders.ts`: la poda de uuid y la resolución con una llamada por página.
- `get-order.ts`: `toOrderView` con clientes; `getOrder` hace una llamada.
- `tests/unit/pedidos/list-orders-customer.test.ts` (nuevo):
  - una llamada por página con ids sin repetir, y cero llamadas sin clientes;
  - el cliente dado de baja llega con `isDeleted`;
  - la poda y el log de valores sin forma;
  - la búsqueda no consulta clientes;
  - el orden por `customerId` se omite;
  - la salida no lleva datos personales.
- `tests/unit/pedidos/get-order.test.ts` y `list-orders.test.ts` (modifican: dependencia nueva y
  conteo de llamadas).
- `tests/unit/pedidos/order-view.test.ts:119` (modifica: `filterable` exacto con `customerId`).
- `tests/unit/pedidos/order-customer-boundaries.test.ts` (nuevo, R22): estático sobre
  `order-catalog.ts` y `order-catalog-prisma.ts`.

**Hecho cuando:** los tests están en verde.

### B6 — Adaptador, puerto y composición · depende de: B1, B2, B3, B4, B5 · R3, R15, R23

- `ports/order-write-repository.ts`: `setCustomerAlive`.
- `adapters/driven/persistence/order-prisma.ts`: el `select`, `toOrderRow`, `create`,
  `updateAlive`, el filtro `customerId` y `setCustomerAlive` (`design.md > 5`).
- `lib/composition/index.ts`: el bloque de `customerCatalog` al final y las dependencias y la
  fachada en el bloque de `pedidos` (`design.md > 6`). **Una sola tanda.**
- `tests/integration/pedidos/order-customer.int.test.ts` (nuevo):
  - `setCustomerAlive`, comparando la fila completa antes y después: solo cambian `customer_id`,
    `updated_by` y `updated_at`;
  - `reserved_at`, `ingredients_cost`, `packaging_cost`, `status`, `packed_by` y `finished_at` no
    cambian;
  - las filas de reserva, `inventory_movements` y `order_assignments` del pedido no cambian;
  - el filtro por cliente en base: total, combinación con estado y con la búsqueda por receta, y
    otra empresa da 0.

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

### F2 — Etiqueta y selector · depende de: F1 · R20, R27, R28, R35

- `app/(private)/pedidos/components/order-customer-label.ts` y `order-customer-picker.tsx` (nuevos).
- `app/(private)/pedidos/components/index.ts`: reexporta los dos.
- `tests/unit/pedidos-ui/order-customer-picker.test.tsx` (nuevo):
  - `fetchPage` llama a la action con el `purpose` que recibe;
  - el oculto lleva el **id** y no la etiqueta;
  - muestra el sufijo «(eliminado)»;
  - el objetivo táctil.

**Hecho cuando:** el test está en verde.

### F3 [P] — Parámetro de la dirección · depende de: T0 · R24, R34

- `order-list-params.ts`: `CUSTOMER_PARAM` y `CUSTOMER_COLUMN_ID`, con lectura y escritura.
- `tests/unit/pedidos-ui/order-list-params.test.ts` (modifica): un uuid válido entra, uno inválido o
  vacío no, el parámetro repetido toma el primero, y `parse(build(p))` devuelve `p` con el filtro.

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
  - limpiar quita solo `customer`;
  - viene precargado con la opción del servidor.
- `tests/unit/pedidos-ui/order-list-section.test.tsx` (modifica):
  - con `customer` en los parámetros, pide la opción **en paralelo** al listado;
  - con `null`, lista sin el filtro;
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
  `search-order-customers.ts`, `get-order-customer-filter-option.ts`
- `lib/modules/pedidos/adapters/driving/order-customer-fixtures.ts` (temporal, se borra en TI)
- `app/(private)/pedidos/components/order-customer-label.ts`, `order-customer-picker.tsx`,
  `order-customer-dialog.tsx`, `order-customer-filter.tsx`
- `e2e/pedido-con-cliente.spec.ts`
- Tests:
  - `tests/unit/pedidos/order-customer-contract.test-d.ts`, `order-customer-write.test.ts`,
    `set-order-customer.test.ts`, `search-order-customers.test.ts`,
    `order-customer-authorization.test.ts`, `list-orders-customer.test.ts`,
    `order-customer-boundaries.test.ts`, `order-actions-customer.test.ts`
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
  `update-order.ts`, `get-order.ts`, `list-orders.ts`, `order-queryable.ts`
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
    `list-orders.test.ts`, `get-order.test.ts`
  - `tests/unit/async-autocomplete.test.tsx`
  - `tests/unit/pedidos-ui/`: `order-list-params.test.ts`, `order-columns.test.tsx`,
    `order-row-actions.test.tsx`, `order-list-section.test.tsx`, `order-table.test.tsx`, y los que
    construyen `OrderSummary` a mano (mecánico, T0)

⚠ = compartido con una ficha `fullstack` en curso. Detalle del riesgo y de cómo resolverlo en
`design.md > 13`. Ninguno de los dos toca `lib/modules/pedidos/`, `lib/modules/clientes/`,
`app/(private)/pedidos/` ni `components/shared/async-autocomplete.tsx`.
