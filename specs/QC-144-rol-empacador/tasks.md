# QC-144 — rol-empacador · tasks.md

> Zona: `backend` · Complejidad: `medium` · depends_on: — · Rama: `feature/QC-144-rol-empacador`
>
> El **qué** está en `requirements.md` (R1–R26), el **cómo** en `design.md`. Aquí va el desglose.
> `[P]` = paralelizable con las tareas marcadas igual dentro del mismo bloque.
> Cada task se cierra con `./init.sh --rapido` en verde salvo que diga otra cosa; la feature se cierra
> con `./init.sh` completo (regla 5 de `CLAUDE.md`).
>
> **Antes de T1:** anotar en `progress/impl_QC-144-rol-empacador.md` el catálogo de `PERMISSIONS`
> que hay en `dev` en ese momento (códigos y número) y la última migración. Es el «catálogo previo»
> de R5: todos los números de T2, T3 y T11 salen de ahí más uno, no de «quince» (D4, QC-142).

## Archivos que esta feature declara tocar (para la validación de conflicto del leader)

**Producción, modificados:** `lib/modules/identity/domain/roles.ts`,
`lib/modules/identity/domain/permissions.ts`, `lib/modules/identity/index.ts`.

**Producción, nuevos:** `db/migrations/<ts>_packer_role/migration.sql`,
`db/migrations/<ts>_packer_role/down.sql`.

**Tests nuevos:** `tests/unit/identity/roles/empacador-rol.test.ts`,
`tests/unit/identity/schema/packer-role-migration.test.ts`,
`tests/unit/asignaciones/empacador-authorization.test.ts`,
`tests/unit/navegacion/menu-empacador.test.ts`,
`tests/integration/identity/packer-role-migration.int.test.ts`.

**Tests modificados:** los de `design.md > 5` (recuento y roles) y
`tests/guards/guard-autorizacion-por-permiso.test.ts`,
`tests/integration/identity/role-catalog.int.test.ts`,
`tests/integration/identity/user-crud.int.test.ts`,
`tests/integration/asignaciones/assigned-orders.int.test.ts`.

**NO se tocan:** `lib/modules/identity/domain/seed-initial-access.ts`, `scripts/seed.ts`,
`db/schema.prisma`, `package.json`, `app/**`, `components/**`, `middleware.ts`,
`lib/shared/**`, `lib/modules/asignaciones/**`, `lib/modules/inventario/**`, `e2e/**`.

**Conflicto conocido:** QC-142 (`permiso-propio-de-documentos`) toca `permissions.ts` y buena parte
de los tests de `design.md > 5`. No pueden estar `in_progress` a la vez sin que el leader lo resuelva
(`AGENTS.md > Paralelismo`); son de zonas distintas (`fullstack` / `backend`), así que la regla de
zona no lo impide por sí sola.

---

## T1–T3 — El dominio

- [ ] **T1.** `roles.ts`: `ROLE_EMPACADOR = 'Empacador'` y su fila **al final** de `SEED_ROLES`
      con la descripción de `design.md > 2.1`; actualizar el comentario de cabecera («los tres
      literales») y el de `SEED_ROLES` («los tres roles»). Reexportar `ROLE_EMPACADOR` en
      `lib/modules/identity/index.ts` junto a los otros dos.
      **Hecho cuando:** `pnpm run typecheck` pasa y el literal `'Empacador'` aparece una sola vez en
      `lib/`. Depende de: —.

- [ ] **T2.** `permissions.ts`: entrada `terminados.consultar` **al final** de `PERMISSIONS`
      (`design.md > 2`); bloque de enmienda en el JSDoc con ordinal y recuento contra el catálogo
      previo; primera línea del JSDoc con el número nuevo; `'terminados.consultar'` al final de la
      lista del Administrador; clave `[ROLE_EMPACADOR]: ['asignaciones.consultar',
      'terminados.consultar']`; una frase en el JSDoc de `SEED_ROLE_PERMISSIONS` sobre el Empacador.
      El Operador **no se toca**.
      **Hecho cuando:** `pnpm run typecheck` pasa y `PermissionCode` incluye `'terminados.consultar'`.
      Depende de: T1.

