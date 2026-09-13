# QC-87 — asignar-responsables-a-un-pedido · tasks.md

> Mitad **BACKEND** de la ficha partida en F1.0. El QUÉ está en `requirements.md` (R1–R51), el CÓMO
> en `design.md`. Aquí van los pasos, con su criterio de **hecho**, sus dependencias y `[P]` para lo
> que puede ir en paralelo.
>
> **Nada de esto se da por hecho sin gate.** `./init.sh --rapido` al cerrar cada tanda;
> **`./init.sh` completo** antes del PR (`CLAUDE.md`, regla 5).

## Archivos que SÍ se tocan

```
lib/modules/asignaciones/index.ts                                    (crece)
lib/modules/asignaciones/domain/{actor,errors,assignment-input,assignment-view}.ts        (nuevos)
lib/modules/asignaciones/domain/{assign-responsibles,remove-work-group-from-order}.ts     (nuevos)
lib/modules/asignaciones/domain/{unassign-responsible,list-order-responsibles}.ts         (nuevos)
lib/modules/asignaciones/ports/order-assignment-repository.ts                             (nuevo)
lib/modules/asignaciones/adapters/driven/persistence/order-assignment-prisma.ts           (nuevo)
lib/modules/asignaciones/adapters/driving/order-assignment-actions.ts                     (nuevo)
lib/modules/pedidos/domain/order-catalog.ts                                               (nuevo)
lib/modules/pedidos/adapters/driven/persistence/order-catalog-prisma.ts                   (nuevo)
lib/modules/pedidos/index.ts                                         (dos líneas)
lib/modules/identity/domain/{people-directory,work-group-directory}.ts                    (nuevos)
lib/modules/identity/adapters/driven/persistence/assignment-directory-prisma.ts           (nuevo)
lib/modules/identity/index.ts                                        (cuatro líneas)
lib/modules/errores/domain/{error-codes,error-catalog,error-message}.ts                   (4 códigos)
lib/composition/index.ts                                             (cableado)
tests/unit/asignaciones/**, tests/integration/asignaciones/**                              (nuevos)
tests/guards/guard-autorizacion-por-permiso.test.ts                  (una línea: la lista de módulos)
```

## Archivos que NO se tocan (y si aparecen en el diff, es un fallo)

```
db/schema.prisma, db/migrations/**                    ← R48: el diff de db/** es VACÍO
lib/modules/identity/domain/permissions.ts            ← R49: el catálogo sigue con QUINCE
tests/unit/identity/permissions.test.ts y todo test que cuente permisos  ← R49: no se tocan
lib/modules/asignaciones/domain/order-assignment.ts   ← los tipos de QC-86, tal cual
app/**, components/**, e2e/**                         ← R50: son de QC-102
package.json, pnpm-lock.yaml                          ← R51: diff vacío
lib/modules/pedidos/domain/order-transitions.ts y los seis casos de uso de QC-34
lib/modules/identity/domain/{effective-account-status,list-work-group-members}.ts  ← se USAN, no se editan
```

---

## Tareas

### [x] T1 — Los cuatro códigos de error y su enmienda escrita
`design.md > 6`. Añadir `order_delivered_frozen`, `order_cancelled_not_assignable`,
`order_assignment_not_found` y `user_not_assignable` a `ERROR_CODES`, con su clave en
`error-catalog.ts` y su texto en `ERROR_MESSAGES_ES`; abrir la familia `asignaciones` con el
comentario de **quinta enmienda**, con esas palabras y con su fecha.
**Hecho:** `guard-catalogo-de-errores` verde, ningún texto repetido, y quitar cualquiera de las tres
piezas de un código rompe el typecheck.
**Dependencias:** ninguna. `[P]` con T2 y T3.

### [x] T2 — `pedidos` publica `OrderCatalog` `[P]`
`design.md > 2.1`. `order-catalog.ts` (tipo + interfaz), `order-catalog-prisma.ts` con el filtro
`deleted_at IS NULL`, y dos líneas en el barril. **Ningún caso de uso de QC-34 cambia.**
**Hecho:** test unitario del adaptador contra doble de Prisma (pedido vivo, pedido de baja → `null`),
barril sin `@prisma/client` en su cierre, `guard-arquitectura-modulos` verde.

### [x] T3 — `identity` publica `PeopleDirectory` y `WorkGroupDirectory` `[P]`
`design.md > 2.2`. Los dos archivos de dominio y **un** adaptador driven que los implementa
reutilizando `listMembersAliveInCompany` y **`effectiveAccountStatus`** (R21): sin segunda definición
de «cuenta activa» y con `now` por parámetro.
**Hecho:** test de integración que demuestra que `activeMemberIds` **excluye** `pending`, `inactive`
y `blocked` **con plazo vigente**, e **incluye** la bloqueada **cuyo plazo venció, moviendo solo el
reloj y sin escribir nada**. Grupo de baja o de otra empresa → `null`.

