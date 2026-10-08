# QC-156 — pedido-con-cliente · review (F2.2, vuelta 1)

> Reviewer, 2026-10-06. Diff `de33dd8e..32442525` (131 archivos; 41 de producción). Spec aprobado con
> la Enmienda F2.1. El grafo no se consultó (índice posiblemente desactualizado): se trabajó con
> Grep/Read sobre el worktree.

## Veredicto: **OK**

0 bloqueantes · 5 menores.

## Verificación ejecutada (por el reviewer, no copiada de la bitácora)

| Comando | Resultado |
| --- | --- |
| `pnpm run typecheck` | verde (0 errores) |
| `pnpm run lint` | 0 errores, 8 warnings preexistentes en archivos ajenos |
| `vitest run` de los 70 tests unit/ui que toca el diff + `tests/guards` | **98 archivos, 1928 pasan, 5 omitidos, 0 rojos** |
| `vitest related --run` (41 archivos de producción) `--project node --project ui` | 300 archivos; 7 rojos en 5 archivos, **todos en `tests/baseline-rojos.json`** (`unidades-viewport` ×2, `usuarios-viewport` ×2, `pantallas-exigen-permiso` '/pedidos', `product-page` R18, `recipe-page` R21). `pantallas-exigen-permiso` falla con el mismo `TypeError … reading 'status'` en `loadFormCatalogs` de `page.tsx` que describe su entrada del baseline: no lo provoca QC-156. |
| `vitest run --project integration` de los 28 `.int` que toca el diff (pedidos, clientes, documentos), contra `QuimiCloude_QC156` | **28 archivos, 286 casos, verde**. Incluye `qc170-distribution-concurrency.int.test.ts` en verde dentro de una corrida de 28 archivos. |

**Timeouts de `qc170-distribution-concurrency`:** confirmo que son por carga. En mi corrida pasa en
verde, la feature solo añade `customerCatalog` a sus deps (diff de 9 líneas, sin cambio de lógica) y
los dos rojos del `--rapido` eran `Test timed out in 20000ms`, no una aserción. Lo vuelve a medir el
`./init.sh` completo de F2.4.

E2E: no lo corrí (lo corre el leader en F2.4). Leí `e2e/pedido-con-cliente.spec.ts`: tiene los cuatro
casos R40(a)–(d), y la bitácora registra 8/8 en Chromium y WebKit.

## Checklist

### 1. Trazabilidad — PASA
Cada R1–R40 tiene al menos un caso que existe, corre en verde y comprueba el requisito. El mapa
verificado está al final.

### 2. Tasks — PASA (con la nota m1)
T0, B1–B6, F1–F7 y TI están en `[x]`. TZ está en `[ ] parcial` porque le falta el `./init.sh`
completo, que según AGENTS.md (paso 10) corre en F2.4. El resto de TZ ya está hecho: mapa R→test,
CHECKPOINTS y `grep` de stubs. Yo también corrí el `grep` de «sin implementar» y de
`order-customer-fixtures` sobre `lib app tests e2e`, y da 0 resultados.

