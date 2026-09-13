# QC-102 — responsables-en-la-pantalla-de-pedidos · design.md

> Diseño de la **otra mitad** de QC-87. Los cuatro casos de uso de asignación ya existen, están
> mergeados en `dev` y se **consumen**. Lo único que nace aquí de backend es **una consulta de
> responsables para varios pedidos a la vez**; el resto es pantalla.
>
> Todo lo que sigue se verificó **en disco**, en este worktree, no de memoria.

## 0. Hallazgos

Cinco. **Ninguno reabre una decisión cerrada**: se anotan y el requisito se escribe tal y como la
decisión lo dejó (instrucción de F1.2).

**H1 — El buscador de personas y el selector de grupos exigen un permiso que la decisión 2 no
nombra.** Verificado: `listUsersAction` y `listWorkGroupsAction` llaman a casos de uso cuya primera
línea es `requirePermission(actor, 'usuarios.consultar')`
(`lib/modules/identity/domain/list-users.ts:65`, `list-work-groups.ts:63`). La decisión cerrada 2
reparte la pantalla entre «ve» (`pedidos.consultar`) y «asigna» (`asignaciones.modificar`), y
**`usuarios.consultar` es un tercer permiso que no aparece en esa decisión**. Consecuencia real:
alguien con `asignaciones.modificar` pero **sin** `usuarios.consultar` vería el panel en modo de
escritura y **con los dos catálogos vacíos**.
**Qué se hace**: **nada que reabra la decisión.** El diseño degrada como ya degrada esta misma
pantalla (`loadFormCatalogs`, `order-list-section.tsx:65-89`): si un catálogo falla o vuelve vacío,
el panel se abre con el selector vacío y un texto de lista vacía, no tumba la lista y no inventa un
permiso nuevo (R15 prohíbe añadirlo). Queda escrito como **riesgo 1** y como dato para el humano:
si quiere que ese caso se vea distinto, es una decisión suya, no del spec.

**H2 — La consecuencia aceptada de la decisión 3 es exactamente lo que se ve en el código.**
`FINAL_ORDER_REASON` está en `order-row-actions.tsx:59` y se pinta como texto visible bajo los tres
botones cuando el pedido es final. La decisión 3 pide que la sección de responsables **calle**. Así
que en la misma fila conviven un párrafo que dice «no se puede editar, cancelar ni eliminar» y unos
controles de asignación que desaparecen sin decir por qué. **Está aceptado por el humano y escrito
en la tabla**: se implementa así (R29), y este hallazgo solo confirma que el efecto es literal.

**H3 — La consulta en lote NO puede comportarse como la de un solo pedido ante un id desconocido.**
`createListOrderResponsibles` lanza `OrderNotFoundError` si `orders.findAliveById` devuelve `null`
(`list-order-responsibles.ts:124-125`). Replicarlo en el lote costaría **una consulta por pedido**
—justo lo que la decisión 5 prohíbe— o un método nuevo en `OrderCatalog`. Se resuelve por **R7**:
en el lote, un id desconocido devuelve entrada **vacía** y no rompe la página. No hay fuga: la
lectura ya está acotada por `companyId` (R3), así que un pedido de otra empresa devuelve vacío
igual que uno inexistente y los dos son indistinguibles.

**H4 — El tope de identificadores se declara dos veces, y es inevitable.** El lote se acota a **25**
identificadores, que es `MAX_PAGE_SIZE` (`lib/shared/pagination.ts:17`). El dominio de
`asignaciones` **no puede importar `lib/shared/**`** (`docs/architecture.md > La regla de
dependencias`), así que la constante se declara en el dominio y **un test afirma que los dos números
coinciden**. Sin ese test, ampliar la página a 50 dejaría media página sin responsables y en
silencio.

