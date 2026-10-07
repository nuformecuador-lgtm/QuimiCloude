# QC-156 — bitacora de implementacion

## Estado (implementer, 2026-10-06)

- Entorno: `pnpm install --frozen-lockfile` en el worktree (sin deps nuevas). Base propia
  `QuimiCloude_QC156` = copia de `qct_tpl_f12f312b3e9e` (71 migraciones, sembrada); `.env` del worktree
  apunta a ella (DATABASE_URL y DIRECT_URL); original en `.env.bak-QuimiCloude`. Al cerrar: borrar la
  base y restaurar `.env`.
- T0: hecha, commit `87a67deb` (incluye la Enmienda F2.1 del spec, design § 9: renombres por la
  guardia R40 — clave de deps `customerCatalog`, archivo `search-order-customer-options.ts` —, sin
  cambio de comportamiento; decisión humana opción b).
- `--rapido` tras T0: 5 rojos / 7 casos, todos en archivos de `tests/baseline-rojos.json`
  (`unidades-viewport`, `usuarios-viewport`, `product-page`, `recipe-page`, `pantallas-exigen-permiso`).
- Tanda 1 (B1–B5, F1–F7): implementada, **sin commit**, bloqueada por preguntas (ver informe al leader):
  typecheck rojo (falta `customerCatalog` en las deps de tests existentes) y guardias que la migración y
  el picker hacen saltar (`clientes/scope.test.ts:479`, `customers-migration.int.test.ts`,
  `guard-identificador-de-request` R19 y R17).

### Decisiones aceptadas por el humano (2026-10-06)

- Las actions stub de T0 leen `search`/`page` sin zod; la validación es del caso de uso (B4).
- `CustomerNotFoundError` se lanza sin diagnóstico.
- `tests/unit/pedidos/module-contract.test.ts` admite temporalmente `order-customer-fixtures.ts` en
  `driving/`; se quita en TI al borrar el archivo.

### Decisiones del leader sobre la tanda 1 (2026-10-06)

1. Doble `customerCatalog` añadido en los tests unit que construyen `Create/Update/Get/ListOrdersDeps`
   (incluidos `order-service.test.ts` y `update-order.test.ts`: cambio mecánico que obliga design
   § 4.1/§ 4.4; el «sin editarlos» de B3 se refería a su lógica). Campo **no** opcional. Integración y
   `lib/composition/index.ts`, en B6.
2. `tests/unit/clientes/scope.test.ts:479`: `20261006160000_orders_customer` entra en la lista esperada.
3. `tests/integration/clientes/customers-migration.int.test.ts`: dentro de la transacción se aplican
   primero los `down.sql` posteriores que referencian `customers` y luego se reponen (precedente
   `proveedores/company-scope.int.test.ts:354`). El `down.sql` de customers no cambia.
4. `guard-identificador-de-request`: la migración entra en `MIGRACIONES_ESPERADAS` (precedente QC-213).
5. `guard-identificador-de-request`: `order-customer-picker.tsx` entra en `SUPERFICIES_QUE_APLANAN` con el
   motivo de `recipe-picker`/`product-picker`.
6. Si `getOrderCustomerFilterOptionAction` devuelve **error**, se trata como `null`: se descarta el filtro
   y se lista sin él.
7. El picker replica `recipe-picker`: editar el texto tras elegir un cliente retira el id oculto.
   Implementación: prop opcional `keepChoiceWhileTyping` (por defecto `false`); solo el filtro la pasa,
   para que escribir busque sin navegar. En el diálogo, editar el texto y Guardar envía
   `customerId: null` (igual que vaciar el campo; el cliente es opcional).
8. Deuda menor (registrada por el leader): con el filtro precargado con un cliente dado de baja, abrir el
   campo busca «Nombre (eliminado)», que no casa hasta borrar el texto.
9. Deuda preexistente, fuera de alcance: con un filtro que deja cero filas y sin término se pinta
   `OrderListEmpty` sin la barra y no se puede limpiar el filtro desde la pantalla.

Las decisiones fuera del spec de B1–B5 y F (las del informe de cada pista) quedan aceptadas por el
leader, pendientes de revisión del reviewer.

## B1 — Esquema y migracion · B2 — Servicio de clientes real (backend_dev, 2026-10-06)

### Archivos

