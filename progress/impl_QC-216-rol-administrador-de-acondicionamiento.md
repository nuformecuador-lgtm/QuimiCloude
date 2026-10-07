# QC-216 — rol-administrador-de-acondicionamiento · bitácora de implementación

## Catálogo previo

Medido en `1a1db86e` (= `origin/dev` al empezar) y verificado contra
`lib/modules/identity/domain/permissions.ts` y `roles.ts` del worktree antes de tocar nada.

**`PERMISSIONS`: 24 códigos, en este orden:**

1. `dashboard.consultar`
2. `inventario.consultar`
3. `inventario.modificar`
4. `recetas.consultar`
5. `recetas.modificar`
6. `unidades.consultar`
7. `unidades.modificar`
8. `proveedores.consultar`
9. `proveedores.modificar`
10. `pedidos.consultar`
11. `pedidos.modificar`
12. `usuarios.consultar`
13. `usuarios.modificar`
14. `asignaciones.consultar`
15. `asignaciones.modificar`
16. `asignaciones.ejecutar`
17. `terminados.consultar`
18. `clientes.consultar`
19. `clientes.modificar`
20. `documentos.consultar`
21. `documentos.modificar`
22. `empaque.modificar`
23. `empresas.consultar`
24. `empresas.modificar`

**`SEED_ROLES`: 4, en este orden:** Administrador, Operador, Empacador, Maestro.

**Última migración:** `20261006140000_inventory_movements_adjustment_count`.

Coincide con lo que dice `tasks.md`; las líneas de `design.md > 5` no se relocalizan por cambio de
catálogo (sí se comprueban una a una al editar).

## Tanda 1 (T1–T3)

Preparación del worktree: no tenía `node_modules`. Se corrió `pnpm install --frozen-lockfile`
(sin dependencias nuevas; `package.json` y el lockfile siguen igual), `prisma generate` y `next typegen`.

### Archivos

| Task | Archivo | Cambio |
|---|---|---|
| T1 | `lib/modules/identity/domain/roles.ts` | `ROLE_ACONDICIONAMIENTO` y su fila al final de `SEED_ROLES`; la cabecera pasa a cinco literales (el nuevo, sin comillas simples, para que el literal entre comillas siga apareciendo una sola vez en `lib/`) |
| T1 | `lib/modules/identity/index.ts` | reexporta `ROLE_ACONDICIONAMIENTO` |
| T2 | `lib/modules/identity/domain/permissions.ts` | entrada `acondicionamiento.modificar` al final; párrafo de enmienda (4 líneas, texto de `design.md > 2`); clave del rol nuevo en `SEED_ROLE_PERMISSIONS` con su frase; código al final de `ADMIN_EXCLUDED_PERMISSIONS` con su frase; import multilínea de `./roles` |
| T3 | `tests/unit/identity/permissions.test.ts` | listas a mano nombran el código/módulo/rol (`CODIGOS_DEL_REQUISITO`, `MODULOS`, `MODULOS_SOLO_ESCRITURA`, las tres colas de catálogo, claves del seed, R9 de QC-161, `PERMISOS_POSTERIORES`, `ADMIN_EXCLUDED_PERMISSIONS` exacto). `EJECUTAR` y `PERMISOS_POSTERIORES` suben a nivel de módulo para reutilizarlos en R5. Bloque nuevo QC-216: R4, R5, R6 (+ simétrico sintético con `(QC-216)`), R8, R9, R10 |
| T3 | `tests/unit/navegacion/qc75-convenciones.test.ts` | `CODIGOS_QC74` suma el código; módulos esperados suman `acondicionamiento` y el comentario lo nombra como no-carpeta y solo escritura |
| T3 | `tests/unit/asignaciones/schema/order-assignments-migration.test.ts` | `CODIGOS_DE_FICHAS_POSTERIORES` suma el código |
| T3 | `tests/unit/identity/roles/maestro-rol.test.ts` | orden exacto de `SEED_ROLES` suma el rol; título ajustado |
| T3 | `tests/unit/identity/roles/empacador-rol.test.ts` | ídem |

Las líneas de `design.md > 5` coincidían con el código (sin relocalización).

### Verificación

