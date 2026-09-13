# QC-102 — responsables-en-la-pantalla-de-pedidos · bitácora de implementación

> Mitad **PANTALLA** de la ficha que QC-87 partió en F1.0, más la **única pieza de backend que
> faltaba**: la consulta de responsables **para varios pedidos a la vez**.
> Spec aprobado por el humano el 2026-09-13 (F1.4). Rama
> `feature/QC-102-responsables-en-la-pantalla-de-pedidos`, worktree propio.
> **Las 18 tareas de `tasks.md` están cerradas** y los **41 requisitos** mapeados.

## 1. Lo que se construyó

Una consulta en lote (`createListResponsiblesForOrders`) con su puerto, su adaptador driven, su
Server Action y su cableado; y la pantalla: columna de responsables en el listado, cuarto botón de
fila «Responsables», y una sección dentro del `order-sheet` **que ya existía** con el panel en sus
dos modos (lectura y escritura).

**Sin migración, sin permiso nuevo y sin dependencias**: el diff de `db/**`, de `package.json` y de
`pnpm-lock.yaml` es **vacío** (R15, R39), y hay guardia que lo vigila.

### La decisión que manda sobre todo lo demás

**El lote se compone EN LA PANTALLA**, en el Server Component `OrderListSection`, con dos llamadas
seguidas — **no** dentro de `listOrders`. `asignaciones` ya importa el contrato de `pedidos`
(`ListOrderResponsiblesDeps.orders: OrderCatalog`), así que componerlo en `pedidos` cerraría el ciclo
`pedidos → asignaciones → pedidos`. Está en `design.md > 1` con tres alternativas descartadas, y hay
guardia de aciclicidad que lo sostiene (R14).

Una consulta en lote **por página**: ni un join (R5) ni una consulta por fila (R4). El test lo
demuestra **contando invocaciones**, no mirando el resultado.

## 2. Archivos tocados

### Producción — nuevos
```
app/(private)/pedidos/components/responsible-avatars.tsx      (3 iniciales + `+N`, ancho constante)
app/(private)/pedidos/components/order-responsibles.tsx       (el panel, lectura y escritura)
lib/modules/asignaciones/domain/list-responsibles-for-orders.ts
lib/modules/asignaciones/domain/responsible-order.ts          (comparador y `toOrigin`, extraídos)
```

### Producción — modificados
```
lib/modules/asignaciones/ports/order-assignment-repository.ts      (+listByOrdersInCompany)
lib/modules/asignaciones/adapters/driven/persistence/order-assignment-prisma.ts  (1 findMany)
lib/modules/asignaciones/adapters/driving/order-assignment-actions.ts  (+1 acción, al final)
lib/modules/asignaciones/domain/list-order-responsibles.ts         (SOLO el import de T3)
lib/modules/asignaciones/domain/actor.ts                           (+canModifyAssignments)
lib/modules/asignaciones/index.ts                                  (bloque nuevo al final)
lib/composition/index.ts                                           (quinta factory)
app/(private)/pedidos/components/order-list-section.tsx            (el lote y canWrite)
app/(private)/pedidos/components/order-columns.tsx                 (columna responsibles)
app/(private)/pedidos/components/order-row-actions.tsx             (cuarto botón)
app/(private)/pedidos/components/order-sheet.tsx                   (prop section)
app/(private)/pedidos/components/order-form.tsx                    (monta la sección)
app/(private)/pedidos/components/order-table.tsx                   (paso de props)
app/(private)/pedidos/components/order-list-skeleton.tsx           (8 -> 9 columnas)
app/(private)/pedidos/components/index.ts                          (barrel)
```

**Los cuatro casos de uso de QC-87 no se tocan.** `list-order-responsibles.ts` cambia una línea de
import y nada más; los otros tres, ni eso. Hay guardia (R40).

