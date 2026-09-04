# Arreglo del gate en rojo — rama `feature/fix-gate-rojos-dev`

No es una feature SDD: son dos arreglos independientes del gate sobre `dev`.

## Encargo 1 — `tests/integration/identity/identity-seed.int.test.ts` (8 casos rojos)

### Qué tablas tenían las filas culpables

Consultado contra la base real (catálogo `pg_constraint` + conteos). FK hacia `users`,
todas `ON DELETE RESTRICT` (`confdeltype = 'r'`):

| tabla | columnas | filas totales | filas que referencian a `users` |
|---|---|---|---|
| `orders` | `created_by`, `updated_by` | 0 | 0 |
| `products` | `created_by`, `updated_by` | 6 | **1** |
| `recipes` | `created_by`, `updated_by` | 1 | **1** |
| `supplier_catalog_lines` | `created_by`, `updated_by` | 0 | 0 |
| `suppliers` | `created_by`, `updated_by` | 0 | 0 |

Culpables reales hoy: **`products` (1 fila) y `recipes` (1 fila)**. `users` tiene 1 fila.

Nota sobre el diagnóstico de partida: la tabla de QC-43 se llama en la base
`supplier_catalog_lines` (no `proveedor_catalogo`) y está **vacía**, así que no es la que
lo destapó; lo destaparon el producto y la receta sembrados. El resto del diagnóstico
—FK `RESTRICT` escritas a mano bloqueando `tx.user.deleteMany({})`— se confirma.

### Qué cambié y por qué

Solo el test. Ninguna FK ni migración tocada. `resetIdentityToEmptyState` ahora vacía,
DENTRO de la misma transacción que termina en `ROLLBACK`, las tablas que dependen de
`users` antes de borrar usuarios y roles.

El orden de borrado **no es una lista escrita a mano**: se deriva en tiempo de ejecución
del catálogo de Postgres (`tablesDependingOnUsers`), que calcula el cierre transitivo de
tablas que apuntan a `users` y las ordena hojas-primero (peeling topológico; si el grafo
dejara de ser acíclico, lanza un error que lo dice). Elegí esto sobre la lista fija porque
el fallo de hoy es exactamente el de una lista que nadie actualizó: cada módulo nuevo con
auditoría `created_by`/`updated_by` volvería a poner el archivo en rojo. Descarté
`TRUNCATE ... CASCADE` (transaccional y más corto) porque toma `ACCESS EXCLUSIVE` hasta el
final de la transacción y esta base local está compartida por varios worktrees: bloquearía
a otros archivos de integración corriendo en paralelo.

Con el esquema de hoy el orden resuelto es `orders`, `recipe_lines`,
`supplier_catalog_lines`, `recipes`, `suppliers`, `products` → `users` → roles del seed.
Los nombres vienen del catálogo y aun así se validan contra `^[a-z_][a-z0-9_]*$` antes de
interpolarse en el `DELETE FROM`.

Invariantes respetados: el aislamiento por transacción revertida no se toca (comprobado
tras la corrida: `users` 1, `roles` 2, `products` 6, `recipes` 1, `recipe_lines` 2,
`document_types` 1, `presentations` 6, `units` 4 — idénticos a antes); ninguna migración
ni FK relajada; los 8 casos comprueban exactamente lo mismo que antes. También se
actualizó la cabecera del archivo, que hasta ahora sólo explicaba el borrado de usuarios.

## Encargo 2 — baseline de los dos guardias de rama de recetas

Decisión ya tomada por el humano. Entradas tal cual quedaron en
`tests/baseline-rojos.json`:

```json
"tests/unit/recetas-ui/recipe-route-contract.test.ts": {
  "motivo": "Contiene un caso de guardia de rama que se apoya en `git diff --name-only origin/dev...HEAD` (el de R44 de QC-26). Estando EN dev ese rango esta vacio por definicion, y el caso se declara rojo a proposito ('el rango git origin/dev...HEAD no estaba disponible: este caso no ha comprobado nada') en vez de pasar en silencio sin comprobar nada. Es estructural: en dev no puede estar verde. COSTE ACEPTADO, y no es pequeno: al estar listado aqui, el archivo ENTERO queda ignorado por el comparador tambien en las ramas de feature, que es justo donde su guardia de diff SI tendria sentido y donde ademas viven los otros casos del archivo (los que no dependen del rango). O sea que este archivo deja de proteger nada via gate; si se toca la pantalla de recetas hay que correrlo a mano en la rama. La salida limpia seria que el caso se auto-salte cuando el rango esta vacio (skip explicito y ruidoso) y sacar el archivo de esta lista.",
  "desde": "2026-09-04"
},
"tests/unit/recetas/module-contract.test.ts": {
  "motivo": "Mismo motivo estructural que el anterior: uno de sus casos comprueba, sobre `git diff --name-only origin/dev...HEAD`, que QC-26 (feature de presentacion) no toca `lib/modules/recetas/**`. En dev el rango esta vacio y el caso falla adrede con 'el rango git origin/dev...HEAD no estaba disponible: este caso no ha comprobado nada'. COSTE ACEPTADO: listarlo aqui apaga el archivo COMPLETO para el comparador, incluidas sus comprobaciones de contrato del modulo `recetas` (barrel, ausencia de rutas HTTP bajo app/api) que si podrian correr en cualquier rama, y lo apaga tambien en las ramas de feature donde deberia morder. Correccion pendiente: que el caso del diff se salte explicitamente cuando el rango no existe, y borrar esta entrada.",
  "desde": "2026-09-04"
}
```

Se actualizó también el `_nota` del archivo (ya no está vacío) y el bloque de estado de
`docs/verification.md > Rojos heredados`, que seguía afirmando que el baseline estaba
vacío.

Comprobado que el comparador acepta el formato, con un reporte de corrida simulado (los
dos archivos en `failed`, uno más en `passed`):

```
$ node scripts/comparar-baseline-rojos.mjs .tmp-rep.json
sin rojos nuevos (2 rojos, todos en el baseline de 2)
exit=0
```

## Archivos modificados

- `tests/integration/identity/identity-seed.int.test.ts`
- `tests/baseline-rojos.json`
- `docs/verification.md`
- `progress/impl_fix-gate-rojos-dev.md` (este informe)

## Verificación (modo acotado, según lo pedido; el `./init.sh` completo lo corre el humano)

```
$ pnpm typecheck
app/layout.tsx(43,56): error TS2304: Cannot find name 'LayoutProps'.
 ELIFECYCLE  Command failed with exit code 2.
```

**Este rojo no es de este cambio y es ambiental.** `LayoutProps<"/">` es un tipo global que
genera Next en `.next/types/**`, incluido desde `tsconfig.json`; este worktree nunca ha
corrido `next dev` ni `next build`, así que no existe `.next/`. Los tres archivos que toqué
son un test, un JSON y un `.md`: ninguno puede producir ese error. Se resuelve generando
los tipos (`pnpm build`, o un arranque de `next dev`) en el worktree.

```
$ pnpm lint
✖ 2 problems (0 errors, 2 warnings)
  app/(private)/inventario/components/product-columns.ts  66:10  'formatDate' is defined but never used
  tests/unit/inventario/product-page.test.tsx              9:3   'EMPTY_CELL' is defined but never used
```

0 errores. Las 2 advertencias son preexistentes en `dev`, en archivos que no toqué.

```
$ pnpm exec vitest run tests/integration/identity/identity-seed.int.test.ts
 Test Files  1 passed (1)
      Tests  10 passed (10)
   Duration  7.96s
```

Los 8 casos del seed en verde, más los 2 de `withInitialAccessTransaction` que viven en el
mismo archivo (10 en total).

```
$ pnpm exec vitest related --run tests/integration/identity/identity-seed.int.test.ts tests/baseline-rojos.json
 Test Files  1 passed (1)
      Tests  10 passed (10)

$ pnpm exec vitest run guard
 Test Files  12 passed (12)
      Tests  123 passed (123)
```

## Veredicto

Los 8 casos del seed quedan en verde de forma determinista —ya no dependen de con qué datos
arranque la base local— y los dos guardias de rama de recetas quedan en el baseline con
motivo y coste declarados; el único rojo restante, `LayoutProps` en `pnpm typecheck`, es
ambiental por falta de `.next/types` en este worktree.

---

# Encargo 3 — acotar al esquema `public` las consultas al catalogo (4 archivos)

Añadido después del primer commit, a petición del coordinador.

## Qué cambié

Cinco consultas a `pg_constraint`, en cuatro archivos, pasan a unir con `pg_namespace`
sobre el `relnamespace` de la tabla que declara la FK (`conrelid`) y a filtrar
`n.nspname = 'public'`:

- `tests/integration/inventario/presentation-uniqueness.int.test.ts` — **dos**: la del
  `beforeAll` (`products_presentation_id_fkey`) y la de `fkAfter` que relee `confdeltype`.
- `tests/integration/proveedores/proveedores-constraints.int.test.ts` — el censo de FK de
  `suppliers` y `supplier_catalog_lines`.
- `tests/integration/recetas/recetas-constraints.int.test.ts` — el censo de FK de `recipes`
  y `recipe_lines`.
- `tests/integration/unidades/unidades-constraints.int.test.ts` — el censo de FK hacia
  `units`. Aquí se acotan **las dos puntas** (`conrelid` y `confrelid`), no una: el
  predicado del caso es sobre la tabla REFERENCIADA (`ft.relname = 'units'`), así que
  limitar sólo el lado que declara la FK dejaría pasar una FK de `public` hacia una tabla
  `units` de otro esquema. No cambia lo que el caso comprueba; sólo lo dice con precisión.

Ninguna lista esperada de FK se tocó, ni ninguna aserción. El cambio es de **alcance de la
consulta**, más comentarios que explican por qué el filtro existe (para que nadie lo
"simplifique" luego).

## Barrido del resto de consultas al catálogo en esos cuatro archivos

Revisadas todas las de `pg_constraint`, `pg_class`, `pg_index`/`pg_indexes`, `pg_tables`,
`pg_type` e `information_schema` de los cuatro archivos. **Las demás ya estaban acotadas** y
no hacía falta tocarlas:

- `information_schema.columns` → todas con `table_schema = 'public'` (helpers `columnInfo`,
  y los casos de `image_path`, `deleted_at`, columnas de `units`).
- `pg_indexes` y `pg_tables` → todas con `schemaname = 'public'`.
- `pg_type` de `recetas` (censo de enums) → ya unía con `pg_namespace` y filtraba
  `n.nspname = 'public'`.

O sea que el agujero estaba exactamente en las cinco consultas a `pg_constraint`, que es la
única vista del catálogo aquí usada que es **global a la base** y no lleva columna de
esquema propia.

## Lo que NO pude demostrar, y por qué: la base compartida se movió debajo

Esto es lo importante de esta sección.

**El síntoma que motivó el encargo ya no es reproducible, y los 4 archivos siguen rojos por
OTRA causa.** Medido en esta misma sesión, con marca de tiempo:

- 07:40 — `pg_namespace` tenía `public` y `public_shadow_qc52`; `SELECT count(*) FROM
  pg_constraint WHERE conname = 'products_presentation_id_fkey'` devolvía **2**. El
  diagnóstico del coordinador era exacto.
- 07:45 — mismas consultas: sólo queda el esquema `public`, `public_shadow_qc52` tiene
  **0 tablas** y esa cuenta es **1**. `public_shadow_qc52` era la **shadow database** que
  `prisma migrate dev` crea y destruye durante la sesión de QC-52; su vida es la de esa
  invocación.
- Y en esa ventana la sesión paralela **aplicó su migración a la base compartida**:
  `_prisma_migrations` tiene ahora `20260904123854_split_product_and_supplier_catalog`, que
  no existe en esta rama. `public.products` perdió `cost`, `min_purchase` y `delivery_time`
  (quedan `created_at, created_by, deleted_at, id, image_path, name, presentation_id,
  qty_alert, stock, unit_id, updated_at, updated_by`) y `supplier_catalog_lines` ganó
  `supplier_catalog_lines_presentation_id_fkey` y `supplier_catalog_lines_unit_id_fkey`.

Consecuencia: cualquier `tx.product.create()` de esos archivos revienta con **SQLSTATE
42703** (columna inexistente) porque el cliente Prisma de ESTA rama pide columnas que la
base ya no tiene. El mensaje que se ve —«The column `existe` does not exist in the current
database»— es engañoso: el servidor habla español (`no existe la columna ...`) y Prisma
extrae `existe` como si fuera el nombre de la columna. No hay ninguna columna `existe`.
Los censos de FK ni siquiera llegan a evaluarse: el caso muere antes, creando el producto.

Comprobado que **no es mío**: con `git stash` (es decir, el archivo tal cual está en la
rama, sin mi cambio) `unidades-constraints` da exactamente los mismos `6 failed | 7 passed`
y los mismos seis nombres de caso.

No toco las listas esperadas de FK —está prohibido y además sería incorrecto: la lista de
`supplier_catalog_lines` la actualizará QC-52 cuando su rama entre—. Esos cuatro archivos
volverán a poder correr cuando esta rama tenga la migración de QC-52, o cuando la base local
vuelva al esquema de `dev`.

**Verificación del cambio, hecha de la única forma honesta disponible:** ejecuté las cinco
consultas, en su versión ANTES y DESPUÉS, directamente contra el catálogo, y comparé los
conjuntos de filas. Con el estado actual de la base (sin esquema espejo) devuelven
**exactamente lo mismo** — el filtro no altera lo que el test observa cuando hay un solo
esquema, que es el invariante que hay que preservar—; y con el esquema espejo presente el
filtro es justo lo que elimina el duplicado. Nada de lo que los casos afirman cambia.

Nota lateral, y es una buena señal: `identity-seed.int.test.ts` (encargo 1) **sigue en verde,
10/10, contra esta base ya migrada por QC-52**, con `supplier_catalog_lines` estrenando dos
FK nuevas. Eso es exactamente lo que compra derivar el orden de borrado del catálogo en vez
de una lista escrita a mano.

## Verificación (acotada)

```
$ pnpm typecheck
(sin salida: limpio — con `.next/types` ya copiado, el rojo ambiental de `LayoutProps`
desapareció, tal como se anticipó)

$ pnpm lint
✖ 2 problems (0 errors, 2 warnings)   # las mismas 2 advertencias preexistentes de dev

$ pnpm exec vitest run <los 4 archivos>
 Test Files  4 failed (4)
      Tests  36 failed | 33 passed (69)
      # 100% de los fallos son SQLSTATE 42703 por el drift de QC-52 descrito arriba;
      # idénticos con y sin mi cambio (comprobado con git stash).

$ pnpm exec vitest run tests/integration/identity/identity-seed.int.test.ts
 Test Files  1 passed (1)
      Tests  10 passed (10)
```

## Veredicto del encargo 3

Las cinco consultas a `pg_constraint` quedan acotadas a `public` y el resto del catálogo ya
lo estaba; el arreglo es correcto pero **hoy no se puede demostrar en verde**, porque la
base compartida ya no es la de `dev`: la sesión de QC-52 aplicó
`20260904123854_split_product_and_supplier_catalog` sobre `public` y esos cuatro archivos
fallan ahora por drift de esquema (SQLSTATE 42703), con y sin mi cambio.