### [x] T4 — El puerto `OrderAssignmentRepository`
`design.md > 3`. Cuatro métodos, `companyId` como primer parámetro en los tres que lo llevan, **sin
ningún método de `update`** y sin ningún borrado masivo por pedido.
**Hecho:** compila; el puerto no importa `@prisma/client` ni `next/*`; una llamada sin `companyId` no
compila (se demuestra con un caso negativo documentado en el test).
**Depende de:** nada. `[P]` con T1–T3.

### [x] T5 — El adaptador Prisma del puerto
`design.md > 3`. `createMany({ skipDuplicates: true })` con `createdAt`/`updatedAt` **explícitos**;
`deleteOne` y `deleteByWorkGroup` físicos; `listByOrderInCompany` ordenado por `user_id`; todo dentro
de la transacción que le pase el caso de uso.
**Hecho:** es el **único** sitio del repo con `prisma.orderAssignment` (lo verifica
`guard-arquitectura-modulos`); test de integración del `insertMissing` que corre **dos veces** con el
mismo lote y crea filas solo la primera.
**Depende de:** T4.

### [x] T6 — `actor.ts`, `errors.ts` y los esquemas del borde de `asignaciones`
`design.md > 1` y `> 7`. `Actor` con `companyId`; `requirePermission` que delega en
`assertPermission` del **barril** de `identity`; `AsignacionesError` + subclases con `code` del
catálogo; tres esquemas zod (`orderId` uuid, al menos un `userId` o un `workGroupId`).
**Hecho:** tests unitarios del fallo cerrado (actor `null`, sin `permissions`, vacío, sin el código)
y del rechazo de entrada inválida; `guard-autorizacion-por-permiso` verde.
**Depende de:** T1.

### [x] T7 — Caso de uso `assignResponsibles`
`design.md > 5`. Los siete pasos en ese orden, con `Promise.all` en los pasos 4 y 5, deduplicación
determinista en el dominio y una sola transacción.
**Hecho:** cubre R1, R2, R5, R6, R8–R12, R14–R28 con sus tests (§8 del design). En particular: un
test que reaplica un grupo y comprueba que **ninguna** fila vieja cambió, y otro que renombra el
grupo después y comprueba lo mismo.
**Depende de:** T2, T3, T4, T5, T6.

### [x] T8 — Casos de uso `unassignResponsible` y `removeWorkGroupFromOrder` `[P]` con T9
`design.md > 5`. Borrado físico de **una** fila / de las filas con **ese** origen congelado; la
tabla de estados de §4 se aplica igual; `'not_found'` → `order_assignment_not_found`.
**Hecho:** R29–R34 con sus tests, incluido el que quita un grupo **dado de baja después de
aplicarlo** y funciona.
**Depende de:** T4, T5, T6.

### [x] T9 — Caso de uso `listOrderResponsibles` `[P]` con T8
`design.md > 5`. `pedidos.consultar` en primera línea, sin comprobar estado, con el origen y el
nombre **de la fila**, personas de baja incluidas y orden estable.
**Hecho:** R3, R7, R13, R35–R40 con sus tests; el test de R3 usa un actor con `pedidos.consultar` y
**sin** ninguno de `asignaciones.*` y espera éxito.
**Depende de:** T2, T3, T4, T5, T6.

### T10 — El barril de `asignaciones`
Publica las **cuatro** factories con sus `*Deps`, los errores, los esquemas y `OrderResponsible`.
**No** publica el puerto, el adaptador driven ni las Server Actions (R46).
**Hecho:** el barril se puede importar desde un componente de cliente (no arrastra `next/*`,
`@prisma/client` ni `'use server'`); `guard-arquitectura-modulos` verde.
**Depende de:** T7, T8, T9.

### T11 — Cableado en `lib/composition`
`design.md > 2.3`. Los tres adaptadores nuevos y las cuatro funciones ya cableadas.
**Hecho:** ningún otro archivo de producción importa un adaptador driven (R47).
**Depende de:** T10.

### T12 — Las tres Server Actions y la consulta tipada
`design.md > 7`. `FormData` crudo al esquema, actor de las dos caras de la sesión, traducción por
`code`, **sin `revalidatePath`** y **sin** comprobar permisos en esta capa.
**Hecho:** R41, R43, R44 con sus tests; un test comprueba que un `FormData` sin `orderId` acaba en
`invalid_input` y **no** en una excepción sin traducir.
**Depende de:** T11.