### Tests — nuevos
```
tests/unit/asignaciones/list-responsibles-for-orders.test.ts
tests/unit/composition/asignaciones-facade.test.ts
tests/integration/asignaciones/{batch-company-scope,batch-states}.int.test.ts
tests/unit/pedidos-ui/{responsible-avatars,order-responsibles,order-list-skeleton}.test.tsx
tests/unit/pedidos-ui/{assign,unassign,remove-work-group,a11y-tactil}.test.tsx
tests/unit/pedidos-ui/{order-sheet-responsibles,read-only}.test.tsx
tests/guards/{guard-lote-sin-join,guard-qc102-limites-de-la-ficha}.test.ts
tests/guards/{guard-qc87-no-reimplementado,guard-pantalla-pedidos-se-amplia}.test.ts
e2e/pedidos-responsables.spec.ts
```

### Tests — modificados
```
tests/guards/guard-arquitectura-modulos.test.ts     (bloque 15: el grafo es acíclico, R14)
tests/guards/guard-identificador-de-request.test.ts (alta del spec en la lista CERRADA)
tests/unit/shared/data-table-alcance.test.ts        (lista cerrada: ocho -> nueve)
tests/unit/pedidos/scope.test.ts                    (lista cerrada: los dos specs de pedidos)
tests/unit/asignaciones/{order-assignment-repository,order-assignment-actions}.test.ts
tests/unit/asignaciones/{assign-responsibles,order-state,authorization}.test.ts  (solo los DOBLES)
tests/unit/pedidos-ui/{order-columns,order-list-section,order-row-actions}.test.tsx
tests/unit/pedidos-ui/{order-sheet,order-form,pedidos-viewport,order-route-contract}
tests/integration/{aislamiento.json,asignaciones/use-case-fixture.ts}
```

**Ningún guion de test ajeno se reescribió.** Donde hubo que tocar tests de QC-87 o de la pantalla
fue para que los **dobles** satisficieran el puerto que crece, o para añadir un `vi.mock` que el
barrel nuevo exige. Los `test(...)`, sus selectores y sus aserciones se quedaron como estaban.

## 3. Mapa `R<n> -> test` — los 41, ninguno sin test

Abreviaturas: `U/` = `tests/unit/`, `I/` = `tests/integration/`, `G/` = `tests/guards/`.

### La consulta en lote (R1–R15)

| R | Test |
| --- | --- |
| R1 | `U/asignaciones/list-responsibles-for-orders.test.ts` — una entrada por id pedido, en el orden pedido; + `I/asignaciones/batch-company-scope.int.test.ts` |
| R2 | idem unit — sin `pedidos.consultar`: `unauthorized` y **ningún puerto tocado**; y el permiso se comprueba **antes** que zod |
| R3 | `I/asignaciones/batch-company-scope.int.test.ts` — el pedido de otra empresa **no vuelve**; firma: `U/asignaciones/order-assignment-repository.test.ts` (sin `companyId` **no compila**) |
| R4 | `U/asignaciones/list-responsibles-for-orders.test.ts` — con 20 pedidos, **exactamente 2 invocaciones** de puerto (cuenta invocaciones, no resultado) |
| R5 | `G/guard-lote-sin-join.test.ts` — ninguna `@relation` entre `orders` y `order_assignments`, ningún `include`; los dos casos **mueren al mutar el archivo real** |
| R6 | unit — dos lecturas dan lo mismo, y **el lote y el singular devuelven la misma secuencia** (mismo comparador, extraído en T3) |
| R7 | unit + `I/.../batch-company-scope` — inexistente, dado de baja y de otra empresa: entrada **vacía**, sin error y sin distinguirse |
| R8 | unit — lista vacía da `[]` con los puertos a **cero** invocaciones |
| R9 | unit — uuid inválido y tope excedido dan `invalid_input` sin tocar puertos; repetidos se consultan **una vez** |
| R10 | `I/asignaciones/batch-states.int.test.ts` — los cuatro estados y una página mezclada; + unit (sin `OrderCatalog`, H3) |
| R11 | unit — **tres claves exactas**; la persona de baja sigue saliendo con su nombre |
| R12 | unit + `I/.../batch-company-scope` (grupo renombrado **después** de asignar) + `U/pedidos-ui/order-responsibles.test.tsx` |
| R13 | `U/asignaciones/order-assignment-actions.test.ts` — argumentos tipados, error **por `code`**, y no comprueba permisos |
| R14 | `G/guard-arquitectura-modulos.test.ts` bloque 15 — el grafo entre módulos es **acíclico**; muere si `pedidos` importa `asignaciones` o consulta `prisma.orderAssignment` |
| R15 | `G/guard-qc102-limites-de-la-ficha.test.ts` — diff de `db/**` **vacío**; + `U/identity/permissions.test.ts` (los **quince** permisos, ya existía) |

