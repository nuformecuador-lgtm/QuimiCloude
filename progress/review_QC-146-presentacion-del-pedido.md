# review — QC-146 presentacion-del-pedido

> F2.2, 2026-09-22. Reviewer. Rama `feature/QC-146-presentacion-del-pedido`, HEAD `3c80e0b5`,
> revisado contra la base de merge `cc5f34c0` (`origin/dev`). Leidos: `requirements.md` (R1-R30),
> `design.md`, `tasks.md`, `progress/impl_QC-146-presentacion-del-pedido.md`, `CHECKPOINTS.md`.

## Veredicto: RECHAZADO

Dos bloqueantes. El codigo de produccion esta bien: la migracion, el contrato, los casos de uso y
la UI cumplen el spec. Lo que falla es un test que se va a poner rojo en cuanto la rama se
sincronice con `dev`, y la T10 sin cerrar.

## Lo que corri yo

- Unit + guardias: `vitest run tests/unit/pedidos tests/unit/asignaciones tests/unit/asignaciones-ui
  tests/unit/pedidos-ui tests/unit/inventario/presentation-catalog.test.ts
  tests/unit/inventario/scope.test.ts tests/unit/shared/order-presentation-label.test.tsx tests/guards`
  -> **123 archivos, 1755 pasan, 8 omitidos, 0 rojos**.
- Integracion: `pedidos-constraints`, `order-crud`, `order-repository`,
  `inventario/company-scope-queries`, `proveedores/company-scope`, `asignaciones/assigned-orders`
  -> **6 archivos, 126 pasan, 0 rojos**.
- No corri `./init.sh` completo ni la E2E: el leader ya corrio el gate y esta corriendo la E2E.

## Checklist

| # | Punto | Estado |
|---|---|---|
| 1 | Trazabilidad R1-R30 -> test concreto y no vacio | OK (ver menores 3 y 4) |
| 2 | Tasks todas `[x]` | **FALLA**: T10 sin marcar (B2) |
| 3 | CHECKPOINTS | OK salvo T10 y el gate despues de sincronizar (B1) |
| 4 | Verificacion ejecutable | OK en la rama tal cual; rojo seguro tras sincronizar con `origin/dev` (B1) |
| 5 | Calidad y seguridad | OK: sin tabla nueva (RLS de `orders` ya forzada), sin webhooks, sin secretos, capas separadas, `PresentationCatalog` por contrato publico |
| 6 | Multiplataforma | OK: reutiliza `PresentationSelect` sin cambios (44 px, 16 px); columna y linea de ejecucion son texto; sin `100vh` ni `:hover` |
| 7 | Dependencias | OK: `package.json` y `docs/dependencias.md` sin tocar |
| 8 | Aislamiento por empresa | OK: sin modelo nuevo; FK compuesta `(company_id, presentation_id)`; `findRefs(ids, actor.companyId)`; rechazo cruzado probado (R3 int, R8 unit, R28 int) |
| 9 | Comentarios en lineas anadidas de produccion | OK: ninguna cita `QC-`, `R<n>`, `design.md` ni "decision cerrada" |

## Lo que se pidio mirar en especial

- **Migracion `20260922130000_orders_presentation`.** FK compuesta escrita a mano, `RESTRICT`/`CASCADE`,
  mismo patron que `supplier_catalog_lines`. Columna `UUID` anulable, sin `DEFAULT`, sin `UPDATE`:
  los pedidos existentes quedan en `NULL`. `down.sql` quita FK, indice y columna en orden inverso,
  y el test estatico lo ata con mutaciones. `schema.prisma` sin `@relation`, con `@@index`. Correcto.
- **Reglas de negocio.** Obligatoria en alta y edicion (zod `uuid()` heredado por `updateOrderSchema`);
  `ENTREGADO`/`CANCELADO` mueren en `assertTransition` antes del catalogo; `requirePermission` va
  primero; el Operador la ve por `asignaciones.consultar` sin permiso nuevo; "Sin presentacion" con
  `data-missing`; `ORDER_QUERYABLE` sin tocar; `resolve-ingredients-cost.ts`, `order-cost.ts`,
  `cancel-order.ts`, `delete-order.ts` sin tocar. Correcto.
- **Hallazgo 1 del implementer, renombre a 20260922130000.** Aceptable: la migracion no salio de la
  rama ni de la base de desarrollo local; el ajuste de `_prisma_migrations` fue en dev local y se
  reaplico limpio. Ver B1: el problema no es el renombre, es el test que lo vigila.
- **Hallazgo 2, `startAssignedOrder` recibe `presentations`.** Aceptable: `StartAssignedOrderDeps`
  extiende `GetAssignedOrderExecutionDeps` y el tipo lo exige. Ver menor 1.