- [ ] **T3.** Actualizar los tests unitarios y guardias que fijan recuento o roles
      (`design.md > 5`, primeras filas de cada tabla que no sean de integración):
      `permissions.test.ts`, `guard-permisos-sembrados.test.ts`, `guard-nav-permisos-declarados.test.ts`,
      `qc75-convenciones.test.ts`, `documentos/authorization.test.ts`,
      `order-assignments-migration.test.ts`, `grupos/scope.test.ts`, `roles/scope.test.ts`,
      `seed/seed-initial-access.test.ts`. Los números **suben** y las listas a mano **nombran**
      `terminados.consultar` / `terminados` / `Empacador`; nada se relaja a `toContain` ni a
      `toBeGreaterThan`. En `permissions.test.ts` se añaden los casos de R4, R6, R8, R9 y R10
      (Empacador exacto y en negativo: sin `inventario.consultar`, sin `asignaciones.modificar`;
      Operador sin `terminados.consultar`).
      **Hecho cuando:** `./init.sh --rapido` verde y cada archivo tocado cita QC-144 en el comentario
      junto al número o la lista que cambió. Depende de: T2.

## T4–T6 — La migración

- [ ] **T4.** `pnpm run db:migrate:create` con nombre `packer_role`; completar `migration.sql` con las
      cuatro sentencias de `design.md > 3.1` y su cabecera (qué hace, por qué es la primera que
      inserta en `roles`, por qué no nombra al Operador, idempotencia). Si Prisma genera DDL por
      drift, borrarlo a mano y dejarlo dicho en la cabecera, como QC-66/QC-86.
      **Hecho cuando:** el archivo no contiene `CREATE`, `ALTER`, `DROP` ni `Operador` en líneas
      ejecutables, y `pnpm run db:migrate` lo aplica sobre la base local. Depende de: T2.

- [ ] **T5.** `down.sql` con los cuatro `DELETE` de `design.md > 3.3`, en ese orden, con cabecera.
      **Hecho cuando:** `pnpm run db:rollback` sobre la base local (sin usuarios Empacador) devuelve
      rol, permiso y asignaciones al estado previo, `pnpm run db:migrate` vuelve a aplicarla, y un
      segundo `pnpm run db:seed` imprime «nada que crear». Depende de: T4.

- [ ] **T6. [P]** `tests/unit/identity/schema/packer-role-migration.test.ts` (plantilla:
      `user-permissions-migration.test.ts`): localiza la carpeta por patrón `/_packer_role$/`;
      UP = exactamente cuatro `INSERT … ON CONFLICT … DO NOTHING` sobre `roles`, `permissions`,
      `role_permissions`; literales comparados contra `ROLE_EMPACADOR`, la descripción de
      `SEED_ROLES`, la entrada de `PERMISSIONS` y `SEED_ROLE_PERMISSIONS[ROLE_EMPACADOR]`
      **importados**; `updated_at` explícito; ninguna DDL; ningún `Operador`. DOWN = cuatro `DELETE`
      acotados en el orden de §3.3, sin `CASCADE`, sin `INSERT`/`UPDATE`/`ALTER`. Casos de
      sensibilidad (quitar el `ON CONFLICT`, invertir el orden del DOWN, quitar un `WHERE`) que
      demuestran que el test cae.
      **Hecho cuando:** verde, y cada caso de sensibilidad falla si se revierte la mutación.
      Cubre R7, R17, R18, R20, R21. Depende de: T5.

## T7–T10 — Comportamiento del rol

- [ ] **T7. [P]** `tests/unit/identity/roles/empacador-rol.test.ts`: R1 (fila en `SEED_ROLES`,
      descripción no vacía, Administrador y Operador con nombre y descripción intactos); R2 (barrido
      de `lib/`, `app/`, `middleware.ts` sin comentarios: el literal entre cualquiera de las tres
      comillas solo en `roles.ts`, más caso sintético que dispara y simétrico que no); R3 (el modelo
      `Role` de `db/schema.prisma` no tiene campo de empresa); R16 (mismo barrido para
      `terminados.consultar`: solo `permissions.ts`; el mensaje de fallo nombra a QC-145 como la ficha
      que lo relajará).
      **Hecho cuando:** verde, y añadir `'Empacador'` o `'terminados.consultar'` a cualquier archivo
      de `app/` lo pone rojo. Depende de: T2.

