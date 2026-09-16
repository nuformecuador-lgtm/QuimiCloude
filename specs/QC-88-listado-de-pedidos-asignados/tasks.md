# QC-88 — listado-de-pedidos-asignados · tasks.md

> **Como leer esto.** Cada task lleva **la lista explicita de archivos que toca** —para que el leader
> pueda validar el conflicto con QC-60 y QC-81 **antes** de F2.0 (`design.md > 13`)—, sus
> dependencias y su criterio de «hecho». `[P]` = se puede hacer en paralelo con las otras `[P]` del
> mismo bloque, porque no comparten ni un archivo.
>
> **Dos tasks estan CONDICIONADAS a decisiones humanas de F1.4** y se marcan con `[PA1]` / `[PA2]`:
> el nombre de la ruta y su etiqueta, y donde se compone la lista. El desglose de abajo asume la
> **opcion B** de `design.md > 2.2` (recomendada); si el humano elige la A, cambian **T4, T5 y T6**
> y el resto se queda igual — el delta esta escrito en `> Si el humano elige la opcion A`.
>
> **El gate lo corre el leader** (`AGENTS.md > Regla del gate`). Cada task termina con `pnpm
> typecheck`, `pnpm lint` y `pnpm exec vitest related --run <sus archivos>`, nunca con la suite
> entera.
>
> `<RUTA>` = el segmento que fije `[PA1]`. Ningun archivo de producto escribe ese literal: todo
> deriva de la constante (R1).

---

## Bloque 1 — La consulta que no existe (backend)

### T1 · `[x]` Metodo de puerto «los pedidos de esta persona» (R9) `[P]`

> Hecha en el commit `1b0b16d` (2026-09-16). Alcance ampliado: ver la nota al pie de T2.

**Toca**
- `lib/modules/asignaciones/ports/order-assignment-repository.ts` (metodo nuevo **al final** de la
  interfaz; no se reordena ni se reescribe ninguno de los cinco existentes)
- `tests/unit/asignaciones/order-assignment-repository.test.ts` (caso nuevo)

**Depende de:** nada.
**Hecho cuando:** `listOrderIdsByUserInCompany(companyId, userId)` existe con **`companyId` como
primer parametro**, y hay un caso que demuestra que una llamada que lo olvide **no compila** (mismo
patron que el caso negativo ya vigilado en ese archivo).

### T2 · `[x]` Adaptador Prisma de esa lectura (R10, R37)

> Hecha en el commit `1b0b16d` (2026-09-16). **Desviacion declarada:** anadir un metodo REQUERIDO a
> `OrderAssignmentRepository` rompe a todos sus implementadores, y tres de ellos no los nombra
> ninguna task — los dobles de `tests/unit/asignaciones/assign-responsibles.test.ts` (dos) y
> `tests/unit/asignaciones/order-state.test.ts` (uno)—. El sistema de tipos obliga a cerrarlos en el
> MISMO commit en que la interfaz crece, asi que T1+T2 entraron juntas con esos tres archivos. Es un
> hueco de la descomposicion T1/T2, no una decision de diseno reabierta.

**Toca**
- `lib/modules/asignaciones/adapters/driven/persistence/order-assignment-prisma.ts` (funcion nueva
  **al final** del objeto que devuelve la factoria)
- `tests/unit/asignaciones/order-assignment-repository.test.ts`

**Depende de:** T1.
**Hecho cuando:** la lectura es **un solo `findMany`** con `where: { userId, companyId }`,
`select: { orderId: true }` y `orderBy: { orderId: 'asc' }`; **no hay ningun `include`**; y
`pnpm exec vitest related --run tests/guards/guard-lote-sin-join.test.ts` sigue verde.

### T3 · `[x]` Integracion contra base real de la lectura nueva (R7, R8) `[P]`

> Hecha en la tanda 2 (2026-09-16). Ejercita el **adaptador** directamente: el caso de uso (T6) esta
> bloqueado por QC-60. **Desviacion:** «un `user_id` con filas en dos empresas» es inseedable — la FK
> `order_assignments_user_id_fkey` es compuesta `(user_id, company_id)`, asi que la base lo rechaza;
> R7 se cubre por el lado que si existe y se anade un caso que demuestra la imposibilidad.