**H5 — El tooltip de `+N` no está verificado en táctil, y eso es un desconocido, no un sí.**
`components/ui/tooltip.tsx` es el primitivo de `@base-ui/react`, que abre por *hover* y por *foco*;
si abre o no al tocar en iOS **no se ha comprobado en este repo** y no se afirma (regla 6 de
`CLAUDE.md`). Por eso **R35** exige que la lista completa sea alcanzable **abriendo el panel** —la
segunda puerta que la decisión 1 creó— y no solo por el tooltip, y el disparador del `+N` es un
`button` con `aria-label` y 44x44 px, como ya hace `product-field.tsx:79-100`.

## 1. Dónde se compone el lote, y por qué NO en `pedidos`

La semilla lo dejó explícito: **la decisión es del diseño**, y el ciclo es el criterio.

`asignaciones` **ya depende de `pedidos`**: `ListOrderResponsiblesDeps` declara
`readonly orders: OrderCatalog` y lo importa del contrato público de `pedidos`
(`list-order-responsibles.ts:45`). La flecha `asignaciones → pedidos` existe hoy en disco.

**Decisión: se compone en la PANTALLA**, en el Server Component `OrderListSection`
(`app/(private)/pedidos/components/order-list-section.tsx`), que ya es el sitio donde hoy se piden
la lista y los dos catálogos del panel. Dos llamadas seguidas:

```
listOrdersAction(params)                      → página de pedidos (ya existe)
listResponsiblesForOrdersAction(orderIds)     → responsables de esa página (NUEVO)
```

Por qué ahí y no en otro sitio:

- **No hay ciclo posible.** `pedidos` no gana ni una línea; sigue sin conocer `asignaciones`
  (**R14**). Verificado: hoy `grep orderAssignment lib/modules/pedidos` no devuelve nada.
- **`app/**` puede llamar a los dos módulos.** La tabla de dependencias lo permite explícitamente:
  `app/**` importa `lib/composition`, el barrel de cualquier módulo y sus adaptadores driving.
- **Es el mismo patrón que ya usa esta pantalla.** `loadFormCatalogs` ya compone la lista con dos
  catálogos de **otros** módulos (`recetas`, `unidades`) en este mismo archivo.

La composición del `Map` `orderId → responsables` y el reparto por fila ocurren en el servidor; a la
tabla (módulo de cliente) bajan **solo datos serializables**, como hoy.

### Alternativas descartadas

**A1 — Componer dentro de `listOrders`, en el dominio de `pedidos`.** Es lo que haría el listado
«autosuficiente» y lo que uno escribe por inercia, porque el nombre de la receta se compone ahí
mismo (`list-orders.ts:145`). **Descartada: crea el ciclo `pedidos → asignaciones → pedidos`.**
`asignaciones` ya importa el contrato de `pedidos`, así que la vuelta lo cierra, y
`guard-arquitectura-modulos.test.ts` no es lo único que sufriría: un ciclo entre contratos públicos
es exactamente lo que la arquitectura hexagonal por módulos existe para evitar. Es además la mitad
que la semilla señala con nombre propio.

**A2 — Un módulo «orquestador» nuevo que dependa de los dos.** Rompería el ciclo, sí. **Descartada
por sobre-ingeniería**: un módulo entero —contrato, dominio, puerto, adaptador, cableado— para
ejecutar dos `await` seguidos, sin ninguna regla de negocio propia que justificarlo. El reviewer
rechaza lo que no está pedido (`docs/architecture.md > Dominio`).

**A3 — Denormalizar: una columna de responsables en `orders`, o una vista materializada.** Quitaría
la segunda consulta. **Descartada**: viola **R15** (el diff de `db/**` tiene que ser vacío),
duplicaría el dato congelado de QC-86 en dos sitios que pueden divergir, y la segunda consulta que
ahorra cuesta hoy un `findMany` por `order_id IN (...)` sobre la PK.

**A4 — Pedir los responsables en el cliente al abrir el panel (SWR o una Server Action por fila).**
**Descartada por la decisión cerrada 7** —el panel no consulta al abrirse— y porque la decisión 4
exige el dato **ya en el listado**: si el listado lo trae, pedirlo otra vez es una consulta que
sobra por cada apertura.