- `db/schema.prisma` (mod): `Order.customerId` (`String?`, `@map("customer_id")`, `@db.Uuid`, sin
  `@relation`), `@@index([companyId, customerId], map: "orders_company_id_customer_id_idx")` y
  `customerId` en la cabecera de escalares sin `@relation`.
- `db/migrations/20261006160000_orders_customer/migration.sql` y `down.sql` (nuevos, a mano).
- `lib/modules/clientes/adapters/driven/persistence/customer-catalog-prisma.ts` (stub -> real).
- `lib/modules/clientes/adapters/driven/persistence/customer-prisma.ts` (mod): `export` de
  `searchCondition` y la cabecera, que decia que era el unico archivo con `@prisma/client`.
- `tests/unit/pedidos/schema/pedidos-schema.test.ts` (mod): caso :229 reescrito a R5;
  `ORDER_COLUMNS` + `customerId`; lista cerrada de `@@index` + el indice nuevo.
- `tests/unit/pedidos/schema/orders-customer-migration.test.ts` (nuevo).
- `tests/integration/pedidos/orders-customer-constraints.int.test.ts` (nuevo, `transaccion`).
- `tests/unit/clientes/customer-catalog.test.ts` (nuevo).
- `tests/integration/clientes/customer-catalog.int.test.ts` (nuevo, `commit`).
- `tests/integration/aislamiento.json` (mod): las dos entradas.
- `tests/guards/guard-ambito-empresa-clientes.test.ts`: **sin cambios**, su lista de archivos no es
  cerrada (`readdirSync`) y ya barre `customer-catalog-prisma.ts`.

### Timestamp

`20261006160000` > `20261006140000` (ultima de `db/migrations`, de `origin/dev` y de
`origin/feature/QC-213-*`) > `20261006120000` (QC-209). Sin cambio.

### Migracion sobre `QuimiCloude_QC156`

```
pnpm run db:migrate
  migrations/
    └─ 20261006160000_orders_customer/
      └─ migration.sql
  All migrations have been successfully applied.
pnpm run db:rollback
  db:rollback: aplicando down.sql de 20261006160000_orders_customer y borrando su fila de _prisma_migrations
  db:rollback: 20261006160000_orders_customer revertida.
pnpm run db:migrate
  migrations/
    └─ 20261006160000_orders_customer/
      └─ migration.sql
  All migrations have been successfully applied.
```

### R -> test

| R | Test |
| --- | --- |
| R1 | `pedidos-schema.test.ts` (ORDER_COLUMNS, caso R5) · `orders-customer-migration.test.ts` «R1, R2: anade customer_id UUID anulable…» · `orders-customer-constraints.int.test.ts` «R1, R3: un pedido sin cliente (NULL) es valido…» |
| R2 | `orders-customer-migration.test.ts` «R1, R2…», «R2, R4: el UP es exactamente…» · int «R2: los pedidos previos a la migracion quedan sin cliente y ninguna otra columna cambia» |
| R3 | `orders-customer-migration.test.ts` «R3: la FK es COMPUESTA…», «R3: crea el indice completo…» · int «R3: un pedido con cliente de otra empresa da 23503…» |
| R4 | `orders-customer-migration.test.ts` «R4: el timestamp…», «R4: existe y revierte…» · int «R4: aplicar el DOWN quita columna, indice y FK; volver a subir deja el esquema igual» |
| R5 | `pedidos-schema.test.ts` «QC-156 R5: Order declara una sola referencia a cliente…» |
| R27 | `customer-catalog.test.ts` (includeDeleted, orden, searchCondition, 10/25) · `customer-catalog.int.test.ts` (bajas, empresa, orden, acentos, paginas) |
| R28 | `customer-catalog.test.ts` (`deletedAt: null`, `findAliveCustomerRefById`) · `customer-catalog.int.test.ts` |
| R37 | `customer-catalog.test.ts` (forma de `CustomerRef`, `select` minimo, lista vacia sin consulta) · `customer-catalog.int.test.ts` (solo cuatro claves) |

### Verificacion

