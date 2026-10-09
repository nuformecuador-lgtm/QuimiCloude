# QC-218 — acondicionar-con-equipo · design.md

> El **qué** está en `requirements.md` (R1–R36); aquí, el **cómo**. Las rutas citadas son las de este
> worktree, una rama sobre `dev` con QC-215, QC-216, QC-217 y QC-221 mergeadas. Aprobado el 2026-10-08:
> **D11** (Terminar lleva a `TERMINADO`), **D12** (el equipo se ve en el detalle), **D13** (tope de 25)
> y **D14** (propuestas N1–N4 de § 6 y enmiendas de § 9). Ninguna librería nueva.

## Lo que ya existe

**Términos buscados.**

- **Board** (`feature_list.json`, nombre y descripción, todos los estados): «equipo» y «acondicion».
- **`specs/`**: `conditioning_team`, «equipo de acondicionamiento», `CountdownTimer` y «congelad».
- **Código** (Grep/Read): `conditioning`, `CountdownTimer`, `ConfirmActionDialog`,
  `canBeResponsible`, `WorkGroupDirectory`, `listResponsibleCandidates` y `ExecutionTransaction`.

El MCP del grafo no se consultó en esta tanda: la búsqueda de código es por Grep/Read.

**Resultado.** Nada resuelve la ficha: no existen ni el equipo ni sus pantallas, así que no hay
bloqueo. Lo que hay se reutiliza o se calca.

| Ref | Qué es | Uso aquí |
|---|---|---|
| QC-215 `start-conditioning.ts`, `finish-conditioning.ts`, `OrderCatalog.startConditioningAliveById` | comenzar y terminar sin pantalla, con sus errores | **comenzar se amplía** con el equipo (R12, R18). **Terminar no cambia**: sigue llevando a `TERMINADO` (D11) |
| QC-215 design § 6.2 | «el equipo de QC-218 sí es una tabla aparte, y la diseña esa ficha» | se hace así (§ 1) |
| QC-217 detalle `/asignacion/acondicionamiento/[id]`, `ConditioningOrderScreen`, `getConditioningOrder` | detalle en solo lectura | **se amplía** con las acciones (R1–R3) y el equipo (D12) |
| QC-86/87 `order_assignments`, `assign-responsibles.ts`, `canBeResponsible`, `PeopleDirectory`, `WorkGroupDirectory` | asignación de personas y grupos con origen congelado | **se calca el modelo** (PK, FK compuestas, `CHECK` de grupo y nombre) y **se reutilizan** los contratos de `identity` y la regla `canBeResponsible`. La tabla y el caso de uso no se reutilizan (§ 8, alternativas 1 y 3) |
| QC-102 `order-responsibles.tsx` (selector con búsqueda y casillas) | panel de responsables de `/pedidos` | **se calca su forma visual** (búsqueda, casillas hermanas de su etiqueta, 44 px, 16 px). No se extrae (§ 8, alternativa 4) |
| `list-responsible-candidates.ts` (`MAX_CANDIDATES = 25`) | personas para el selector | **se calca** con el permiso de acondicionamiento y se hereda el tope (D13) |
| QC-125 `components/shared/countdown-timer.tsx` | cuenta regresiva `MM:SS` con `onEnd` | **se reutiliza** tal cual (D6) |
| `components/shared/confirm-action-dialog.tsx` | confirmación controlada | **no sirve tal cual**: su confirmar no admite estar deshabilitado. Se usa el primitivo `AlertDialog` (§ 5.3) |
| QC-168 `order-packing-actions.ts`, `PackedOrderNotice`, `PACKED_ORDER_PARAM` | acciones de empaque y aviso tras terminar | **se calcan** para las dos acciones y el aviso (R27) |
| QC-82 `ExecutionTransaction` (`withExecutionTransaction`) | transacción de `asignaciones` a la que se une `pedidos` | **se amplía** con dos escritores, para que pedido y equipo se escriban juntos (R12) |
| QC-219 (board, `pending`) | datos de lote; enmendará Terminar | depende de esta ficha. No se toca |
| QC-223 (board, `in_progress`) | entrega `TERMINADO → ENTREGADO` | es la razón de D11: la entrega no es de esta ficha. Posible choque de archivos (§ 9) |

