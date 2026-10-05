# QC-201-empacador-no-ejecuta-pedidos — design

## 0. Hallazgos que condicionan el diseño

- **`finish-assigned-order` no lo usa nadie con `empaque.modificar` para otra cosa.** Su único
  llamador es `finishAssignedOrderAction` (`lib/modules/asignaciones/adapters/driving/order-execution-actions.ts`),
  que solo invoca `order-execution-screen.tsx` de `/asignacion/[id]`. Lo que sí lee
  `empaque.modificar` dentro de ese archivo es `ensurePackerAssignments`, sobre las **personas
  candidatas** (no sobre el actor) para auto-asignar empacadores. Eso no cambia: el actor que
  termina pasa a necesitar `asignaciones.ejecutar`; los empacadores que se auto-asignan siguen
  identificándose por `empaque.modificar`. Terminar el empaque es otro caso de uso
  (`finish-packing.ts`, `empaque.modificar`) y no se toca.
- **Comenzar** = `createStartAssignedOrder` (`domain/start-assigned-order.ts`), invocado por
  `startAssignedOrderAction`, que llama la página `/asignacion/[id]/page.tsx` al pintarse. Internamente
  compone `getAssignedOrderExecution`, que también exigirá `asignaciones.ejecutar`.
- **«Mis asignados»** (`domain/list-assigned-orders.ts`) solo devuelve `PENDIENTE`, `EN_CURSO` y
  `BLOQUEADO` (`ESTADOS_DE_TRABAJO`). Las otras vistas que puede ver el Empacador ya están en
  estados posteriores: «Por empacar» (`POR_EMPACAR`, `EN_EMPAQUE`, `empaque.modificar`) y
  «Terminados» (`ENTREGADO`, `terminados.consultar`). «Todos» exige `pedidos.consultar`, que el
  Empacador no tiene. `/asignacion/empaque/[id]` filtra a `POR_EMPACAR`/`EN_EMPAQUE`. Por tanto D8
  se cumple cerrando «Mis asignados» y `/asignacion/[id]` a quien no tiene `asignaciones.ejecutar`.
- **El catálogo solo admite hoy `consultar`/`modificar`** (`tests/unit/identity/permissions.test.ts`
  aserta `action === 'consultar' || 'modificar'` y que cada módulo con escritura declara exactamente
  `['consultar','modificar']`). `ejecutar` es la primera acción distinta: es una enmienda explícita
  (R2), no un descuido. La BD no lo impide: `permissions` tiene `action TEXT` y un único
  `(module, action)`, que `asignaciones/ejecutar` respeta.

## 1. Modelo de datos

Sin cambios de esquema. Migración **de datos** nueva, calcada de
`db/migrations/20260925120100_packing_permission/`:

`db/migrations/<ts>_execution_permission/` con `<ts>` posterior a la última migración existente
(hoy `20261004120000_orders_packaging_cost`; p. ej. `20261004150000`; el implementer verifica que
siga siendo la última al crearla).

`migration.sql` (UP):
```sql
INSERT INTO "permissions" ("code", "module", "action", "description", "updated_at") VALUES
  ('asignaciones.ejecutar', 'asignaciones', 'ejecutar',
   'Entrar, comenzar y terminar la ejecución de los pedidos asignados.', CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_code")
SELECT "r"."id", 'asignaciones.ejecutar' FROM "roles" AS "r"
WHERE "r"."name" IN ('Administrador', 'Operador')
ON CONFLICT ("role_id", "permission_code") DO NOTHING;
```
`down.sql`: `DELETE FROM "role_permissions" WHERE "permission_code" = 'asignaciones.ejecutar';`
y después `DELETE FROM "permissions" WHERE "code" = 'asignaciones.ejecutar';` (FK RESTRICT: la
asignación va primero). Sin `ALTER`, `DROP`, `UPDATE` ni `CASCADE`. La cabecera del SQL sigue el
estilo de la de `packing_permission` sin citar fichas ni requisitos.

Que la migración resuelva el rol por nombre (`'Administrador'`, `'Operador'`) es lo mismo que hace
la de `empaque.modificar`; los literales se duplican porque SQL no importa TS, y el test de
migración los compara contra `ROLE_ADMINISTRADOR`/`ROLE_OPERADOR` y `PERMISSIONS`.

RLS: sin cambios (las tablas de permisos no cambian de forma).

## 2. Dominio `identity`

`lib/modules/identity/domain/permissions.ts`:
- `PERMISSIONS`: nueva entrada `asignaciones.ejecutar` justo después de `asignaciones.modificar`
  (orden del catálogo = orden del módulo). `PermissionCode` la incorpora sola.