- `pnpm run typecheck`: verde.
- `pnpm run lint`: 0 errores, 8 warnings preexistentes ajenos a los archivos tocados.
- Los cinco tests de T3: `5 passed`, `151 passed | 3 skipped`.
- `pnpm exec vitest run guard`: `51 passed`, `692 passed | 11 skipped`.
- `vitest related` de los tres archivos de producción (= `test:rapido`): `7 failed | 583 passed`
  archivos; `10 failed | 8868 passed | 27 skipped` tests. Rojos:
  - Baseline (`tests/baseline-rojos.json`): `recetas/module-contract`, `configuracion-ui/unidades-viewport`,
    `configuracion-ui/usuarios-viewport`, `inventario/product-page`, `navegacion/pantallas-exigen-permiso`,
    `recetas-ui/recipe-page`.
  - **No baseline**: `tests/integration/identity/identity-seed.int.test.ts`, dos casos (QC-142 R13 y
    QC-201 R3/R4 de la doble corrida): la base de test sale de las migraciones, que aún no traen el
    rol ni el permiso (T4), así que el seed los crea de más. Se espera que se vuelva verde con T4;
    a verificar en T4/T12.
- `./init.sh --rapido`: corta en el paso de `feature_list.json` («falta QC-216»): la copia del
  worktree no tiene la ficha; es archivo del leader y no se toca. Typecheck, lint, `test:rapido` y
  guardias se corrieron a mano (arriba).

## Tanda T7–T10 (comportamiento del rol, solo tests)

En paralelo con la tanda T4–T6/T11–T14 de otro backend_dev en el mismo worktree; sin archivos en común.

### Archivos

| Task | Archivo | Cambio |
|---|---|---|
| T7 | `tests/unit/identity/roles/acondicionamiento-rol.test.ts` | nuevo (plantilla `maestro-rol.test.ts`): R1, R2 (barrido + sintéticos con tres comillas + simétricos), R3 (estático), R17 (barrido con anti-cegado; el mensaje dice cómo relajarlo) |
| T8 | `tests/guards/guard-autorizacion-por-permiso.test.ts` | patrones del literal y de `ROLE_ACONDICIONAMIENTO`; ancla tensada (nombre del caso suma `QC-216 R11`); sintéticos que disparan y simétrico en comentario |
| T9 | `tests/unit/navegacion/menu-acondicionamiento.test.ts` | nuevo: R12 (solo `nav-asignacion`, aterrizaje `/asignacion`; simétricos: el permiso nuevo solo no abre nada, el Operador ve inventario) |
| T9 | `tests/unit/identity/require-page-permission.test.ts` | bloque R13: el código de cada `page.tsx` se lee de su fuente y se valida contra `PERMISSIONS` |
| T10 | `tests/unit/asignaciones/acondicionamiento-authorization.test.ts` | nuevo: R14, R15 (13 casos de `asignaciones` + 2 de `inventario`, puertos falsos con Proxy que registran acceso y llamada), R16 |

### Mapa parcial R → test

- R1, R2, R3 (estático), R17 → `acondicionamiento-rol.test.ts`
- R11 → `guard-autorizacion-por-permiso.test.ts` (casos `QC-216 R11`)
- R12 → `menu-acondicionamiento.test.ts`
- R13 → `require-page-permission.test.ts` (bloque del Administrador de acondicionamiento)
- R14, R15, R16 → `acondicionamiento-authorization.test.ts`

### Sensibilidad (mutar, ver rojo, revertir)

- T7: regex del literal solo con comilla simple → rojos los dos sintéticos de tres comillas (R2, R17). Barrido sin `lib` → rojos R2 y el anti-cegado de R17.
- T8: sin el patrón del literal → rojos el ancla y el sintético del literal; sin el patrón de la constante → rojos el ancla y el sintético de la constante.
- T9: actor con `asignaciones.ejecutar` y `pedidos.consultar` de más → rojos `/asignacion/<id>` y `/pedidos`; menú con `inventario.consultar` de más → rojo R12.
- T10: actor con `asignaciones.ejecutar`, `pedidos.consultar`, `empaque.modificar`, `inventario.consultar` de más → 12 rojos (R14, R15 de esos permisos, R16). Además un caso fijo comprueba que el puerto falso sí registra a quien lo toca.

Todo revertido; los archivos commiteados son los verdes.

### Verificación