## 1. Modelo de datos

### 1.1 Tabla nueva `order_conditioning_team_members` (`/// @module asignaciones`)

```prisma
/// El equipo que acompaño un acondicionamiento: constancia, no da acceso al pedido. Una fila por
/// persona, escrita al comenzar y nunca actualizada. `workGroupName` es la foto del nombre del grupo
/// al comenzar. FK compuestas y CHECK escritos a mano, sin `@relation`: son drift.
/// @module asignaciones
model OrderConditioningTeamMember {
  orderId       String   @map("order_id") @db.Uuid
  userId        String   @map("user_id") @db.Uuid
  companyId     String   @map("company_id") @db.Uuid
  workGroupId   String?  @map("work_group_id") @db.Uuid
  workGroupName String?  @map("work_group_name")
  /// Orden de la persona dentro del equipo, desde 0: todas las filas de un equipo comparten
  /// `created_at`, y el orden de composicion es el que se muestra.
  position      Int
  createdAt     DateTime @default(now()) @map("created_at") @db.Timestamptz(6)

  @@id([orderId, userId], map: "order_conditioning_team_members_pkey")
  @@unique([orderId, position], map: "order_conditioning_team_members_order_id_position_key")
  @@index([userId], map: "order_conditioning_team_members_user_id_idx")
  @@index([workGroupId], map: "order_conditioning_team_members_work_group_id_idx")
  @@map("order_conditioning_team_members")
}
```

- **Sin `updated_at` ni `deleted_at`.** Las filas solo se insertan: no hay edición ni borrado del
  equipo (R14, D4), y una columna que nadie escribe es infraestructura por si acaso. El
  `docs/architecture.md > Dominio 3` se cumple: no hay borrado físico.
- **Restricciones** (R23), escritas a mano en la migración:
  - PK `(order_id, user_id)`: una persona, una vez por pedido;
  - FK `(order_id, company_id) → orders(id, company_id)`;
  - FK `(user_id, company_id) → users(id, company_id)`;
  - FK `(work_group_id, company_id) → work_groups(id, company_id)`, en `MATCH SIMPLE` (sin grupo, no
    se evalúa);
  - las tres FK con `ON DELETE RESTRICT ON UPDATE CASCADE`, como `order_assignments` y
    `order_execution_entries`;
  - `CHECK order_conditioning_team_members_work_group_name_matches_group`: grupo y nombre, los dos o
    ninguno;
  - `CHECK order_conditioning_team_members_position_non_negative`: `position >= 0`.
- **Empresa:** `company_id` NOT NULL. Cumple `tests/guards/guard-empresa-en-esquema.test.ts`.
- **Lo que la base no garantiza:** que solo haya equipo en pedidos `EN_ACONDICIONAMIENTO`,
  `TERMINADO` o `ENTREGADO`. Un `CHECK` no puede mirar otra tabla, y un disparador sería la primera
  regla cruzada entre módulos en la base. Lo garantizan R12 (misma transacción que el cambio de
  estado) y el test de integración de R22.

### 1.2 RLS

`ENABLE` + `FORCE ROW LEVEL SECURITY`, sin policies, al final de la migración (R32). Es el mismo
patrón que `order_assignments`. La frontera es el caso de uso (`docs/architecture.md > Acceso a
datos y autorizacion`).

### 1.3 Migración

`db/migrations/20261008150000_order_conditioning_team/`:

- **`migration.sql`**, en este orden:
  1. `CREATE TABLE`, los dos índices y el único de posición;
  2. los dos `CHECK`;
  3. las tres FK;
  4. RLS.

  No ejecuta DDL sobre tablas existentes. Del SQL generado hay que **borrar a mano** los
  `DROP CONSTRAINT` de drift, como en `20261006180000_order_execution_entries`.
- **`down.sql`**: `DROP TABLE "order_conditioning_team_members";`. Las FK son del hijo, así que no
  queda nada en `orders`, `users` ni `work_groups` (R32).
- El nombre entra en la lista de migraciones conocidas de
  `tests/guards/guard-identificador-de-request.test.ts`.
- Si al sincronizar con `dev` (F2.3) hay una migración posterior, el implementer sube el timestamp y
  corrige `tasks.md > Archivos esperados`.

## 2. Puertos y adaptadores

### 2.1 Puerto nuevo `lib/modules/asignaciones/ports/conditioning-team-repository.ts`

```ts
export type NewConditioningTeamMember = {
  readonly orderId: string; readonly userId: string; readonly companyId: string;
  readonly workGroupId: string | null; readonly workGroupName: string | null;
  readonly position: number;
};
export type ConditioningTeamMemberRow = {
  readonly userId: string; readonly workGroupId: string | null; readonly workGroupName: string | null;
};
export interface ConditioningTeamRepository {
  /** Una sola sentencia. Lanza si la PK choca: el caso de uso nunca manda duplicados. */
  insertAll(rows: readonly NewConditioningTeamMember[]): Promise<number>;
  /** Ordenadas por `position`: el orden de composición de R13. */
  listByOrderInCompany(companyId: string, orderId: string): Promise<readonly ConditioningTeamMemberRow[]>;
}
```

Sin `update` ni `delete`: lo que no se puede expresar no se hace por descuido (R14). Es el criterio
de `OrderAssignmentRepository`.

### 2.2 Adaptador `lib/modules/asignaciones/adapters/driven/persistence/conditioning-team-prisma.ts`

`createConditioningTeamRepository(db: PrismaLike = prisma)`:

- `insertAll` → `createMany` **sin** `skipDuplicates`: un choque es un error de programación y tiene
  que ser ruidoso.
- `listByOrderInCompany` → `findMany where { companyId, orderId } orderBy { position: 'asc' }`.
  `position` existe porque todas las filas de un equipo comparten `created_at`, y el orden de R13 es
  el que R25 pinta.

### 2.3 `identity`: el directorio de grupos gana un listado

`WorkGroupDirectory` (`lib/modules/identity/domain/work-group-directory.ts`) gana un método:

```ts
listSnapshotsAliveInCompany(companyId: string, now: Date, limit: number): Promise<readonly WorkGroupSnapshot[]>;
```

- Devuelve los grupos vivos de la empresa, ordenados por nombre normalizado y después por id, con
  tope `limit`. Cada uno lleva sus `activeMemberIds` con el mismo filtro de estado efectivo que
  `findSnapshotAliveInCompany`.
- **Implementación** en `assignment-directory-prisma.ts`:
  1. una consulta de grupos;
  2. **una** consulta de miembros para todos (`work_group_members` con `user`), filtrada en memoria
     por `isEffectivelyActive`.

  Así no hay una consulta por grupo. Se exporta en `assignmentDirectoryPrisma`.
- **Por qué no `identity.listWorkGroups`:** exige `usuarios.consultar`, que el acondicionador no
  tiene (QC-216 R8). El directorio es el contrato que `identity` ofrece a otros módulos sin permiso
  propio.

### 2.4 `pedidos`: el repositorio de acondicionamiento sobre una transacción

Hoy `startConditioningAliveOrder` y `finishConditioningAliveOrder` (`order-prisma.ts`) usan el
`prisma` global. Se añade `createOrderConditioningRepository(db: PrismaLike = prisma):
OrderConditioningRepository`, gemela de `createOrderPackingRepository`.