**Toca**
- `tests/integration/asignaciones/assigned-orders.int.test.ts` (**archivo nuevo**)
- `tests/integration/aislamiento.json` (fila nueva: modo de aislamiento, y `motivo`/`desde` si es
  `commit`; sin ella `guard-aislamiento-integracion` se pone roja)

**Depende de:** T2.
**Hecho cuando:** hay un caso de **rechazo cruzado** —una asignacion de otra empresa **no vuelve** y
no se distingue de una inexistente (R8)— sobre base real, y el archivo declara su aislamiento.

### T4 · `[PA2]` Lectura en lote de pedidos por ids en el contrato de `pedidos` (R11, R15)

**Toca**
- `lib/modules/pedidos/domain/order-catalog.ts` (tipo `AssignedOrderSummary` + metodo nuevo en la
  interfaz existente)
- `lib/modules/pedidos/index.ts` (dos exports de tipo; **bloque nuevo al final**, no se reordena)
- `tests/unit/pedidos/module-contract.test.ts` (si el barrel tiene ancla de exports, se **tensa**)

**Depende de:** nada.
**Hecho cuando:** el tipo **no puede expresar** autoria ni motivo de cancelacion, el barrel sigue sin
arrastrar `@prisma/client`/`next/*`/`'use server'` en su cierre de imports (R12), y el metodo devuelve
`Page<AssignedOrderSummary>` (la paginacion la hace el adaptador, no el dominio).

### T5 · `[PA2]` Adaptador de esa lectura (R11)

**Toca**
- `lib/modules/pedidos/adapters/driven/persistence/order-catalog-prisma.ts` (funcion nueva **al
  final**; `findAliveOrderTargetById` no se toca)
- `tests/unit/pedidos/order-catalog.test.ts` (o el archivo existente equivalente)

**Depende de:** T4.
**Hecho cuando:** el `where` lleva `id: { in }`, `status: { in }` y **`deletedAt: null`**; la
paginacion sale de `toOffsetLimit`/`buildPage` de `lib/shared/pagination` y **no se reimplementa**;
y el `total` describe el conjunto **ya filtrado por estado** (R11).
**AVISO DE CONFLICTO:** este es **uno de los dos archivos que QC-60 va a tocar**
(`design.md > 13`). El leader lo valida antes de F2.0.

### T6 · `[PA2]` El caso de uso, con su autorizacion (R5, R6, R7, R11, R14, R15, R20)

**Toca**
- `lib/modules/asignaciones/domain/list-assigned-orders.ts` (**archivo nuevo**)
- `lib/modules/asignaciones/domain/assigned-order-view.ts` (**archivo nuevo**: el tipo de salida)
- `lib/modules/asignaciones/index.ts` (**bloque nuevo al final**: factoria, `*Deps` y tipo de salida)
- `tests/unit/asignaciones/list-assigned-orders.test.ts` (**archivo nuevo**)
- `tests/unit/asignaciones/authorization.test.ts` (caso nuevo para R40)

**Depende de:** T1, T4 (los tipos), T7 (o la guardia se pone roja en cuanto se escriba el permiso).
**Hecho cuando:**
- `requirePermission(actor, 'asignaciones.consultar')` es la **primera linea**, antes de `zod` y antes
  de tocar puerto, con test que lo demuestra **contando invocaciones de los dobles** (R5, R40);
- los cuatro casos de actor invalido se rechazan igual (R6);
- un test **cuenta las consultas** y demuestra que son **las mismas con 1 fila que con 25** (R14);
- el propio actor **no** sale entre los responsables de sus filas (R20);
- reutiliza `compareResponsibles` y `toOrigin` de `./responsible-order` y **no** copia el comparador
  (R15), y **no** invoca `listResponsiblesForOrders` (`design.md > 0` H1).

### T7 · `[x]` Enmienda de la guardia del contrato del modulo (R36)

> Hecha en el commit `1b0b16d` (2026-09-16). La puerta quedo **por igualdad exacta de archivo**
> (`relPath === 'lib/modules/asignaciones/domain/list-assigned-orders.ts'`), mas estrecha que la de
> QC-87 para `asignaciones.modificar`, que es por prefijo de carpeta.

