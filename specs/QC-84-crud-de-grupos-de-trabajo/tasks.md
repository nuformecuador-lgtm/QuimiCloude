# QC-84 — crud-de-grupos-de-trabajo · tasks.md

> Zona: `backend` · Complejidad: `medium` · depends_on: `QC-83` (mergeada) ·
> Rama: `feature/QC-84-crud-de-grupos-de-trabajo`
>
> Convenciones: `[P]` = paralelizable con las otras `[P]` del mismo bloque. Cada task indica sus
> dependencias, sus **archivos esperados** y su **criterio de hecho** (verificable, no «parece
> bien»). Un commit por task, formato `docs/conventions.md > Commits`.
>
> **Recordatorio de gate** (`docs/verification.md`, regla 5 de `CLAUDE.md`): el `backend_dev` corre
> **solo** `pnpm run typecheck`, `pnpm run lint` y `pnpm exec vitest related --run <sus archivos>`.
> **No corre la suite completa.** `./init.sh --rapido` lo corre el **leader** al cerrar cada tanda;
> `./init.sh` **completo**, al cerrar la feature y **antes del PR, sin excepción**.

## Archivos que SÍ se tocan

| Archivo | Qué |
| --- | --- |
| `lib/modules/identity/domain/work-group-input.ts` | NUEVO — esquemas `zod` del borde |
| `lib/modules/identity/domain/work-group-view.ts` | NUEVO — `WorkGroupRow`, `WorkGroupMemberRow` |
| `lib/modules/identity/domain/work-group-queryable.ts` | NUEVO — `WORK_GROUP_QUERYABLE` y `WORK_GROUP_MEMBER_QUERYABLE` |
| `lib/modules/identity/domain/create-work-group.ts` | NUEVO — caso de uso |
| `lib/modules/identity/domain/rename-work-group.ts` | NUEVO — caso de uso |
| `lib/modules/identity/domain/delete-work-group.ts` | NUEVO — caso de uso |
| `lib/modules/identity/domain/add-work-group-member.ts` | NUEVO — caso de uso |
| `lib/modules/identity/domain/remove-work-group-member.ts` | NUEVO — caso de uso |
| `lib/modules/identity/domain/list-work-groups.ts` | NUEVO — caso de uso |
| `lib/modules/identity/domain/list-work-group-members.ts` | NUEVO — caso de uso |
| `lib/modules/identity/domain/errors.ts` | SE AMPLÍA — siete clases al final, las diez existentes intactas |
| `lib/modules/identity/ports/work-group-repository.ts` | NUEVO — el puerto único |
| `lib/modules/identity/adapters/driven/persistence/work-group-prisma.ts` | NUEVO — único archivo con `@prisma/client` |
| `lib/modules/identity/adapters/driving/work-group-actions.ts` | NUEVO — las siete Server Actions |
| `lib/modules/identity/index.ts` | Bloque nuevo **al final**, sin reordenar nada |
| `lib/composition/index.ts` | Bloque nuevo **al final** de la fachada `identity` |
| `lib/modules/errores/domain/error-codes.ts` | SE AMPLÍA — siete códigos (32 → 39) |
| `lib/modules/errores/domain/error-catalog.ts` | SE AMPLÍA — siete claves y sus siete textos |
| `tests/**` | Los nuevos de T11–T15 + el ajeno `tests/unit/errores/catalogo.test.ts` |

## Archivos que NO se tocan (declaración para la validación de conflicto del leader)