### El listado y el panel (R16–R36)

| R | Test |
| --- | --- |
| R16 | `U/pedidos-ui/order-columns.test.tsx` (columna propia) + `order-list-section.test.tsx` (**una sola** llamada al lote por render, no una por fila) |
| R17 | `U/pedidos-ui/responsible-avatars.test.tsx` — 5 responsables dan 3 círculos y `+2`; el `+N` nombra **a los que faltan** |
| R18 | idem — clases de ancho **idénticas** con 1 y con 9; y en negativo, no es `w-fit` |
| R19 | idem — marcador de ausencia, **el mismo** que receta y motivo de cancelación; ningún identificador técnico |
| R20 | `U/pedidos-ui/order-list-section.test.tsx` — lote en `unauthorized`/`invalid_input`/`unexpected`: la lista **sigue en pie** |
| R21 | `U/pedidos-ui/responsible-avatars.test.tsx` — iniciales de `getInitials`, nombre accesible completo, **ningún `img`** |
| R22 | `U/pedidos-ui/order-list-skeleton.test.tsx` — esqueleto y tabla declaran el **mismo** número de columnas |
| R23 | `U/pedidos-ui/order-sheet-responsibles.test.tsx` — **una sola** instancia de panel, sin ruta nueva y sin `router.push` |
| R24 | `U/pedidos-ui/order-row-actions.test.tsx` — entrada «Responsables», **activa** en `ENTREGADO`/`CANCELADO`, con los otros tres inertes y su motivo a la vista |
| R25 | `U/pedidos-ui/order-responsibles.test.tsx` — 12 responsables, **todos**, agrupados en tres bloques por origen |
| R26 | `U/pedidos-ui/order-sheet-responsibles.test.tsx` — abrir el panel deja el contador de la acción **a cero** |
| R27 | `U/pedidos-ui/order-responsibles.test.tsx` — catálogos **por props**; el cliente no importa `lib/composition`; catálogo vacío degrada (H1) |
| R28 | `U/pedidos-ui/read-only.test.tsx` — sin el permiso no se monta ningún control; **y la otra mitad invocada, no reescrita**: importa `U/asignaciones/authorization.test.ts` de QC-87 |
| R29 | `U/pedidos-ui/order-sheet-responsibles.test.tsx` — `ENTREGADO`/`CANCELADO`: sin controles **y sin frase**, contrastado con `PENDIENTE`/`EN_CURSO` |
| R30 | `U/pedidos-ui/remove-work-group.test.tsx` — **una** llamada con el `workGroupId`; en negativo, **ninguna** desasignación individual |
| R31 | `U/pedidos-ui/unassign.test.tsx` — exactamente esa persona; no viaja ninguna otra ni una lista |
| R32 | `U/pedidos-ui/assign.test.tsx` — personas y grupos en **la misma** invocación, `FormData`, campos **en inglés** |
| R33 | idem — toast con el `added` que devolvió la **acción**, `router.refresh()`, y **ningún** `revalidatePath` |
| R34 | idem — error **dentro** del panel, por `code`, con lo marcado **conservado** |
| R35 | `U/pedidos-ui/a11y-tactil.test.tsx` — 44x44 en los seis controles, 16 px en el buscador, el `+N` por teclado, y el panel completo **sin hover** |
| R36 | `U/pedidos-ui/order-route-contract.test.ts` — los dos componentes bajo `components/`, exportados por el barrel, sin rutas profundas |