## 2. El backend nuevo, pieza a pieza

Nada de esto toca `db/schema.prisma`: son cuatro archivos de código y dos líneas de cableado.

### 2.1 Puerto (`ports/order-assignment-repository.ts`) — un método más

```ts
/** Las filas de ESOS pedidos en ESA empresa, en UNA sentencia (R4, R5). */
listByOrdersInCompany(
  companyId: string,
  orderIds: readonly string[],
): Promise<readonly OrderAssignmentRowWithOrder[]>;

export type OrderAssignmentRowWithOrder = AssignmentRow & { readonly orderId: string };
```

`companyId` sigue siendo el **primer parámetro**, como en los otros tres métodos: una llamada que lo
olvide **no compila** (R3). El tipo de fila **extiende** `AssignmentRow` en vez de redefinirlo: aquí
`orderId` sí hace falta, porque es lo que agrupa.

### 2.2 Adaptador driven (`adapters/driven/persistence/order-assignment-prisma.ts`)

```ts
db.orderAssignment.findMany({
  where: { companyId, orderId: { in: orderIds } },
  select: { ...ASSIGNMENT_SELECT, orderId: true },
  orderBy: [{ orderId: 'asc' }, { userId: 'asc' }],
});
```

**UNA sentencia, sin `include` y sin `join`** (R5). El `orderBy` es barato y total: la PK de
`order_assignments` es `(order_id, user_id)` —QC-86—, así que la lectura ya es determinista **antes**
de resolver nombres; el orden final por nombre lo pone el caso de uso, igual que hoy.
`orderIds` vacío **no llega aquí**: el caso de uso corta antes (R8).

### 2.3 Caso de uso (`domain/list-responsibles-for-orders.ts`)

```ts
export type OrderResponsiblesEntry = {
  readonly orderId: string;
  readonly responsibles: readonly OrderResponsible[];
};

export type ListResponsiblesForOrdersDeps = {
  readonly assignments: OrderAssignmentRepository;
  readonly people: PeopleDirectory;
  readonly now?: () => Date;
};

createListResponsiblesForOrders(deps):
  (actor, orderIds: unknown) => Promise<readonly OrderResponsiblesEntry[]>
```

Orden de ejecución, y es el requisito:

1. `requirePermission(actor, 'pedidos.consultar')` — **primera línea**, antes de zod y antes de
   ningún puerto (R2). Reutiliza `requirePermission` del módulo; no se escribe una segunda.
2. `zod`: array de uuid, `.max(25)` (H4), deduplicado con `Set`. Inválido → `ValidationError`
   (`invalid_input`, R9).
3. Lista vacía → `[]`, **sin tocar puertos** (R8).
4. `assignments.listByOrdersInCompany(actor.companyId, ids)` — **1 consulta**.
5. `people.findRefsIncludingDeletedInCompany(companyId, userIdsÚnicos, now)` — **1 consulta**, con
   los ids de **toda la página** deduplicados: una persona que está en cinco pedidos se pregunta una
   vez (R4, y el mismo truco que `list-orders.ts:140` hace con las recetas).
6. Agrupar en memoria por `orderId`, ordenar cada grupo con el **mismo comparador** que
   `list-order-responsibles.ts` y devolver **una entrada por id pedido**, con `[]` para los que no
   tengan filas (R1, R6, R7).

**El comparador y `toOrigin` se extraen a un archivo del dominio** (`domain/responsible-order.ts`) y
los **dos** casos de uso lo importan. No se copia: dos definiciones del mismo orden divergen, y R6
exige que el lote ordene **igual** que el singular.

**`OrderCatalog` NO es dependencia de este caso de uso** (H3): no se comprueba la existencia de cada
pedido. Los ids vienen de una página que `listOrders` ya devolvió —viva y de la empresa— y la
empresa la vuelve a aplicar el `where` (R3).

