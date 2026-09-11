# QC-86 — modelo-de-asignacion-de-pedidos · tasks.md

> **Leyenda.** `[P]` = paralelizable con las tasks marcadas igual dentro de la misma tanda.
> `[AS]` = toca `lib/modules/asignaciones/**`. `[ID]` = toca `lib/modules/identity/**`.
> `[DB]` = toca `db/**`. Rutas relativas a la raíz del **worktree**.
>
> **Regla de tanda** (`CLAUDE.md` n.º 5): al cerrar cada tanda se corre `./init.sh --rapido`. El
> `./init.sh` **completo** es del leader, antes del PR, sin excepción.
>
> **Criterio de «hecho» que rige todas las tasks de test:** cada aserción cae al **mutar** lo que
> vigila. Se demuestra mutando, no leyendo.

---

## Archivos que SÍ se tocan

**Nuevos**

| Archivo | Qué |
| --- | --- |
| `lib/modules/asignaciones/index.ts` | Contrato público del módulo nuevo (R31) |
| `lib/modules/asignaciones/domain/order-assignment.ts` | `OrderAssignment` y `AssignmentOrigin` (`design.md > 3`) |
| `db/migrations/<ts>_order_assignments/migration.sql` | UP: tabla, índices, CHECK, 3 FK, 4 filas de permisos, RLS |
| `db/migrations/<ts>_order_assignments/down.sql` | DOWN (R34, R35) |
| `tests/unit/asignaciones/schema/order-assignments-migration.test.ts` | Test de esquema y migración |
| `tests/unit/asignaciones/module-contract.test.ts` | Forma del módulo y frontera (R29, R31) |
| `tests/integration/asignaciones/order-assignments-constraints.int.test.ts` | Constraints contra Postgres real |
| `progress/impl_QC-86-modelo-de-asignacion-de-pedidos.md` | Bitácora y mapa de trazabilidad |

**Modificados**

| Archivo | Qué cambia, y nada más |
| --- | --- |
| `db/schema.prisma` | **Solo** se añade el modelo `OrderAssignment`. Ni una línea de `User`, `Company`, `WorkGroup`, `WorkGroupMember` u `Order` (R32) |
| `lib/modules/identity/domain/permissions.ts` | Dos entradas en `PERMISSIONS`, dos códigos al Administrador y uno al Operador en `SEED_ROLE_PERMISSIONS`, y la **enmienda escrita** en el comentario de cabecera: trece → **quince** |

**Modificados porque afirman el número exacto del catálogo o el conjunto exacto del Operador.**
Son tests ajenos que **hay que retensar al número nuevo, nunca relajar** (riesgo 6 de `design.md`):

| Archivo | Qué afirma hoy |
| --- | --- |
| `tests/unit/identity/permissions.test.ts` | `CODIGOS_DEL_REQUISITO` (13 códigos), `MODULOS`, `MODULOS_CON_ESCRITURA`, `Set.size === 13`, y **tres** casos con `SEED_ROLE_PERMISSIONS[ROLE_OPERADOR] === ['inventario.consultar']` |
| `tests/guards/guard-permisos-sembrados.test.ts` | `PERMISSIONS.length === 13` y el texto del mensaje («trece entradas … enmendado por QC-38 y por QC-66») |
| `tests/unit/navegacion/qc75-convenciones.test.ts` | `CODIGOS_QC74` (13 códigos escritos a mano), `toHaveLength(13)` y `MODULOS_DE_NEGOCIO` |
| `tests/unit/identity/seed/seed-initial-access.test.ts` | «los trece permisos … y las **catorce** asignaciones» (13 del Administrador + 1 del Operador → pasa a 15 + 2 = **17**) |
| `tests/integration/identity/identity-seed.int.test.ts` | El total de asignaciones que el seed debe dejar y el caso «el Operador solo con `inventario.consultar`» |

**Tests de no-regresión con lista blanca de rutas** (miden `origin/dev...HEAD` y se ponen rojos ante
**cualquier** archivo nuevo de `db/` o de `lib/modules/`). Hay que **nombrar** la migración de esta
ficha en su lista, con el comentario que explique por qué, igual que hicieron QC-83 y QC-66:

- `tests/unit/recetas-ui/recipe-route-contract.test.ts` (bloque `MIGRACION_QC83` / `MIGRACION_QC66`)
- `tests/unit/recetas/module-contract.test.ts`
- `tests/unit/unidades/unidades-convenciones.test.ts`
- `tests/unit/unidades/consumidores-catalogo.test.tsx`
- `tests/guards/guard-identificador-de-request.test.ts`
- `tests/unit/navegacion/qc75-convenciones.test.ts`

> **Aviso:** esta lista sale de buscar `origin/dev...` en `tests/`. **Cada uno se comprueba
> ejecutándolo**, y solo se toca el que se ponga rojo. Retensar uno que no hacía falta es ruido en el
> diff; relajar uno que sí hacía falta es un agujero. Lo que se toque se anota en la bitácora, uno a
> uno, para que el reviewer lo mire.

## Archivos que NO se tocan

`app/**` · `components/**` · `hooks/**` · `middleware.ts` · `lib/composition/**` ·
`lib/shared/navigation/private-nav.ts` · `scripts/seed.ts` · `lib/modules/pedidos/**` ·
`lib/modules/recetas/**` · `lib/modules/inventario/**` · `lib/modules/unidades/**` ·
`lib/modules/proveedores/**` · `e2e/**` (**ningún E2E nuevo**, decisión cerrada 16) ·
`package.json` y `pnpm-lock.yaml` (R37) · cualquier `migration.sql` o `down.sql` ya existente ·
`lib/modules/identity/**` salvo `domain/permissions.ts`.

Si alguno de estos aparece en `git diff`, la feature está fuera de alcance: **para y pregunta**.

---

## Tanda A — El módulo y el esquema

### [x] T1. `[AS]` `[P]` El armazón del módulo `asignaciones`
- **Archivos:** `lib/modules/asignaciones/index.ts`, `lib/modules/asignaciones/domain/order-assignment.ts`.
- **Qué:** `design.md > 3`. `AssignmentOrigin` como **unión discriminada** (`direct` /
  `workGroup` con `workGroupId` y `workGroupName`) y `OrderAssignment`. Dominio puro: sin `zod`, sin
  `next/*`, sin `@prisma/client`, sin importar ningún otro módulo. **Sin `ports/` y sin
  `adapters/`**: no hay caso de uso (R36).
- **Hecho cuando:** `pnpm run typecheck` en verde y
  `tests/guards/guard-arquitectura-modulos.test.ts` sigue verde con el módulo nuevo descubierto por
  su barrido (bloques 1 y 6: `index.ts` presente, solo `domain/`, contrato sin servidor).
- **Depende de:** nada. Paralelizable con T2 y T3.

### [x] T2. `[DB]` `[P]` El modelo `OrderAssignment` en el esquema
- **Archivos:** `db/schema.prisma`.
- **Qué:** `design.md > 1.1`. `/// @module asignaciones`, PK compuesta `(orderId, userId)`, los dos
  `@@index`, `workGroupId`/`workGroupName` anulables, `createdAt`/`updatedAt`, **ninguna
  `@relation`**, **ningún `deletedAt`**.
  **Comentarios `/// OJO` obligatorios**, con el patrón de `Order`, `WorkGroupMember` y `Unit`:
  (a) las tres FK y el CHECK van **escritos a mano** y son **DRIFT** — qué hay que borrar del SQL
  generado (riesgo 5); (b) las dos FK de `identity` son **compuestas con `company_id`** y qué se
  rompe si se simplifican (riesgo 1); (c) **`MATCH SIMPLE` es a propósito**, `MATCH FULL` mataría
  R13 (riesgo 2); (d) `workGroupName` es un **snapshot**, no una desnormalización que un `JOIN`
  pueda sustituir (riesgo 3); (e) **no hay `deleted_at`** y por qué (riesgo 4).
- **Hecho cuando:** `prisma validate` pasa, el cliente generado expone `orderAssignment`, y
  `git diff db/schema.prisma` **solo** añade líneas del modelo nuevo (ningún modelo existente
  cambia, R32).
- **Depende de:** nada. Paralelizable con T1 y T3.