- `pnpm exec vitest run tests/unit/pedidos/schema/`: 12 archivos, 171 casos, verde.
- `pnpm exec vitest run tests/unit/clientes/customer-catalog.test.ts tests/guards/guard-ambito-empresa-clientes.test.ts`: 30 casos, verde.
- `pnpm exec vitest run --project integration tests/integration/pedidos/orders-customer-constraints.int.test.ts`: 4/4.
- `pnpm exec vitest run --project integration tests/integration/clientes/customer-catalog.int.test.ts`: 5/5.
- `pnpm run lint`: 0 errores, 8 warnings preexistentes en archivos ajenos.
- `pnpm run typecheck`: rojo **solo** en archivos ajenos en curso (`lib/composition/index.ts`, tests de
  `pedidos` que construyen `*Deps` sin `customerCatalog`: trabajo de B3–B5/B6). Cero errores en
  archivos de B1/B2.

### Rojos que B1 provoca y el spec no previo (pendiente de decision)

1. `tests/unit/clientes/scope.test.ts:479` «solo dos migraciones del repo tocan la tabla customers»:
   la nueva migracion nombra `customers` en el `REFERENCES` de la FK.
2. `tests/integration/clientes/customers-migration.int.test.ts` (4 casos: R18 x2, R23, R24): su DOWN
   hace `DROP TABLE "customers"` sin CASCADE y ahora falla con `2BP01` por
   `orders_company_id_customer_id_fkey`. Es el comportamiento que ese `down.sql` declara querer
   («revertir esta sin revertir aquella debe fallar ruidosamente»).

Ninguno se ha editado: la instruccion era dejar los tests de `clientes` sin tocar.

Veredicto: B1 y B2 implementados y en verde en sus tests; quedan dos tests de `clientes` rojos por la FK, a decidir.

## B6 — Adaptador y composicion (backend_dev, 2026-10-06)

### Archivos

- `lib/modules/pedidos/adapters/driven/persistence/order-prisma.ts`: `customerId` en `ORDER_SELECT`,
  `toOrderRow`, `INSERT` de `create` y `updateAliveOrder`; `orderCustomerFilterWhere` (exportada) y
  su uso en `buildOrderWhere` (los dos campos salen de `query.filters` antes del `map`, un solo
  termino al final del `AND`); `setAliveOrderCustomer` real (`updateMany` con ambito y
  `deletedAt: null`, `data` = `customerId`, `updatedBy`, `updatedAt`).
- `lib/composition/index.ts`: imports de `customer-catalog-prisma` y de las tres factorias;
  `buildCustomerCatalog()` (declaracion de funcion) al final del archivo y
  `const customerCatalog = buildCustomerCatalog()` justo antes de `pedidos`; `customerCatalog` en
  create/get/list/update; `setOrderCustomer`, `searchOrderCustomers`, `getOrderCustomerFilterOption`
  en la fachada.
- `tests/unit/pedidos/order-customer-filter-where.test.ts` (nuevo).
- `tests/integration/pedidos/order-customer.int.test.ts` (nuevo) y su entrada `commit` en
  `tests/integration/aislamiento.json`.
- `customerCatalog` en las deps de 14 tests de `tests/integration/pedidos/` y de
  `documentos/formula-import.int.test.ts`: catalogo real (`customer-catalog-prisma`) en los que
  cablean adaptadores reales; en `order-crud` (dobles ligados a `tx`), un doble que falla si se le
  llama.

### Decision no trivial

- La composicion no puede declarar `const customerCatalog` al final del archivo: `pedidos` se evalua
  antes y leeria la constante en zona muerta temporal. Por eso el bloque final es una declaracion de
  funcion (se eleva) y la unica instancia se crea justo encima de `pedidos`.

### R -> test (B6)

| R | Test |
| --- | --- |
| R13 | `order-customer.int.test.ts` «R13: no recalcula ni toca lo apartado; solo cambian customer_id, updated_by y updated_at» |
| R14, R15 | int «R14, R15: en un pedido entregado y empacado, solo cambian customer_id, updated_by y updated_at; los libros no cambian» · «R15: con el ambito de otra empresa no escribe nada y responde not_found» |
| R19, R20 | int «R19, R20: la pagina trae el nombre del cliente, tambien si se dio de baja» |
| R23, R24 | `order-customer-filter-where.test.ts` (7 casos) · int «R23, R24: por cliente, «sin cliente» y los dos a la vez, sin salir de la empresa» |

### Verificacion