### 2.4 Adaptador driving (`adapters/driving/order-assignment-actions.ts`) — una función más

```ts
export type OrderResponsiblesBatchResult =
  | { status: 'success'; data: readonly OrderResponsiblesEntry[] }
  | ErrorState;

export async function listResponsiblesForOrdersAction(
  orderIds: readonly string[],
): Promise<OrderResponsiblesBatchResult>;
```

Argumentos **ya tipados**, nunca `FormData` (R13): no viene de un `<form>`. Mismo `currentActor()`,
mismo `toErrorState` por `code`, **ningún permiso comprobado aquí**. Se añade **al final** del
archivo existente, sin reordenar nada. No se reexporta desde el barrel (R14/QC-87 R46).
Devuelve **array**, no `Map`: el array es plano, ordenado y serializable sin depender de qué
estructuras soporte el serializador de RSC.

### 2.5 Composición (`lib/composition/index.ts`)

Una factory más en el bloque `asignaciones` ya existente, con el **mismo**
`orderAssignmentRepository` y el **mismo** `peopleDirectory` que los otros cuatro casos de uso. Sin
adaptadores nuevos y sin `OrderCatalog`.

### 2.6 Contrato (`lib/modules/asignaciones/index.ts`)

Bloque **nuevo al final**, sin tocar lo de arriba: `createListResponsiblesForOrders`,
`ListResponsiblesForOrdersDeps` y `OrderResponsiblesEntry`. Sigue sin arrastrar `next/*`,
`@prisma/client` ni `'use server'`.

## 3. La pantalla

### 3.1 Contratos de la UI

```ts
// app/(private)/pedidos/components/order-responsibles.tsx  ('use client')
type ResponsibleGroup =
  | { kind: 'direct'; responsibles: readonly OrderResponsible[] }
  | { kind: 'workGroup'; workGroupId: string; workGroupName: string;
      responsibles: readonly OrderResponsible[] };
```

El agrupado por origen (R25) se deriva **en memoria** de lo que ya trae cada fila; el nombre del
grupo sale del **origen congelado** de la propia fila (R12), nunca de una consulta a `work_groups`
—tabla que además es de otro módulo—.

### 3.2 Archivos que se tocan y qué gana cada uno

| Archivo | Cambio |
| --- | --- |
| `order-list-section.tsx` | segunda llamada (lote) y reparto por fila; degradación si falla (R20) |
| `order-columns.tsx` | columna nueva `responsibles`, `sortable: false`, sin `filter` (R16) |
| `order-list-skeleton.tsx` | `ORDER_SKELETON_COLUMN_COUNT` +1 (R22) |
| `order-row-actions.tsx` | cuarto botón, «Responsables», con `onResponsibles?` (R24) |
| `order-sheet.tsx` | `OrderRowSheetActions` abre el panel en la sección; prop `section` (R23, R24) |
| `order-form.tsx` | monta la sección de responsables dentro del panel (R23) |
| **nuevos** | `responsible-avatars.tsx` (fila, R17/R18/R21), `order-responsibles.tsx` (panel, R25–R34) |
| `components/index.ts` | barrel: exporta lo nuevo (R36) |

**El botón «Responsables» de la fila NO se deshabilita en estado final.** `isFinalOrderStatus`
deshabilita los otros tres (R24 de QC-35), pero ver responsables de un pedido entregado es
precisamente lo que la decisión 3 y QC-87 R13 permiten: lo que desaparece dentro del panel son los
controles de escritura (R29).

### 3.3 El `+N`

Tres avatares y, si sobran, un `+N` (R17). El ancho se fija con una clase de ancho **constante** —no
`w-fit`— para que la columna no baile (R18). El `+N` es un `button` de 44x44 px con `aria-label`
(«Ver los N responsables restantes») que dispara el tooltip **y** abre el panel al pulsarlo: así el
dato existe por dos caminos y ninguno depende de `:hover` (R35, H5).