### [x] T3. `[ID]` `[P]` Los dos permisos en el catálogo y en el seed
- **Archivos:** `lib/modules/identity/domain/permissions.ts`.
- **Qué:** `design.md > 4.1`. Dos entradas nuevas con descripción no vacía; Administrador recibe
  **las dos**, Operador recibe **`asignaciones.consultar`** y nada más (R27). Escritas **una a una**,
  sin comodín. La **enmienda** al comentario de cabecera con estas palabras: QC-74 R2 dijo diez,
  QC-38 once, QC-66 trece, **QC-86 quince**; y que `asignaciones` **sí** es una carpeta de
  `lib/modules/` (a diferencia de `usuarios`).
- **Hecho cuando:** `tests/guards/guard-permisos-sembrados.test.ts` se pone **roja por el número**
  (13 ≠ 15) y por nada más — esa es la prueba de que el cambio llegó donde tenía que llegar; se
  arregla en T4.
- **Depende de:** nada. Paralelizable con T1 y T2.

### [x] T4. `[P]` Retensar los tests que afirman el número exacto
- **Archivos:** los **cinco** de la tabla «Modificados porque afirman el número exacto».
- **Qué:** subir 13 → **15** y 14 → **17**, añadir los dos códigos a cada lista escrita a mano,
  añadir `asignaciones` a `MODULOS`, `MODULOS_CON_ESCRITURA` y `MODULOS_DE_NEGOCIO`, y cambiar los
  **tres** casos que afirman que el Operador tiene **exactamente** `['inventario.consultar']` para
  que afirmen **exactamente** `['inventario.consultar', 'asignaciones.consultar']`.
  **Prohibido** convertir una igualdad en un `toContain` o en un `toBeGreaterThan`: el número exacto
  **es** el contrato (riesgo 6).
- **Hecho cuando:** los cinco archivos pasan, **ninguna aserción se debilitó** (se revisa el diff
  aserción por aserción) y quitar a mano uno de los dos permisos del catálogo vuelve a ponerlos
  rojos.
- **Depende de:** T3.

### [ ] T5. Cierre de tanda A
- **Hecho cuando:** `./init.sh --rapido` en verde, guardias incluidas.
- **Depende de:** T1, T2, T3, T4.

---

## Tanda B — La migración

### [x] T6. `[DB]` El `migration.sql` (UP)
- **Archivos:** `db/migrations/<ts>_order_assignments/migration.sql`.
- **Qué:** los **seis** pasos de `design.md > 5.1`, **en ese orden**: tabla + PK, los dos índices, el
  CHECK, las tres FK (pedido simple; persona y grupo **compuestas con `company_id`**), los cuatro
  `INSERT` de permisos con `ON CONFLICT DO NOTHING` y el rol resuelto **por nombre**, y los dos
  `ALTER … ROW LEVEL SECURITY` **al final**. Cabecera con el inventario de lo que salió de Prisma, lo
  que se completó a mano y lo que se **borró** a mano, con el formato de
  `20260908210000_work_groups_and_members/migration.sql`.
- **Hecho cuando:** `pnpm run db:migrate` la aplica limpia sobre la base del worktree; el archivo no
  ejecuta **ningún DDL** sobre una tabla preexistente (R32); `\d order_assignments` muestra las dos
  FK de `identity` **con `company_id` dentro** y el CHECK con sus dos ramas; y
  `SELECT count(*) FROM permissions` devuelve **15**.
- **Depende de:** T5.

### [x] T7. `[DB]` El `down.sql` (DOWN)
- **Archivos:** `db/migrations/<ts>_order_assignments/down.sql`.
- **Qué:** los cuatro pasos de `design.md > 5.3`, en ese orden (asignaciones de rol → permisos →
  `DROP TABLE`), **sin `CASCADE`**, con los dos `DELETE` acotados **por código**.
- **Hecho cuando:** `pnpm run db:rollback` deja la base en un estado en el que: no existe
  `order_assignments`, `permissions` vuelve a tener **13** filas, `role_permissions` vuelve al conteo
  exacto de antes de T6, un snapshot de `orders` y de `users` —columnas, índices y restricciones— es
  **idéntico** al de antes, y `_prisma_migrations` queda sin la fila. **Verificado contra Postgres
  real, no leído**, con las dos salidas pegadas en la bitácora. Después se reaplica el UP.