- Las dos funciones exportadas siguen existiendo y delegan en la fábrica con `prisma`. Así
  `tests/integration/pedidos/order-conditioning.int.test.ts` y
  `guard-ambito-empresa-pedidos.test.ts` no cambian.
- La concurrencia de QC-215 § 2.2 se mantiene dentro de la transacción. El `UPDATE` condicional
  serializa igual, y la relectura del perdedor ve `taken` (R22).

### 2.5 `ExecutionTransaction` gana dos escritores

`lib/modules/asignaciones/ports/execution-transaction.ts`:

```ts
export type ExecutionWriters = {
  … // los de hoy, sin cambios
  readonly conditioning: Pick<OrderCatalog, 'startConditioningAliveById'>;
  readonly team: ConditioningTeamRepository;
};
```

En `lib/composition/index.ts`, `executionTransaction.run` construye:

- `conditioning.startConditioningAliveById` con
  `createStartConditioning({ conditioning: createOrderConditioningRepository(tx) })` (el de
  `pedidos/domain`);
- `team` con `createConditioningTeamRepository(tx)`.

Es el patrón de `packing`. Se reutiliza esta transacción en vez de crear una nueva porque ya es «la
de `asignaciones` a la que se une `pedidos`» (QC-82). Abrir otra duplicaría `withExecutionTransaction`.

## 3. Dominio (`lib/modules/asignaciones/domain/`)

### 3.1 `conditioning-team.ts` (nuevo, puro)

```ts
export const startConditioningSchema = z.strictObject({
  orderId: z.string().uuid(),
  userIds: uniqueIdList,            // z.array(uuid) sin repetidos, como assignment-input.ts
  workGroupIds: uniqueIdList,
}).refine((i) => i.userIds.length > 0 || i.workGroupIds.length > 0);

export function composeConditioningTeam(
  orderId: string, companyId: string,
  loose: readonly PersonRef[], requestedUserIds: readonly string[],
  groups: readonly WorkGroupSnapshot[], members: readonly PersonRef[],
): readonly NewConditioningTeamMember[];
```

`composeConditioningTeam` hace dos cosas:

- **Valida las sueltas, en el orden recibido:**
  - la persona que falta → `UserNotFoundError`;
  - `!isActive` → `UserNotAssignableError`;
  - `!canBeResponsible` → `ConditioningTeamMemberNotAllowedError` (R16).
- **Compone el equipo:**
  1. las sueltas;
  2. después los miembros de cada grupo, en el orden del snapshot, saltando a los no elegibles (R15);
  3. si una persona ya está, gana la primera (R13);
  4. `position` = índice final.

  Si el resultado sale vacío → `ConditioningTeamEmptyError` (R17).

`uniqueIdList` se copia de `assignment-input.ts`, que no lo exporta. Son cuatro líneas, y exportarlo
cambiaría el contrato de QC-87 por algo trivial.

### 3.2 `start-conditioning.ts` (se amplía)

```ts
export type StartConditioningDeps = {
  readonly orders: OrderCatalog;          // lectura previa (findAliveById)
  readonly people: PeopleDirectory;
  readonly groups: WorkGroupDirectory;
  readonly transaction: ExecutionTransaction;
  readonly now?: () => Date;
};
```

Los pasos van en este orden, y el orden es requisito:

1. `requirePermission(actor, 'acondicionamiento.modificar')` (R19).
2. `startConditioningSchema.safeParse` → `ValidationError` (R18).
3. `orders.findAliveById(orderId, companyId)`, y según lo que devuelva:
   - `null` → `OrderNotFoundError`;
   - `EN_ACONDICIONAMIENTO` → paso 5 sin resolver el equipo (R20, R21);
   - cualquier estado distinto de `POR_ACONDICIONAR` → `OrderNotConditionableError`.