### 3. CHECKPOINTS
- [x] Especificación: los tres archivos existen; design § 11 trae A1–A9 descartadas.
- [~] Tasks `[x]`: todas salvo la parte de TZ que es F2.4 (m1).
- [x] El mapa R→test está en `progress/impl_…md`, y lo verifiqué aquí.
- [x] typecheck y lint en verde. `pnpm test` completo: pendiente de F2.4 (no me toca).
- [x] Flujo crítico (permisos): hay E2E R40(d), con rechazo del servidor y la base sin cambios.
- [x] UI multiplataforma: ver punto 6.
- [x] Sin dependencias nuevas: `package.json` y el lockfile no cambian.
- [x] Empresa: la columna vive en `orders`, que ya tiene `company_id`. FK compuesta `(company_id, customer_id) → customers(company_id, id)`.
- [x] Permisos validados en el service, con test (`order-customer-authorization.test.ts`, matriz de 10 operaciones × 6 actores, con dobles que explotan si se les llama).
- [x] RLS: no hay tabla nueva; `orders` ya la tiene activada y forzada.
- [x] El acceso a datos va solo por Prisma, en los adaptadores driven.
- [x] La migración es reversible: `down.sql` es el inverso exacto y sin `IF EXISTS`; el test int R4 baja y vuelve a subir.
- [x] Sin secretos. Sin webhooks.
- [x] Hexagonal: `domain/` importa de `clientes` solo **tipos** del barrel; la composición cablea el driven de `clientes`; las actions no instancian adaptadores; ningún `'use server'` se reexporta. `guard-arquitectura-modulos` en verde.
- [x] La lógica está en `domain/`. Las actions solo hacen `currentActor` → caso de uso → `toErrorState`.
- [x] Server Actions, no API routes; la página valida en el servidor.
- [x] Nada dependiente del entorno quedó fijo en el código.

### 4. Verificación ejecutable — PASA (tabla de arriba)

### 5. Calidad y seguridad — PASA
- **P6 / R13 (atajo de la edición).** `update-order.ts` decide **después** de `assertTransition` y
  **antes** de leer recetas o calcular el coste. La condición exige que el cliente cambie
  (`data.customerId !== row.customerId`) y que `isCustomerOnlyEdit(...)` dé `true`. Así, «mismo
  cliente y nada más cambia» va por el camino de siempre, como pide R13. `isCustomerOnlyEdit`
  (`order-edit-change.ts`) compara cada dato así:
  - receta efectiva: `recipeVersionId ?? recipeId`;
  - cantidad: `sameDecimal`, con `bigint` escalado sobre el `parseDecimal` existente; no hay un
    tercer parser ni coma flotante;
  - prioridad y unidad: igualdad;
  - una fila guardada sin unidad nunca es igual;
  - reparto: misma longitud y emparejado uno a uno, sin importar el orden. Una línea con envase
    compara envase y número de envases; una línea antigua compara `packagingProductId === null`,
    presentación y número de envases.

  `confirmBlocked` no se compara. Todo coincide con la definición «igual al guardado» de
  requirements y con la tabla de design § 4.1.1. El atajo solo llama a `requireAliveCustomer` y a
  `setCustomerAlive`. Los tests unitarios usan catálogos que explotan si se les llama. El int R13
  comprueba que la fila entera queda igual salvo `customer_id`, `updated_by` y `updated_at`, que el
  `ingredients_cost` fijado a mano sobrevive y que los libros no cambian.
- **R14/R15/R16/R17/R18.**
  - Dependencias: `setOrderCustomer` no recibe catálogos de recetas, inventario ni unidades.
  - Orden: el permiso va primero, luego zod (`z.object`, que descarta las claves de más), luego
    `findAliveById(scope)`. No pasa por `assertTransition`. Con el mismo cliente sale sin
    escribir.
  - Escritura: `setCustomerAlive` hace `updateMany` con el ámbito y `deletedAt: null`, y su `data`
    lleva solo `customerId`, `updatedBy` y `updatedAt`.
  - Tests: los siete estados con `it.each`. En el int, un pedido ENTREGADO con `packed_by`,
    `finished_at` y responsables queda igual columna por columna, y los libros de reservas,
    movimientos y asignaciones no cambian.
- **Autorización.**
  - `pedidos.modificar` en alta y edición con cliente, en el cambio y en las opciones `assign`.
  - `pedidos.consultar` en el listado (con y sin filtro), la ficha, las opciones `filter` y la
    opción del filtro.
  - Un `purpose` desconocido exige `modificar` y falla cerrado.
  - Ninguna operación pide `clientes.*` (R8).
  - Las tres actions nuevas leen la sesión una sola vez y no repiten el permiso
    (`order-actions-customer.test.ts` y `session-once-per-request-actions.test.ts`).