- **Depende de:** T6.

### [x] T8. Test de esquema y de migración
- **Archivos:** `tests/unit/asignaciones/schema/order-assignments-migration.test.ts`.
- **Qué, como mínimo** (`design.md > 6`):
  - las **dos** FK hacia `identity` son compuestas y llevan `company_id`; el test cae si alguien las
    escribe simples (R11, riesgo 1);
  - el SQL **no** contiene `MATCH FULL` (R13, riesgo 2);
  - el CHECK `order_assignments_work_group_name_matches_group` existe **con sus dos ramas** (R7);
  - las **tres** FK son `ON DELETE RESTRICT` (R10, R20, R22);
  - la FK del pedido es **simple** y el UP no menciona `company_id` sobre `orders` (R14);
  - ni el esquema ni el SQL declaran `deleted_at` en la tabla (R15);
  - existen `order_assignments_user_id_idx` y `order_assignments_work_group_id_idx` (R17);
  - la tabla queda con RLS `ENABLE` **y** `FORCE`, y esos `ALTER` van **al final** (R33);
  - el UP **no ejecuta DDL sobre ninguna tabla preexistente**, y lo único que escribe en ellas son
    los cuatro `INSERT` de permisos (R32);
  - los dos códigos, módulos, acciones y **descripciones** del SQL coinciden con `PERMISSIONS`
    **importado del barril**, no copiado (R28); y los `INSERT` llevan `ON CONFLICT DO NOTHING` y
    resuelven el rol por **nombre**, sin ningún uuid literal (R28);
  - el `down.sql` **no** contiene `UPDATE`, `INSERT` ni `ALTER TABLE`, sus dos `DELETE` van acotados
    por los dos códigos, y no nombra `orders`, `users`, `work_groups` ni `companies` (R35);
  - el modelo declara `/// @module asignaciones` (R30) y **ninguna** `@relation` (R31);
  - el esquema declara `created_at`/`updated_at` y las tres columnas de referencia como `NOT NULL`
    (R1, R23), y `work_group_id`/`work_group_name` como anulables (R6);
  - los identificadores creados están en inglés y `snake_case` (R24).
- **Hecho cuando:** cada aserción cae al mutar el archivo que vigila.
- **Depende de:** T7.

### [ ] T9. Cierre de tanda B
- **Hecho cuando:** `./init.sh --rapido` en verde, incluida
  `tests/guards/guard-rls-force.test.ts`, que descubre la tabla nueva leyendo el SQL (R33).
- **Depende de:** T8.

---

## Tanda C — Las garantías contra Postgres real

### [x] T10. Tests de integración de constraints
- **Archivos:** `tests/integration/asignaciones/order-assignments-constraints.int.test.ts`.
- **Qué, cada caso dentro de una transacción que acaba en `ROLLBACK`**, con **dos** empresas
  efímeras creadas en el `beforeAll` (nunca la de instalación: `companies_name_unique` es global y
  chocaría con la del seed), sus personas, sus grupos y sus pedidos:
  - **R11 — el corazón**: asignación con persona de la empresa A y grupo de la B → `23503`; y con
    `company_id` que no es la de ninguno de los dos → `23503`;
  - **R12**: mover de empresa a una persona asignada, y a un grupo ya aplicado → `23503` en los dos
    sentidos;
  - **R13 — el caso legítimo**: asignación **sin grupo**, con la empresa de la persona → aceptada; y
    sin grupo con una empresa ajena → `23503`;
  - **R3**: la misma persona dos veces en el mismo pedido → `23505`, **y también** si la segunda
    llega con grupo y la primera era suelta, y si llega con **otro** grupo;
  - **R4**: un pedido con dos personas y una persona en dos pedidos → aceptado;
  - **R1/R2**: asignación sin `company_id` → `23502`; con pedido inexistente → `23503`;
  - **R6/R7**: grupo sin nombre congelado → `23514`; nombre congelado sin grupo → `23514`; las dos
    juntas → aceptado;
  - **R8 — la congelación**: renombrar el grupo **después** de asignar no cambia
    `work_group_name`; darlo de baja tampoco cambia ninguna columna de la fila;
  - **R9**: meter y sacar a alguien del grupo **después** de asignar no crea, borra ni modifica
    ninguna asignación;
  - **R10/R20/R22**: borrar físicamente el grupo, el pedido o la persona con asignaciones → `23503`
    en los tres casos;
  - **R15**: quitar a una persona elimina la fila y **no queda rastro** (`count = 0`, sin columna que
    lo conserve);
  - **R16**: borrar **una** fila de un grupo deja las demás de ese grupo intactas;
  - **R17**: `DELETE … WHERE order_id = ? AND work_group_id = ?` se lleva exactamente las de ese
    grupo y **no** las sueltas ni las de otro grupo del mismo pedido;
  - **R18**: un pedido sin asignaciones existe; borrar la última no cambia ni una columna del pedido;
  - **R19**: dar de baja el pedido **no** toca sus asignaciones;
  - **R21**: dar de baja a una persona, o dejarla `inactive`/`blocked`, **no** toca sus asignaciones;
  - **R23**: `created_at`/`updated_at` se rellenan y el segundo cambia al modificar la fila.