| Archivo sensible | ¿Lo toca esta feature? |
| --- | --- |
| `db/schema.prisma` | **NO.** El modelo es de QC-83 y está mergeado (R46). Diff vacío |
| `db/migrations/` | **NO.** Ninguna migración nueva, editada ni revertida (R46) |
| `lib/modules/identity/domain/permissions.ts` | **NO.** El catálogo se queda en **quince** (R47) |
| `tests/guards/guard-permisos-sembrados.test.ts`, `tests/unit/identity/permissions.test.ts`, `tests/guards/guard-nav-permisos-declarados.test.ts`, `tests/unit/navegacion/qc75-convenciones.test.ts` | **NO.** Afirman el número exacto de permisos y siguen verdes sin cambios |
| `tests/guards/guard-contrato-listados.test.ts` | **NO.** `identity` ya está dentro desde QC-66: esta ficha **no crea** una copia nueva del contrato |
| `lib/modules/identity/domain/effective-account-status.ts`, `account-status.ts`, `work-group-name.ts`, `actor.ts` | **NO.** Se **consumen** tal cual |
| `lib/modules/asignaciones/**`, `lib/modules/pedidos/**` | **NO** (R50). El test de R39 los **lee** desde `tests/`, no los modifica |
| `app/`, `components/`, `middleware.ts`, `e2e/`, `lib/shared/**`, otros módulos | **NO** (R48) |

---

## Bloque 0 — Lo que se hereda montado

### [x] T0 — Verificar la base heredada (BLOQUEA TODO). No se re-crea nada de esto
- **Depende de**: que QC-83 y QC-66 estén en `dev`; worktree montado en F2.0.
- **Qué**: comprobar uno por uno, y anotar la evidencia (archivo + línea):
  1. `db/schema.prisma` → `model WorkGroup` y `model WorkGroupMember` completos; y en el
     `migration.sql` de QC-83, el índice **`work_groups_name_unique`** funcional, compuesto y
     **parcial**. **Nada de esto se crea ni se modifica.**
  2. `lib/modules/identity/domain/work-group-name.ts` → `normalizeWorkGroupName`, exportado por el
     barril. **Es la única definición** (R13).
  3. `lib/modules/identity/domain/actor.ts` → `Actor` y `requirePermission` (no
     `requireAnyPermission`: aquí cada operación exige **un** código exacto).
  4. `lib/modules/identity/domain/permissions.ts` → `PERMISSIONS` con **quince** entradas,
     `usuarios.consultar` y `usuarios.modificar` incluidas.
  5. `lib/modules/identity/domain/effective-account-status.ts` → `effectiveAccountStatus`.
  6. `lib/modules/identity/domain/list-query.ts`, `page.ts`, `ports/list-query-log.ts` →el contrato
     de QC-57 **ya está** en `identity`. No se copia nada.
  7. `lib/modules/errores/domain/error-codes.ts` → **32** códigos; `tests/unit/errores/catalogo.test.ts`
     L45 con el `toHaveLength(32)`.
  8. `db/schema.prisma` → `model OrderAssignment` con `work_group_id` y `work_group_name` (QC-86):
     es contra esas columnas que se escribe el test de R39.
- **Si falta cualquiera de los ocho: PARAR y avisar al leader.** No se «arregla» escribiéndolo aquí:
  eso duplicaría trabajo de QC-83, QC-66, QC-70, QC-78 o QC-86 y garantizaría conflicto de merge.
- **Archivos**: ninguno (solo lectura) + `progress/impl_QC-84-crud-de-grupos-de-trabajo.md`.
- **Hecho cuando**: los ocho puntos están verificados y anotados con su evidencia en la bitácora.

---

## Bloque 1 — Errores y borde

### [x] T1 — Los siete códigos nuevos en el catálogo único, con su ripple en la MISMA tanda
- **Depende de**: T0.
- **Qué**: añadir a `ERROR_CODES` los siete de `design.md > 7.1` con un comentario de familia
  («`identity` (QC-84): los grupos de trabajo»); su clave en `ERROR_MESSAGE_KEY` y su **texto** en
  `ERROR_MESSAGES_ES`, **sin que dos códigos compartan texto** (QC-70 R4). Actualizar
  `tests/unit/errores/catalogo.test.ts` L45 a `toHaveLength(39)` y su comentario. **Ninguna
  expectativa se elimina ni se debilita.**
- **Archivos**: `lib/modules/errores/domain/error-codes.ts`, `…/error-catalog.ts`,
  `tests/unit/errores/catalogo.test.ts`.