- `SEED_ROLE_PERMISSIONS`: se añade `'asignaciones.ejecutar'` a Administrador (tras
  `asignaciones.modificar`) y a Operador (`['inventario.consultar', 'asignaciones.consultar',
  'asignaciones.ejecutar']`). Empacador y Maestro sin cambios.
- `ADMIN_EXCLUDED_PERMISSIONS`: sin cambios.
- El JSDoc del catálogo gana una frase sobre la acción `ejecutar` (sin citar fichas).

`seed-initial-access.ts` no cambia: deriva lo que falta de `PERMISSIONS` y `SEED_ROLE_PERMISSIONS`.

## 3. Dominio `asignaciones`

### 3.1 Autorización (R5–R7)
Primera línea de cada caso de uso, antes de `zod` y de cualquier puerto:
- `get-assigned-order-execution.ts`: `requirePermission(actor, 'asignaciones.ejecutar')`.
- `start-assigned-order.ts`: ídem.
- `finish-assigned-order.ts`: ídem.

Se **sustituye** `asignaciones.consultar`, no se añade: exigir ambos dejaría fuera a quien tenga solo
`ejecutar` y contradiría R7b. Hoy Administrador y Operador tienen los dos, así que no hay cambio
observable para ellos.

### 3.2 Pregunta para la pantalla (R9)
En `domain/actor.ts`, junto a `canModifyAssignments`, con el mismo patrón (constante privada tipada
`PermissionCode`, centinela, `assertPermission` en `try/catch`):
```ts
export function canExecuteAssignedOrders(actor: PermissionBearer | null | undefined): boolean
```
Se publica en el barril `lib/modules/asignaciones/index.ts`. Así el código del permiso no se escribe
en `app/**` para decidir la columna (R11a, R15).

### 3.3 Lista «Mis asignados» (R16, R17)
`list-assigned-orders.ts`: tras `requirePermission(actor, 'asignaciones.consultar')` y la
validación de la entrada, `if (!canExecuteAssignedOrders(actor))` devuelve la página vacía que ya
construye hoy para `ids.length === 0` (`items: []`, `total: 0`, `totalPages: 1`), **sin** llamar al
repositorio de asignaciones ni al catálogo de pedidos. Con el permiso, el flujo no cambia.

La decisión vive en el caso de uso (servidor) y se toma por permiso; la página no filtra nada.

### 3.4 Vistas de `/asignacion` (R19, R19a)
`domain/assignment-views.ts > resolveAssignmentViews` pasa a:
```ts
const views: AssignmentViewKind[] = [];
if (hasPermission(bearer, PEDIDOS_CONSULTAR)) views.push('todos');
else {
  if (canExecuteAssignedOrders(bearer)) views.push('asignados');
  if (hasPermission(bearer, TERMINADOS_CONSULTAR)) views.push('terminados');
}
if (hasPermission(bearer, EMPAQUE_MODIFICAR)) views.push('por_empacar');
return views.length > 0 ? views : ['asignados'];
```
Usa `canExecuteAssignedOrders` (no el literal) para que el código del permiso siga en un único
archivo de dominio (R15). `resolveAssignmentView` no cambia: una `vista` pedida que no esté en la
lista cae en la primera permitida (R19a). La página ya pinta solo la sección de la vista resuelta.
El fallback `['asignados']` conserva el contrato «nunca vacío» de hoy; por R16 esa vista sale vacía.

### 3.5 «Terminados» filtrado por empacador (R20, R20a)
Criterio: el filtro se activa cuando el actor **no** tiene `asignaciones.ejecutar` (mismo predicado
que R16 y R19, un solo criterio para «quien no ejecuta»). Hoy, con el seed, solo afecta al
Empacador: el Administrador tiene `ejecutar` y además ve «Todos», no «Terminados».

El filtro tiene que ir en SQL para que `total`/`totalPages` describan lo que se muestra. Cambio en
el puerto de `pedidos` (`lib/modules/pedidos/domain/order-catalog.ts`), dueño de `orders`:
```ts
listAliveSummariesInCompany(
  companyId: string,
  statuses: readonly OrderStatus[],
  ordering: OrderSummaryOrdering,
  page: number,
  pageSize?: number,
  filter?: { readonly packedBy?: string },
): Promise<Page<AssignedOrderSummary>>;
```
Parámetro opcional al final: los llamadores actuales (`list-company-orders`, `list-packing-orders`,
`list-finished-orders`) no cambian de comportamiento. El adaptador Prisma de `pedidos` añade
`packedBy` al `where` cuando viene. `packed_by` ya existe con índice `orders_packed_by_idx`; los
`ENTREGADO` antiguos lo tienen `NULL` y por tanto quedan fuera (R20).

`list-finished-orders.ts`: tras validar la entrada,
`const filter = canExecuteAssignedOrders(actor) ? undefined : { packedBy: actor.id };`.
El actor sale de la sesión, nunca de la entrada.

