# QC-87 — asignar-responsables-a-un-pedido · design.md

> El QUÉ está en `requirements.md` (R1–R51) y el Alcance lo cerró el humano antes del spec. Aquí va
> el CÓMO de la **mitad BACKEND**: **cuatro casos de uso** en el módulo `asignaciones`, **un puerto
> propio** con su adaptador Prisma, **tres contratos públicos nuevos** en `pedidos` e `identity` para
> no tocar sus tablas, **tres Server Actions**, **cuatro códigos de error nuevos** y **cero**
> migración, **cero** permiso nuevo y **cero** pantalla.
>
> Precedentes que se siguen en vez de reinventarse:
> **QC-86** (`specs/QC-86-modelo-de-asignacion-de-pedidos/`) — el modelo que esta ficha consume
> entero; **QC-84** (`lib/modules/identity/domain/*work-group*`) — la forma de un caso de uso con
> `requirePermission` en primera línea, puerto con `…AliveInCompany`, resultados discriminados y
> Server Actions con `FormData`; **QC-34** (`lib/modules/pedidos/`) — los estados del pedido y su
> guardia de transiciones; **QC-33/QC-34** — `RecipeCatalog` como patrón de «servicio que un módulo
> ofrece a otro por interfaz»; **QC-94** — el caso de uso de solo lectura con su puerto mínimo.

---

## 0. Hallazgos: lo que la semilla dice y no se implementa tal cual

Ninguno bloqueante. Se anotan aquí porque el encargo pide **decirlo en `design.md` en vez de tocar la
tabla de decisiones**.

1. **La decisión 11 («el E2E entra aquí») se refiere al conjunto, y el E2E de PANTALLA es de
   QC-102.** La semilla se escribió **antes** de la partición de F1.0 y su recorrido —«abrir un
   pedido, marcar una persona, aplicar un grupo, sacar a alguien y comprobar que el listado muestra
   los avatares y el nombre del grupo»— es literalmente pantalla: **no hay ninguna ruta que
   Playwright pueda visitar en esta mitad** (R50). Lo que esta ficha aporta como evidencia
   equivalente son **tests de integración contra Postgres real** (§8), que es donde se demuestran el
   congelado, el filtro de `active`, la reaplicación y los rechazos por estado. QC-102 hereda el E2E
   con su motivo escrito, exactamente como QC-84 R48 lo difirió a QC-85.
2. **La decisión 4 (panel lateral) y la 6 (avatares con el nombre del grupo) no se implementan
   aquí.** Lo que esta mitad hace es **entregar el dato que las hace posibles**: la consulta devuelve
   la persona, su origen y el **nombre congelado** del grupo (R35). Que se pinte como avatar con una
   etiqueta es de QC-102, y por eso las dos filas se mapean a **R50** además de a R35.
3. **`asignaciones.consultar` sigue sin estrenarse.** QC-86 R29 dijo que **ninguno** de los dos
   permisos se exigía todavía; esta ficha estrena **`asignaciones.modificar`** (R1) y **no** el de
   consulta, porque la decisión 5 fijó que **ver los responsables basta con `pedidos.consultar`**.
   `asignaciones.consultar` («ver los pedidos que **tengo** asignados») lo estrena **QC-88**. Es
   deliberado y se escribe para que nadie lo «arregle» exigiéndolo en la consulta de esta ficha: lo
   convertiría en un permiso que el Administrador tiene y que además abriría un listado que todavía
   no existe.
4. **La coherencia de empresa con el PEDIDO sigue sin poder garantizarse**, y no es de esta ficha
   arreglarlo: `orders` no tiene `company_id` (QC-86 R14, épica QC-46). El triángulo que la base
   cierra es **persona ↔ grupo ↔ fila**; lo que esta ficha añade en el service es que la empresa
   escrita sea **la del actor** (R5) y que la lectura se acote a ella (R7). Un pedido de otra empresa
   no es distinguible hoy, y **R7 es lo máximo exigible** hasta QC-46.
5. **«Quitar un grupo del pedido» está incluido** (R32–R34) aunque el encargo enumerara solo
   «desasignar persona a persona»: la **decisión 7** hereda de QC-86 que quitar el grupo se lleva a
   las personas que trajo, y sin caso de uso QC-102 no podría ofrecerlo. Está aislado en su propio
   archivo y su propia Server Action para que **caiga de un tirón** si el humano lo difiere (pregunta
   abierta 3).