- **Cubre**: R43.
- **Hecho cuando**: `typecheck` verde (el `satisfies Record<ErrorCode, string>` es quien lo exige),
  el test del catálogo pasa, y
  `pnpm exec vitest related --run lib/modules/errores/domain/error-codes.ts` no deja **ningún
  segundo** archivo rojo (si aparece, se arregla aquí, no luego).

### [x] T2 — [P] Las siete clases de error de grupos
- **Depende de**: T1.
- **Qué**: las siete de `design.md > 7.1`, al **final** de `errors.ts`, derivando de `IdentityError`,
  sin tocar ninguna de las diez existentes. Comentario que explique por qué son **tres** códigos de
  «ya pertenece pero no se ve» y no uno (§ 7.2).
- **Archivos**: `lib/modules/identity/domain/errors.ts`,
  `tests/unit/identity/grupos/errors.test.ts` (nuevo).
- **Cubre**: R43 (la mitad del dominio), R31.
- **Hecho cuando**: cada clase expone su `code` exacto y el test lo afirma **por clase**, no por
  texto; y los diez errores de QC-66 siguen con el suyo intacto.

### [x] T3 — [P] Esquemas del borde y tipos de salida
- **Depende de**: T0.
- **Qué**: `createWorkGroupSchema`, `renameWorkGroupSchema`, `workGroupMemberSchema`,
  `deleteWorkGroupSchema` (`strictObject`, sin `companyId`, **sin ninguna lista de miembros**), y
  `WorkGroupRow` / `WorkGroupMemberRow` con sus claves **exactas**.
- **Archivos**: `lib/modules/identity/domain/work-group-input.ts`, `…/work-group-view.ts` (nuevos),
  `tests/unit/identity/grupos/work-group-input.test.ts` (nuevo).
- **Cubre**: R11, R14, R26, R33.
- **Hecho cuando**: el test demuestra que mandar `companyId`, `deletedAt` o un array de miembros
  **falla** el `parse`, y que el nombre vacío o solo con espacios se rechaza.

### [x] T4 — [P] Las dos listas blancas de campos consultables
- **Depende de**: T0.
- **Qué**: `WORK_GROUP_QUERYABLE` (`sortable: ['name','createdAt']`, `filterable: {}`,
  `searchable: true`) y `WORK_GROUP_MEMBER_QUERYABLE` (las tres vacías: el orden de los miembros es
  **fijo** por R22 y de la consulta compartida solo se usan página y tamaño), consumiendo el contrato
  de QC-57 **que ya está en `identity`**.
- **Archivos**: `lib/modules/identity/domain/work-group-queryable.ts` (nuevo).
- **Cubre**: R27, R54.
- **Hecho cuando**: `typecheck` pasa, `deletedAt` no aparece en ninguna de las dos listas y
  `tests/guards/guard-contrato-listados.test.ts` sigue verde **sin haberse tocado**.

---

## Bloque 2 — Dominio: puerto y casos de uso

### [x] T5 — El puerto de datos
- **Depende de**: T2, T3, T4.
- **Qué**: `WorkGroupRepository` con los siete métodos de `design.md > 5`: `companyId` como **primer
  parámetro obligatorio** de todos, resultados **discriminados**, `listMembersAliveInCompany`
  devolviendo **candidatos con estado crudo y `lockedUntil`**, y **ningún** método de búsqueda por
  nombre.
- **Archivos**: `lib/modules/identity/ports/work-group-repository.ts` (nuevo).
- **Cubre**: R8, R9, R12 (la parte del puerto), R19, R32, R34, R37.
- **Hecho cuando**: `typecheck` pasa; ningún método permite omitir la empresa; el puerto no importa
  Prisma ni framework.

