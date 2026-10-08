# QC-221 — permiso-y-modulo-de-integraciones · tasks.md

> Zona: `backend` · Complejidad: `low` · depends_on: — · Bloquea a: QC-222 · Rama:
> `feature/QC-221-permiso-y-modulo-de-integraciones`
>
> El **qué** está en `requirements.md` (R1–R23) y el **cómo** en `design.md`. `[P]` marca las
> tareas que pueden ir en paralelo con las que llevan la misma marca dentro de su bloque.
>
> **Cómo se cierra cada task.** Con `pnpm run typecheck`, `pnpm run lint`,
> `pnpm exec vitest related --run <archivos tocados>` y `pnpm exec vitest run guard`, salvo que
> la task diga otra cosa. La feature se cierra con `./init.sh` en verde (regla 5 de `CLAUDE.md`).
>
> **Regla transversal** (`docs/conventions.md > Comentarios`). Ningún comentario nuevo cita
> `QC-<n>`, `R<n>`, `design.md` ni «decisión cerrada». En los tests, `R<n>` va en el nombre del
> caso.
>
> **Antes de T1.** Anotar en `progress/impl_QC-221-permiso-y-modulo-de-integraciones.md` lo que
> hay en `dev` en ese momento. Es el «catálogo previo» de R2, R5 y R6:
>
> - el catálogo de `PERMISSIONS`: códigos, número y orden;
> - el conjunto del Administrador;
> - la última migración.
>
> Medido en este worktree: 25 códigos, 21 permisos del Administrador y última migración
> `20261007120100_order_terminated_finished_index`. Si `dev` difiere, mandan sus valores y las
> líneas de `design.md > 6` se vuelven a localizar.
>
> **Antes de T1, también:** que el humano haya respondido en F1.4 las preguntas abiertas 1, 2, 3
> y 5 de `requirements.md`. Si cambia el código del permiso o los nombres de las constantes, se
> actualizan los tres archivos del spec antes de escribir código.

## T1–T2 — El permiso

- [ ] **T1.** Cambios en `permissions.ts`, con el texto de `design.md > 2`:
      - la entrada `integraciones.modificar` **al final** de `PERMISSIONS`;
      - el párrafo de enmienda del JSDoc: como mucho 5 líneas y sin citas;
      - `'integraciones.modificar'` como **última** entrada de `[ROLE_ADMINISTRADOR]` en
        `SEED_ROLE_PERMISSIONS`.

      No se tocan los otros roles ni `ADMIN_EXCLUDED_PERMISSIONS`.
      **Hecho cuando:** `pnpm run typecheck` pasa, `PermissionCode` incluye el código y el
      párrafo nuevo no casa con `/QC-\d+|\bR\d+\b|design\.md|decisi[oó]n cerrada/i`.
      Depende de: —.

- [ ] **T2.** Actualizar los tests rojos de `design.md > 6`:
      - `permissions.test.ts`;
      - `qc75-convenciones.test.ts`;
      - `order-assignments-migration.test.ts`.

      Las listas escritas a mano **nombran** el código o el módulo, y nada se relaja. Además, un
      bloque nuevo en `permissions.test.ts` con R1, R2, R3 (con su simétrico sintético), R5 y R6
      (`design.md > 7`).
      **Hecho cuando:** los tres archivos están en verde con `vitest related` y las guardias
      también. Cubre R1, R2, R3, R5 y R6. Depende de: T1.

## T3–T5 — La migración

- [ ] **T3.** `pnpm run db:migrate:create` con el nombre `integrations_permission`. En
      `migration.sql`, las dos sentencias de `design.md > 5.1` y la cabecera (solo datos,
      idempotente, literales duplicados). Si Prisma genera DDL por drift, se borra y se dice en
      la cabecera.
      **Hecho cuando:** no hay `CREATE`, `ALTER`, `DROP` ni escrituras en `"roles"`, y
      `pnpm run db:migrate` la aplica sobre la base local. Depende de: T1.

- [ ] **T4.** `down.sql` con los dos `DELETE` de `design.md > 5.2`, en ese orden y con cabecera.
      **Hecho cuando:**
      - `pnpm run db:rollback` devuelve la base al estado previo;
      - `pnpm run db:migrate` la vuelve a aplicar;
      - un segundo `pnpm run db:seed` no crea nada.

      Depende de: T3.

- [ ] **T5. [P]** `tests/unit/identity/schema/integrations-permission-migration.test.ts`
      (plantilla: `documents-permissions-migration.test.ts`), con el contenido de
      `design.md > 7` y los casos de sensibilidad.
      **Hecho cuando:** está en verde, y cada caso de sensibilidad falla si se revierte su
      mutación. Cubre R4, R16, R17, R19 y R20 (estático). Depende de: T4.