---

## 1. Los cuatro casos de uso

```
lib/modules/asignaciones/
  index.ts                                   ← contrato público (ya existe; CRECE)
  domain/
    order-assignment.ts                      ← tipos de QC-86 (ya existe; NO se toca)
    actor.ts                                 ← NUEVO: Actor + requirePermission del módulo
    errors.ts                                ← NUEVO: AsignacionesError y sus subclases
    assignment-input.ts                      ← NUEVO: los tres esquemas zod del borde
    assignment-view.ts                       ← NUEVO: la proyección de salida de la consulta
    assign-responsibles.ts                   ← NUEVO: caso de uso 1 (sueltas + grupos)
    remove-work-group-from-order.ts          ← NUEVO: caso de uso 2
    unassign-responsible.ts                  ← NUEVO: caso de uso 3
    list-order-responsibles.ts               ← NUEVO: caso de uso 4
  ports/
    order-assignment-repository.ts           ← NUEVO: el único puerto propio
  adapters/
    driven/persistence/order-assignment-prisma.ts   ← NUEVO: el único que toca prisma.orderAssignment
    driving/order-assignment-actions.ts             ← NUEVO: 3 Server Actions + 1 consulta tipada
```

Firmas (el `now` entra **por parámetro** en todo lo que depende del reloj, como en `identity`):

```ts
createAssignResponsibles(deps): (actor, input: unknown, now: Date) => Promise<AssignOutcome>;
createRemoveWorkGroupFromOrder(deps): (actor, input: unknown) => Promise<{ removed: number }>;
createUnassignResponsible(deps): (actor, input: unknown) => Promise<void>;
createListOrderResponsibles(deps): (actor, orderId: string) => Promise<readonly OrderResponsible[]>;

type AssignOutcome = { readonly added: number };          // R16
type OrderResponsible = {                                  // R35, R39
  readonly userId: string;
  readonly displayName: string;
  readonly origin: AssignmentOrigin;                       // el tipo de QC-86, sin cambios
};
```

`AssignmentOrigin` es **el de QC-86** (`{ kind: 'direct' } | { kind: 'workGroup', workGroupId,
workGroupName }`): la unión discriminada ya hace imposible «grupo sin nombre congelado» en
TypeScript, así que **R35 no necesita un tipo nuevo**, solo consumir el que existe.

**`requirePermission` en la primera línea de los cuatro** (R1, R3), con `actor.ts` **copiado del de
`pedidos`**: importa `assertPermission` y `PermissionCode` del **barril** de `identity` —nunca por
ruta profunda— y lanza el `UnauthorizedError` **de este módulo**, subclase de `AsignacionesError`,
para que el traductor del driving lo siga reconociendo con un solo `instanceof`. El `Actor` de este
módulo lleva `id`, **`companyId`** y `permissions` (R4, R5): la empresa viaja **con** los permisos y
no como argumento suelto, igual que en `identity` (QC-66 dec. 14).

---

## 2. Lo que `asignaciones` NO puede saber por su cuenta: tres contratos nuevos

Es el punto delicado de la ficha. QC-86 R31 obliga a conocer el pedido, la persona y el grupo **por
contrato público**, y hay una guardia que lo hace cumplir (`tests/guards/guard-arquitectura-modulos.test.ts`,
bloques de imports y de `prisma.<modelo>`): `asignaciones` **no puede** escribir `prisma.order`,
`prisma.user` ni `prisma.workGroup`, ni importar sus `ports/` o `domain/` por ruta profunda. Se
verificó en disco antes de decidir.

La salida es la que el repo ya usa: **cada módulo publica una interfaz de servicio, la implementa un
adaptador driven SUYO y la cablea `lib/composition`** (`docs/architecture.md > Dominio` n.º 2). Es
literalmente lo que QC-34 hizo con `RecipeCatalog` para que `pedidos` supiera de una receta.

### 2.1 `pedidos` publica `OrderCatalog` (nuevo)