- **Aislamiento por empresa.** En la base, la FK compuesta da `23503` con un cliente de otra
  empresa (test int R3). En el listado, `orderCustomerFilterWhere` mete el `OR` dentro de su propio
  término del `AND`, detrás del ámbito. El test int lo prueba: los pedidos sin cliente de la empresa
  B no salen en el «sin cliente» de A, y el filtro por un cliente de A, pedido desde B, da 0.
  Además, los tres métodos de `customer-catalog-prisma` aplican `customerCompanyScope(scope)` y la
  empresa siempre sale de `actor.companyId`.
- **«Sin cliente» (`customerPresence`).** Entra en `CLOSED_SELECT_VALUES` y reutiliza la poda que ya
  existe. El `customerId` sin forma de uuid se poda con `selectValueRule`. En ambos casos solo se
  registra el nombre del campo. La pantalla usa un único parámetro, `?customer=`. Con
  `customer=none` no se llama a la action de opción.
- **Clientes eliminados.** El listado y la ficha usan `findRefsIncludingDeleted`, con
  `isDeleted`. La etiqueta añade «(eliminado)». El selector `assign` filtra con `deletedAt: null`.
  R12 acepta el mismo cliente dado de baja en la edición y en el cambio.
- **Frontera `clientes` ↛ `pedidos`.** Nada nuevo en `lib/modules/clientes/` nombra `pedidos` u
  `orders`; la única mención es un comentario preexistente de `list-query.ts`, que el diff no toca.
  `pedidos` importa solo `import type … from '@/lib/modules/clientes'`. El `select` de
  `OrderCatalog` no gana `customer*` (R22). `scope.test.ts` reescrito tiene casos de sensibilidad
  para el barrel y la ruta profunda.
- **`down.sql`.** Es el inverso exacto (FK → índice → columna). Lo comprueban la forma
  (`orders-customer-migration.test.ts`) y el int R4. El DOWN en cadena de
  `customers-migration.int.test.ts` está en verde.
- **PII en logs.** Las líneas añadidas de producción no tienen `console`/logger. Lo único que se
  registra es `log.ignoredFields(LIST_NAME, [nombres de campo])`. `CustomerRef` y su `select` solo
  exponen id, nombres, apellidos y la marca de baja. Teléfono, correo, dirección y ciudad no salen
  de `clientes`, y lo verifican `customer-catalog.test.ts` y `order-customer-contract.test-d.ts`.

### 6. Multiplataforma — PASA
- Picker: `min-h-11` y `text-base` (16 px) en el input; botón de limpiar `size-11`; opciones
  `min-h-11`.
- Botones del diálogo: `min-h-11 min-w-11`.
- Diálogo: `max-h-[90dvh]` y `safe-area-inset-bottom`.
- No hay `100vh` ni `hover:` como única vía. El menú de fila usa `RowActionsMenu`.
- No hay librerías de UI nuevas.

### 7. Dependencias — PASA
`package.json` sin cambios (R39).

### 8. Aislamiento por empresa — PASA
No hay modelo nuevo en `schema.prisma`. Las consultas nuevas filtran por la empresa del actor, y hay
test de acceso cruzado (int R3, int R15 con ámbito ajeno → `not_found`, int R23 entre empresas,
unit R18 de otra empresa).

### 9. Comentarios — PASA
Ninguna línea añadida en `lib/`, `app/`, `components/` o `db/` cita `QC-<n>`, `R<n>`, `design.md` ni
«decisión cerrada». Los comentarios nuevos explican el motivo, no repiten el código.

### Decisiones ya tomadas: aplicadas como se decidieron
- Las 13 filas de «Decisiones cerradas»: aplicadas.
- Enmienda F2.1:
  - la clave de deps se llama `customerCatalog`;
  - el primer parámetro de `requireAliveCustomer` también;
  - el archivo es `search-order-customer-options.ts`;
  - no hay `\bcustomers\b` en `pedidos`.