**Toca**
- `tests/unit/asignaciones/module-contract.test.ts` (regla **(e)**: `isLegitimatePermissionConsumer`
  y el caso `:764`)

**Depende de:** nada (va **antes** que T6).
**Hecho cuando:** `asignaciones.consultar` es legitimo **solo** en el archivo del caso de uso nuevo;
los **tres portazos** del caso siguen dando hallazgo (el mismo codigo en un adaptador `driving`, en
`app/**` y en otro modulo), y el caso sigue demostrando que `asignaciones.modificar` **no** es
legitimo fuera de donde QC-87 lo abrio. **La guardia se tensa, no se ensancha** (`design.md > 14`,
riesgo 2).

### T8 · Cableado en el punto unico de composicion (R13)

**Toca**
- `lib/composition/index.ts` (la constante `orderCatalog` gana la funcion nueva; la fachada
  `asignaciones` gana `listAssignedOrders`; **bloques nuevos al final**, sin reordenar nada)
- `tests/unit/composition/asignaciones-facade.test.ts` (o el equivalente existente)

**Depende de:** T2, T5, T6.
**Hecho cuando:** ningun archivo fuera de `lib/composition` importa el adaptador driven nuevo, y la
fachada expone la operacion ya cableada con sus cuatro dependencias.

### T9 · Server Action de la consulta (R27 lado servidor)

**Toca**
- `lib/modules/asignaciones/adapters/driving/order-assignment-actions.ts` (funcion nueva **al final**;
  las cinco existentes no se tocan)
- `tests/unit/asignaciones/order-assignment-actions.test.ts`

**Depende de:** T8.
**Hecho cuando:** recibe **argumento tipado** (ningun `FormData`), resuelve el actor con el
`currentActor()` que ya existe, **no comprueba ningun permiso** y traduce el error **por su `code`**.
No se reexporta desde el barrel del modulo.

---

## Bloque 2 — Ruta, menu y aterrizaje

### T10 · `[PA1]` Constante de ruta, helper de detalle y prefijo privado (R1, R2)

**Toca**
- `lib/shared/routes.ts` (constante nueva + helper derivado del disparador de R22 + **una** fila en
  `PRIVATE_ROUTE_PREFIXES`)

**Depende de:** la respuesta a `[PA1]` en F1.4. **Entra en el MISMO commit que T12**: la guardia
`guard-rutas-privadas-cubiertas` se pone roja en los dos sentidos —prefijo sin pantalla y pantalla sin
prefijo—.
**Hecho cuando:** la constante aparece **una sola vez** en los prefijos y ningun otro archivo de
producto redeclara la URL.

### T11 · `[PA1]` Item de menu y guardias del menu tensadas (R3, R35)

**Toca**
- `lib/shared/navigation/private-nav.ts` (etiqueta nueva + entrada en `PRIVATE_NAV_ITEMS` **entre
  Dashboard e Inventario**, `design.md > 7.2`)
- `tests/guards/guard-nav-permisos-declarados.test.ts` (ancla: de **ocho** a **nueve** enlaces,
  **nombrando** el nuevo)
- `tests/unit/navegacion/private-layout-menu.test.tsx` (si su ancla de `testId` lo exige)

**Depende de:** T10.
**Hecho cuando:** el item declara **`asignaciones.consultar`**, su `href` **deriva** de la constante,
el ancla de la guardia sube **y** nombra el enlace, y el ancla del catalogo de **15** permisos sigue
intacta (esta ficha **no** anade permisos).

---

## Bloque 3 — La pantalla

### T12 · `[PA1]` Pagina y componentes de la ruta (R4, R26-R32)

**Toca** (todos **nuevos**)
- `app/(private)<RUTA>/page.tsx`
- `app/(private)<RUTA>/components/index.ts`
- `app/(private)<RUTA>/components/assigned-orders-list-params.ts`
- `app/(private)<RUTA>/components/assigned-orders-list-section.tsx`
- `app/(private)<RUTA>/components/assigned-orders-table.tsx`
- `app/(private)<RUTA>/components/assigned-orders-columns.tsx`
- `app/(private)<RUTA>/components/assigned-orders-empty.tsx`
- `app/(private)<RUTA>/components/assigned-orders-error.tsx`
- `app/(private)<RUTA>/components/assigned-orders-skeleton.tsx`
- `app/(private)<RUTA>/components/assigned-order-enter-trigger.tsx`