- `pnpm run typecheck`: 0 errores.
- `pnpm run lint`: 0 errores, 8 warnings preexistentes en archivos ajenos.
- `vitest run tests/unit/pedidos tests/unit/clientes/scope.test.ts`: 108 archivos, 1953 pasan, 3 skipped.
- `vitest run guard`: 51 archivos, 694 pasan, 11 skipped.
- `--project integration order-customer.int.test.ts`: 5/5.
- `--project integration` sobre los 15 archivos de integracion tocados: **31 rojos / 180** en 5 archivos
  (`order-reservation`, `order-reservation-concurrency`, `order-expiry`, `order-ingredients-cost`,
  `order-cost-quote`). Causa unica: pasan un `NewOrder` con `customerId: null` (cambio de T0) como
  ENTRADA de `createOrder`/`updateOrder`, y `createOrderSchema.customerId` (B3,
  `z.string().optional()`) rechaza `null` -> `ValidationError`. Comprobado: con `.nullish()` en el
  esquema pasan los 180 (experimento revertido). Pendiente de decision del leader.

Veredicto: B6 implementado y en verde salvo 31 casos de integracion rojos por el esquema de entrada de B3 ante `customerId: null`, a decidir.

### Decisión del implementer en B6 (2026-10-06)

31 casos de integración (`order-reservation`, `order-reservation-concurrency`, `order-expiry`,
`order-ingredients-cost`, `order-cost-quote`) mandaban `customerId: null` como **entrada** a
`createOrder`/`updateOrder`, por el cambio mecánico de T0 sobre `NewOrder`. Se mantiene design § 4.1
(`customerId: z.string().optional()`, sin aceptar `null`) y se corrigen las entradas de test
(`Omit<NewOrder, 'customerId'>`); sin cambio de lógica ni de aserciones. Resultado: 16/16 archivos,
185/185 casos de integración en verde. Decisión aceptada por el leader.

`./init.sh --rapido` tras B6 (tip `840b9bdc`): typecheck y lint en verde; 365 archivos de test, 360
pasan; 5667 casos pasan, 7 fallan, 2 omitidos. Los 7 rojos (5 archivos) están todos en
`tests/baseline-rojos.json`: `configuracion-ui/unidades-viewport` (2), `configuracion-ui/usuarios-viewport`
(2), `navegacion/pantallas-exigen-permiso` ('/pedidos'), `inventario/product-page` (R18),
`recetas-ui/recipe-page` (R21). El modo rápido no consulta esa lista, así que el exit es 1.

## Mapa consolidado R1–R40 → test (implementer, TZ)

Construido a partir de los nombres reales de los casos **añadidos o reescritos por esta feature**
(`git diff de33dd8e..HEAD -- tests e2e`, casos `it/test/describe` que citan el R), y contrastado con
`design.md > 10`. El número entre paréntesis es la cantidad de casos que citan ese R en el archivo. Las
rutas son relativas a `tests/`, salvo `e2e/`.