### El E2E y los límites (R37–R41)

| R | Test |
| --- | --- |
| R37 | `e2e/pedidos-responsables.spec.ts` — **verde en chromium y webkit** (ver seccion 5) |
| R38 | `git diff origin/dev...HEAD -- e2e/pedidos.spec.ts` **vacío** (cero líneas), y `e2e/` gana **exactamente un** archivo; más la corrida real de la seccion 5 |
| R39 | `G/guard-qc102-limites-de-la-ficha.test.ts` + `G/guard-dependencias-aprobadas.test.ts` (ya existía) |
| R40 | `G/guard-qc87-no-reimplementado.test.ts` — ruta exacta y nunca el barrel para las acciones; la pantalla no duplica reglas del dominio; los cuatro casos de uso conservan permiso y tabla de estados |
| R41 | `G/guard-pantalla-pedidos-se-amplia.test.ts` — QC-55 y QC-57 ni aparecen en el diff; los seis archivos de la pantalla anterior **solo GANAN** exportaciones |
| H4 | `U/asignaciones/list-responsibles-for-orders.test.ts` — `MAX_ORDERS_PER_BATCH` y `MAX_PAGE_SIZE` son **el mismo número** |

**Todas las guardias se verificaron mutando el archivo REAL** y comprobando que se ponen rojas.

## 4. Salida real del gate

`./init.sh` **completo, sin flags** (obligatorio antes del PR):

```
Test Files  456 passed (456)
     Tests  6482 passed | 66 skipped (6548)
  Duration  248.21s
✓ los tres proyectos corrieron (ui, node, integration)
✓ tests: sin rojos nuevos (0 rojos, todos en el baseline de 8); 8 por limpiar
✓ todas las migraciones tienen down.sql
== init OK ==
```

`typecheck` y `lint` en verde. Los **8 archivos del baseline que hoy pasan** son material de QC-99 y
**no se han tocado**.

### Lo que el modo rápido NO cazó, y conviene que quede escrito

`./init.sh --rapido` dio verde (142 archivos, 2071 tests) mientras **tres archivos estaban rojos**.
Ninguno de los tres se alcanza por el grafo de imports: dos eran **listas cerradas**
(`data-table-alcance`, `pedidos/scope`) y el tercero una **regla de frontera**
(`module-contract`, R29/R50). Es exactamente el agujero que `docs/verification.md` documenta, y es
la razón de que el gate completo antes del PR no sea negociable.

Además, en la primera corrida el rápido seleccionó **cero** tests relacionados, porque el diff se
calcula contra `origin/dev` **por commits** y el trabajo aún estaba sin commitear.

## 5. El E2E — `./init.sh` no corre Playwright, así que va aparte

```
pnpm exec playwright test e2e/pedidos-responsables.spec.ts e2e/pedidos.spec.ts
  4 passed (1.2m)
  2 failed
    [chromium] › e2e/pedidos.spec.ts:447 › ... no es Administrador ... (R49)
    [webkit]   › e2e/pedidos.spec.ts:447 › ... no es Administrador ... (R49)
```

Los 4 verdes son el spec nuevo (R37) en las dos proyecciones y el R48 de la pantalla anterior.

**Los 2 rojos son deuda heredada, demostrada y no supuesta.** Se corrió el mismo caso en `48f5af7`,
el commit **anterior** a la primera línea de QC-102, y **falla idéntico**: misma línea, mismo
mensaje, misma navegación a `/inventario`.

La causa está localizada: el helper `login()` de ese spec espera aterrizar en `DASHBOARD_ROUTE`, pero
`login-action.ts` aterriza en `firstVisibleNavHref(...)`, y el rol **Operador** de la base de
desarrollo tiene hoy exactamente **`inventario.consultar`** y **`asignaciones.consultar`** — **no
tiene `dashboard.consultar`**. Ninguno de los archivos de esa cadena (`login-action.ts`,
`private-nav.ts`, `routes.ts`) aparece en el diff de esta rama.