## T6–T7 — El módulo y las rutas

- [ ] **T6. [P]** Armazón de `lib/modules/integraciones/`:
      - `index.ts` con `export {};`;
      - `.gitkeep` en `domain/`, `ports/`, `adapters/driven/` y `adapters/driving/`
        (`design.md > 3.1`).

      Test `tests/unit/integraciones/module-shape.test.ts` con R8, R9, R10, R11, R12 y R13. R8
      reutiliza `findForbiddenPatternsInSource` de la guardia; R9 lleva anticegado y un mensaje
      que explica cómo relajarlo.
      **Hecho cuando:** el test y `pnpm exec vitest run guard` están en verde (en particular
      `guard-arquitectura-modulos`), y añadir un `domain/x.ts` sintético pone R11 en rojo.
      Depende de: T1 (por R9).

- [ ] **T7. [P]** Las tres constantes de `design.md > 3.2` en `lib/shared/routes.ts`, con un
      comentario de como mucho tres líneas y sin citas. **No** se tocan `PRIVATE_ROUTE_PREFIXES`
      ni `private-nav.ts`. Test `tests/unit/integraciones/integration-routes.test.ts` con R14
      (valores, literal único, `decideRouteAccess` por segmentos) y R15.
      **Hecho cuando:** el test está en verde y `guard-rutas-privadas-cubiertas` sigue en verde
      sin cambios. Depende de: —.

## T8–T10 — Integración (base real)

- [ ] **T8. [P]** `tests/integration/identity/integrations-permission-migration.int.test.ts`
      (plantilla: `documents-permissions-migration.int.test.ts`): R16, R17 y R20, con el SQL
      leído de los archivos.
      **Hecho cuando:** está en verde contra el Postgres local. Depende de: T4.

- [ ] **T9. [P]** Ampliar `identity-seed.int.test.ts` con R18 y R21: el código lo tiene solo el
      Administrador, y dos corridas producen lo mismo que una.
      **Hecho cuando:** está en verde. Depende de: T1.

- [ ] **T10. [P]** Ampliar `session-user.int.test.ts` con R7: el Administrador tiene el código en
      su sesión, y el Operador y el Administrador de acondicionamiento no.
      **Hecho cuando:** está en verde. Depende de: T1.

## T11 — Cierre

- [ ] **T11.** Mapa `R<n> -> test` completo (R1–R23) en
      `progress/impl_QC-221-permiso-y-modulo-de-integraciones.md`, con R22 y R23 justificados
      como «revisión + guardia» (`design.md > 7`). Verificar que el diff no toca nada de esto:
      - `e2e/`, `app/`, `components/` y `hooks/`;
      - `lib/shared/navigation/`;
      - `middleware.ts` y `route-guard-middleware.ts`;
      - `lib/composition/`;
      - `package.json` y `db/schema.prisma`.

      **Hecho cuando:** `./init.sh` está en verde. Depende de: T2 y T5–T10.

## Archivos esperados

**Producción, modificados:**

- `lib/modules/identity/domain/permissions.ts`
- `lib/shared/routes.ts`

**Producción, nuevos:**

- `lib/modules/integraciones/index.ts`
- `lib/modules/integraciones/domain/.gitkeep`
- `lib/modules/integraciones/ports/.gitkeep`
- `lib/modules/integraciones/adapters/driven/.gitkeep`
- `lib/modules/integraciones/adapters/driving/.gitkeep`
- `db/migrations/<ts>_integrations_permission/migration.sql`
- `db/migrations/<ts>_integrations_permission/down.sql`

**Tests nuevos:**

- `tests/unit/integraciones/module-shape.test.ts`
- `tests/unit/integraciones/integration-routes.test.ts`
- `tests/unit/identity/schema/integrations-permission-migration.test.ts`
- `tests/integration/identity/integrations-permission-migration.int.test.ts`

**Tests modificados:**

- `tests/unit/identity/permissions.test.ts`
- `tests/unit/navegacion/qc75-convenciones.test.ts`
- `tests/unit/asignaciones/schema/order-assignments-migration.test.ts`
- `tests/integration/identity/identity-seed.int.test.ts`
- `tests/integration/identity/session-user.int.test.ts`

**Estado de la feature:**

- `progress/impl_QC-221-permiso-y-modulo-de-integraciones.md`

**Choques previsibles.** Cualquier ficha en vuelo que enmiende el catálogo toca
`lib/modules/identity/domain/permissions.ts` y `tests/unit/identity/permissions.test.ts`; es lo
que pasó con QC-216. La que mergee después reubica su entrada detrás de la otra. QC-222 depende
de esta ficha y no debe empezar código antes de su merge.
