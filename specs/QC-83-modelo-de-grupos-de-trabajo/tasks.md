# QC-83 — modelo-de-grupos-de-trabajo · tasks.md

> **Leyenda.** `[P]` = paralelizable con las tasks marcadas igual dentro de la misma tanda.
> `[ID]` = toca `lib/modules/identity/**`. `[DB]` = toca `db/**`. Rutas relativas a la raíz del
> worktree.
>
> **Regla de tanda** (`CLAUDE.md` n.º 5): al cerrar cada tanda se corre `./init.sh --rapido`. El
> `./init.sh` **completo** es del leader, antes del PR, sin excepción.
>
> **Criterio de «hecho» que rige todas las tasks de test:** cada aserción cae al **mutar** lo que
> vigila. Se demuestra mutando, no leyendo.

---

## Tanda A — El dominio y el esquema

### [x] T1. `[ID]` `[P]` Una única definición de «mismo nombre de grupo»
- **Archivos:** `lib/modules/identity/domain/normalize-key.ts` (nuevo, **interno**),
  `lib/modules/identity/domain/company-name.ts` (refactor de comportamiento nulo),
  `lib/modules/identity/domain/work-group-name.ts` (nuevo),
  `lib/modules/identity/index.ts`.
- **Qué:** `design.md > 4`. `normalizeKey` recibe el cuerpo actual de `normalizeCompanyName`;
  `normalizeCompanyName` y el nuevo `normalizeWorkGroupName` delegan en él. El barrel exporta
  **solo** `normalizeWorkGroupName`; `normalizeKey` **no** se exporta.
- **Hecho cuando:** `tests/unit/identity/company-name.test.ts` sigue verde **sin tocar ni una
  línea** (si hay que editarlo, el refactor está mal); existe
  `tests/unit/identity/work-group-name.test.ts` con los casos de R3 —acentos, mayúsculas, espacios
  de sobra y signos— y falla si `normalizeWorkGroupName` deja de normalizar cualquiera de ellos.
- **Depende de:** nada. Paralelizable con T2.

### [x] T2. `[DB]` `[P]` Las dos tablas nuevas y la restricción única de `users` en el esquema
- **Archivos:** `db/schema.prisma`.
- **Qué:** `design.md > 1.1`, `> 1.2` y `> 1.3`. `WorkGroup` con `/// @module identity`, su
  `@relation` a `Company` (`Restrict`/`Cascade`), `@@unique([id, companyId])` y
  `@@index([companyId])`; `WorkGroupMember` con `/// @module identity`, PK compuesta,
  `@@index([userId])` y **sin ninguna `@relation`**; `Company` gana `workGroups WorkGroup[]`;
  `User` gana **solo** `@@unique([id, companyId], map: "users_id_company_id_key")`.
  **Comentarios `/// OJO` obligatorios**, con el patrón de `Company` y `Unit`: (a) por qué la
  unicidad del nombre **no** está aquí como `@@unique` y qué se rompe si alguien la añade
  (riesgo 3); (b) por qué las dos FK de la pertenencia son **compuestas, con `company_id`, escritas
  a mano y por tanto DRIFT** (riesgo 2); (c) por qué la pertenencia **no** lleva `deleted_at`
  (riesgo 4).
- **Hecho cuando:** `prisma validate` pasa, el cliente generado expone `workGroup` y
  `workGroupMember`, y **ninguna columna de `User` cambia** (`git diff` sobre el modelo `User` es
  una sola línea).
- **Depende de:** nada. Paralelizable con T1.

### [x] T3. Cierre de tanda A
- **Hecho cuando:** `./init.sh --rapido` en verde.
- **Depende de:** T1, T2.

---

## Tanda B — La migración