### [x] T6 — Los cinco casos de uso de escritura
- **Depende de**: T5.
- **Qué**: `create-work-group`, `rename-work-group`, `delete-work-group`,
  `add-work-group-member`, `remove-work-group-member`, cada uno factory `createXxx(deps)`, con
  `requirePermission('usuarios.modificar')` **antes** de `zod` y antes de cualquier puerto,
  normalización con `normalizeWorkGroupName`, y traducción de los resultados discriminados a los
  errores de T2. En `add-work-group-member`, **el motivo de ocultación se calcula con
  `effectiveAccountStatus`** (`design.md > 5.1`).
- **Archivos**: los cinco `lib/modules/identity/domain/*.ts` (nuevos).
- **Cubre**: R1–R5, R10–R14, R16, R17, R28–R37, R40.
- **Hecho cuando**: pasan los tests de T11 y T12, y `typecheck`/`lint` verdes.

### [x] T7 — Los dos casos de uso de lectura, con el filtro de miembros en el dominio
- **Depende de**: T5.
- **Qué**: `list-work-groups` (contrato de QC-57, `sanitizeListQuery`, registro de campos omitidos
  por el puerto de QC-57) y `list-work-group-members`, que **filtra con `effectiveAccountStatus(view,
  now)`** y proyecta con `buildDisplayName`, sobre los candidatos que el puerto devuelve ya ordenados
  por apellidos, nombres e identificador. Ambos con `requirePermission('usuarios.consultar')` en
  primera línea. `now` **entra por parámetro**.
  **Cierre de P2 (decisión 18)**: `list-work-group-members` **pagina después de filtrar**
  (`design.md > 5.3`) —`total` sobre el conjunto **ya filtrado**, corte por página y tamaño
  **efectivo**— con el 10/25 inyectado por `deps` (`pagination`), nunca importando `lib/shared` desde
  el dominio.
- **Archivos**: `lib/modules/identity/domain/list-work-groups.ts`,
  `…/list-work-group-members.ts` (nuevos).
- **Cubre**: R1, R19–R27, **R51, R52, R53, R54**.
- **Hecho cuando**: pasan T11 y T13; ningún archivo nuevo compara `account_status` con `'active'` a
  mano (se busca el literal y no aparece fuera de `effective-account-status.ts`).

---

## Bloque 3 — Adaptadores y composición

### [x] T8 — El adaptador Prisma
- **Depende de**: T5.
- **Qué**: implementación de los siete métodos; `select` con **columnas enumeradas**;
  `toOffsetLimit`/`buildPage` de `lib/shared/pagination`; orden `name ASC, id ASC` con desempate
  estable; búsqueda por nombre; traducción del `P2002` de `work_groups_name_unique` a
  `'duplicate_name'` y del de `work_group_members_pkey` a `already_member`; el `addMember` como
  `$transaction` de tres pasos (`design.md > 5.1`); `softDelete` como `UPDATE` y `removeMember` como
  `DELETE` **físico**.
- **Archivos**: `lib/modules/identity/adapters/driven/persistence/work-group-prisma.ts` (nuevo).
- **Cubre**: R8, R9, R12, R17, R24, R25, R29, R32, R34, R37, R38, R41.
- **Hecho cuando**: pasan los tres tests de integración (T14, T15, T16).

### [x] T9 — Las siete Server Actions
- **Depende de**: T6, T7.
- **Qué**: `'use server'`; **`FormData`** en las cinco mutaciones, argumentos tipados en las dos
  consultas; actor de las **dos caras** de la sesión vía `@/lib/composition`; traducción del error
  por su `code` con el traductor único de QC-70; ninguna decisión de negocio; **sin
  `revalidatePath`**.
- **Archivos**: `lib/modules/identity/adapters/driving/work-group-actions.ts` (nuevo),
  `tests/unit/identity/grupos/work-group-actions.test.ts` (nuevo).
- **Cubre**: R6, R42, R43.
- **Hecho cuando**: el test cubre los siete caminos y demuestra que sin una de las dos caras de la
  sesión el resultado es `unauthorized` **sin tocar el puerto**.