**Depende de:** T9, T10, T17.
**Hecho cuando:**
- `requirePagePermission('asignaciones.consultar')` es la **primera linea** de `page.tsx` (R4);
- la seccion es un Server Component que llama la operacion **una vez** y baja todo por props (R27);
- vacio, error y esqueleto se pintan **fuera** de `<DataTable>`, con `status="idle"` siempre y
  `searchable={false}` (R28-R30);
- los tamanos salen de `lib/shared/pagination` y viajan en la URL (R31);
- el barrel **no** declara `'use client'` y la pagina importa **solo** desde el barrel;
- objetivos tactiles >= 44x44 y el motivo de R21 **visible**, no solo en `tooltip` (R32).

### T13 · `[PA1]` Test de contrato de la ruta (R33)

**Toca**
- `tests/unit/asignaciones-ui/assigned-orders-route-contract.test.ts` (**archivo nuevo**, calcado de
  `tests/unit/pedidos-ui/order-route-contract.test.ts`)

**Depende de:** T12.
**Hecho cuando:** deriva la carpeta esperada **de la constante** (nunca del literal) y comprueba:
constante declarada una vez, no redeclarada en `private-nav`, una sola fila en los prefijos, la
pantalla donde dice la constante, `components/index.ts` sin `'use client'`, la pagina importando solo
del barrel, ningun archivo de la ruta con la URL a mano, y que el permiso de la pagina y el del item
de menu son **el mismo codigo**, derivado del catalogo.

### T14 · Tests de los componentes (R16-R22, R28-R30) `[P]`

**Toca**
- `tests/unit/asignaciones-ui/assigned-orders-columns.test.tsx` (**nuevo**)
- `tests/unit/asignaciones-ui/assigned-orders-states.test.tsx` (**nuevo**)
- `tests/unit/asignaciones-ui/assigned-order-enter-trigger.test.tsx` (**nuevo**)
- `tests/unit/asignaciones-ui/assigned-orders-list-params.test.ts` (**nuevo**)

**Depende de:** T12.
**Hecho cuando:** hay un test por cada uno de R16-R22 —incluido que la receta sin resolver pinta el
marcador **y no el uuid** (R17), que el nombre del grupo es el **congelado** (R19), que el actor no
sale entre los avatares (R20) y que `EN_CURSO` deshabilita el disparador **con su motivo accesible**
(R21)— y un test que ata el numero de columnas del esqueleto al de la tabla.

### T17 · `[x]` Los avatares: promocion o componente propio (R18, R19)

> Hecha en la tanda 3 (2026-09-16), por la via de **promocion**: QC-102 esta mergeado en `dev`, asi
> que el plan B no aplica y **no hay deuda de duplicacion que anotar**. Requirio enmendar
> `tests/unit/pedidos-ui/order-route-contract.test.ts` (R36 de QC-102), que fijaba el componente
> dentro de la ruta — **decision humana del 2026-09-16**, no del implementer. La guardia se **tenso**
> (dos casos nuevos y un `describe` nuevo de 4) y se probo con **4 mutaciones**.
>
> **Correccion al desglose:** `order-columns.tsx` y `order-responsibles.tsx` **NO importan** el
> componente; el unico import de producto era `order-sheet.tsx:23`.

**Toca**, **opcion promocion** (si QC-102 esta mergeado en `dev`; lo confirma el leader en F2.0):
- `components/shared/responsible-avatars.tsx` (**movido** desde
  `app/(private)/pedidos/components/responsible-avatars.tsx`)
- `app/(private)/pedidos/components/index.ts` (reexport desde la nueva ubicacion)
- `app/(private)/pedidos/components/order-columns.tsx`, `.../order-responsibles.tsx` (imports)
- `tests/unit/pedidos-ui/*` que importen esos simbolos