```ts
// lib/modules/pedidos/domain/order-catalog.ts
export type OrderAssignmentTarget = {
  readonly id: string;
  readonly status: OrderStatus;   // el enum de QC-34, sin copiarlo
};

export interface OrderCatalog {
  /** `null` = no existe o está dado de baja: para quien pregunta son el mismo caso (QC-34 R33). */
  findAliveById(id: string): Promise<OrderAssignmentTarget | null>;
}
```

- Implementación: `lib/modules/pedidos/adapters/driven/persistence/order-catalog-prisma.ts`, con el
  mismo filtro `deleted_at IS NULL` que `findAliveById` del repositorio de QC-34. **No se reutiliza
  `OrderRepository`**: es el puerto **interno** de `pedidos` y sacarlo del módulo sería exactamente
  el «repositorio compartido entre módulos» que la arquitectura prohíbe.
- Devuelve **el estado y nada más** (no el número, ni la receta, ni las cantidades): lo que no está
  en el tipo no se puede filtrar por descuido, mismo criterio que `MemberCandidate` de QC-84.
- **`pedidos` no gana ningún caso de uso** ni cambia ninguno de los seis: solo un tipo, una interfaz,
  un adaptador y dos líneas de barril.

### 2.2 `identity` publica `PeopleDirectory` y `WorkGroupDirectory` (nuevos)

```ts
// lib/modules/identity/domain/people-directory.ts
export type PersonRef = {
  readonly id: string;
  readonly displayName: string;   // ya compuesto con buildDisplayName (QC-84 R19)
  readonly isActive: boolean;     // estado EFECTIVO en `now`, no la columna
};

export interface PeopleDirectory {
  /** Las personas VIVAS de esa empresa cuyo id se pide. Un id que no existe, está de baja o es de
   *  otra empresa simplemente NO vuelve: quien pregunta no distingue los tres casos (R6). */
  findAliveRefsInCompany(companyId: string, ids: readonly string[], now: Date): Promise<readonly PersonRef[]>;
  /** Para la consulta de responsables: incluye a las personas dadas de baja, inactivas o
   *  bloqueadas, porque siguen siendo responsables (R37, QC-86 dec. 9). `isActive` viene igual. */
  findRefsIncludingDeletedInCompany(companyId: string, ids: readonly string[], now: Date): Promise<readonly PersonRef[]>;
}

// lib/modules/identity/domain/work-group-directory.ts
export type WorkGroupSnapshot = {
  readonly id: string;
  readonly name: string;                        // el nombre de AHORA: es el que se congela (R19)
  readonly activeMemberIds: readonly string[];  // SOLO los `active` efectivos (R19, R20, R21)
};

export interface WorkGroupDirectory {
  /** `null` = el grupo no existe, está dado de baja o es de otra empresa (R25). */
  findSnapshotAliveInCompany(companyId: string, workGroupId: string, now: Date): Promise<WorkGroupSnapshot | null>;
}
```

**El filtro de `active` vive en `identity`, no en `asignaciones`, y es R21.** El adaptador que
implementa `WorkGroupDirectory` reutiliza **`listMembersAliveInCompany`** del repositorio de QC-84 y
**`effectiveAccountStatus(view, now)`** —la única función por la que pasan todos los lectores del
estado de una cuenta (QC-78 R7)—. Así «quién se asigna al aplicar el grupo» y «quién se ve en la
pantalla de miembros del grupo» son **la misma lista por construcción**, que es exactamente lo que la
decisión 3 pide («nadie pulsa 5 y obtiene otra cosa»). Un adaptador driven **puede** importar
`../../domain` de su propio módulo, así que esto no rompe ninguna regla.

**Los dos precios, escritos:**
- dar de alta a alguien y meterlo en el turno **no le asigna nada** hasta que entre y cambie su
  contraseña (decisión 3): su estado efectivo es `pending` y `activeMemberIds` no lo trae;
- una cuenta bloqueada **por plazo vencido** vuelve sola a `active` sin ninguna escritura, porque el
  estado efectivo depende del **reloj** (QC-78) — por eso `now` es parámetro y no `new Date()`.

### 2.3 El cableado