### [x] T10 — El contrato del módulo y el punto de composición
- **Depende de**: T6, T7, T8.
- **Qué**: bloque **nuevo al final** de `lib/modules/identity/index.ts` (tipos, esquemas, los siete
  errores y las siete factories, **solo de `./domain`**; ninguna Server Action); y en
  `lib/composition/index.ts`, el `workGroupRepository`, la dependencia de **paginación** de
  `list-work-group-members` —cableada sobre `lib/shared/pagination.ts`, la misma implementación que
  usa el resto de la aplicación (`design.md > 5.3`)— y las siete claves de la fachada `identity`,
  **sin reordenar ni reformatear nada**.
- **Archivos**: `lib/modules/identity/index.ts`, `lib/composition/index.ts`,
  `tests/unit/composition/identity-facade.test.ts` (se amplía).
- **Cubre**: R44.
- **Hecho cuando**: `tests/guards/guard-arquitectura-modulos.test.ts` pasa y el barril sigue
  importable desde un componente de cliente.

---

## Bloque 4 — Tests de dominio

### [x] T11 — [P] Autorización de las siete operaciones
- **Depende de**: T6, T7.
- **Qué**: dobles que **lanzan si los llaman**; los siete casos con actor ausente, sin permisos, con
  el conjunto vacío, con el permiso cruzado y con un código parecido; `not.toHaveBeenCalled()` sobre
  **cada** método del puerto.
- **Archivos**: `tests/unit/identity/grupos/authorization.test.ts` (nuevo).
- **Cubre**: R1, R2, R3, R4, R5.
- **Hecho cuando**: pasa y ningún caso llega al puerto.

### [x] T12 — [P] El servicio y los cuatro caminos del duplicado de pertenencia
- **Depende de**: T6.
- **Qué**: dos archivos. El del servicio: ámbito de empresa, grupo de baja como inexistente, crear,
  renombrar, dar de baja, meter, sacar, y que no existe ninguna operación de restaurar. El de
  `add-member`: los **cuatro** `code` distintos (visible, `pending`, `inactive`, `blocked`).
- **Archivos**: `tests/unit/identity/grupos/work-group-service.test.ts`,
  `…/add-member-errors.test.ts` (nuevos).
- **Cubre**: R8–R18, R28–R37, R40.
- **Hecho cuando**: los dos pasan y ningún caso de error escribe por el puerto.

### [x] T13 — [P] El filtro de miembros: los dos precios escritos
- **Depende de**: T7.
- **Qué**: `pending` **no** sale; `inactive` no sale; bloqueada con plazo vigente no sale; **el mismo
  doble**, con el `now` avanzado más allá del plazo, **sí** sale, y el caso de uso **no llamó a
  ningún método de escritura**; una cuenta que pasa a `active` reaparece en **todos** sus grupos sin
  escritura sobre la pertenencia; orden determinista con dos homónimos.
- **Archivos**: `tests/unit/identity/grupos/members-filter.test.ts` (nuevo).
- **Cubre**: **R19, R20, R21**, R22, R23.
- **Hecho cuando**: pasa y el caso del desbloqueo se logra **solo** moviendo `now`.

### [x] T19 — [P] La paginación de los miembros (cierre de P2, decisión 18)
- **Depende de**: T7. *(Se numera **al final de la serie** y no renumera ninguna task: es la segunda
  vuelta del spec, aprobada el 2026-09-11. Su sitio de ejecución es este bloque, junto a T13.)*
- **Qué**: defecto **10** y tope **25** (pedir 100 devuelve 25, no un error); el **total cuenta solo
  a las filtradas** —12 miembros con 4 ocultos ⇒ `total: 8` y **una** página—; recorrer todas las
  páginas devuelve a **cada** persona **exactamente una vez**, con **dos homónimas** dentro; y la
  página tiene la **misma forma** que la del listado de grupos.
- **Archivos**: `tests/unit/identity/grupos/members-pagination.test.ts` (nuevo).
- **Cubre**: **R51, R52, R53, R54**.
- **Hecho cuando**: pasa; el caso del total se pone **rojo** si se cuenta antes de filtrar, y el del
  recorrido se pone rojo si se quita el desempate por identificador.