- Menores de T0: no quedan stubs; `CustomerNotFoundError` se lanza sin diagnóstico.
- Tanda 1:
  - dobles de `customerCatalog`;
  - la migración en `scope.test.ts` y en `MIGRACIONES_ESPERADAS`;
  - DOWN en cadena;
  - `order-customer-picker` en `SUPERFICIES_QUE_APLANAN`.
- Si la opción del filtro devuelve error, se trata como `null` (`loadCustomerFilterOption`).
- El picker retira el id al teclear (`keepChoiceWhileTyping` es `false` por defecto; el filtro lo
  pone a `true`).
- Las entradas de los int son `Omit<NewOrder,'customerId'>`.
- El E2E está en `E2E_ESPERADOS` y es la excepción exacta de `clientes/scope.test.ts`, con su caso
  «la excepción es exacta».
- Las dos deudas aceptadas no se reabren.

## Hallazgos

### Bloqueantes
Ninguno.

### Menores
- **m1** — TZ queda `[ ] parcial` en `tasks.md` hasta el `./init.sh` completo de F2.4. Es lo que
  espera el flujo. Tiene que pasar a `[x]` con la salida del gate en la bitácora antes del PR.
- **m2** — `order-list-section.tsx:345`: `canEditCustomer={canEditDistribution}` reutiliza una
  variable que se llama por otra acción. Hoy es correcto, porque las dos salen del mismo
  `assertPermission(user, 'pedidos.modificar')` (design § 8). Pero el nombre ata el permiso del
  cliente al de «Reparto». Si la regla de reparto cambia algún día, el cliente la seguiría sin
  que nadie lo note. Bastaría con un nombre neutro (`canModifyOrders`).
- **m3** — `order-list-section.tsx` (`listWithCustomerFilter`): cuando el cliente de la dirección no
  se resuelve, el listado se pide **dos veces**: primero en paralelo con el filtro y luego sin él.
  design § 8 dice «quita el filtro **antes** de listar». El resultado es correcto (R29), pero en
  ese caso cuesta una consulta de más. Es una desviación de rendimiento sin efecto visible.
- **m4** — `e2e/pedido-con-cliente.spec.ts` R40(d) saca el id de `setOrderCustomerAction` del JS
  servido y hace `POST` con `Next-Action`. Es el primer E2E del repo que llama a una Server
  Action así, y depende del formato interno del bundle de Next. Si una actualización de Next lo
  cambia, el caso se rompe sin que cambie el comportamiento. Conviene dejar el motivo y el patrón
  anotados en `docs/verification.md` para que no se copie sin saberlo.
- **m5** — El atajo de R13 y `setOrderCustomer` no bloquean la fila ni vuelven a comprobar el estado
  dentro de la transacción. Está decidido y escrito en design § 4.1.1, § 4.2 y A9. Lo anoto solo
  para que el humano lo vea en el PR: una edición concurrente que cambie la cantidad entre la
  lectura y la escritura del atajo no se revierte. Es lo deseado, pero no lo prueba ningún test de
  concurrencia.

## Mapa de trazabilidad verificado (R → test)

Leí los casos y comprobé que corren en verde: unit/ui y guardias en mi corrida de 98 archivos, int
en mi corrida de 28. El E2E no lo corrí.