`lib/composition/index.ts` gana cuatro líneas: instancia los tres adaptadores nuevos
(`orderCatalogPrisma`, `peopleDirectoryPrisma`/`workGroupDirectoryPrisma`,
`orderAssignmentPrisma`) y expone `asignaciones = { assignResponsibles, removeWorkGroupFromOrder,
unassignResponsible, listOrderResponsibles }`. Es el **único** archivo que ata puerto e
implementación (R47).

---

## 3. El puerto propio y su adaptador

```ts
// lib/modules/asignaciones/ports/order-assignment-repository.ts
export type NewAssignment = {
  readonly orderId: string;
  readonly userId: string;
  readonly companyId: string;
  readonly workGroupId: string | null;
  readonly workGroupName: string | null;   // juntos o ninguno: el CHECK de QC-86 R7
};

export type AssignmentRow = {
  readonly userId: string;
  readonly workGroupId: string | null;
  readonly workGroupName: string | null;
};

export interface OrderAssignmentRepository {
  /** Inserta las filas que FALTAN y no toca las que ya están (R15, R22). Devuelve cuántas creó
   *  (R16). Una sola sentencia, dentro de una transacción con el resto de la operación (R27). */
  insertMissing(rows: readonly NewAssignment[], now: Date): Promise<number>;
  /** Las filas del pedido de ESA empresa, ordenadas por el adaptador (R7, R38). */
  listByOrderInCompany(companyId: string, orderId: string): Promise<readonly AssignmentRow[]>;
  /** Borrado FÍSICO de UNA fila (R29). `'not_found'` = esa persona no es responsable (R30). */
  deleteOne(companyId: string, orderId: string, userId: string): Promise<'ok' | 'not_found'>;
  /** Borrado FÍSICO de las filas de ese pedido con ESE origen (R32). Devuelve cuántas (R34). */
  deleteByWorkGroup(companyId: string, orderId: string, workGroupId: string): Promise<number>;
}
```

- **`insertMissing` es `createMany({ data, skipDuplicates: true })`**, que Prisma traduce a
  `INSERT ... ON CONFLICT DO NOTHING` contra `order_assignments_pkey`. Es **la traducción exacta de
  las decisiones 2 y 3 de QC-86**: la persona que ya estaba **no se toca** —su origen y su nombre
  congelado siguen siendo los de entonces (R15, R22)— y la que falta entra, **sin `SELECT` previo**
  y por tanto **sin carrera**. El número de filas creadas que devuelve es **R16 y R34 sin contar
  nada a mano**.
- **La deduplicación DENTRO de la misma operación la hace el dominio** (R24), antes de llamar al
  puerto: se recorre primero la lista de personas sueltas y después los grupos **en el orden
  recibido**, quedándose con la **primera** aparición de cada `userId`. Se hace en el dominio y no en
  la base porque es donde se puede **probar con objetos planos** que gana el primero, y porque un
  lote con la misma clave repetida es una entrada que el dominio debe normalizar, no una carrera.
- **`updatedAt` se pasa explícito.** `createMany` no dispara `@updatedAt` en todos los caminos y la
  columna es `NOT NULL` **sin default de base** (QC-86 §1.1): el adaptador escribe `now` en
  `createdAt` y `updatedAt`. Es la trampa que QC-4, QC-47 y QC-83 ya dejaron anotada.
- **`companyId` es el primer parámetro de los tres métodos de lectura y borrado**, con el mismo
  criterio que `WorkGroupRepository`: una llamada que lo olvide **no compila**, en vez de leer o
  borrar sobre la empresa equivocada (R7).
- **El orden final (R38) lo pone el CASO DE USO, no el adaptador**, y es la única excepción al
  reparto habitual del repo: se ordena por **nombre mostrable**, que vive en `users` y que este
  módulo **no puede consultar** (§11.3). El adaptador devuelve las filas ordenadas por `user_id`
  —barato, cubierto por la PK— para que la lectura sea determinista **antes** de resolver nombres, y
  el caso de uso reordena con los `PersonRef` ya resueltos, desempatando por `userId`.
- **Ningún método de este puerto actualiza una fila.** No hay `update`: la asignación se crea o se
  borra, nunca se edita (QC-86 R8, R9). Lo que no se puede expresar no se hace por descuido.

---

## 4. El estado del pedido, operación por operación

