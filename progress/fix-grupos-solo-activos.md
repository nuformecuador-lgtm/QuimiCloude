# Fix: en los grupos de trabajo solo entran personas activas (rama `fix/grupos-solo-miembros-activos`)

Fecha: 2026-10-05. Fix directo que aprobó el humano. Regla: **solo entran en un grupo las personas cuyo estado de cuenta EFECTIVO es activo**, y el buscador de candidatos solo ofrece personas activas.

## Archivos tocados

Producción:
- `lib/modules/identity/domain/add-work-group-member.ts`: nuevo `canJoinWorkGroup(account, now)`, que es `blockReasonOf(effectiveAccountStatus(...)) === null`. Se exporta y se pasa al puerto como predicado `admits`, con el mismo `instant`. El resultado nuevo `not_admitted` se traduce a `WorkGroupMemberNotActiveError`.
- `lib/modules/identity/ports/work-group-repository.ts`: `addMemberAliveInCompany(companyId, id, userId, now, admits)` y el resultado nuevo `{ kind: 'not_admitted' }`.
- `lib/modules/identity/adapters/driven/persistence/work-group-prisma.ts`: dentro de la misma transacción, después de leer a la persona, se llama a `admits(account)` **antes** del INSERT. Si no la admite, se mira si ya pertenecía al grupo:
  - si ya pertenecía, devuelve `already_member`, así que los códigos de R30/R31 no cambian;
  - si no, devuelve `not_admitted` y no se escribe nada.
- `lib/modules/identity/domain/list-work-group-members.ts`: `isVisible` ahora llama a `canJoinWorkGroup`. Así hay una sola expresión para quien se ve y para quien entra.
- `lib/modules/identity/domain/errors.ts`: clase nueva `WorkGroupMemberNotActiveError`.
- `lib/modules/errores/domain/error-codes.ts` y `error-catalog.ts`: código nuevo `work_group_member_not_active`.
- `lib/modules/identity/domain/work-group-queryable.ts`: `WORK_GROUP_CANDIDATE_QUERYABLE`, que permite buscar pero no ordenar ni filtrar.
- `lib/modules/identity/domain/list-work-group-candidates.ts` (nuevo): el caso de uso `createListWorkGroupCandidates` y el tipo `WorkGroupCandidateRow`.
- `lib/modules/identity/ports/work-group-candidate-reader.ts` (nuevo): el puerto `WorkGroupCandidateReader`.
- `lib/modules/identity/adapters/driven/persistence/work-group-candidates-prisma.ts` (nuevo): reutiliza `buildUserWhere` del listado de usuarios, así que la búsqueda mira las mismas 4 columnas que el picker usaba antes y también excluye al propio actor.
- `lib/modules/identity/adapters/driving/work-group-actions.ts`: Server Action nueva.
- `lib/modules/identity/index.ts`: exporta `WorkGroupMemberNotActiveError`, `WORK_GROUP_CANDIDATE_QUERYABLE`, `createListWorkGroupCandidates`, `ListWorkGroupCandidatesDeps` y `WorkGroupCandidateRow`.
- `lib/composition/index.ts`: `identity.listWorkGroupCandidates` queda conectado.

Spec:
- `specs/QC-84-crud-de-grupos-de-trabajo/requirements.md`: enmienda fechada 2026-10-05 debajo de R28, y una fila nueva en «Decisiones cerradas» justo después de la decisión 4. El texto original no se tocó.

Tests:
- Nuevos:
  - `tests/unit/identity/grupos/add-member-admission.test.ts`
  - `tests/unit/identity/grupos/list-work-group-candidates.test.ts`
- Actualizados:
  - `tests/unit/identity/grupos/work-group-service.test.ts`: R28 ahora espera el predicado.
  - `tests/unit/identity/grupos/scope.test.ts`: discriminante `not_admitted`.
  - `tests/unit/identity/account-status-scope.test.ts`: alta del adaptador nuevo.
  - `tests/unit/errores/catalogo.test.ts`: pasa de 67 a 68 códigos.
  - `tests/integration/identity/work-group-membership.int.test.ts`:
    - R28 reescrito;
    - el helper `meter` activa a la persona de forma temporal para preparar escenarios de lectura de R19/R20/R21/R30/R31/R51;
    - bloque nuevo de candidatos.

## La acción nueva