- **Hecho cuando:** los casos de R11, R12 y R13 fallan si alguien convierte las FK compuestas en
  simples o escribe `MATCH FULL`.
- **Depende de:** T9.

### [x] T11. `[P]` Test de contrato del módulo y de frontera
- **Archivos:** `tests/unit/asignaciones/module-contract.test.ts`.
- **Qué:** (a) el módulo tiene `index.ts` y **solo** `domain/` —ni `ports/` ni `adapters/`— (R36);
  (b) ningún archivo de `lib/modules/asignaciones/**` importa una ruta interna de otro módulo ni
  `@/lib/shared/db/prisma` (R31); (c) el contrato no arrastra `next/*` ni `@prisma/client`;
  (d) ningún archivo fuera de `lib/modules/asignaciones/**` consulta `prisma.orderAssignment` (R30);
  (e) **R29 en negativo**: los dos códigos nuevos **no aparecen** en ningún archivo de `app/**`,
  `components/**`, `lib/shared/**` ni `lib/modules/**` salvo `identity/domain/permissions.ts`.
- **Hecho cuando:** cada aserción cae con un fuente sintético que la viola **y** no cae con el caso
  simétrico correcto (patrón de `tests/guards/`, R21 de QC-9).
- **Depende de:** T9. Paralelizable con T10.

### [x] T12. `[P]` Los tests del seed y del catálogo, contra base real
- **Archivos:** `tests/integration/identity/identity-seed.int.test.ts` (retensado en T4).
- **Qué:** que el seed deja **quince** permisos y **diecisiete** asignaciones; que el Operador queda
  con **exactamente** `inventario.consultar` y `asignaciones.consultar` (R26, R27); y que una segunda
  corrida no cambia ningún conteo. Además: aplicar la migración de T6 sobre una base **ya sembrada**
  no duplica ni reescribe nada (R28).
- **Hecho cuando:** los conteos son exactos y el caso de idempotencia se ejecuta dos veces seguidas.
- **Depende de:** T9. Paralelizable con T10 y T11.

### [ ] T13. `[P]` No-regresión: nada de lo que ya existe cambia
Es un requisito con nombre (R32, R36, decisión cerrada 16), no una consecuencia.

- **Qué:** `git diff` de la rama **no** toca ninguno de los archivos de «Archivos que NO se tocan»;
  los E2E existentes se ejecutan y pasan **sin cambios en su guion**; y cada test de lista blanca de
  la tabla de arriba se ejecuta uno a uno — el que se ponga rojo se retensa **nombrando** la
  migración de esta ficha con su comentario, y se anota en la bitácora para que el reviewer la mire.
- **Hecho cuando:** los specs E2E pasan con el número de tests de cada uno anotado en la bitácora, y
  `git diff` confirma que **ningún `test(...)` de E2E cambió de contenido**. **No se añade ningún E2E
  nuevo.**