| R | Tests |
| --- | --- |
| R1 | `unit/pedidos/schema/orders-customer-migration.test.ts` (2) · `integration/pedidos/orders-customer-constraints.int.test.ts` (1) · `unit/pedidos/schema/pedidos-schema.test.ts` (`ORDER_COLUMNS`) |
| R2 | `orders-customer-migration.test.ts` (3) · `orders-customer-constraints.int.test.ts` (1) |
| R3 | `orders-customer-migration.test.ts` (3) · `orders-customer-constraints.int.test.ts` (2: 23503 con otra empresa) |
| R4 | `orders-customer-migration.test.ts` (4) · `orders-customer-constraints.int.test.ts` (1: DOWN y UP) · `integration/clientes/customers-migration.int.test.ts` (baja de las posteriores) |
| R5 | `unit/pedidos/schema/pedidos-schema.test.ts` «QC-156 R5: Order declara una sola referencia a cliente…» |
| R6 | `unit/pedidos/order-customer-authorization.test.ts` · `order-actions-customer.test.ts` · `search-order-customer-options.test.ts` · `e2e/pedido-con-cliente.spec.ts` R40(d) |
| R7 | `order-customer-authorization.test.ts` · `order-actions-customer.test.ts` |
| R8 | `order-customer-authorization.test.ts` (3) · `unit/pedidos-ui/order-columns.test.tsx` |
| R9 | `unit/pedidos/order-actions-customer.test.ts` (8: una lectura de sesión, actor, sin permiso repetido) · `unit/identity/session-once-per-request-actions.test.ts` (tres filas) |
| R10 | `order-customer-write.test.ts` (5) · `order-actions-customer.test.ts` (2) · `order-customer.test.ts` |
| R11 | `order-customer-write.test.ts` (7: cuatro causas, cero llamadas sin forma de uuid) · `order-customer.test.ts` (3) · `set-order-customer.test.ts` (2) · `order-actions-customer.test.ts` (2) |
| R12 | `order-customer-write.test.ts` (2) · `set-order-customer.test.ts` (2) |
| R13 | `order-edit-change.test.ts` (13) · `order-customer-write.test.ts` (11: atajo con dobles que fallan) · `integration/pedidos/order-customer.int.test.ts` «R13: no recalcula ni toca lo apartado…» · `order-actions-customer.test.ts` |
| R14 | `set-order-customer.test.ts` (siete estados) · `order-customer.int.test.ts` · `pedidos-ui/order-customer-dialog.test.tsx` (3) · `e2e` R40(c) |
| R15 | `set-order-customer.test.ts` (3) · `order-customer-write.test.ts` · `order-customer.int.test.ts` (2) |
| R16 | `set-order-customer.test.ts` (4) |
| R17 | `set-order-customer.test.ts` (3) |
| R18 | `set-order-customer.test.ts` (6: tres causas de `order_not_found`) · `order-actions-customer.test.ts` |
| R19 | `list-orders-customer.test.ts` (4) · `get-order.test.ts` (2) · `order-customer.int.test.ts` · `order-customer.test.ts` |
| R20 | `list-orders-customer.test.ts` (2) · `get-order.test.ts` · `order-customer.int.test.ts` · `pedidos-ui/order-columns.test.tsx` (2) · `pedidos-ui/order-customer-picker.test.tsx` |
| R21 | `list-orders-customer.test.ts` (4) · `get-order.test.ts` |
| R22 | `unit/pedidos/order-customer-boundaries.test.ts` (4) |
| R23 | `order-customer-filter-where.test.ts` (3) · `list-orders-customer.test.ts` (2) · `order-view.test.ts` · `order-customer.int.test.ts` · `e2e` R40(b) |
| R24 | `order-customer-filter-where.test.ts` (7) · `list-orders-customer.test.ts` (5) · `order-view.test.ts` · `order-customer.int.test.ts` · `pedidos-ui/order-list-params.test.ts` |
| R25 | `list-orders-customer.test.ts` (2) |
| R26 | `list-orders-customer.test.ts` (2) · `order-view.test.ts` · `pedidos-ui/order-columns.test.tsx` |
| R27 | `search-order-customer-options.test.ts` (5) · `unit/clientes/customer-catalog.test.ts` (3) · `integration/clientes/customer-catalog.int.test.ts` (3) · `pedidos-ui/order-customer-filter.test.tsx` · `order-customer-picker.test.tsx` · `order-actions-customer.test.ts` |
| R28 | `customer-catalog.test.ts` (5) · `customer-catalog.int.test.ts` (3) · `search-order-customer-options.test.ts` (2) · `order-customer-picker.test.tsx` |
| R29 | `search-order-customer-options.test.ts` (4) · `pedidos-ui/order-list-section.test.tsx` (3) · `order-customer-filter.test.tsx` (2) · `order-table.test.tsx` · `order-actions-customer.test.ts` |
| R30 | `pedidos-ui/order-columns.test.tsx` (4) · `e2e` R40(a) |
| R31 | `pedidos-ui/order-form-customer.test.tsx` (6) · `order-customer-picker.test.tsx` (4) · `order-customer-dialog.test.tsx` · `unit/async-autocomplete.test.tsx` (2) |
| R32 | `pedidos-ui/order-row-actions.test.tsx` (4: siete estados × `canEditCustomer`) · `order-customer-dialog.test.tsx` · `order-list-section.test.tsx` · `e2e` R40(c), R40(d) |
| R33 | `pedidos-ui/order-customer-dialog.test.tsx` (2) · `e2e` R40(c) |
| R34 | `order-list-params.test.ts` (5) · `order-customer-picker.test.tsx` (5) · `order-customer-filter.test.tsx` (5) · `order-table.test.tsx` · `e2e` R40(b) |
| R35 | `order-customer-dialog.test.tsx` · `order-customer-filter.test.tsx` · `order-customer-picker.test.tsx` · `order-columns.test.tsx` · `pedidos-viewport.test.tsx` (columnas 11 → 12) |
| R36 | `unit/clientes/scope.test.ts` (3: R40 de QC-154 reescrito, barrel no dispara, ruta profunda sí) · `guards/guard-arquitectura-modulos.test.ts` |
| R37 | `unit/clientes/customer-catalog.test.ts` (4) · `integration/clientes/customer-catalog.int.test.ts` · `unit/pedidos/order-customer-contract.test-d.ts` (forma de `CustomerRef`) · tests de `clientes` de QC-153/154/155 en verde |
| R38 | `guards/guard-catalogo-de-errores.test.ts` + `unit/errores/catalogo.test.ts` (sin cambios, en verde): guardia, sin caso nuevo, según design § 10 |
| R39 | `guards/guard-dependencias-aprobadas.test.ts` (sin cambios, en verde; `package.json` y `pnpm-lock.yaml` sin diff frente a `de33dd8e`): guardia, según design § 10 |
| R40 | `e2e/pedido-con-cliente.spec.ts`: R40(a) alta con cliente y columna; R40(b) filtro; R40(c) cambio en `CANCELADO` sin cambio de estado; R40(d) solo `pedidos.consultar`: sin «Cliente» y `unauthorized` en el servidor |