- `pnpm run typecheck`: verde.
- `pnpm run lint`: 0 errores, 8 warnings preexistentes ajenos.
- `pnpm exec vitest run` de los cinco archivos: `5 passed`, `70 passed`.
- `pnpm exec vitest run guard`: `51 passed`, `695 passed | 11 skipped`.
- `./init.sh` no se corrió (indicación del leader).

## Tanda T4–T6, T11–T14 (migración e integración)

En paralelo con la tanda T7–T10 de otro backend_dev en el mismo worktree; sin archivos en común.

### Base usada

- **`QuimiCloude_QC216`**, propia de la rama. Creada con `CREATE DATABASE ... TEMPLATE qct_tpl_f12f312b3e9e`
  (la plantilla de integración de la rama antes de la migración nueva: 71 migraciones, sembrada).
  Estado de partida comprobado: 4 roles, 24 permisos, 29 asignaciones, última migración
  `20261006140000_inventory_movements_adjustment_count`. Es la «base sembrada antes de la feature».
- `.env` del worktree apunta a ella (`DATABASE_URL` y `DIRECT_URL`); el original queda en
  `.env.bak-QuimiCloude` (ignorado por git). La base compartida `QuimiCloude` no se tocó.
- Un primer `db:seed` sobre la copia creó el rol antes de existir la migración; la base se borró y se
  volvió a copiar de la plantilla para probar la migración sobre el estado previo de verdad.
- Los tests de integración no usan esta base: `tests/integration/_global-setup.ts` construye su propia
  plantilla desde las migraciones (`qct_tpl_98ed93a270b2`, ya con `conditioning_role`) y una copia
  efímera por corrida.
- Al cerrar la feature: borrar `QuimiCloude_QC216` y restaurar `.env` desde `.env.bak-QuimiCloude`.

### Migración: timestamp

`pnpm run db:migrate:create --name conditioning_role` generó `20261006234105_conditioning_role`.
Es posterior a la última de `origin/dev` (`20261006140000`) y a las de otros worktrees
(`20261006160000` QC-156, `20261006180000` QC-82), así que se conserva el que dio Prisma.

Prisma generó además 67 sentencias de drift (`DROP CONSTRAINT` de FKs compuestas y `DROP INDEX` de
índices trigram escritos a mano). Se borraron todas y la cabecera de `migration.sql` lo dice.

### Archivos

| Task | Archivo | Cambio |
|---|---|---|
| T4 | `db/migrations/20261006234105_conditioning_role/migration.sql` | nuevo: tres `INSERT ... ON CONFLICT DO NOTHING` de `design.md > 3.1`, cabecera (solo datos, sin otros roles, idempotencia, literales duplicados, drift borrado) |
| T5 | `db/migrations/20261006234105_conditioning_role/down.sql` | nuevo: cuatro `DELETE` de `design.md > 3.2` en ese orden, cabecera |
| T6 | `tests/unit/identity/schema/conditioning-role-migration.test.ts` | nuevo (plantilla `packer-role-migration.test.ts`): 12 casos, predicados puros + mutaciones en memoria |
| T11 | `tests/integration/identity/conditioning-role-migration.int.test.ts` | nuevo (plantilla `packer-role-migration.int.test.ts`): 6 casos, SQL leído del archivo |
| T12 | `tests/integration/identity/identity-seed.int.test.ts` | bucle sin `empresas.*` suma el rol; dos casos nuevos (R26/R3/R9 sobre base vacía; R23 sobre base sembrada salvo el rol) |
| T13 | `tests/integration/identity/role-catalog.int.test.ts` | bloque R18: `createListRoles` + adaptador real con `usuarios.consultar` y con `usuarios.modificar`; simétrico sin permiso |
| T13 | `tests/integration/identity/user-crud.int.test.ts` | bloque R19 (alta, edición, y los dos rechazos sin `usuarios.modificar`) y R3 (dos empresas, un solo rol) |
| T14 | `tests/integration/identity/session-user.int.test.ts` | caso R20: la cadena real `createResolveSession` + `findActiveSessionUserById` da exactamente los dos permisos |
| — | `tests/guards/guard-identificador-de-request.test.ts` | la lista de migraciones conocidas suma `20261006234105_conditioning_role` (la guardia lo exige a cada migración nueva) |
| — | `tests/integration/aislamiento.json` | el censo suma `identity/conditioning-role-migration.int.test.ts` en `transaccion` |