| R | Test(s) verificados |
| --- | --- |
| R1 | `unit/pedidos/schema/pedidos-schema.test.ts` (`ORDER_COLUMNS` y el caso R5) · `unit/pedidos/schema/orders-customer-migration.test.ts` «R1, R2…» · `integration/pedidos/orders-customer-constraints.int.test.ts` «R1, R3: un pedido sin cliente (NULL) es valido…» |
| R2 | `orders-customer-migration.test.ts` (UP sin DEFAULT ni UPDATE) · `orders-customer-constraints.int.test.ts` «R2: los pedidos previos… quedan sin cliente y ninguna otra columna cambia» |
| R3 | `orders-customer-migration.test.ts` «R3: la FK es COMPUESTA…» · int «R3: un pedido con cliente de otra empresa da 23503…» |
| R4 | `orders-customer-migration.test.ts` (DOWN inverso) · int «R4: aplicar el DOWN quita columna, indice y FK; volver a subir deja el esquema igual» · `integration/clientes/customers-migration.int.test.ts` (DOWN en cadena) |
| R5 | `pedidos-schema.test.ts` «QC-156 R5: Order declara una sola referencia a cliente…» |
| R6 | `unit/pedidos/order-customer-authorization.test.ts`: alta, edición, cambio y opciones `assign` × actores sin `pedidos.modificar`, con dobles que explotan · E2E R40(d) |
| R7 | `order-customer-authorization.test.ts`: listado sin filtro, por cliente y «sin cliente», ficha, opciones `filter` y opción del filtro × actores sin `pedidos.consultar` |
| R8 | `order-customer-authorization.test.ts`: casos «autorizada sin ningún permiso de clientes» y la comprobación de la matriz |
| R9 | `unit/pedidos/order-actions-customer.test.ts` (una lectura de sesión, actor como parámetro, sin permiso repetido) · `unit/identity/session-once-per-request-actions.test.ts` (tres filas) |
| R10 | `unit/pedidos/order-customer-write.test.ts` «R10: con un cliente vivo…», «sin cliente…», «con el cliente vacio…» |
| R11 | `order-customer-write.test.ts` (cuatro causas; sin forma de uuid → 0 llamadas; también en el atajo) · `unit/pedidos/set-order-customer.test.ts` (it.each de causas; sin forma de uuid) · `unit/pedidos/order-customer.test.ts` |
| R12 | `order-customer-write.test.ts` «R12: el MISMO cliente, aunque este dado de baja…» · `set-order-customer.test.ts` «R12…» |
| R13 | `unit/pedidos/order-edit-change.test.ts` (13 casos de la tabla «igual») · `order-customer-write.test.ts` (atajo con catálogos que explotan, `10`=`10.0000`, reparto en otro orden, quitar con `null` sin catálogo, mismo cliente → camino completo, cada dato distinto → camino completo, sin unidad → camino completo, estados cerrados → `invalid_transition` antes del atajo) · `integration/pedidos/order-customer.int.test.ts` «R13: no recalcula ni toca lo apartado…» |
| R14 | `set-order-customer.test.ts` it.each sobre los siete `ORDER_STATUS_VALUES` · `order-customer.int.test.ts` «R14, R15: en un pedido entregado y empacado…» · E2E R40(c) (CANCELADO) |
| R15 | `set-order-customer.test.ts` (la unidad de trabajo solo ve `setCustomerAlive`; deps sin catálogos) · int R14/R15 (fila y libros intactos) · int «R15: con el ambito de otra empresa no escribe nada» |
| R16 | `set-order-customer.test.ts` «R16: quitar con null…», «…con la cadena vacia…», «R16 R17…» · int (quitar no toca nada más) |
| R17 | `set-order-customer.test.ts` «R17: el mismo cliente no escribe nada…» · int (con `updated_by` del otro actor; `created_*` intactos porque la fila se compara entera) |
| R18 | `set-order-customer.test.ts`: no existe o borrado, otra empresa, desaparece al escribir, claves de más, sin la clave → `invalid_input` |
| R19 | `unit/pedidos/list-orders-customer.test.ts` · `unit/pedidos/get-order.test.ts` · int «R19, R20…» · `order-customer-contract.test-d.ts` (sin PII) |
| R20 | `list-orders-customer.test.ts` · `get-order.test.ts` · int «R19, R20…» (`isDeleted: true`) · `unit/pedidos-ui/order-columns.test.tsx` («(eliminado)») |
| R21 | `list-orders-customer.test.ts` (una llamada por página, ids sin repetir, cero sin clientes) · `get-order.test.ts` |
| R22 | `unit/pedidos/order-customer-boundaries.test.ts` (tipos de `OrderCatalog` y `select` de `order-catalog-prisma`) |
| R23 | `unit/pedidos/order-customer-filter-where.test.ts` (tres casos, `OR` en su propio término) · `list-orders-customer.test.ts` · int «R23, R24: por cliente, «sin cliente» y los dos a la vez, sin salir de la empresa» (total, con estado y con búsqueda) · E2E R40(b) |
| R24 | `list-orders-customer.test.ts` (poda y log del nombre del campo, para uuid y para `none`) · `order-customer-filter-where.test.ts` · `unit/pedidos-ui/order-list-params.test.ts` |
| R25 | `list-orders-customer.test.ts` (el término va al catálogo de recetas y no al de clientes) |
| R26 | `list-orders-customer.test.ts` (sort por cliente omitido y anotado) · `unit/pedidos/order-view.test.ts` (`sortable` y `filterable` exactos) · `order-columns.test.tsx` |
| R27 | `unit/pedidos/search-order-customer-options.test.ts` (`includeDeleted: true`; sin «Sin cliente») · `unit/clientes/customer-catalog.test.ts` · `integration/clientes/customer-catalog.int.test.ts` (empresa, bajas, orden, acentos, 10/25) |
| R28 | `search-order-customer-options.test.ts` (`assign` → `includeDeleted: false`) · `customer-catalog.test.ts` (`deletedAt: null`) · `customer-catalog.int.test.ts` · `order-customer-picker.test.tsx` |
| R29 | `search-order-customer-options.test.ts` y la opción del filtro (sin forma de uuid → null sin consultar) · `unit/pedidos-ui/order-list-section.test.tsx` (null o error → descarta; `customer=none` → no llama) · `order-customer-filter.test.tsx` · `order-table.test.tsx` |
| R30 | `order-columns.test.tsx` (columna, marcador de ausencia, sin orden ni filtro) · E2E R40(a) |
| R31 | `unit/pedidos-ui/order-form-customer.test.tsx` · `order-customer-picker.test.tsx` · `unit/async-autocomplete.test.tsx` (`defaultInputValue`) |
| R32 | `unit/pedidos-ui/order-row-actions.test.tsx` (siete estados × `canEditCustomer`) · `order-customer-dialog.test.tsx` · E2E R40(c) y R40(d) |
| R33 | `order-customer-dialog.test.tsx` (éxito: cierra, toast y refresh; error: mensaje del catálogo y sigue abierto) · E2E R40(c) |
| R34 | `order-list-params.test.ts` · `order-customer-picker.test.tsx` («Sin cliente» primero en la página 1, según el término, nunca con `assign`) · `order-customer-filter.test.tsx` (se sustituyen entre sí; página 1) · E2E R40(b) |
| R35 | `order-customer-dialog.test.tsx` · `order-customer-filter.test.tsx` · `order-customer-picker.test.tsx` (clases de 44 px y 16 px) · `pedidos-viewport.test.tsx` |
| R36 | `unit/clientes/scope.test.ts` (R40 de QC-154 reescrito: el barrel no dispara, la ruta profunda sí; R38 de `app/`) · `tests/guards/guard-arquitectura-modulos.test.ts` |
| R37 | `customer-catalog.test.ts` (forma de `CustomerRef`, `select` mínimo) · `customer-catalog.int.test.ts` (solo cuatro claves) · `order-customer-contract.test-d.ts` · tests de `clientes` de QC-153/154/155 en verde en la corrida de guardias y unit |
| R38 | `tests/guards/guard-catalogo-de-errores.test.ts` + `unit/errores/catalogo.test.ts` sin cambios y en verde (design § 10) |
| R39 | `tests/guards/guard-dependencias-aprobadas.test.ts` en verde; `package.json` y lockfile sin diff |
| R40 | `e2e/pedido-con-cliente.spec.ts` R40(a)–(d) (leído; lo corre el leader en F2.4) |