## E2E (TI, 2026-10-06, contra `QuimiCloude_QC156`, puerto 3117)

`pnpm exec playwright test e2e/pedido-con-cliente.spec.ts`: **8 passed (1.2m)**.

| Caso | Chromium | WebKit |
| --- | --- | --- |
| R40(a) crea un pedido con cliente y ve su nombre en la columna «Cliente» (R30) | 49.0s | 1.0m |
| R40(b) filtra la lista por el cliente y ve solo sus pedidos (R23, R34) | 41.5s | 46.4s |
| R40(c) cambia el cliente de un pedido CANCELADO sin que cambie su estado (R14, R32, R33) | 45.0s | 23.1s |
| R40(d) con solo pedidos.consultar no ve «Cliente» y el servidor rechaza con unauthorized (R6, R32) | 34.0s | 10.7s |

Primera corrida: 6/8 en rojo por un selector del test (`input:not([type="hidden"])` también casaba con
el input oculto de base-ui). Se cambió a `getByRole('combobox')`, sin tocar producción.

`pnpm exec playwright test e2e/pedidos.spec.ts` (regresión): **4 passed (35.3s)**.

Supuestos del E2E: no había ningún E2E que llamara a una Server Action directamente. R40(d) saca el id de
`setOrderCustomerAction` del JS servido, hace `POST` con la cabecera `Next-Action` y comprueba
`"code":"unauthorized"` y que la base no cambió. Los datos efímeros llevan el prefijo del worker y se
crean en `beforeAll` (empresa, admin, rol `qc156_e2e_<RUN_ID>_rol_consulta` con solo
`pedidos.consultar`, receta, clientes, pedidos); se borran en `afterAll`.

## CHECKPOINTS (revisión del implementer; el veredicto es del reviewer)

- Especificación: existen los tres archivos; tasks T0, B1–B6, F1–F7 y TI marcadas `[x]`. TZ queda
  **parcial** hasta el `./init.sh` completo de F2.4.
- Trazabilidad: R1–R40 mapeados arriba; R38 y R39 por guardia, como dice design § 10.
- Calidad: typecheck y lint en verde; E2E del flujo de permisos (R40 d) en Chromium y WebKit.
  `pnpm test` completo: pendiente de F2.4.
- Dependencias: ninguna nueva.
- Datos: `orders.customer_id` vive en una tabla que ya tiene `company_id`, con FK compuesta
  `(company_id, customer_id)`. La migración tiene `down.sql`; `db:migrate` → `db:rollback` → `db:migrate`
  limpio sobre `QuimiCloude_QC156` (B1). Sin cliente de Supabase ni secretos.
- Módulos: `pedidos` importa `clientes` solo por el barrel (guardia R40 de `clientes/scope.test.ts`);
  la composición cablea `customerCatalog`; `guard-arquitectura-modulos` en verde.
- Stubs: `grep "sin implementar|order-customer-fixtures"` sobre `lib app tests e2e` da 0 resultados.
- Pendiente fuera de esta fase: `progress/review_*.md`, `history.md`, desmontar el worktree, borrar
  `QuimiCloude_QC156` y restaurar `.env` desde `.env.bak-QuimiCloude` al cerrar la feature.