**Riesgo de guardia:** `tests/guards/guard-ambito-empresa-pedidos.test.ts` y
`tests/integration/aislamiento.json` vigilan el ámbito de empresa de las consultas de `pedidos`; el
`where` sigue llevando `companyId`, pero el implementer debe confirmar que la guardia sigue verde.

## 4. Rutas y UI

### 4.1 `/asignacion/[id]/page.tsx` (R8)
`await requirePagePermission('asignaciones.ejecutar')` como primera línea, en lugar de
`asignaciones.consultar`. El 404 lo da `requirePagePermission`. El comentario de cabecera se ajusta
al nuevo permiso.

### 4.2 `/asignacion/page.tsx` → tabla (R10, R11)
Contrato nuevo, de arriba abajo:
- `page.tsx` ya lee `sessionUser` (misma lectura memoizada por petición, sin coste extra). Calcula
  `const canExecute = canExecuteAssignedOrders(sessionUser)` y lo pasa a
  `<AssignedOrdersListSection params vista canExecute />`.
- `AssignedOrdersListSection` → `<AssignedOrdersTable … canExecute />`.
- `AssignedOrdersTable` → `buildAssignedOrdersColumns({ canExecute })` (en el `useMemo`, con
  `canExecute` como dependencia).
- `buildAssignedOrdersColumns({ canExecute }: { readonly canExecute: boolean })`: si `false`, no
  incluye la columna `ASSIGNED_ORDER_ENTER_COLUMN_ID`. Sin valor por defecto `true`: la dirección
  segura es exigir el argumento.
- `AssignedOrdersSkeleton`: hoy copia a mano el número de columnas y un test lo ata. Recibe
  `canExecute` (desde `page.tsx`, que ya lo tiene antes del `Suspense`) para pintar el mismo número
  de columnas que la tabla.

Ningún componente lee el rol ni el código del permiso.

### 4.3 Server Actions
`order-execution-actions.ts` no cambia: no comprueba permisos, delega en los casos de uso. Sin
permiso, `startAssignedOrderAction` devolverá el `ErrorState` de autorización; la página no llega a
llamarla porque el 404 va antes.

## 5. Contratos I/O

| Caso de uso | Entrada | Permiso antes | Permiso después | Salida sin permiso |
|---|---|---|---|---|
| `getAssignedOrderExecution` | `{ orderId: uuid }` | `asignaciones.consultar` | `asignaciones.ejecutar` | `UnauthorizedError` |
| `startAssignedOrder` | `{ orderId: uuid }` | `asignaciones.consultar` | `asignaciones.ejecutar` | `UnauthorizedError` |
| `finishAssignedOrder` | `{ orderId: uuid }` | `asignaciones.consultar` | `asignaciones.ejecutar` | `UnauthorizedError` |
| `listAssignedOrders` | `{ page, pageSize? }` | `asignaciones.consultar` | igual + filtro R16 | página vacía si falta `ejecutar` |
| `listFinishedOrders` | `{ page, pageSize? }` | `terminados.consultar` | igual + filtro R20 | solo `packedBy = actor.id` si falta `ejecutar` |
| `resolveAssignmentViews` | `PermissionBearer` | — | — | sin `asignados` si falta `ejecutar` |
| `canExecuteAssignedOrders` | `PermissionBearer \| null \| undefined` | — | — | `false` |

## 6. Tests afectados (no exhaustivo; el implementer barre con el grafo)

- `tests/unit/identity/permissions.test.ts`: `CODIGOS_DEL_REQUISITO`, `PERMISOS_PREVIOS`, la
  aserción de acción (`consultar|modificar` → admitir `ejecutar` solo en `asignaciones`), la de
  «módulo con escritura declara exactamente consultar y modificar» (`asignaciones` declara tres),
  las listas exactas del Operador (varias `toEqual` repetidas por fichas anteriores) y del
  Administrador.
- `tests/unit/identity/seed/seed-initial-access.test.ts`, `tests/integration/identity/identity-seed.int.test.ts`:
  recuentos derivados.
- `tests/unit/asignaciones/empacador-authorization.test.ts`: hoy aserta que el Empacador **concede**
  en leer/comenzar/terminar; se invierte a **rechaza sin invocar puertos** (lista sigue concediendo
  pero vacía).
- `tests/unit/asignaciones/module-contract.test.ts` regla (e): `CODIGOS_NUEVOS` gana
  `asignaciones.ejecutar`; `CONSUMO_LEGITIMO` mueve los tres casos de uso y `[id]/page.tsx` de
  `consultar` a `ejecutar` y añade `domain/actor.ts` para `ejecutar`.