### [x] T4. `[DB]` El `migration.sql` (UP)
- **Archivos:** `db/migrations/<ts>_work_groups_and_members/migration.sql`.
- **Qué:** los ocho pasos de `design.md > 3.1`, **en ese orden**, incluidos los dos índices únicos
  auxiliares del paso 4 (sin ellos la FK compuesta falla con `42830`) y las dos FK compuestas del
  paso 7. Cabecera con el inventario de lo que salió de Prisma, lo que se completó a mano y lo que
  se **borró** a mano, con el formato de
  `20260907183034_permissions_and_role_permissions/migration.sql`.
- **Hecho cuando:** `pnpm run db:migrate` la aplica limpia sobre la base del worktree; el archivo
  **no** menciona `orders`, `products`, `recipe_lines`, `recipes`, `supplier_catalog_lines`,
  `suppliers` ni `units` fuera de los comentarios (R23); y un `\d work_group_members` muestra las
  dos FK **con `company_id` dentro**.
- **Depende de:** T3.

### [x] T5. `[DB]` El `down.sql` (DOWN)
- **Archivos:** `db/migrations/<ts>_work_groups_and_members/down.sql`.
- **Qué:** los tres pasos de `design.md > 3.3`, en ese orden, **sin `CASCADE`** en ningún `DROP
  TABLE`. No toca `companies`, no toca `pgcrypto` y toca `users` **en una sola línea**.
- **Hecho cuando:** `pnpm run db:rollback` deja la base en un estado en el que un snapshot de
  `users` —columnas, índices y restricciones— es **idéntico** al de antes de aplicar T4, no queda
  ninguna de las dos tablas, y `_prisma_migrations` queda sin la fila. **Verificado contra Postgres
  real, no leído.** Después se vuelve a aplicar el UP para seguir trabajando.
- **Depende de:** T4.

### [x] T6. `[DB]` Test de esquema y de migración
- **Archivos:** `tests/unit/identity/schema/work-groups-migration.test.ts` (nuevo) y, si hace falta
  retensarlo, `tests/unit/identity/schema/identity-schema.test.ts`.
- **Qué, como mínimo** (`design.md > 6`):
  - `work_groups_name_unique` es **compuesto con `company_id`**, **funcional** (`lower(...)`) y
    **parcial** (`WHERE deleted_at IS NULL`) — R4, R5, R6;
  - las **dos** FK de `work_group_members` son compuestas y llevan `company_id`; el test cae si
    alguien las escribe simples (R14, riesgo 1);
  - `ON DELETE CASCADE` hacia `work_groups` y `ON DELETE RESTRICT` hacia `users` (`design.md > 2.1`);
  - ni el esquema ni el SQL declaran `deleted_at` en `work_group_members` (R18);
  - las dos tablas nuevas quedan con RLS `ENABLE` **y** `FORCE`, y los `ALTER` van **al final** del
    archivo (R24);
  - el UP no ejecuta DDL sobre ninguna tabla de otro módulo y solo toca `users` para crear
    `users_id_company_id_key` (R23);
  - el `down.sql` **no** contiene `INSERT`, `UPDATE` ni `DELETE`, y no toca `users` ni `companies`
    más allá de ese `DROP INDEX` (R26);
  - los dos modelos declaran `/// @module identity` (R22);
  - el modelo `WorkGroup` **no** tiene ningún `@@unique` de nombre (riesgo 3).
- **Hecho cuando:** cada aserción cae al mutar el archivo que vigila.
- **Depende de:** T5.

### [x] T7. Cierre de tanda B
- **Hecho cuando:** `./init.sh --rapido` en verde, incluida
  `tests/guards/guard-rls-force.test.ts`, que descubre las tablas nuevas leyendo el SQL.
- **Depende de:** T6.

---

## Tanda C — Las garantías contra Postgres real