**Toca**, **plan B** (si QC-102 sigue sin mergear):
- `app/(private)<RUTA>/components/assigned-order-responsibles.tsx` (**nuevo**, reutilizando
  `getInitials` de `lib/shared/ui/initials.ts`)

**Depende de:** decision del leader en F2.0 (`design.md > 8.3`).
**Hecho cuando:** **no** se toca `components/shared/data-table/`, y si se toma el plan B la
duplicacion queda anotada como **deuda con destinatario** en `progress/impl_QC-88-*.md`.

---

## Bloque 4 — Lo que esta feature rompe y tiene que arreglar

### T15 · Actualizar el E2E de permisos por el cambio de aterrizaje (R34)

**Toca**
- `e2e/permisos.spec.ts` (el aterrizaje afirmado; `HIDDEN_NAV_TEST_IDS` **no** gana el item nuevo)

**Depende de:** T11, T12.
**Hecho cuando:** el recorrido del Operador vuelve a pasar **en Chromium y WebKit**; `nav-inventario`
sigue visible; **el 404 sobre `ORDERS_ROUTE` se conserva tal cual** —es lo que demuestra que
`asignaciones.consultar` **no** abre `/pedidos`—; y la excepcion de
`tests/guards/guard-e2e-landing.test.ts` para este spec **se conserva con su motivo** (no se anade
ninguna excepcion nueva).

### T16 · E2E del recorrido del Operador (R38)

**Toca**
- `e2e/pedidos-asignados.spec.ts` (**archivo nuevo**; no se toca `e2e/pedidos.spec.ts` ni
  `e2e/pedidos-responsables.spec.ts`)

**Depende de:** T12, T15.
**Hecho cuando:** un solo recorrido, con prefijo de fixture propio y `RUN_ID` por worker, que:
entra con `loginAndLand` (nunca un `login()` local ni una ruta escrita a mano, o
`guard-e2e-landing` muerde); ve **solo** sus pedidos en `PENDIENTE`/`EN_CURSO`; **no** ve el
`ENTREGADO` ni el `CANCELADO` sembrados a proposito; **no** ve el pedido asignado a otra persona;
encuentra el `EN_CURSO` con el disparador **deshabilitado y con su motivo**; y limpia en `afterAll`
respetando el orden de las FK `RESTRICT` (asignaciones → pedido → receta → personas → empresa).
Corre en **Chromium y WebKit**.

### T18 · Trazabilidad y cierre

**Toca**
- `progress/impl_QC-88-listado-de-pedidos-asignados.md` (**nuevo**)

**Depende de:** todas.
**Hecho cuando:** el archivo contiene el mapa **`R1`…`R40` → test concreto**, sin ningun hueco
(`CHECKPOINTS.md > Trazabilidad`), la salida real de lo que se corrio, y la nota de las deudas
declaradas (plan B de T17 si se tomo, y el tope de ids del riesgo 1 de `design.md > 14`).

---

## Si el humano elige la **opcion A** de `design.md > 2.2`

Cambian **T4, T5 y T6** y nada mas. Archivos que pasarian a tocarse, para que el leader valide el
conflicto: `lib/modules/pedidos/ports/order-repository.ts`, `lib/modules/pedidos/domain/list-query.ts`
**y sus cuatro copias en los otros modulos**, `lib/modules/pedidos/domain/order-queryable.ts`,
`lib/modules/pedidos/adapters/driven/persistence/order-prisma.ts` y
`tests/guards/guard-contrato-listados.test.ts`. **Es justo la superficie que QC-60 va a reescribir**,
y ademas hay que resolver antes el problema de autorizacion de `design.md > 2.2` (problema 1): sin
respuesta a eso, la opcion A **no cumple R5**.

---

## Orden sugerido

```
T1 ─┬─ T2 ── T3
    │
T7 ─┼──────────────┐
T4 ─┴─ T5 ─────────┴─ T6 ── T8 ── T9 ──┐
                                       ├─ T12 ── T13
T10 ── T11 ────────────────────────────┤        └─ T14
T17 ───────────────────────────────────┘
                              T11+T12 ── T15 ── T16 ── T18
```

`[P]` reales: **T1 / T4 / T7** al principio, y **T3 / T14** dentro de su bloque. No comparten ningun
archivo entre si.
