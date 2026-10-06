# QC-216 — rol-administrador-de-acondicionamiento · tasks.md

> Zona: `backend` · Complejidad: `medium` · depends_on: — · Rama:
> `feature/QC-216-rol-administrador-de-acondicionamiento`
>
> El **qué** está en `requirements.md` (R1–R28), el **cómo** en `design.md`. `[P]` =
> paralelizable con las tareas marcadas igual dentro del mismo bloque. Cada task se cierra con
> `./init.sh --rapido` en verde salvo que diga otra cosa; la feature se cierra con `./init.sh`
> completo (regla 5 de `CLAUDE.md`).
>
> **Regla transversal.** `docs/conventions.md > Comentarios`: ningún comentario nuevo cita `QC-<n>`,
> `R<n>`, `design.md` ni «decisión cerrada»; en tests, `R<n>` va en el nombre del caso.
>
> **Antes de T1:** anotar en `progress/impl_QC-216-rol-administrador-de-acondicionamiento.md` el
> catálogo de `PERMISSIONS` y los `SEED_ROLES` que hay en `dev` en ese momento (códigos, número y
> orden) y la última migración. Es el «catálogo previo» de R5. Medido en `1a1db86e`: 24 códigos,
> 4 roles, última migración `20261006140000_inventory_movements_adjustment_count`. Si difiere, mandan
> los de `dev` y las líneas de `design.md > 5` se relocalizan.

## Archivos que esta feature declara tocar (para la validación de conflicto del leader)

**Producción, modificados:** `lib/modules/identity/domain/roles.ts`,
`lib/modules/identity/domain/permissions.ts`, `lib/modules/identity/index.ts`.

**Producción, nuevos:** `db/migrations/<ts>_conditioning_role/migration.sql`,
`db/migrations/<ts>_conditioning_role/down.sql`.

**Tests nuevos:** `tests/unit/identity/roles/acondicionamiento-rol.test.ts`,
`tests/unit/identity/schema/conditioning-role-migration.test.ts`,
`tests/unit/asignaciones/acondicionamiento-authorization.test.ts`,
`tests/unit/navegacion/menu-acondicionamiento.test.ts`,
`tests/integration/identity/conditioning-role-migration.int.test.ts`.

**Tests modificados:** los de `design.md > 5` y
`tests/guards/guard-autorizacion-por-permiso.test.ts`,
`tests/unit/identity/require-page-permission.test.ts`,
`tests/integration/identity/identity-seed.int.test.ts`,
`tests/integration/identity/role-catalog.int.test.ts`,
`tests/integration/identity/user-crud.int.test.ts`,
`tests/integration/identity/session-user.int.test.ts`.

**NO se tocan:** `lib/modules/identity/domain/seed-initial-access.ts`, `scripts/seed.ts`,
`db/schema.prisma`, `package.json`, `app/**`, `components/**`, `hooks/**`, `middleware.ts`,
`lib/shared/**`, `lib/modules/asignaciones/**`, `lib/modules/inventario/**`, `e2e/**`.

**Conflicto conocido:** QC-215 (`estados-de-acondicionamiento`, backend) consume el permiso y no
compila sin esta ficha (`requirements.md > Preguntas abiertas 3`). No comparten archivos de
producción salvo que QC-215 toque `permissions.ts`; si lo hace, que mergee después.

---

## T1–T3 — El dominio

- [x] **T1.** `roles.ts`: `ROLE_ACONDICIONAMIENTO = 'Administrador de acondicionamiento'` y su fila
      **al final** de `SEED_ROLES` con la descripción de `design.md > 2.1`; la cabecera pasa a «los
      cinco literales». Reexportar `ROLE_ACONDICIONAMIENTO` en `lib/modules/identity/index.ts`.
      **Hecho cuando:** `pnpm run typecheck` pasa y el literal `'Administrador de acondicionamiento'`
      aparece una sola vez en `lib/`. Depende de: —.

- [x] **T2.** `permissions.ts`: entrada `acondicionamiento.modificar` **al final** de `PERMISSIONS`
      (`design.md > 2`); párrafo de enmienda del JSDoc con el texto de `design.md > 2` (≤ 5 líneas,
      sin citas); clave `[ROLE_ACONDICIONAMIENTO]: ['asignaciones.consultar', 'acondicionamiento.modificar']`
      al final de `SEED_ROLE_PERMISSIONS` con su frase en el JSDoc; `'acondicionamiento.modificar'`
      al final de `ADMIN_EXCLUDED_PERMISSIONS` con su frase. Administrador, Operador, Empacador y
      Maestro **no se tocan**. Importar `ROLE_ACONDICIONAMIENTO` de `./roles`.
      **Hecho cuando:** `pnpm run typecheck` pasa, `PermissionCode` incluye el código y el párrafo
      nuevo no casa con `/QC-\d+|\bR\d+\b|design\.md|decisi[oó]n cerrada/i`. Depende de: T1.