- **Depende de:** T9. Paralelizable con T10, T11 y T12.

### [x] T14. `[P]` Verificar que no entró ninguna dependencia
- **Hecho cuando:** el diff de la rama sobre `package.json` y `pnpm-lock.yaml` está **vacío** (R37),
  y `tests/guards/guard-dependencias-aprobadas.test.ts` en verde.
- **Depende de:** T9. Paralelizable con T10, T11, T12 y T13.

### [ ] T15. Bitácora y mapa de trazabilidad
- **Archivos:** `progress/impl_QC-86-modelo-de-asignacion-de-pedidos.md`.
- **Qué:** el mapa `R1..R37 -> test concreto` **sin hueco** (`CHECKPOINTS.md > Trazabilidad`),
  nombrando archivo **y** título de test; la lista de tests ajenos retensados, uno a uno, con el
  motivo; y las salidas reales del rollback de T7.
- **Hecho cuando:** los 37 requisitos tienen su test nombrado y ninguno apunta a un test que no caiga
  al mutar lo que vigila.
- **Depende de:** T10, T11, T12, T13, T14.

### [ ] T16. Cierre de feature
- **Hecho cuando:** `./init.sh` **completo** en verde (regla 5 de `CLAUDE.md`: obligatorio antes del
  PR, sin excepción) y la migración aplicada **y revertida y reaplicada** al menos una vez sobre la
  base del worktree.
- **Depende de:** T15.

---

## Mapa `R<n> -> test`

Es el mapa **previsto**; el implementer lo confirma en la bitácora (T15) con el título exacto de
cada caso. Abreviaturas: **A** = `tests/unit/asignaciones/schema/order-assignments-migration.test.ts`
· **B** = `tests/integration/asignaciones/order-assignments-constraints.int.test.ts` ·
**C** = `tests/unit/identity/permissions.test.ts` ·
**D** = `tests/guards/guard-permisos-sembrados.test.ts` ·
**E** = `tests/unit/asignaciones/module-contract.test.ts` ·
**F** = `tests/guards/guard-arquitectura-modulos.test.ts` ·
**G** = `tests/integration/identity/identity-seed.int.test.ts` ·
**H** = `tests/guards/guard-rls-force.test.ts` ·
**I** = `tests/guards/guard-dependencias-aprobadas.test.ts` ·
**J** = `tests/unit/identity/seed/seed-initial-access.test.ts` · **T13** = la verificación de T13.

| R | Test | R | Test |
| --- | --- | --- | --- |
| R1 | A + B (`23502`) | R20 | B (`DELETE orders` → `23503`) |
| R2 | B (pedido inexistente) | R21 | B (baja/`inactive`/`blocked`) |
| R3 | B (los tres caminos → `23505`) | R22 | B (`DELETE users` → `23503`) |
| R4 | B | R23 | A + B |
| R5 | A (no hay columna de 2.º origen) | R24 | A |
| R6 | A + B | R25 | C |
| R7 | A (CHECK) + B (`23514` ×2) | R26 | C + D + G |
| R8 | B (renombrar y dar de baja) | R27 | C + G |
| R9 | B (alta/baja de pertenencia) | R28 | A + G |
| R10 | B (`DELETE work_groups`) | R29 | E |
| R11 | A + B | R30 | A + E + F |
| R12 | B (los dos sentidos) | R31 | A + E + F |
| R13 | A (sin `MATCH FULL`) + B | R32 | A + T13 |
| R14 | A | R33 | A + H |
| R15 | A (sin `deleted_at`) + B | R34 | A + T7 (rollback real) |
| R16 | B | R35 | A |
| R17 | A (índice) + B | R36 | E + T13 (E2E sin cambios) |
| R18 | B | R37 | I |
| R19 | B | | |

Y `J` respalda R26/R27 en unitario con dobles, sin base.

---

## Grafo de dependencias

```
┌ T1 ┐
│ T2 │ → T5 → T6 → T7 → T8 → T9 → ┌ T10 ┐
│ T3 │→T4 ┘                       │ T11 │
└────┘                            │ T12 │ → T15 → T16
                                  │ T13 │
                                  └ T14 ┘
```