Tabla de la que salen R9–R13 y los dos códigos nuevos:

| Estado del pedido | asignar | quitar un grupo | desasignar | consultar |
| --- | --- | --- | --- | --- |
| `PENDIENTE` | ✔ | ✔ | ✔ | ✔ |
| `EN_CURSO` | ✔ | ✔ | ✔ | ✔ |
| `ENTREGADO` | ✖ `order_delivered_frozen` | ✖ `order_delivered_frozen` | ✖ `order_delivered_frozen` | ✔ |
| `CANCELADO` | ✖ `order_cancelled_not_assignable` | ✖ `order_cancelled_not_assignable` | ✖ `order_cancelled_not_assignable` | ✔ |
| no existe / de baja | ✖ `order_not_found` | ✖ `order_not_found` | ✖ `order_not_found` | ✖ `order_not_found` |

**Dos códigos y no uno** porque son dos frases distintas y dos acciones distintas para quien las lee
(QC-70 R4): «Un pedido entregado conserva sus responsables tal como estaban.» frente a «Un pedido
cancelado no admite responsables nuevos.» Es el mismo criterio con el que QC-84 abrió **tres** códigos
de «ya pertenece pero no se ve».

**La comprobación va sobre la lectura, no en el `WHERE`** (R12), copiando literalmente la nota del
puerto de QC-34: si viviera en el `where` del `DELETE`, «el pedido no existe» y «el pedido está
entregado» devolverían lo mismo y la pantalla diría `order_not_found` de un pedido que el usuario
está viendo.

**No se usa `assertTransition` de `pedidos`** aunque esté publicado: esa tabla dice qué **cambios de
estado** son legales en una **edición** del pedido, y aquí no se cambia ningún estado. Reutilizarla
sería atar dos reglas que no son la misma; el día que QC-34 permita un estado nuevo, la tabla de
arriba tendría que decidirlo por sí sola de todas formas.

---

## 5. El camino completo de cada caso de uso

**`assignResponsibles(actor, input, now)`** — R1, R5–R28:

1. `requirePermission(actor, 'asignaciones.modificar')` — **primera línea**, antes de zod.
2. `assignResponsiblesSchema.safeParse(input)` → `invalid_input` si falla (R42). El esquema exige
   `orderId` uuid y **al menos un** `userId` o `workGroupId`; listas de uuid sin repetir.
3. `orders.findAliveById(orderId)` → `order_not_found` (R8) / tabla de §4 (R10, R11).
4. `people.findAliveRefsInCompany(actor.companyId, userIds, now)` → si falta alguno,
   `user_not_found` (R17); si alguno viene con `isActive: false`, `user_not_assignable` (R18).
5. `groups.findSnapshotAliveInCompany(...)` **por cada grupo** → `null` es `work_group_not_found`
   (R25). De cada uno salen `name` (lo que se congela, R19, R28) y `activeMemberIds` (R20, R21).
6. **Composición determinista** (R24): primero las sueltas en el orden recibido, después cada grupo
   en el orden recibido y sus miembros en el orden que devuelve el snapshot; la **primera** aparición
   de cada `userId` gana y las siguientes se descartan.
7. `assignments.insertMissing(rows, now)` dentro de **una transacción** (R27) → `{ added }` (R16).
   Las que ya estaban las descarta la base, no un `if` (R15, R22).

Pasos 4 y 5 se lanzan **en paralelo** (`Promise.all`): son lecturas independientes y ninguna decide
si la otra corre.

**`removeWorkGroupFromOrder`**: permiso → zod → pedido y estado → `deleteByWorkGroup` → `{ removed }`
(R32, R33, R34). **No comprueba que el grupo exista**: se borra por el `work_group_id` **congelado en
la fila**, así que quitar del pedido un grupo que se dio de baja ayer **funciona** (R32) — que es
justo lo que pasaría en producción si no se dijera aquí.

**`unassignResponsible`**: permiso → zod → pedido y estado → `deleteOne` → `'not_found'` se traduce a
`order_assignment_not_found` (R29, R30). La entrada es `{ orderId, userId }` y **no admite lista**
(R31).