- [x] **T3.** Actualizar los tests unitarios y guardias rojos de `design.md > 5` (todas las filas
      que no son de integración): `permissions.test.ts`, `qc75-convenciones.test.ts`,
      `order-assignments-migration.test.ts`, `maestro-rol.test.ts`, `empacador-rol.test.ts`. Las
      listas a mano **nombran** el código, el módulo o el rol; nada se relaja. En
      `permissions.test.ts`, bloque nuevo con R4, R5, R6 (+ simétrico sintético), R8, R9, R10
      (`design.md > 6`).
      **Hecho cuando:** `./init.sh --rapido` verde. Cubre R4, R5, R6, R8, R9, R10. Depende de: T2.

## T4–T6 — La migración

- [ ] **T4.** `pnpm run db:migrate:create` con nombre `conditioning_role`; `migration.sql` con las
      tres sentencias de `design.md > 3.1` y cabecera (solo datos, por qué no nombra a ningún otro
      rol, idempotencia, literales duplicados). Si Prisma genera DDL por drift, borrarlo y decirlo
      en la cabecera.
      **Hecho cuando:** sin `CREATE`, `ALTER`, `DROP` ni los literales exactos `'Administrador'`,
      `'Operador'`, `'Empacador'`, `'Maestro'` en líneas ejecutables, y `pnpm run db:migrate` la
      aplica sobre la base local. Depende de: T2.

- [ ] **T5.** `down.sql` con los cuatro `DELETE` de `design.md > 3.2`, en ese orden, con cabecera.
      **Hecho cuando:** `pnpm run db:rollback` (sin usuarios con el rol) devuelve la base al estado
      previo, `pnpm run db:migrate` la reaplica y un segundo `pnpm run db:seed` no crea nada.
      Depende de: T4.

- [ ] **T6. [P]** `tests/unit/identity/schema/conditioning-role-migration.test.ts` (plantilla
      `packer-role-migration.test.ts`), contenido de `design.md > 6`, con casos de sensibilidad.
      **Hecho cuando:** verde, y cada caso de sensibilidad falla si se revierte su mutación. Cubre
      R7, R21, R22, R24, R25 (estático). Depende de: T5.

## T7–T10 — Comportamiento del rol

- [x] **T7. [P]** `tests/unit/identity/roles/acondicionamiento-rol.test.ts` (plantilla
      `maestro-rol.test.ts`): R1, R2 (barrido + sintéticos), R3 (estático), R17 (barrido del código
      con anti-cegado y mensaje que explica cómo relajarlo).
      **Hecho cuando:** verde, y el sintético con el literal dispara con las tres comillas. Depende
      de: T2.

- [x] **T8. [P]** `tests/guards/guard-autorizacion-por-permiso.test.ts`: patrones del literal y de
      `ROLE_ACONDICIONAMIENTO`; ancla tensada; sintéticos que disparan y simétrico que no
      (`design.md > 4`).
      **Hecho cuando:** verde, y quitar el patrón nuevo pone rojo el sintético. Cubre R11. Depende
      de: T1.

- [x] **T9. [P]** `tests/unit/navegacion/menu-acondicionamiento.test.ts` (R12) y ampliación de
      `tests/unit/identity/require-page-permission.test.ts` (R13, códigos leídos de cada `page.tsx`).
      **Hecho cuando:** verde. Cubre R12, R13. Depende de: T2.

- [x] **T10. [P]** `tests/unit/asignaciones/acondicionamiento-authorization.test.ts`: R14 (página
      vacía sin puertos), R15 (los casos de uso de `design.md > 6` rechazan sin puertos), R16
      (`resolveAssignmentViews` = `['asignados']`). Actor desde
      `SEED_ROLE_PERMISSIONS[ROLE_ACONDICIONAMIENTO]`.
      **Hecho cuando:** verde, y cada puerto falso afirma cero llamadas. Cubre R14, R15, R16.
      Depende de: T2.

## T11–T14 — Integración (base real)

- [ ] **T11. [P]** `tests/integration/identity/conditioning-role-migration.int.test.ts` (plantilla
      `packer-role-migration.int.test.ts`): R21, R22, R25 con el SQL leído de los archivos.
      **Hecho cuando:** verde contra Postgres local. Depende de: T5.

- [ ] **T12. [P]** `identity-seed.int.test.ts`: R23 y R26 con el rol nuevo nombrado; el bucle de
      roles sin `empresas.*` incluye el rol; R3 (una sola fila).
      **Hecho cuando:** verde. Depende de: T2.

- [ ] **T13. [P]** `role-catalog.int.test.ts` (R18) y `user-crud.int.test.ts` (R19, R3: dos
      empresas distintas con el rol).
      **Hecho cuando:** verde. Depende de: T2.

- [ ] **T14. [P]** `session-user.int.test.ts`: R20 (sesión con exactamente los dos permisos).
      **Hecho cuando:** verde. Depende de: T2.

## T15 — Cierre

- [ ] **T15.** Mapa `R<n> -> test` completo (R1–R28) en
      `progress/impl_QC-216-rol-administrador-de-acondicionamiento.md`, con R27 y R28 justificados
      como «revisión + guardia» (`design.md > 6`). Verificar que el diff no toca `e2e/`,
      `package.json` ni `db/schema.prisma`, y que el selector de usuarios local muestra el rol
      (observación manual, sin cambio de UI).
      **Hecho cuando:** `./init.sh` completo en verde. Depende de: T3, T6–T14.