### 3.4 Solo lectura y estado final

```
puedeEscribir = actor tiene 'asignaciones.modificar'   (viene por props desde el servidor)
esFinal       = isFinalOrderStatus(order.status)        (ya existe, se reutiliza)
controles de escritura se montan  ⟺  puedeEscribir && !esFinal
```

`puedeEscribir` baja **por props** desde el Server Component, que lee la sesión; el componente de
cliente no lee cookies ni permisos. **Y no autoriza nada** (R28): el corte real es
`requirePermission` en el service de QC-87, y hay test de que la acción rechaza aunque la pantalla
se saltara.

### 3.5 Errores, toasts y refresco

`sonner` ya está en uso en `order-sheet.tsx:6` y su región la monta el layout privado: **no se monta
otra** (R33). Éxito de asignar → `toast.success` con el `added` que devuelve la propia acción de
QC-87 (su `AssignResponsiblesFormState` ya lo trae), y `router.refresh()` —ni `push` ni `replace`,
ni `revalidatePath`—, exactamente como hace hoy `handleSaved`. Error → se pinta **dentro** del panel
traducido por `code` (R34).

## 4. Datos, RLS y migraciones

**Ninguna.** No hay tabla nueva, ni columna, ni índice, ni migración: **el diff de `db/**` es vacío**
(R15). La tabla `order_assignments` la creó QC-86 con su empresa, su RLS forzada y sus constraints;
la PK `(order_id, user_id)` es el índice que sirve el `IN` del lote. Tampoco nace ningún permiso: se
reutilizan `pedidos.consultar` y `asignaciones.modificar`, y el catálogo sigue con **quince**.

## 5. Dependencias de terceros

**Ninguna nueva**, y por tanto **no hay cuatro checks que anotar ni fila que aprobar** en
`docs/dependencias.md` (R39). Verificado en disco, no supuesto:

| Pieza | Dónde está | Comprobado |
| --- | --- | --- |
| `getInitials` | `lib/shared/ui/initials.ts` | sí, con test propio (`tests/unit/initials.test.ts`) |
| `Avatar` | `components/ui/avatar.tsx` | sí |
| `Tooltip` | `components/ui/tooltip.tsx` | sí, y ya usado en `product-field.tsx` |
| `sonner` | usado en `order-sheet.tsx` | sí |
| tabla de datos | `components/shared/data-table` | sí |

**No se invoca `npx shadcn add`.** Si durante la implementación alguien cree que hace falta una
librería, eso es una **parada**: se propone, no se instala (regla 7 de `CLAUDE.md`).

## 6. Multiplataforma

Objetivos táctiles de 44x44 (`min-h-11 min-w-11`, la constante que ya usan `order-row-actions.tsx` y
`order-sheet.tsx`), 16 px en el campo del buscador, y **ninguna información solo por `:hover`**
(R35). **No se declara ninguna excepción de escritorio.** El punto delicado es el tooltip del `+N`,
y su mitigación es H5: el panel lo muestra todo.

## 7. Riesgos

1. **H1**: escritura habilitada con catálogos vacíos si falta `usuarios.consultar`. Mitigación:
   degradar y decirlo con un texto de lista vacía; decisión del humano si quiere otra cosa.
2. **La página crece de 2 a 3 consultas** (pedidos, recetas, responsables) más la de personas: 4
   consultas por render de la lista, **constantes** (R4). Si alguien «optimiza» metiendo un
   `include`, R5 y su test lo paran.
3. **El tope de 25 duplicado** (H4): mitigado con el test que ata los dos números.
4. **El E2E de QC-35 (`e2e/pedidos.spec.ts`) toca la tabla de pedidos**, y esta ficha añade una
   columna. R38 exige que su guion no cambie; si algún selector cuenta columnas, el arreglo es del
   selector, no del guion, y se anota en `progress/`.