**`listOrderResponsibles`**: `requirePermission(actor, 'pedidos.consultar')` (R3) → pedido vivo (R8;
**sin** comprobar estado, R13) → `assignments.listByOrderInCompany` → `people.findRefsIncludingDeleted
InCompany` con los ids que salgan → proyección a `OrderResponsible` con el **origen de la fila** y el
**nombre congelado de la fila** (R35, R36) → orden por `displayName` con desempate por `userId`
(R38). **Una persona que no vuelva del directorio** —borrada físicamente por consola, que las FK
`RESTRICT` de QC-86 hacen casi imposible— **sigue saliendo igualmente**, con su identificador como
nombre mostrable: es la misma línea que QC-34 R44 tomó con la receta borrada (la fila sale, el nombre
puede faltar). Queda escrito aquí para que nadie lo silencie con un `filter`, que convertiría un dato
raro en un responsable invisible.

---

## 6. Los cuatro códigos de error nuevos (quinta enmienda al catálogo cerrado de QC-70)

`lib/modules/errores/domain/error-codes.ts` gana **cuatro** entradas, con su clave en
`error-catalog.ts` y su texto en `ERROR_MESSAGES_ES` —los `satisfies` rompen el typecheck si falta
alguna—:

| `code` | Cuándo | Requisito |
| --- | --- | --- |
| `order_delivered_frozen` | El pedido está `ENTREGADO` y se intenta cualquier escritura | R10 |
| `order_cancelled_not_assignable` | El pedido está `CANCELADO` y se intenta cualquier escritura | R11 |
| `order_assignment_not_found` | Se desasigna a quien no es responsable de ese pedido | R30 |
| `user_not_assignable` | Se asigna suelta a una persona cuya cuenta no está `active` | R18 |

**Es una enmienda y se dice con esas palabras**, como hicieron QC-66 y QC-84: QC-70 declaró el
catálogo cerrado y esta es la **quinta** ampliación. Abre una **familia nueva**, `asignaciones`, que
es el **séptimo** módulo del catálogo, porque las cuatro situaciones son de este módulo y no de
`pedidos` —`pedidos` no sabe que existen las asignaciones—. Se **reutilizan sin tocar**
`unauthorized`, `invalid_input`, `order_not_found`, `user_not_found` y `work_group_not_found`.

`tests/guards/guard-catalogo-de-errores.test.ts` vigila que ningún código comparta texto y que cada
uno tenga el suyo.

**Si el humano cierra la pregunta abierta 1 a favor de «sí se puede»**, `user_not_assignable`
desaparece de esta lista y el catálogo gana **tres** en vez de cuatro.

---

## 7. Las tres Server Actions y la consulta

`lib/modules/asignaciones/adapters/driving/order-assignment-actions.ts`, calcado de
`work-group-actions.ts` (QC-84 T9). Hace **tres** cosas y ninguna más:

1. Resuelve el actor de las **dos caras** de la sesión (`getSessionUser` + `getSessionContext`); si
   falta cualquiera, el actor es `null` y **rechaza el caso de uso**, no esta capa (R2, R43).
2. Traduce `FormData` a valores **crudos** para el esquema del dominio (R41). Campos, en inglés
   (R44): `orderId`, `userIds` (varios `formData.getAll('userIds')`), `workGroupIds`, `userId`,
   `workGroupId`.
3. Traduce el error por su **`code`** con `createErrorStateTranslator(AsignacionesError, …)` (R43).

**Sin `revalidatePath`**: no hay ninguna ruta que revalidar todavía (R50), y adivinar la de QC-102
sería inventarla — el mismo criterio, y el mismo párrafo, que QC-84 escribió para QC-85.

La **consulta** se expone con argumentos ya tipados (`listOrderResponsiblesAction(orderId: string)`),
no con `FormData`: no viene de un `<form>` (R41).

**No se reexportan desde el barril** (R46): QC-102 las importará por su **ruta exacta**.

---

## 8. Verificación: qué prueba qué

- **Unidad del dominio** (`tests/unit/asignaciones/*.test.ts`), con puertos de mentira: los cuatro
  cortes de permiso y el fallo cerrado (R1–R4), la tabla de estados entera (R9–R13), la
  deduplicación determinista (R24), el conteo de añadidas (R16), la proyección y el orden de la
  consulta (R35–R40), el rechazo de la entrada inválida **sin tocar puertos** (R42, comprobando que
  el doble del puerto **no se llamó**).