- **Hallazgo 3, tests ajenos.** Ninguno se debilita:
  - `proveedores/company-scope.int.test.ts`: ejecuta antes los `down.sql` posteriores que referencian
    `presentations(company_id, id)`, leidos del disco y en orden inverso, que es lo que hace un
    rollback real. La fotografia no mira `orders`, asi que ninguna asercion de R10 cambia; y
    ademas exige encontrar la dependiente, asi que no pasa en vacio.
  - `pedidos/schema/orders-company-scope-migration.test.ts`: `ordersConstraintsBefore` ahora cuenta
    solo las migraciones ANTERIORES. Es lo que su nombre y su docblock ya decian; lo corrige, no lo
    afloja.
  - `inventario/scope.test.ts`: la exclusion anade un componente que solo pinta una prop; correcto.
  - `guard-identificador-de-request.test.ts`: la lista cerrada gana la migracion nueva; es el uso
    previsto.
  - `asignaciones/assigned-orders.int.test.ts`: solo cablea la dependencia nueva.
- **Archivos fuera del spec.** No hay produccion fuera de `design.md > 11`. Con QC-121 y QC-147 se
  tocan solo los compartidos ya declarados (`db/schema.prisma`, `lib/composition/index.ts`,
  `lib/modules/inventario/index.ts`, los dos archivos de ejecucion de `asignaciones` y
  `order-execution-screen.tsx`), con la linea nueva como bloque aislado. QC-147 usa
  `20260922160000_recipe_lines_percentage`: sin choque de timestamp.

## Hallazgos

### B1 — BLOQUEANTE: `orders-presentation-migration.test.ts` se pone rojo al sincronizar con `dev`

En `tests/unit/pedidos/schema/orders-presentation-migration.test.ts`, el caso "R2: el timestamp de
orders_presentation es estrictamente mayor que el ultimo timestamp existente" compara el timestamp
de la migracion con **el maximo de todas las demas carpetas de `db/migrations/`**, no con las que
existian al crearla. `origin/dev` ya tiene `20260922150000_product_type_enum`, que llego despues de
la base `cc5f34c0`, y QC-147 trae `20260922160000_recipe_lines_percentage`. En cuanto la rama se
sincronice con `dev` (F2.3, obligatorio antes del PR), la comparacion 20260922130000 > 20260922150000
es falsa y el `./init.sh` completo sale rojo. Ademas se volveria a romper con cualquier migracion
futura de cualquier ficha. Es la trampa de la "lista que envejece" que otros tests del repo ya
evitan.

**Que falta:** reescribir o quitar ese caso. Una opcion es exigir solo lo que de verdad importa
al orden: que el timestamp sea mayor que el de las migraciones de las que depende,
`*_orders_company_scope` y `*_suppliers_company_scope`, que crea `presentations_company_id_id_key`.
R2 queda cubierto de todos modos por los demas casos del archivo y por
`pedidos-constraints.int.test.ts`.

### B2 — BLOQUEANTE, se levanta con la E2E del leader: T10 sin marcar

`tasks.md` tiene T10 sin marcar: la E2E de R29 esta escrita y tiene asercion real (la celda
`order-presentation` con el nombre y la fila de la base con el id), pero no se ha ejecutado.
CHECKPOINTS exige todas las tasks marcadas. **Que falta:** que pase
`pnpm run e2e -- e2e/pedidos.spec.ts e2e/aislamiento-pedidos.spec.ts`, marcar T10 y anotar la
salida en la bitacora.

### Menores

1. `design.md > 7` dice que `startAssignedOrder` no recibe `presentations`, y lo recibe. El motivo
   es correcto, porque el tipo lo exige, pero `design.md` sigue diciendo lo contrario. Hay que
   anotar la enmienda en el design o dejarla dicha en el PR.
2. `update-order.ts` comprueba la presentacion **antes** que la receta; `design.md > 3.4` la pone
   despues. No cambia ningun requisito, pero con las dos invalidas el codigo que vuelve es
   `presentation_not_found` en vez de `recipe_not_found`. Esta desviacion no se documenta.
3. En `pedidos-constraints.int.test.ts`, el caso de R4 borra la presentacion con un pedido vivo,
   uno cancelado y uno dado de baja **a la vez**. Basta el vivo para que falle, asi que no prueba
   por separado que un pedido cancelado o uno dado de baja bloquee el borrado por si solo.
   `ENTREGADO`, que R4 nombra, no aparece. La FK no distingue estados, asi que el riesgo es bajo.
4. La bitacora mapea R8 tambien a `update-order.test.ts`, pero ese archivo no tiene un caso de R8.
   R8 en la edicion si esta cubierto en `company-isolation-service.test.ts`, caso "updateOrder: la
   presentacion es de la empresa B y el actor es de A". Hay que corregir el mapa.
5. En `order-form.tsx` y `order-list-skeleton.tsx` el mismo commit que cambia codigo limpia
   comentarios previos: quita citas a QC-35bis, QC-102 y T7. Es limpieza de comentarios mezclada
   con cambios de codigo (`docs/conventions.md > Comentarios`).
6. `lib/modules/inventario/domain/presentation-catalog.ts` empieza con un comentario que repite la
   ruta del archivo. Varios comentarios anadidos repiten lo que hace la linea siguiente, por ejemplo
   "Una sola llamada si el resumen tiene presentacion; ninguna si no" en
   `get-assigned-order-execution.ts`.