### [x] T13 — `asignaciones` entra en la guardia de autorización por permiso
Añadir `'asignaciones'` a `BUSINESS_MODULES` de `tests/guards/guard-autorizacion-por-permiso.test.ts`.
Es una línea, y sin ella el módulo nuevo queda **fuera** del barrido que impide autorizar por rol.
**Hecho:** la guardia recorre el módulo y sigue verde; se comprueba que **dispara** metiendo
temporalmente un `'Administrador'` en un archivo del módulo.
**Depende de:** T6. `[P]` con T7–T12.

### T14 — Los tests de integración contra Postgres real
`design.md > 8`. Cada caso en una transacción con `ROLLBACK`. Son la evidencia que **sustituye al
E2E** en esta mitad (hallazgo 1 del design).
**Hecho:** R5–R7, R15, R19–R23, R26–R29, R32 demostrados contra la base, y cada aserción **cae al
mutar** lo que vigila.
**Depende de:** T7, T8, T9.

### T15 — El mapa `R<n> -> test` y el cierre
Escribir `progress/impl_QC-87-asignar-responsables-a-un-pedido.md` con el mapa completo
(`CHECKPOINTS.md > Trazabilidad`), verificar que el diff de `db/**`, `package.json`,
`pnpm-lock.yaml`, `app/**` y `components/**` es **vacío** (R48, R50, R51) y que el catálogo sigue con
**quince** permisos (R49).
**Hecho:** `./init.sh` completo en verde y ningún `R<n>` sin test.
**Depende de:** todo lo anterior.

---

## Mapa `R<n> -> test` (previsto; el implementer lo confirma en `progress/impl_<feature>.md`)

| Requisito | Test |
| --- | --- |
| R1, R2 | `unit/asignaciones/authorization.test.ts` — los tres casos de uso de escritura, actor ausente/vacío/sin el código |
| R3 | `unit/asignaciones/list-order-responsibles.test.ts` — actor con solo `pedidos.consultar` pasa; con solo `asignaciones.*` falla |
| R4 | `unit/asignaciones/authorization.test.ts` — el dominio no lee sesión (firma con actor por parámetro) |
| R5, R6 | `integration/asignaciones/company-scope.int.test.ts` |
| R7 | `integration/asignaciones/company-scope.int.test.ts` — responsables de otra empresa no vuelven |
| R8, R12 | `unit/asignaciones/order-state.test.ts` — pedido inexistente vs. entregado dan errores distintos |
| R9, R10, R11 | `unit/asignaciones/order-state.test.ts` — la tabla de `design.md > 4`, celda a celda |
| R13 | `unit/asignaciones/list-order-responsibles.test.ts` — los cuatro estados devuelven lo mismo |
| R14, R16 | `unit/asignaciones/assign-responsibles.test.ts` |
| R15, R22 | `integration/asignaciones/reapply-work-group.int.test.ts` |
| R17, R18 | `unit/asignaciones/assign-responsibles.test.ts` — rechazo entero, ninguna fila |
| R19, R20, R21 | `integration/asignaciones/active-members-only.int.test.ts` + `unit/identity/assignment-directory.test.ts` |
| R23 | `integration/asignaciones/reapply-work-group.int.test.ts` — desasignada a mano, vuelve al reaplicar |
| R24 | `unit/asignaciones/assign-responsibles.test.ts` — la misma persona por dos caminos, gana el primero |
| R25, R26 | `integration/asignaciones/active-members-only.int.test.ts` |
| R27 | `integration/asignaciones/atomicity.int.test.ts` |
| R28, R36 | `integration/asignaciones/frozen-name.int.test.ts` — renombrar y dar de baja el grupo después |
| R29, R30, R31 | `integration/asignaciones/unassign.int.test.ts` + `unit/asignaciones/unassign-responsible.test.ts` |
| R32, R33, R34 | `integration/asignaciones/remove-work-group.int.test.ts` |
| R35, R38, R39, R40 | `unit/asignaciones/list-order-responsibles.test.ts` |
| R37 | `integration/asignaciones/list-order-responsibles.int.test.ts` — persona de baja y bloqueada siguen saliendo |
| R41, R43, R44 | `unit/asignaciones/order-assignment-actions.test.ts` |
| R42 | `unit/asignaciones/assignment-input.test.ts` — entrada inválida y el puerto **no se llamó** |
| R45, R46, R47 | `guards/guard-arquitectura-modulos.test.ts` |
| R48 | `guards/guard-rls-force.test.ts` + revisión del diff de `db/**` anotada en T15 |
| R49 | `unit/identity/permissions.test.ts` (existente, **sin tocar**) + `guards/guard-permisos-sembrados.test.ts` |
| R50 | los E2E existentes, sin cambios en su guion + revisión del diff de `app/**` y `components/**` en T15 |
| R51 | `guards/guard-dependencias-aprobadas.test.ts` |