- **Integración contra Postgres real**
  (`tests/integration/asignaciones/*.int.test.ts`, cada caso en una transacción con `ROLLBACK`) — es
  donde vive la evidencia que sustituye al E2E (§0, hallazgo 1): reaplicar un grupo **añade solo a
  los que faltan** y no toca origen ni nombre congelado de las filas viejas (R22, R23); **renombrar
  el grupo después no cambia ninguna fila** (R28, R36); solo entran los `active` y el `pending` entra
  **al reaplicar** (R19–R21, R26); desasignar borra **una** fila y deja las demás del grupo (R29);
  quitar un grupo borra **solo** las suyas (R32); la atomicidad (R27); el aislamiento por empresa
  (R5–R7).
- **Guardias que ya existen y tienen que seguir verdes**: `guard-arquitectura-modulos` (R45, R46,
  R47), `guard-catalogo-de-errores` (R43), `guard-autorizacion-por-permiso` (a cuya lista de módulos
  de negocio se **añade `asignaciones`**, T13), `guard-permisos-sembrados` y los tests que cuentan
  **quince** permisos (R49, **no se tocan**), `guard-dependencias-aprobadas` (R51).
- **El diff de `db/**` tiene que ser vacío** (R48): se comprueba mirándolo, y la ausencia de
  migración hace que `./init.sh` no tenga nada nuevo que aplicar.

**Criterio de «hecho»**, el de QC-47 T11 y QC-86: cada aserción **cae al mutar lo que vigila**. Un
test de R22 que pase también si el adaptador hiciera `deleteMany` + `createMany` no prueba R22.

---

## 9. Dependencias de terceros

**Ninguna nueva** (R51, decisión cerrada 12). Todo lo que hace falta ya está: `zod` para el borde,
Prisma para el adaptador, y **ninguna utilidad escrita a mano** que una librería del ecosistema
resuelva mejor —no se parsean fechas, no se calculan decimales, no se ordena con reglas de
localización que `Intl` ya tenga—. Regla 7 de `CLAUDE.md` **sin propuesta que abrir** y, por tanto,
**sin los cuatro checks de `docs/architecture.md > Dependencias de terceros` que rellenar**. El diff
de la rama sobre `package.json` y `pnpm-lock.yaml` debe quedar **vacío**.

---

## 10. Riesgos

1. **Que alguien implemente la reaplicación como «borrar y volver a insertar».** Es el riesgo n.º 1:
   es más corto de escribir, deja la lista «correcta» y **rompe la decisión 2 y el congelado de
   QC-86** —saca del pedido a quien ya no esté en el grupo y reescribe el nombre congelado de quien
   sí—. Mitigación: R22 y R23 escritos por separado, el test de integración que renombra el grupo y
   comprueba que la fila vieja **no cambió**, y la ausencia de `update` y de `deleteMany(orderId)` en
   el puerto (§3).
2. **Que el filtro de `active` se copie en `asignaciones` con un `WHERE account_status = 'active'`.**
   Sería la segunda definición de una regla que depende del **reloj**, y una cuenta bloqueada por
   intentos fallidos puede seguir diciendo `active` en la columna (QC-78 R11). Mitigación: R21, el
   filtro vive en el adaptador de `identity` sobre `effectiveAccountStatus`, y el test que mueve el
   reloj **sin escribir nada**.
3. **Que alguien exija `asignaciones.consultar` en la consulta de responsables** «porque se llama
   así». Rompería la decisión 5 y dejaría a un Administrador sin ver los avatares hasta que
   caducara su sesión. Mitigación: R3 y su test, que construye un actor con `pedidos.consultar` y
   **sin** los de asignaciones y espera éxito.
4. **Que la comprobación de estado acabe en el `WHERE`** de la escritura. Mitigación: R12 y el test
   que espera `order_delivered_frozen` —no `order_not_found`— sobre un pedido entregado que existe.
5. **Que el módulo empiece a consultar `prisma.order` o `prisma.user`** «porque el contrato es mucha
   ceremonia». Mitigación: la guardia de módulos, que ya lo prohíbe hoy, y §2.