4. **Equipo**, solo con `POR_ACONDICIONAR`. Son dos lecturas en paralelo:
   - `people.findAliveRefsInCompany(userIds)`;
   - `groups.findSnapshotAliveInCompany` por grupo (`null` → `WorkGroupNotFoundError`).

   Después, una lectura de los miembros (unión) y `composeConditioningTeam`. El instante del
   snapshot es el de comenzar (R13).
5. `transaction.run(({ conditioning, team }) => …)`:
   - `startConditioningAliveById(...)`;
   - `'ok'` → `team.insertAll(rows)`. Si la lectura del paso 3 era `EN_ACONDICIONAMIENTO`, no hay
     `rows` y `'ok'` no puede salir: el `UPDATE` exige `POR_ACONDICIONAR`;
   - `'already_mine'` → nada (R21);
   - el resto → `ExecutionAbortedError`, que se traduce a `order_conditioning_taken`,
     `order_not_conditionable` u `order_not_found`, con la tabla de QC-215 § 3.

   Un `throw` dentro deshace las dos escrituras (R12, R22).

**Carrera entre el paso 3 y el 5:** si otro lo toma, el `UPDATE` mueve 0 filas, se clasifica
`taken` y no se inserta equipo (R22).

### 3.3 `list-conditioning-team-candidates.ts` (nuevo)

`createListConditioningTeamCandidates({ people, groups, now? })`, con entrada
`z.strictObject({})` y la salida:

```ts
export type ConditioningTeamCandidates = {
  readonly people: readonly { id: string; displayName: string }[];
  readonly workGroups: readonly {
    id: string; name: string;
    contributes: number;        // miembros elegibles (R7)
    excludedAdministrators: number; // miembros activos que no pasan canBeResponsible (R7)
  }[];
};
```

1. `requirePermission(actor, 'acondicionamiento.modificar')` (R30).
2. Personas: `people.listAliveInCompany(companyId, now, MAX_CANDIDATES, ACTIVE_ACCOUNTS_ONLY)`, y
   después `canBeResponsible` (D13).
3. Grupos: `groups.listSnapshotsAliveInCompany(companyId, now, MAX_CANDIDATES)`, más una lectura
   `findAliveRefsInCompany` con la unión de `activeMemberIds` para contar elegibles y excluidos.

`MAX_CANDIDATES` se importa de `list-responsible-candidates.ts`, que es el mismo módulo.

### 3.4 `get-conditioning-order.ts` y la vista del equipo (D12)

Devuelve `ConditioningOrderDetail = ConditioningOrderRow & { team: readonly ConditioningTeamMemberView[] }`,
donde:

```ts
export type ConditioningTeamMemberView = {
  readonly userId: string; readonly displayName: string;
  readonly origin: { kind: 'direct' } | { kind: 'workGroup'; workGroupId: string; workGroupName: string };
};
```

- El equipo solo se lee si el estado es `EN_ACONDICIONAMIENTO` o `TERMINADO`. Los nombres salen de
  `findRefsIncludingDeletedInCompany` (R25), en la misma lectura que ya resuelve a quien acondiciona.
- La fila de «Por acondicionar» (`ConditioningOrderRow`) **no cambia**: la lista no lee equipos.
- Deps nuevas: `team: ConditioningTeamRepository` (el global, fuera de transacción).

### 3.5 Errores nuevos (enmienda al catálogo cerrado)

| Clase (`domain/errors.ts`) | `code` | Texto propuesto (estilo del catálogo, sin tildes) |
|---|---|---|
| `ConditioningTeamMemberNotAllowedError` | `conditioning_team_member_not_allowed` | `'Esta persona no puede formar parte del equipo de acondicionamiento.'` |
| `ConditioningTeamEmptyError` | `conditioning_team_empty` | `'El equipo de acondicionamiento necesita al menos una persona.'` |