Los dos últimos no están en la lista de archivos de `tasks.md`; son altas obligatorias en censos que
cada migración / test de integración nuevo tiene que actualizar (mismo patrón que QC-213).

### Mapa parcial R → test

- R7, R21, R22, R24, R25 (estático) → `tests/unit/identity/schema/conditioning-role-migration.test.ts`
- R21, R22, R25 (base real) → `tests/integration/identity/conditioning-role-migration.int.test.ts`
- R23, R26, R3 (una fila), R9 (base) → `tests/integration/identity/identity-seed.int.test.ts` (casos `QC-216 …` y el bucle `QC-161 R9, QC-216 R26`)
- R18 → `tests/integration/identity/role-catalog.int.test.ts` (bloque `QC-216`)
- R19, R3 (dos empresas) → `tests/integration/identity/user-crud.int.test.ts` (bloque `QC-216 R19`)
- R20 → `tests/integration/identity/session-user.int.test.ts` (caso `QC-216 R20`)

### Verificación

- T4 en `QuimiCloude_QC216`: `pnpm run db:migrate` → «All migrations have been successfully applied»;
  roles 5, permisos 25, asignaciones 31; el permiso nuevo solo en el rol nuevo.
- T5: `pnpm run db:rollback` → vuelve a 4 / 24 / 29 y última migración `20261006140000`;
  `pnpm run db:migrate` la reaplica; dos `pnpm run db:seed` seguidos → «nada que crear» las dos veces.
  Las tres FKs (`users_role_id_fkey`, `role_permissions_role_id_fkey`,
  `role_permissions_permission_code_fkey`) son RESTRICT, comprobado en `pg_constraint`.
- T6: 12/12. Sensibilidad real además de la de memoria: quitar el `ON CONFLICT ("code")` del archivo
  en disco pone rojo el caso R22; revertido con `git checkout`.
- Integración (base efímera desde `qct_tpl_98ed93a270b2`): los cinco archivos de identity tocados
  → `5 passed`, `113 passed`. **`identity-seed.int.test.ts` vuelve a verde**: los dos casos de doble
  corrida (QC-142 R13 y QC-201 R3/R4) que la tanda 1 vio rojos por faltar la migración pasan.
- `pnpm exec vitest related --run` de los archivos tocados: `7 passed`, `148 passed`.
- `pnpm exec vitest run guard`: `51 passed`, `695 passed | 11 skipped` (antes de dar de alta los censos,
  rojas `guard-identificador-de-request` y `guard-aislamiento-integracion`).
- `pnpm run typecheck`: verde. `pnpm run lint`: 0 errores, 8 warnings preexistentes ajenos.
- `./init.sh` / `pnpm test` no se corrieron (indicación del leader).

## Consolidación del implementer (T15 parcial)

- **Mapa R1–R26:** en los mapas parciales de las dos tandas de arriba (T1–T3 / T7–T10 / T4–T6, T11–T14).
- **R27** (sin E2E): revisión. `git diff --stat 1a1db86e -- e2e package.json db/schema.prisma app components middleware.ts lib/shared lib/modules/asignaciones lib/modules/inventario` sale vacío.
- **R28** (sin dependencia ni modelo): `tests/guards/guard-dependencias-aprobadas.test.ts` + `tests/unit/identity/schema/conditioning-role-migration.test.ts` (sin DDL). `package.json` y `db/schema.prisma` no aparecen en el diff.
- **Fuera de la lista declarada de `tasks.md`:** `tests/guards/guard-identificador-de-request.test.ts` y `tests/integration/aislamiento.json` (altas en los censos de migraciones y de tests de integración, mismo patrón que QC-213).
- **Base propia:** `QuimiCloude_QC216`, con el `.env` original en `.env.bak-QuimiCloude`. Al cerrar hay que borrarla y restaurar el `.env`.
- **`./init.sh --rapido`:** se para en la validación de `feature_list.json` porque la copia del worktree no tiene QC-216. Lo corrí a mano: typecheck verde y lint con 0 errores y 8 warnings preexistentes. El sistema mató `test:rapido` por falta de memoria (no por un fallo) y no lo relancé. Las tandas habían corrido por separado `vitest related` y las guardias: 51 archivos, 695 passed y 11 skipped, todo verde.
- **T15 abierta:** faltan `./init.sh` completo (lo corre el leader) y la observación manual del selector de usuarios.