6. **Que alguien «arregle» el catálogo de permisos** al ver que `asignaciones.consultar` no lo usa
   nadie. Mitigación: hallazgo 3 de §0, R49 y los tests de quince entradas.

---

## 11. Alternativas descartadas

### 11.1 Reaplicar un grupo = reemplazar por la foto de hoy (`DELETE` de sus filas + `INSERT`)

Es lo primero que se le ocurre a cualquiera: «aplicar un grupo» deja el pedido con **el grupo tal
como está hoy**, y se implementa en dos sentencias sin pensar en qué había antes.
**Descartada por la decisión cerrada 2**, y se anota porque es exactamente lo que alguien va a
proponer al leer «reaplicar»:

- **Sacaría del pedido a quien ya no está en el grupo**, que es **lo que QC-86 prohíbe** (R9 de
  QC-86): una persona que lleva media hora ejecutando la receta perdería el pedido porque alguien
  editó el turno.
- **Reescribiría el nombre congelado** de las filas que sobrevivieran, destruyendo el único dato que
  dice cómo se llamaba el grupo entonces (QC-86 R6, R8).
- **Y borraría el origen de las sueltas** que coincidan, si el `DELETE` se acota mal.

Lo que se hace en su lugar —insertar las que faltan— es **más simple**, no más complejo: una sola
sentencia, sin `SELECT` previo y sin carrera.

### 11.2 Poner los cuatro casos de uso en el módulo `pedidos`

Ahorraría los tres contratos nuevos de §2: `pedidos` ya lee `orders` y podría leer la tabla de
asignaciones «de paso». **Descartada por la decisión cerrada 1 de QC-86**, que ya cerró que la tabla
es de `asignaciones`, y por dos razones técnicas propias de esta mitad: el permiso se llama
`asignaciones.modificar` y viviría en un módulo con otro nombre, y **seguirían haciendo falta los
contratos hacia `identity`** —persona y grupo son suyos— así que el ahorro real es **uno de tres**.

### 11.3 Que `asignaciones` resuelva los nombres de las personas con un `JOIN`

Un `JOIN` de `order_assignments` con `users` en el adaptador de este módulo daría la consulta de §5
en **una** query en vez de dos. **Descartada**: es `prisma.user` desde un módulo que no es su dueño,
lo prohíbe `docs/architecture.md > Anti-patrones` y lo detecta la guardia. El coste aceptado son
**dos lecturas** por consulta; el beneficio es que el día que una persona deje de ser `User` —o que
`identity` cambie cómo compone el nombre mostrable— esta ficha no se entera.

### 11.4 Congelar el nombre del grupo leyéndolo en el adaptador con un subselect

`INSERT ... SELECT name FROM work_groups` congelaría el nombre **dentro de la misma sentencia**, sin
pasarlo desde el dominio. **Descartada** por lo mismo que 11.3 —es la tabla de otro módulo— y porque
dejaría el congelado **sin ningún test de dominio**: hoy se puede probar con objetos planos que la
fila lleva el nombre que el snapshot traía.

### 11.5 Un solo caso de uso «sincronizar responsables» que reciba la lista completa

La forma «declarativa»: la pantalla manda el conjunto final y el backend calcula altas y bajas.
**Descartada**: es 11.1 con otro nombre —cualquier persona ausente de la lista se borra— y además
haría **imposible distinguir** «aplicar un grupo» de «marcar cinco personas», que es precisamente lo
que la decisión 6 necesita conservar para poder enseñar el nombre del grupo.

### 11.6 Exigir el estado del pedido con un `CHECK` o un trigger en la base

Sería la garantía más fuerte: ninguna escritura, venga por donde venga, asignaría sobre un
`ENTREGADO`. **Descartada** por el precedente explícito de QC-34 (`order-transitions.ts`): la base de
este repo **no restringe las transiciones ni los estados de pedido**, un `CHECK` no puede mirar otra
tabla, y un trigger sería el segundo del repositorio para expresar una regla que el service sí sabe
expresar. Coste aceptado y escrito: un `INSERT` por consola puede asignar sobre un pedido entregado.
Lo caro de deshacer —el cruce de empresas, el duplicado, el nombre congelado a medias— **sí** lo
garantiza la base, desde QC-86.