Van en `lib/modules/errores/domain/error-codes.ts`, con su línea de fecha, y en `error-catalog.ts`.
No se reutiliza `user_cannot_be_responsible`, porque su texto habla de «responsable», y el equipo no
lo es (D5). Es el mismo criterio que QC-215 § 6.4.

## 4. Server Actions

Archivo nuevo `lib/modules/asignaciones/adapters/driving/order-conditioning-actions.ts`, calcado de
`order-packing-actions.ts`. Se importa por ruta exacta, no desde el barrel.

| Acción | Entrada (`FormData`) | Éxito | Error |
|---|---|---|---|
| `startConditioningAction(prev, fd)` | `orderId`, `getAll('userIds')`, `getAll('workGroupIds')` | `revalidatePath(conditioningOrderRoute(id))` → `{ status: 'success' }` | `ErrorState` (R28) |
| `finishConditioningAction(prev, fd)` | `orderId` | `revalidatePath(ASSIGNED_ORDERS_ROUTE)` + `redirect('/asignacion?vista=por_acondicionar&acondicionado=<n>')` (R27) | `ErrorState` (R28) |

- `lib/shared/routes.ts` gana `CONDITIONED_ORDER_PARAM = 'acondicionado'`.
- En `/asignacion`, con la vista `por_acondicionar` y ese parámetro, la página pinta
  `<ConditionedOrderNotice>` con el texto «Pedido <n> acondicionado», calcado de `PackedOrderNotice`.

## 5. Pantalla

### 5.1 `page.tsx` del detalle

Después de `getConditioningOrder`, la página calcula:

- `canStart = order.status === 'POR_ACONDICIONAR'`;
- `canFinish = order.status === 'EN_ACONDICIONAMIENTO' && order.conditionedById === actor.id`.

Solo si `canStart`, llama a `asignaciones.listConditioningTeamCandidates(actor, {})`. Si falla con un
error del módulo, el detalle se pinta sin «Acondicionar» y con el aviso de error del catálogo.
Pasa todo por props a `ConditioningOrderScreen`. **No autoriza nada:** la frontera son los casos de
uso (R19, R29, R30).

### 5.2 Componentes de ruta (`app/(private)/asignacion/acondicionamiento/[id]/components/`, barrel `index.ts`)

| Archivo | Tipo | Qué |
|---|---|---|
| `conditioning-order-screen.tsx` | servidor | lo de QC-217, más `<ConditioningActions>` si `canStart` o `canFinish` (R1–R3), y `<ConditioningTeamList>` si hay equipo (D12) |
| `conditioning-actions.tsx` | cliente | el botón «Acondicionar» o «Terminar» y el estado `open` de su modal |
| `start-conditioning-dialog.tsx` | cliente | `Dialog` de shadcn: `<ConditioningTeamPicker>`, error `role="alert"`, «Cancelar» y `<CountdownGatedButton label="Comenzar">`, con `useActionState(startConditioningAction)` (R5, R8, R9, R28) |
| `conditioning-team-picker.tsx` | cliente | búsqueda + casillas de personas y de grupos, con el patrón visual de `order-responsibles.tsx`. Grupo: «<nombre> · <n> personas», la línea de Administradores excluidos y la casilla deshabilitada si `contributes === 0` (R6, R7). Emite `userIds` / `workGroupIds` como `<input type="hidden">` |
| `finish-conditioning-dialog.tsx` | cliente | `AlertDialog`: título, descripción, «Cancelar» y `<CountdownGatedButton label="Terminar">` dentro de un `<form action={finishFormAction}>` (R10, R26, R28) |
| `countdown-gated-button.tsx` | cliente | `Button` deshabilitado mientras `waiting \|\| disabled`, con `<CountdownTimer seconds={CONDITIONING_WAIT_SECONDS} onEnd={…}>` dentro. El modal lo monta con `key` por apertura, así que cada apertura reinicia la cuenta (R9, R10). `CONDITIONING_WAIT_SECONDS = 5` |
| `conditioning-team-list.tsx` | servidor | (D12) «Equipo»: sueltas y cada grupo con su nombre congelado (R25) |