- [ ] **T8. [P]** `tests/guards/guard-autorizacion-por-permiso.test.ts`: `buildForbiddenPatterns()`
      suma `literal del rol Empacador` (vía `literal(ROLE_EMPACADOR)`) y `ROLE_EMPACADOR`; tensar el
      ancla de nombres; caso sintético que dispara con el literal y con la constante, y simétrico que
      no dispara con el literal dentro de un comentario.
      **Hecho cuando:** `./init.sh --rapido` verde (incluye todas las guardias). Cubre R11.
      Depende de: T1.

- [ ] **T9. [P]** `tests/unit/asignaciones/empacador-authorization.test.ts`: actor con
      `SEED_ROLE_PERMISSIONS[ROLE_EMPACADOR]`. Conceden: `listAssignedOrders`,
      `getAssignedOrderExecution`, `startAssignedOrder`, `finishAssignedOrder` (con dobles de sus
      puertos, afirmando que **no** lanzan el error de autorización). Rechazan sin invocar ningún
      puerto: `listProducts`, `getProduct`, `createProduct` (`inventario`) y `assignResponsibles`,
      `unassignResponsible`, `removeWorkGroupFromOrder` (`asignaciones`), cada uno con el error de
      autorización de su módulo.
      **Hecho cuando:** verde. Cubre R12, R13. Depende de: T2.

- [ ] **T10. [P]** `tests/unit/navegacion/menu-empacador.test.ts`: con los permisos del Empacador,
      `filterNavItemsByPermissions` deja solo `nav-asignacion` y `firstVisibleNavHref` devuelve
      `ASSIGNED_ORDERS_ROUTE`; con los del Operador sigue apareciendo además `nav-inventario` (caso
      simétrico que prueba que el test distingue).
      **Hecho cuando:** verde. Cubre R15. Depende de: T2.

## T11–T14 — Integración (base real)

- [ ] **T11.** `tests/integration/identity/identity-seed.int.test.ts`: el reset (`:259`) y
      `seedRoleNames` (`:267`) filtran por `SEED_ROLES.map(r => r.name)`, no por dos constantes;
      subir los números de `:776-777`, `:894-895`, `:924-925`; ajustar `:375-394` a los tres roles;
      nuevo caso R25 que recorre **cada** rol de `SEED_ROLES` y compara `codigosEnBaseDe` con
      `codigosSembradosDe`; R19 (segunda corrida sin cambios, con el Empacador); R3 (una sola fila
      `Empacador`).
      **Hecho cuando:** `pnpm run test:integration` (o el comando del gate completo) verde para este
      archivo. Cubre R3, R19, R25. Depende de: T3.

- [ ] **T12. [P]** `tests/integration/identity/packer-role-migration.int.test.ts`, en transacción
      revertida y con el SQL **leído del archivo** (patrón de `identity-seed.int.test.ts:327-350`):
      (a) base sembrada, se borran las filas de esta ficha, se aplica el UP → rol, permiso y las tres
      asignaciones exactas, Operador idéntico al de antes; (b) UP dos veces sobre base sembrada →
      mismos conteos y mismas filas, `updated_at` incluido; (c) DOWN sin usuarios Empacador → estado
      previo exacto; (d) DOWN con un usuario Empacador → `23503` y nada borrado.
      **Hecho cuando:** verde. Cubre R17, R18, R21. Depende de: T5.

- [ ] **T13. [P]** `role-catalog.int.test.ts`: `listAllRoles()` incluye `Empacador` y no
      `Administrador` (R22). `user-crud.int.test.ts`: alta y edición con el rol Empacador por un actor
      con `usuarios.modificar` se aceptan y persisten; sin el permiso, rechazo; dos usuarios de
      empresas distintas con el mismo rol (R23, R3).
      **Hecho cuando:** verde. Depende de: T11.

- [ ] **T14. [P]** `tests/integration/asignaciones/assigned-orders.int.test.ts`: un usuario con rol
      Empacador ve solo los pedidos en que es responsable; no ve los de otro responsable de su
      empresa ni los de otra empresa.
      **Hecho cuando:** verde. Cubre R14. Depende de: T11.

## T15 — Cierre

- [ ] **T15.** `progress/impl_QC-144-rol-empacador.md` con el mapa completo `R1..R26 -> test`
      (R24: diff sin `e2e/`; R26: `guard-dependencias-aprobadas` + T6 sin DDL + `db/schema.prisma`
      sin cambios en el diff).
      **Hecho cuando:** `./init.sh` **completo** verde y ningún `R<n>` queda sin test o sin
      verificación nombrada. Depende de: T1–T14.