```ts
// lib/modules/identity/adapters/driving/work-group-actions.ts  ('use server')
export async function listWorkGroupCandidatesAction(
  query: unknown,
): Promise<WorkGroupCandidateListResult>;

export type WorkGroupCandidateListResult =
  | { status: 'success'; data: Page<WorkGroupCandidateRow> }
  | ErrorState;

// exportado desde '@/lib/modules/identity'
export type WorkGroupCandidateRow = {
  readonly id: string;
  readonly displayName: string;
  readonly roleName: string;
};
```

- `query` usa la misma forma que `listUsersAction`: `{ page, pageSize, sort, filters, search }`. `sort` y `filters` se ignoran y no rompen nada.
- El permiso es `usuarios.modificar`, no `usuarios.consultar`. La lista solo sirve para elegir a quién meter, y meter exige `usuarios.modificar`. Un actor que solo tenga `usuarios.consultar` recibe `unauthorized`.
- Para frontend: el picker de `work-group-form.tsx` pasa de `UserRow` a `WorkGroupCandidateRow`. Solo usa `id`, `displayName` y `roleName`, que son justo las claves de la fila nueva.

## Código de error nuevo

- `work_group_member_not_active`, con el mensaje «Solo se puede meter en un grupo a una persona con la cuenta activa.»
- Es un solo código para pendiente, inactiva y bloqueada. Sigue el precedente de `user_not_assignable`: las tres situaciones llevan a la misma acción y el catálogo no interpola.
- Los tres `work_group_member_exists_*` se separaron porque explican por qué alguien no se ve en la lista; aquí no hay nada que explicar sobre la lista.

## Decisiones y desvíos que hay que revisar

1. **El filtro de estado efectivo de los candidatos se hace en memoria, no en SQL.** El encargo pedía hacerlo «en la consulta SQL» y a la vez «reutilizar la misma traducción» de R19. Esa traducción (`effectiveAccountStatus`) depende del reloj y hoy vive solo en el dominio: R19 filtra en memoria. Copiarla a un `WHERE` sería una segunda definición, que es lo que QC-78 R7 y la guardia R13 prohíben. Lo que el encargo buscaba (total y paginación correctos) se cumple igual: el SQL trae a todas las personas vivas de la empresa que casan con la búsqueda, sin LIMIT; el dominio filtra y **después** pagina. Es el mismo patrón que `list-work-group-members.ts`. El coste es leer a todas las personas que casan con la búsqueda; en una empresa con muchos usuarios esto podría pesar.
2. **El buscador excluye al propio actor.** Reutiliza `buildUserWhere` pasando `actor.id` como excluido. Desde la decisión del humano del 2026-10-05 eso es además la regla: nadie puede meterse a sí mismo en un grupo, y el servidor lo rechaza con `work_group_member_self` (ver la ampliación más abajo).
3. Hay una carrera teórica sin cubrir: si el estado de una persona cambia entre la lectura y el INSERT dentro de la transacción, no hay `FOR UPDATE`. La ventana es de milisegundos y aceptarla no cambia ninguna garantía de R32.
4. **Deuda: el filtro de activos se hace en memoria.** Cada consulta del picker hace un `findMany` sin límite sobre todas las personas vivas de la empresa que casan con la búsqueda, y después filtra y pagina. Hoy no es un problema, pero conviene vigilarlo si alguna empresa crece mucho. Para pasarlo al SQL sin duplicar la regla de estado efectivo habría que derivar el `WHERE` de la misma definición que usa `effectiveAccountStatus`.

## R → test

| Requisito | Test |
| --- | --- |
| R28 (enmienda): pendiente, inactiva, bloqueada sin plazo, bloqueada con plazo vigente, `active` con plazo vigente → rechazo sin fila | `tests/unit/identity/grupos/add-member-admission.test.ts` y `tests/integration/identity/work-group-membership.int.test.ts` > «R28 (enmienda 2026-10-05)…» |
| R28 (enmienda): activa y bloqueada con plazo vencido entran | ídem, segundo caso |
| R28: el predicado usa el mismo instante | `add-member-admission.test.ts` > «el predicado se evalua con el MISMO instante…» |
| R30/R31 sin cambios (tres códigos) | `add-member-errors.test.ts` (sin tocar, verde) y `work-group-membership.int.test.ts` > «R30 + R31» |
| Candidatos: excluye no activas y el total es correcto | `list-work-group-candidates.test.ts` y `work-group-membership.int.test.ts` > «los candidatos a grupo son solo…» |
| Candidatos: búsqueda | `work-group-membership.int.test.ts` > «la busqueda acota…» |
| Candidatos: permiso `usuarios.modificar` | `list-work-group-candidates.test.ts` > «exige `usuarios.modificar`…» |