### [x] T8. Tests de integración de constraints
- **Archivos:** `tests/integration/identity/work-groups-constraints.int.test.ts`.
- **Qué, cada caso dentro de una transacción que acaba en `ROLLBACK`**, con **dos** empresas
  efímeras propias creadas en el `beforeAll` (nunca la de instalación:
  `companies_name_unique` es global y chocaría con la del seed):
  - **R14 — el corazón**: pertenencia con grupo de la empresa A y persona de la B → `23503`; y con
    `company_id` que no es la de ninguno de los dos → `23503`;
  - **R15**: mover de empresa a una persona con pertenencias, y a un grupo poblado → `23503` en los
    dos sentidos;
  - **R16**: la misma persona dos veces en el mismo grupo → `23505`;
  - **R17**: una persona en dos grupos y un grupo con dos personas → aceptado;
  - **R4/R5/R6**: mismo nombre normalizado en la misma empresa → `23505`; en otra empresa →
    aceptado; con el primer grupo dado de baja → aceptado;
  - **R2**: grupo sin nombre → `23502`;
  - **R8/R9/R10**: grupo sin empresa → falla; con empresa inexistente → `23503`; borrar una empresa
    con un grupo vivo → `23503`, **y con un grupo dado de baja también**;
  - **R11**: `created_at`/`updated_at` se rellenan y el segundo cambia al modificar el grupo;
  - **R18**: sacar a una persona elimina la fila y **no queda rastro** (`count = 0`, sin columna que
    lo conserve);
  - **R19**: sacar a la última persona deja el grupo vivo e intacto; un grupo sin miembros existe;
  - **R20**: dar de baja a una persona **no** toca sus pertenencias;
  - **R21**: dar de baja un grupo **no** toca sus pertenencias.
- **Hecho cuando:** los casos de R14 y R15 fallan si alguien convierte las FK compuestas en simples.
- **Depende de:** T7.

### [x] T9. `[P]` No-regresión: nada de lo que ya existe cambia
Es un requisito con nombre (R23, R27, decisión cerrada 16), no una consecuencia.

- **Qué:** `git diff` de la rama **no** toca `app/`, `components/`, `middleware.ts`,
  `lib/composition/`, `scripts/seed.ts` ni ningún fixture E2E o de integración ajeno; los E2E
  existentes se ejecutan y pasan; ninguna guardia de otra feature necesita relajarse (si alguna hay
  que **retensarla** por la foto del esquema que lleva congelada, se anota en la bitácora para que
  el reviewer la mire una a una).
- **Hecho cuando:** los specs E2E pasan con el número de tests de cada uno anotado en la bitácora, y
  `git diff` confirma que **ningún `test(...)` cambió de contenido**. **No se añade ningún E2E
  nuevo.**
- **Depende de:** T7. Paralelizable con T8.

### [x] T10. `[P]` Verificar que no entró ninguna dependencia
- **Hecho cuando:** el diff de la rama sobre `package.json` y `pnpm-lock.yaml` está **vacío** (R28),
  y `tests/guards/guard-dependencias-aprobadas.test.ts` en verde.
- **Depende de:** T7. Paralelizable con T8 y T9.

### [x] T11. Bitácora y mapa de trazabilidad
- **Archivos:** `progress/impl_QC-83-modelo-de-grupos-de-trabajo.md`.
- **Qué:** el mapa `R1..R28 -> test concreto` **sin hueco** (`CHECKPOINTS.md > Trazabilidad`),
  nombrando archivo **y** título de test; la nota de T9 si hubo que retensar alguna guardia ajena; y
  el resultado real del rollback de T5 (salida del snapshot comparado).
- **Hecho cuando:** los 28 requisitos tienen su test nombrado, y ninguno apunta a un test que no
  caiga al mutar lo que vigila.
- **Depende de:** T8, T9, T10.

### [x] T12. Cierre de feature
- **Hecho cuando:** `./init.sh` **completo** en verde (regla 5 de `CLAUDE.md`: obligatorio antes del
  PR, sin excepción) y la migración aplicada **y revertida y reaplicada** al menos una vez sobre la
  base del worktree.
- **Depende de:** T11.

---

## Grafo de dependencias

```
┌ T1 ┐
└ T2 ┘ → T3 → T4 → T5 → T6 → T7 → ┌ T8  ┐
                                  │ T9  │ → T11 → T12
                                  └ T10 ┘
```