---

## Bloque 5 — Integración, alcance y cierre

### [x] T14 — Integración: el CRUD contra Postgres real
- **Depende de**: T8, T10.
- **Qué**: crear con la empresa heredada; duplicado por **`SQLSTATE 23505`** del índice parcial; dos
  empresas con el mismo nombre; renombrar y su duplicado; paginación 10/25; orden estable; grupo de
  otra empresa → no encontrado; baja lógica que **conserva** la fila y sus pertenencias; y que tras
  la baja el nombre **queda libre**.
- **Archivos**: `tests/integration/identity/work-group-crud.int.test.ts` (nuevo).
- **Cubre**: R8, R9, R12, R15, R17, R24, R25, R26, R37, R38, R41.
- **Hecho cuando**: pasa y el `beforeAll` falla con un mensaje claro si la base no tiene las tablas
  de QC-83.

### [x] T15 — Integración: pertenencias, filtro y la carrera del duplicado
- **Depende de**: T8, T10.
- **Qué**: meter a personas en los cuatro estados de cuenta; la lista de miembros con las cuatro;
  persona de otra empresa y persona borrada → no encontrada; **dos inserciones concurrentes** de la
  misma persona con **dos conexiones de verdad** → una sola fila y la segunda con el error de
  duplicado; sacar borra la fila **de verdad** y no toca ni a la persona ni a sus otros grupos;
  sacar a quien no pertenece. **Y la paginación contra datos reales**: un grupo con más de una página
  de miembros vivos y algunos ocultos, comprobando que el `total` es el del conjunto **filtrado** y
  que las páginas no repiten ni pierden a nadie.
- **Archivos**: `tests/integration/identity/work-group-membership.int.test.ts` (nuevo).
- **Cubre**: R19, R20, R21, R28, R29, R30, R31, R32, R34, R35, R36, **R51, R52, R53**.
- **Hecho cuando**: pasa de forma repetible (se corre tres veces seguidas) y la tabla queda con una
  sola fila tras la carrera.

### [x] T16 — Integración: la baja del grupo NO deja un pedido sin responsables
- **Depende de**: T8, T10.
- **Qué**: **el test que la ficha exige**. Montar un pedido con un grupo aplicado (filas de
  `order_assignments` con `work_group_id` y `work_group_name`, QC-86); **renombrar** el grupo y
  después **darlo de baja**; afirmar que las filas de asignación quedan **idénticas** —mismas
  personas, misma referencia, mismo nombre congelado— y que el pedido **conserva sus responsables**.
- **Archivos**: `tests/integration/identity/work-group-assignments.int.test.ts` (nuevo).
- **Cubre**: **R18, R39**.
- **Hecho cuando**: pasa, y se pone **rojo** si se cambia a mano el caso de uso de baja para tocar
  `order_assignments` (caso de sensibilidad, anotado en la bitácora).

### [x] T17 — [P] El test de alcance
- **Depende de**: T8, T9.
- **Qué**: diff **vacío** en `db/schema.prisma` y en `db/migrations/`; `PERMISSIONS.length === 15`;
  nada nuevo bajo `app/`, `components/` ni `e2e/`; `package.json` sin dependencias nuevas; ningún
  archivo de producción de la feature nombra `order_assignments`, `prisma.orderAssignment` ni
  importa `@/lib/modules/asignaciones`; ningún archivo de la feature compara `'active'` a mano.
- **Archivos**: `tests/unit/identity/grupos/scope.test.ts` (nuevo).
- **Cubre**: R46, R47, R48, R49, R50.
- **Hecho cuando**: pasa y **cada** aserción se pone roja al violarla a mano.