- `tests/guards/guard-pantallas-exigen-permiso.test.ts`: solo valida que el código exista en el
  catálogo; la ruta ya está en `RUTAS_ESPERADAS_HOY`. Se espera verde sin cambios.
- Tests de los tres casos de uso y de `list-assigned-orders`, `order-execution-page.test.tsx`,
  tests de columnas/tabla/skeleton de `asignaciones-ui`: fixtures de actor con `asignaciones.ejecutar`.
- `tests/unit/asignaciones/assignment-views.test.ts`: matriz de vistas de R19 por conjunto de
  permisos.
- `tests/unit/asignaciones/list-finished-orders.test.ts`, `tests/unit/pedidos/order-catalog.test.ts`,
  `tests/integration/asignaciones/finished-orders.int.test.ts`,
  `tests/integration/pedidos/order-catalog-company-summary.int.test.ts`: filtro `packedBy` (R20) y
  llamadas sin filtro intactas; `tests/helpers/order-summaries.ts` si el doble del puerto cambia.
- `tests/unit/asignaciones/list-responsible-candidates.test.ts` /
  `responsible-eligibility.int.test.ts`: caso explícito de que el Empacador sigue siendo elegible
  (R22).
- E2E: `ejecucion-receta.spec.ts` y `pedidos-asignados.spec.ts` entran como Operador (tras la
  migración/seed tendrán el permiso). Nuevo caso E2E para R18 con el Empacador.

## 7. Alternativas descartadas

1. **Exigir `empaque.modificar` en negativo («no entra quien empaca»).** Descartada: autoriza por
   ausencia de permiso, rompe el fallo cerrado de `assertPermission` y en la práctica es decidir por
   rol disfrazado. Además el humano cerró D1.
2. **Quitar `asignaciones.consultar` al Empacador.** Descartada: es lo que le permite entrar a
   `/asignacion` y ver «Terminados» y «Por empacar»; perderlo le cerraría la pantalla entera.
3. **Ocultar solo el botón «Entrar» sin tocar los casos de uso.** Descartada: un permiso
   implementado solo en UI o en ruta no cuenta como implementado
   (`docs/architecture.md > Permisos y autenticacion`); la URL directa y la Server Action seguirían
   abiertas.
4. **Filtrar en `/asignacion/page.tsx` (no montar `AssignedOrdersListSection`) en vez de en el caso
   de uso.** Descartada para R16: D8 pide filtrado en servidor por consulta/caso de uso; filtrar en
   la página deja el caso de uso devolviendo los pedidos a cualquier otro llamador. Por eso se
   hacen las dos cosas: el caso de uso vacía la lista (R16) y `resolveAssignmentViews` oculta la
   pestaña (R19).
6. **Filtrar «Terminados» por presencia de `empaque.modificar`** en vez de por ausencia de
   `asignaciones.ejecutar`. Descartada: serían dos criterios distintos para la misma idea («quien no
   ejecuta solo ve lo suyo») y un usuario con `ejecutar` y `empaque.modificar` vería su
   «Terminados» recortado sin motivo.
7. **Filtrar «Terminados» en memoria tras leer la página.** Descartada: `total` y `totalPages`
   mentirían y las páginas saldrían con huecos.
8. **Filtrar «Terminados» por fila de responsable (`order_assignments`) en vez de por `packedBy`.**
   Descartada: el humano fijó `packedBy` = actor (D10); la asignación incluye a quien ejecutó, no
   solo a quien empacó.
5. **Exigir `consultar` Y `ejecutar` en los casos de uso de ejecución.** Descartada: duplica la
   pregunta y hace que `ejecutar` dependa de `consultar`, contra la regla de pertenencia exacta sin
   implicación (R7b).

## 8. Dependencias de terceros

Ninguna nueva.

## 9. Riesgos

- **Sesiones vivas al desplegar — RIESGO ACEPTADO (D11):** los Operadores con sesión abierta
  antes del despliegue no tendrán `asignaciones.ejecutar` en su sesión hasta volver a iniciarla
  (máximo 8 h): mientras tanto no ven «Entrar» ni la pestaña «Mis asignados», y `/asignacion/[id]`
  les da 404. Un Empacador con sesión vieja, en cambio, queda filtrado desde el primer momento,
  porque nunca tuvo el permiso. El humano lo aceptó; no se cierran sesiones. Se avisa en el PR.
- **Elegibilidad de responsables sin cambios (D12):** `canBeResponsible` no se toca; un Empacador
  puede seguir asignado a un pedido que no podrá ver hasta `POR_EMPACAR`. Es intencionado.
- **Orden migración/código:** si el código sale antes que la migración, nadie puede ejecutar. Este
  spec no verifica en qué orden aplica el despliegue las migraciones; el implementer lo comprueba y
  lo deja escrito en el PR.