## Gate

- `./init.sh --rapido`: **verde** (`init OK`). typecheck pasa, lint pasa con 0 errores (8 warnings ya existentes en otros archivos), y las guardias quedan en 51 archivos y 680 tests pasados.
  - Hubo que exportar `DATABASE_URL`/`DIRECT_URL` a mano. El gate hace `. ./.env` y se rompe en la línea 49 del `.env` (`FORMULA_PROMPT` con backticks y paréntesis), un problema que ya existía en el `.env` local.
  - `test:rapido` dijo «el diff vs origin/dev no toca codigo con tests», así que además corrí:
    - `vitest run tests/unit/identity tests/unit/errores tests/guards`: 145 archivos pasan y 1 falla, ya existente (ver abajo);
    - integración `tests/integration/identity/work-group*` contra la base: 4 archivos y 64 tests en verde;
    - `tests/unit/configuracion-ui`: todo lo de grupos en verde. Fallan 4 tests de viewport en unidades/usuarios por `overflow-hidden`, que no tienen relación con este cambio.
- Fallo que ya existía y no es de este cambio: `tests/unit/identity/account-status-scope.test.ts` marca `lib/modules/asignaciones/domain/list-responsible-candidates.ts` (commit `0dbcd68f user filter`), que no está en la lista cerrada.
- Mientras trabajaba, otro proceso estaba editando `app/(private)/asignacion/[id]/components/*` en este mismo árbol. Un typecheck intermedio dio rojo por ese motivo; en la corrida del gate ya pasaba. No toqué `app/`.
- Falta `./init.sh` completo antes del PR.

Veredicto: el servidor rechaza a las personas que no están efectivamente activas y existe la consulta de candidatos activos; gate rápido en verde, y frontend tiene que cambiar el picker a `listWorkGroupCandidatesAction`.

## Ampliación del 2026-10-05: nadie puede meterse a sí mismo en un grupo

Decisión del humano. Desde aquí el árbol está en `dev`; no hubo commit, pull ni cambio de rama.

- **Código nuevo: `work_group_member_self`**, con el mensaje «No puedes meterte a ti mismo en un grupo de trabajo.» y la clase `WorkGroupMemberSelfError`, que se exporta desde `@/lib/modules/identity`.
- `addWorkGroupMember` rechaza cuando `userId === actor.id`. La comprobación va después de `requirePermission` y de zod, y antes del puerto.
- **El alta con miembros iniciales ya queda cubierta.** `createWorkGroup` solo recibe `{ name }`; el esquema es estricto y no tiene `members`. Los miembros iniciales entran uno a uno con `addWorkGroupMemberAction`, es decir, por `addWorkGroupMember`.
- El buscador de candidatos sigue excluyendo al actor, y ahora hay tests que lo comprueban (unit e integración).
- Archivos tocados en esta tanda:
  - `lib/modules/errores/domain/error-codes.ts`, `lib/modules/errores/domain/error-catalog.ts`
  - `lib/modules/identity/domain/errors.ts`, `lib/modules/identity/domain/add-work-group-member.ts`, `lib/modules/identity/index.ts`
  - `tests/unit/errores/catalogo.test.ts` (pasa de 68 a 69 códigos)
  - `tests/unit/identity/grupos/add-member-admission.test.ts`, `tests/unit/identity/grupos/list-work-group-candidates.test.ts`
  - `tests/integration/identity/work-group-membership.int.test.ts`
  - `specs/QC-84-crud-de-grupos-de-trabajo/requirements.md` (enmienda debajo de R28 y fila nueva en «Decisiones cerradas»)
- Sobre `tests/unit/identity/account-status-scope.test.ts`: **lo modifiqué yo** en la primera tanda. Añadí `work-group-candidates-prisma.ts` a la lista cerrada porque ese adaptador nuevo selecciona `accountStatus`, y sin esa línea el test se ponía rojo por mi cambio. El fallo que ya existía es otro: `lib/modules/asignaciones/domain/list-responsible-candidates.ts` falta en la lista. Ese no lo toqué.
- Gate: `./init.sh --rapido` en **verde**; esta vez cargó el `.env` solo. Los tests de grupos y errores, unit e integración contra la base, dan 14 archivos y 272 tests pasados.