- **Sin cambios en `components/shared/`.** `CountdownTimer` se usa tal cual. El botón con espera
  vive en la ruta, porque hoy solo lo usan estos dos modales (`docs/architecture.md > Regla: sin
  sobre-ingenieria`).
- **Multiplataforma** (`docs/perfil-agentes.md > frontend_dev` regla 9):
  - modales con `max-h-[100dvh]` y scroll interno;
  - objetivos táctiles `min-h-11 min-w-11`;
  - búsqueda en `text-base`, para que iOS no haga zoom;
  - nada depende de `:hover`.

### 5.3 Por qué `AlertDialog` y no `ConfirmActionDialog`

`ConfirmActionDialog` cierra antes de llamar a `onConfirm` y no admite un confirmar deshabilitado.
Añadirle props cambiaría un componente compartido que usan empaque y ejecución. El modal de terminar
usa los mismos primitivos (`components/ui/alert-dialog.tsx`) con el mismo `TOUCH_TARGET`.

## 6. Propuestas aprobadas con el spec (D14, 2026-10-08)

| # | Propuesta | Dónde |
|---|---|---|
| N1 | «Administrador» se decide por permiso: quien tiene `pedidos.consultar` no es elegible. Es la regla `canBeResponsible` de QC-87, reutilizada, y nunca el nombre del rol (QC-215 D6, QC-216). Con los roles de semilla, solo el rol `Administrador` la cumple. El propio actor y los demás acondicionadores son elegibles (lectura literal de D3) | R6, R15, R16 |
| N2 | **Cómo se muestra un grupo con Administradores** (lo pide D3). En el selector, cada grupo se pinta como «<nombre> · <n> personas», donde n son las que aportaría. Si tiene Administradores activos, debajo dice «1 Administrador de este grupo no entra en el equipo.» o «<k> Administradores de este grupo no entran en el equipo.». Si no aporta a nadie, la casilla está deshabilitada con «Este grupo no aporta personas al equipo.». Al comenzar, el Administrador se omite en silencio y el resto se guarda | R7, R15 |
| N3 | Textos: «Acondicionar», «Comenzar», «Cancelar», «Terminar»; título del modal de comenzar «Acondicionar el pedido <n>»; título del de terminar «Terminar el acondicionamiento», con la descripción «El pedido <n> pasará a Terminado.»; aviso «Pedido <n> acondicionado»; sección «Equipo»; los dos textos de error de § 3.5 | R5, R26, R27, R25 |
| N4 | Tras terminar se vuelve a «Por acondicionar» con el aviso (`?vista=por_acondicionar&acondicionado=<n>`), como el empaque. Tras comenzar se queda en el detalle, que ya muestra «Terminar» | R27 |

## 7. Autorización y guardias

- **Service:**
  - comenzar y terminar ya exigen el permiso en su primera línea (QC-215);
  - el caso de uso de candidatos también (R30);
  - el equipo no se lee en ningún caso de uso de «Mis asignados» ni de responsables (R24).
- **`tests/unit/identity/roles/acondicionamiento-rol.test.ts`:** la lista de casos de uso que exigen
  el código suma `list-conditioning-team-candidates.ts` (R31).
- **`tests/guards/guard-autorizacion-por-permiso`:** sin cambios. El reviewer comprueba que ningún
  archivo nuevo compara nombres de rol.
- **`tests/unit/identity/session-once-per-request-render.test.tsx`:** el detalle sigue leyendo la
  sesión una vez por petición, aunque ahora llame a dos casos de uso.
- **`guard-arquitectura-modulos`:**
  - el dominio importa solo `@/lib/modules/identity` y `@/lib/modules/pedidos` (contratos);
  - el adaptador nuevo lo cablea `lib/composition`;
  - el modelo lleva `/// @module asignaciones`.