### [x] T18 — Trazabilidad y cierre
- **Depende de**: todas las anteriores, **T19 incluida**.
- **Qué**: escribir el mapa **`R1…R54 → test`** en
  `progress/impl_QC-84-crud-de-grupos-de-trabajo.md` (`CHECKPOINTS.md > Trazabilidad`), anotar el
  estado de **P1** (de QC-87, única abierta; **P2 se cerró el 2026-09-11** y es la decisión 18,
  escrita por R51–R54), y dejar constancia del ripple de
  `design.md > 7.3` y de los tres hallazgos de `design.md > 12`.
- **Archivos**: `progress/impl_QC-84-crud-de-grupos-de-trabajo.md`.
- **Hecho cuando**: ningún `R<n>` queda sin test nombrado y el leader puede correr `./init.sh`
  completo en verde.

---

## Trazabilidad (mapa previsto `R<n> → test`)

| Requisito(s) | Test que lo cierra |
| --- | --- |
| R1–R5 | `tests/unit/identity/grupos/authorization.test.ts` (T11) |
| R6 | `tests/unit/identity/grupos/work-group-actions.test.ts` (T9) |
| R7 | `tests/guards/guard-rls-force.test.ts` (existente) + `…/grupos/scope.test.ts` (T17) |
| R8, R9 | `…/grupos/work-group-service.test.ts` (T12) + `work-group-crud.int.test.ts` (T14) |
| R10, R11 | `…/grupos/work-group-input.test.ts` (T3) + `work-group-service.test.ts` (T12) + `work-group-crud.int.test.ts` (T14) |
| R12, R15, R17 | `work-group-crud.int.test.ts` (T14, vía `SQLSTATE 23505`) |
| R13 | `…/grupos/work-group-service.test.ts` (T12) + `scope.test.ts` (T17: ninguna segunda normalización) |
| R14 | `…/grupos/work-group-input.test.ts` (T3) |
| R16, R18 | `…/grupos/work-group-service.test.ts` (T12) + `work-group-assignments.int.test.ts` (**T16**) |
| R19, R20, R21 | `…/grupos/members-filter.test.ts` (**T13**) + `work-group-membership.int.test.ts` (T15) |
| R22, R23 | `…/grupos/members-filter.test.ts` (T13) |
| R24, R25, R26 | `work-group-crud.int.test.ts` (T14) |
| R27 | `…/grupos/work-group-input.test.ts` (T3, la firma) + `guard-contrato-listados.test.ts` (existente, sin tocar) |
| R28, R29 | `…/grupos/work-group-service.test.ts` (T12) + `work-group-membership.int.test.ts` (T15) |
| R30, R31 | `…/grupos/add-member-errors.test.ts` (**T12**) + `…/grupos/errors.test.ts` (T2) |
| R32 | `work-group-membership.int.test.ts` (**T15**, dos conexiones) |
| R33 | `…/grupos/work-group-input.test.ts` (T3: ningún esquema acepta una lista) |
| R34, R35, R36 | `work-group-membership.int.test.ts` (T15) + `work-group-service.test.ts` (T12) |
| R37, R38, R40, R41 | `work-group-crud.int.test.ts` (T14) |
| R39 | `work-group-assignments.int.test.ts` (**T16**) |
| R42 | `…/grupos/work-group-actions.test.ts` (T9) |
| R43 | `tests/unit/errores/catalogo.test.ts` (T1) + `…/grupos/errors.test.ts` (T2) + `guard-catalogo-de-errores.test.ts` (existente) |
| R44 | `guard-arquitectura-modulos.test.ts` + `tests/unit/composition/identity-facade.test.ts` (T10) |
| R45 | `…/grupos/scope.test.ts` (T17) |
| R46, R47, R48, R49, R50 | `…/grupos/scope.test.ts` (**T17**) + `guard-dependencias-aprobadas.test.ts` |
| **R51, R52, R53** | `…/grupos/members-pagination.test.ts` (**T19**) + `work-group-membership.int.test.ts` (T15) |
| **R54** | `…/grupos/members-pagination.test.ts` (T19, misma forma de página) + `work-group-queryable.ts` con sus dos listas blancas (T4) |
