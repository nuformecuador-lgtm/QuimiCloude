# Review — QC-42-modelo-proveedores

Commit revisado: `7c3cd84` (rama `feature/QC-42-modelo-proveedores`). Base de datos propia
`QuimiCloude_QC42`, `.env` git-ignorado del worktree.

## Checklist

### Especificacion
- [x] `requirements.md` con R1–R36, EARS, 22 decisiones cerradas, 8 preguntas abiertas (no bloquean).
- [x] `design.md` con alternativas descartadas (8.1–8.8) y su porque.
- [x] `tasks.md`: 15/15 tasks `[x]`, sin checkboxes pendientes.

### Trazabilidad
- [x] Los 36 requisitos tienen fila en la tabla `R<n> -> test` de `tasks.md` y de
  `progress/impl_QC-42-modelo-proveedores.md`.
- [x] **Verificado por lectura y por ejecucion, no solo por el mapa del implementer**, en los
  puntos de mayor riesgo: unicidad normalizada del nombre (indice parcial), `CHECK` de «al
  menos telefono o correo», los cuatro `CHECK` de no-negativos/RESTRICT/CASCADE, y RLS forzada.
  Cada uno de esos tests trae su propia mutacion en memoria (`>= 0` -> `> -1`, quitar el
  `WHERE deleted_at IS NULL`, `DECIMAL` -> `DOUBLE PRECISION`, `RESTRICT` -> `CASCADE`, `OR` ->
  `AND`, quitar `FORCE`) y la aserto contra la mutacion: cae en los seis casos. No son tests
  vacios.

### El cruce por ORM (R22) — el encargo especifico de esta ronda
- [x] **Mutacion real ejecutada**: anadi `product Product @relation(fields: [productId],
  references: [id])` a `SupplierCatalogLine` y su reverso `supplierCatalogLines
  SupplierCatalogLine[]` en `Product`, corri `pnpm exec prisma generate`, y
  `tests/unit/proveedores/module-contract.test.ts` **cayo en las dos aserciones de
  `Prisma.dmmf`** (`SupplierCatalogLine` paso a incluir `'Product'`, `Product` paso a incluir
  `'SupplierCatalogLine'`). Revertida la mutacion (`git diff db/schema.prisma` vacio tras
  restaurar y regenerar), el test vuelve a pasar 7/7. El test **muerde**: no es un test que
  pase igual con y sin la violacion.
- [x] La guardia generica (`guard-arquitectura-modulos.test.ts`) efectivamente NO detecta este
  cruce (busca imports y la cadena `prisma.<modelo>`, no relaciones del dmmf), tal como dice
  `design.md > 5.4`; el test especifico de esta feature es quien lo cierra.

### `down.sql`
- [x] **Ejecutado el ciclo real**: `pnpm run db:rollback` -> las dos tablas desaparecen,
  `_prisma_migrations` sin la fila; `products` queda con las **mismas 14 columnas y los mismos
  8 constraints** que antes del rollback (comparacion directa contra `information_schema` y
  `pg_constraint`, no contra el texto de la migracion); ninguna tabla ajena (`identity`,
  `inventario`, `recetas`) desaparece. Reaplicado `pnpm run db:migrate` sin error, y la suite de
  proveedores + guardias vuelve a 193/193 en verde.

### Auditoria del commit `b60236f` ("wip sin verificar")
- Reauditado independientemente (no solo confiado en el "cero defectos" del implementer
  siguiente): `db/schema.prisma`, `migration.sql`, `down.sql`, armazon del modulo, comentarios
  OJO, y los tres archivos de test. **No encontre defectos nuevos** mas alla de lo ya
  verificado arriba. Las cuatro FK (una intra-modulo `CASCADE` generada por Prisma, tres a
  mano con `RESTRICT`/`ON UPDATE CASCADE`), el indice unico parcial, los cuatro `CHECK` y los
  cuatro `ALTER` de RLS (`ENABLE` + `FORCE`, las dos tablas) estan tal como los describe
  `design.md > 4` y se confirman contra la base real (T10 repetido) y contra el SQL (T7, con
  sensibilidad).

### Calidad y seguridad
- [x] RLS `ENABLE` + `FORCE` en las dos tablas, confirmado contra `pg_class.relrowsecurity` /
  `relforcerowsecurity` (documentado en `impl_QC-42...md`, y la guardia generica lo cubre para
  cualquier migracion futura).
- [x] Las tres FK que cruzan de modulo (`product_id`, `created_by`, `updated_by`) son
  escalares sin `@relation` en Prisma y FK reales escritas a mano en `migration.sql`, con
  `ON DELETE RESTRICT` — nunca `SET NULL` — verificado con casos de integracion que insertan un
  UUID inventado y reciben `23503`.
- [x] Sin secretos hardcodeados; `.env` del worktree git-ignorado.
- [x] No hay webhooks en esta feature (no aplica).
- [x] `proveedores` nace hexagonal: `index.ts` solo reexporta de `./domain`, carpetas
  `domain/ports/adapters` exactas, ningun `'use server'` alcanzable, cierre transitivo del
  barrel sin `@prisma/client`, `next/*`, `react`, `@/lib/shared` ni `@/lib/composition` — el
  modulo es importable desde cliente sin arrastrar servidor.
- [x] `lib/composition/index.ts` no se toco (`git diff --stat` vacio), decision consciente y
  documentada (`design.md > 5.5`, `tasks.md` T5).

### `products` intacto (decision cerrada 2)
- [x] `git diff db/schema.prisma` no muestra ninguna linea dentro de `model Product`.
- [x] Confirmado tambien contra la base real: mismas columnas y mismos 8 constraints de
  `products` antes y despues del ciclo rollback/reapply que corri.
- [x] `migration.sql` no contiene ningun `ALTER TABLE "products"` ni `CREATE TABLE "products"`
  (test estatico con sensibilidad, mas verificacion manual del archivo).

### Dependencias
- [x] `git diff origin/dev -- package.json pnpm-lock.yaml` vacio. Ninguna dependencia nueva
  (decision cerrada 22, R36). No aplica ninguna fila nueva en `docs/dependencias.md`.

### Convenciones
- [x] Identificadores de base en ingles y `snake_case` (`suppliers`, `supplier_catalog_lines`,
  y todos los indices/constraints), verificado con vocabulario cerrado y test de sensibilidad
  que rechaza terminos en espanol.
- [x] Sin UI en esta feature: no aplica la regla de multiplataforma.

### Verificacion ejecutable
- [x] Suite propia de la feature: `pnpm exec vitest run tests/unit/proveedores
  tests/integration/proveedores tests/guards` -> **193/193 en verde**, corrida por mi
  directamente (no solo la bitacora del implementer), tanto antes como despues de mis
  mutaciones (revertidas).
- El gate completo `./init.sh` (94 archivos, 1039 tests) ya se corrio en la sesion del leader
  segun el encargo; no lo repeti entero, pero si repeti el ciclo de base de datos completo
  (T10) y la suite dirigida de esta feature, que es donde estaba el riesgo real.

## Hallazgos

Ninguno bloqueante. Ninguno menor tampoco: no encontre discrepancias entre `design.md`, el
codigo y el comportamiento real de la base.

## Veredicto

**APROBADO**