## 8. Alternativas descartadas

1. **Reutilizar `order_assignments` con una marca de «equipo».** Esa tabla significa «responsables».
   Sus filas meten el pedido en «Mis asignados» (QC-88) y en el panel de responsables, que es lo
   contrario de D5 («solo constancia»). Además, QC-215 R20 congela los responsables en los estados
   de acondicionamiento con `order_produced_frozen`, así que la escritura se rechazaría.
2. **Guardar el equipo como JSON en `orders` (`conditioning_team jsonb`).** Pierde las FK compuestas
   (persona y grupo de la misma empresa, R23) y el `CHECK` de grupo y nombre. También pondría datos
   de `asignaciones` en una tabla de `pedidos`. Y «quién estuvo en qué pedido» dejaría de ser
   consultable con un índice.
3. **Llamar a `assignResponsibles` o extraer de él un compositor común.** Las reglas se parecen
   (sueltas primero, gana la primera, omitir en silencio en grupos), pero los errores difieren
   (§ 3.5) y su caso de uso tiene tests de QC-87 que no deben moverse. Duplicar unas 30 líneas puras
   cuesta menos que refactorizar un caso de uso mergeado.
4. **Extraer el selector de `order-responsibles.tsx` a `components/shared/`.** Tocaría `/pedidos` y
   sus tests de QC-102, y el selector del equipo necesita datos que aquel no tiene (aporte por grupo,
   Administradores excluidos). Se calca la forma visual. Si un tercer sitio lo pide, se extrae
   entonces.
5. **Dos escrituras sin transacción (primero el pedido, luego el equipo).** Un fallo entre las dos
   deja un `EN_ACONDICIONAMIENTO` sin equipo, que viola «al menos una persona» (D4). Una transacción
   aparte, fuera de `ExecutionTransaction`, duplicaría `withExecutionTransaction`.
6. **Hacer cumplir los 5 s en el servidor** (guardar cuándo se abrió el modal). D6 lo excluye
   («solo de cliente, como en QC-125»).
7. **Leer los candidatos en el cliente al abrir el modal, con una Server Action.** Añade un viaje y
   un estado de carga al modal. El Server Component ya tiene el actor, y la regla 6 de
   `frontend_dev` pide cargar datos en el servidor.

## 9. Choques previsibles y enmiendas

- **Enmiendas a lo mergeado** (aprobadas con el spec, D14):
  - QC-215 R16, solo para comenzar: la entrada gana el equipo (R18);
  - QC-217 R16: el detalle ofrece acciones (R3);
  - QC-215 R17 y QC-217 R21: una ruta más que nombra el permiso (R31);
  - QC-217 R22: una aserción del E2E (R35).
- **Tests existentes que cambian:**
  - `tests/unit/asignaciones/start-conditioning.test.ts`: entrada y deps nuevas;
  - `tests/unit/asignaciones-ui/conditioning-order-screen.test.tsx` y `conditioning-order-page.test.tsx`:
    hoy afirman cero botones;
  - `tests/unit/asignaciones/get-conditioning-order.test.ts`: la salida gana `team`;
  - `tests/unit/composition/asignaciones-facade.test.ts`: dos claves nuevas.
- **QC-223** (en vuelo, del mismo assignee) puede tocar `lib/composition/index.ts`,
  `lib/modules/errores/domain/error-codes.ts`, `error-catalog.ts` y `db/schema.prisma`. Lo
  comprueba `scripts/archivos-en-vuelo.mjs` en F2.0. La segunda en mergear resuelve en F2.3.
- **QC-219** dependerá de esto: añadirá a Terminar la exigencia de los datos de lote.

## 10. Dependencias de terceros

Ninguna (D10, R36). `CountdownTimer`, `Dialog`, `AlertDialog`, `Checkbox` e `Input` ya están en el
repo.
