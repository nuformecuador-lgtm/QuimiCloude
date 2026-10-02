# Ampliar `WorkGroupRow` con los miembros del grupo (humano, fuera de SDD)

Pedido explicito del humano, fuera del proceso SDD completo (autorizado sin spec/design/tasks):
el listado paginado de grupos de trabajo (`/configuracion/usuarios`, pestana "Grupos") ahora
trae tambien los NOMBRES de los miembros de cada grupo, via join, para que el frontend (delegado
aparte) pinte una columna nueva. Alcance de esta tanda: SOLO backend (contrato + adaptador
Prisma + tests). No se tocó `app/`.

## Archivos modificados

- `lib/modules/identity/domain/work-group-view.ts` — `WorkGroupRow` gana `members: readonly
  WorkGroupMemberRow[]`. Comentario de cabecera actualizado (ya no son "dos claves").
- `lib/modules/identity/adapters/driven/persistence/work-group-prisma.ts`:
  - Nueva proyeccion `WORK_GROUP_ROW_MEMBER_SELECT` (`id, firstNames, lastNames, username`) y
    `toWorkGroupRowMember` (usa `buildDisplayName`, importado de `../../../domain/display-name`).
  - `toWorkGroupRow` ahora recibe `members` como segundo argumento.
  - `listAliveInCompany`: tras resolver la pagina de grupos, si `rows.length > 0` llama a la
    nueva funcion `membersOfGroups(companyId, workGroupIds)` que hace DOS consultas (pertenencias
    de esa pagina de grupos, despues personas unicas vivas de la empresa) y devuelve un
    `Map<workGroupId, WorkGroupMemberRow[]>`, respetando el orden `lastNames, firstNames, id`.
    Si `rows.length === 0` no se hace ninguna consulta extra.
  - Deliberadamente **sin** filtrar por `effectiveAccountStatus` (a diferencia de
    `listMembersAliveInCompany`): esta columna es un vistazo informativo, no el flujo de
    alta/baja de `list-work-group-members.ts`. Comentado en el `select` y en la funcion.
  - Comentarios de cabecera, de `WORK_GROUP_ROW_SELECT` y de `listAliveInCompany` actualizados
    (ya no dicen "DOS columnas" sin matizar).
- `tests/unit/identity/grupos/work-group-input.test.ts` — `CLAVES_DE_GRUPO` y la aserción de
  claves exactas incluyen ahora `members`.
- `tests/integration/identity/work-group-crud.int.test.ts`:
  - El test de R26 ahora espera `['id', 'members', 'name']`.
  - Test nuevo: un grupo sin miembros trae `members: []`; un grupo con dos miembros trae sus dos
    `id` y un `displayName` no vacío para cada uno.
- Fixtures de `WorkGroupRow` en tests de UI que quedaron rotos por el campo nuevo (no tocan
  `app/`, solo fixtures de prueba — se detectaron con
  `grep -rn "WorkGroupRow\|WORK_GROUP_ROW_SELECT" tests/ lib/` ampliando el glob a `.tsx`):
  `tests/unit/configuracion-ui/grupos/work-group-table.test.tsx`,
  `work-group-a11y.test.tsx`, `usuarios-page.test.tsx`, `delete-work-group-dialog.test.tsx`,
  `work-group-sheet.test.tsx`, `work-group-list-section.test.tsx` — todos con `members: []`
  añadido a sus fixtures/fábricas.
  **No se tocó** `tests/unit/configuracion-ui/grupos/work-group-columns.test.tsx`: ya estaba
  modificado por otro agente (frontend, en curso, visible en `git status` desde el arranque de
  esta tanda) construyendo la columna nueva; tocarlo hubiera chocado con ese trabajo en curso.
  Le queda un error de tipo pendiente (`GRUPO.id` reusado en una fila sin `members` en la línea
  ~104) que es de ese trabajo en curso, no de esta tanda.

## No se tocó (por alcance explícito)

- `lib/modules/identity/ports/work-group-repository.ts` — firma de `listAliveInCompany` sin
  cambios.
- `lib/modules/identity/domain/list-work-groups.ts` — sin cambios, el enriquecimiento es detalle
  del adaptador.
- Nada en `app/`, incluidos `assigned-orders-columns.tsx` y `user-columns.tsx` (cambios sin
  commitear de otra tarea, ajenos a esta).

## R\<n\> → test

- R26 (la fila del listado, ahora con miembros) →
  `tests/unit/identity/grupos/work-group-input.test.ts` ("la fila del listado trae el
  identificador, el nombre y sus miembros, y nada mas (R26)") y
  `tests/integration/identity/work-group-crud.int.test.ts` ("R26 — cada fila trae EXACTAMENTE
  `id`, `name` y `members`...").
- Requisito nuevo (humano, sin número R, fuera de SDD): cada fila trae los nombres de sus
  miembros → `tests/integration/identity/work-group-crud.int.test.ts` ("cada fila trae los
  NOMBRES de sus miembros...").

## Verificación

- `npx tsc --noEmit`: limpio salvo UN error preexistente y fuera de alcance,
  `app/(private)/asignacion/components/index.ts` (`MISSING_VALUE_MARK` no exportado de
  `assigned-orders-columns.tsx`) — parte del trabajo en curso de otra tarea, explícitamente
  excluido de esta tanda.
- `npx eslint` sobre todos los archivos tocados: sin salida (limpio).
- `npx vitest run tests/unit/identity/grupos`: **177 passed | 5 skipped (182)**, 9 archivos.
- `npx vitest run tests/unit/configuracion-ui/grupos`: **246 passed | 16 skipped**, 1 fallo — en
  `alcance.test.ts` ("ningun archivo de la pantalla declara un filtro de columna"), causado por
  cambios sin commitear en `user-columns.tsx` de otra tarea (ajenos a esta, señalados
  explícitamente como fuera de alcance en el encargo).
- `npx vitest run tests/integration/identity/work-group-crud.int.test.ts
  tests/integration/identity/work-group-membership.int.test.ts`: **NO PUDE CORRERLOS.** La base
  de integración local falla al construir su plantilla en el paso de sembrado
  (`pnpm run db:seed`): faltan las variables de entorno `SEED_MAESTRO_USERNAME`,
  `SEED_MAESTRO_PASSWORD`, `SEED_MAESTRO_EMAIL` en el `.env` local (están vacías en
  `.env.example`; según `progress/history.md`/memoria del repo solo están confirmadas en
  Vercel, no localmente). No fabriqué valores para esas credenciales porque es una decisión de
  entorno/secretos fuera de mi alcance. El cambio en `work-group-prisma.ts` SÍ pasa `tsc
  --noEmit` y `eslint` sin errores, y el test de integración nuevo quedó escrito y compila, pero
  no se ejecutó contra Postgres real.

## Veredicto

Backend completo y verificado por tipos/lint/unit; la verificación de integración contra
Postgres real quedó bloqueada por falta de `SEED_MAESTRO_*` en el entorno local, no por el
código — necesita que el humano complete esas variables (o indique cómo obtenerlas) para cerrar
esa pata.