**Es dato para el leader, no algo que esta ficha deba arreglar por su cuenta**: tocar el guion de ese
spec lo prohíbe R38, y cambiar los permisos del rol es una decisión de producto.

### Un apunte de entorno

La base de desarrollo iba **una migración por detrás** (`20260912103000_session_revocation`, de
QC-23, ya mergeada en `origin/dev`), y eso tumbaba **cualquier** `prisma.user.create`, así que ningún
E2E con usuarios efímeros podía correr. Se aplicó con `pnpm run db:migrate`, que es el remedio que el
propio gate imprime. Es aditiva y no la trajo el merge de esta rama.

## 6. Decisiones de implementación que conviene mirar en la revisión

1. **`canModifyAssignments`, predicado nuevo en `asignaciones`.** El Server Component calculaba
   `canWrite` con `assertPermission(user, 'asignaciones.modificar', ...)`, y la regla (e) de
   `module-contract.test.ts` (R29, R50) prohíbe que nadie fuera de `asignaciones/domain` escriba esos
   códigos. **No se enmendó la regla** —ya llevaba una enmienda de QC-87, y una segunda para una
   pantalla la habría dejado sin filo—: el módulo publica un predicado que delega en
   `assertPermission` por dentro, y la pantalla solo **pregunta**. Anticipar no es autorizar.
2. **La guardia de R40 se acotó**, porque se había pasado de frenada: medía «del contrato solo se
   toman tipos», más estricto que su requisito, que prohíbe sacar del barrel **las Server Actions**.
   Al acotarla **ganó filo**: ahora caza también el rodeo por un re-export local, y un caso nuevo ata
   la lista de acciones vigiladas a lo que el fuente real exporta.
3. **`MAX_ORDERS_PER_BATCH` se publica en el barrel**, además de los tres símbolos que
   `design.md > 2.6` nombra. Lo pide el test de H4. Es una desviación menor del diseño y se señala
   para que el reviewer decida.
4. **El glifo del marcador de ausencia se declara dos veces** a propósito (`responsible-avatars.tsx`
   no importa el de `order-columns.tsx`) porque al revés cerraría un ciclo entre dos módulos de la
   misma ruta. Los dos valores quedan **atados por test**, que es el mismo remedio que H4 aplica al
   tope duplicado.
5. **El panel se cierra por «Cancelar», no por `Escape`**, porque `sheet.tsx` desactiva `Escape` a
   propósito cuando el panel es un formulario. Es comportamiento intencional de la pantalla; el E2E
   se adaptó a él en vez de cambiarlo.
6. **El caso de uso se salta la segunda consulta si no hay ninguna fila** (0 invocaciones en vez de
   1, nunca más de 2). Es el mismo corte que hace la consulta singular y no contradice R4.

## 7. Lo que hay que decidir, y no es mío

1. **El catálogo del panel se pide con `pageSize: MAX_PAGE_SIZE` (25)**, que es el tope de
   `listUsers`/`listWorkGroups`, y el buscador filtra **sobre lo ya traído**. Con más de 25 personas
   en la empresa, **no todas son asignables desde esta pantalla**. No lo cubre ninguna decisión
   cerrada ni el `design.md`. **Posible ficha aparte.**
2. **H1, ya escrito y aprobado en el spec**: con `asignaciones.modificar` pero **sin**
   `usuarios.consultar`, el panel se abre en escritura con los **dos catálogos vacíos**. Se
   implementó degradando como ya hace `loadFormCatalogs`, que es lo que el spec mandaba. Si el humano
   quiere que ese caso se vea distinto, es decisión suya.
3. **El rojo heredado de `e2e/pedidos.spec.ts` R49** (seccion 5): el rol `Operador` no tiene
   `dashboard.consultar`.

## 8. Estado

- **18/18 tareas cerradas** en `tasks.md`.
- **41/41 requisitos mapeados** a test.
- `./init.sh` **completo en verde**, sin rojos nuevos respecto del baseline.
- `origin/dev` mergeado (F2.3): sin conflictos y **sin migraciones**.
- **PR NO abierto**: falta el `reviewer` (F2.2).
