# Review ronda 2 — QC-42-modelo-proveedores

Commit revisado: `69a070e` (rama `feature/QC-42-modelo-proveedores`, worktree
`.worktrees/QC-42-modelo-proveedores`). Base propia `QuimiCloude_QC42` via el `.env`
git-ignorado del worktree.

**Ronda independiente.** Formé mi juicio antes de abrir
`progress/review_QC-42-modelo-proveedores.md`, y solo lo leí al final para contrastar. No
partí de su veredicto. El territorio que la ronda 1 ya pisó por mutación (cruce por ORM /
`Prisma.dmmf`, los cuatro CHECK, el índice parcial, RLS) lo di por verificado y busqué en
otra parte.

Al terminar: `git status --porcelain` vacío. Todas las mutaciones revertidas, ninguna quedó
en disco, ningún archivo de producción editado por mí.

## Checklist

### Especificación
- [x] `requirements.md`: R1–R36 en EARS, 22 decisiones cerradas, 8 preguntas abiertas.
- [x] `design.md`: alternativas descartadas 8.1–8.8, cada una con su porqué.
- [x] `tasks.md`: 15/15 marcadas `[x]` (T0–T14). Ningún `[ ]` pendiente en el archivo.

### Trazabilidad — los 36 requisitos, recorridos uno a uno
- [x] Cada `R<n>` tiene al menos un test que ejecuta algo, no un test vacío.
- [x] El mapa `R<n> -> test` está en `progress/impl_QC-42-modelo-proveedores.md` y coincide
  con los archivos reales.
- [x] Verificado por mutación, no por lectura, en cuatro puntos nuevos (ver «Mutaciones»).
  Tres muerden; uno no muerde y es el hallazgo menor 1.
- Los requisitos que se cierran por AUSENCIA (R18 moneda, R25 autor en la línea, R28
  `deletedAt` en la línea, R26 estado activo/inactivo, R5 sin VARCHAR) están afirmados en
  positivo contra el censo completo de campos (`scalarNames(...).toEqual(...)`), no con un
  `not.toContain` suelto: añadir o quitar una columna tumba el test. Correcto.

### Tasks y CHECKPOINTS.md — punto por punto
- [x] Especificación: los tres archivos existen, tasks 15/15.
- [x] Trazabilidad: mapa presente, cada R con test.
- [x] `typecheck` / `lint` / `pnpm test`: el gate completo lo corrió el leader (94 archivos,
  1039 tests, `== init OK ==`). No lo repetí entero. Sí corrí yo
  `vitest run tests/unit/proveedores tests/integration/proveedores tests/guards` ->
  **193/193 verde**, antes y después de mis mutaciones.
- [x] E2E: no aplica. No hay flujo navegable (R35, decisión 21); diferido con motivo a QC-44.
- [x] UI multiplataforma: **no aplica**. La feature no toca `app/` ni `components/`;
  confirmado contra el diff, cero archivos de UI.
- [x] Dependencias: `git diff origin/dev...HEAD -- package.json pnpm-lock.yaml
  docs/dependencias.md` -> **vacío**. Ninguna fila nueva que exigir (R36, decisión 22).
  Ninguna utilidad escrita a mano que ya resolviera una librería del stack: lo único escrito
  es `normalizeSupplierName`, seis líneas de `String.prototype`, idéntica a
  `normalizeRecipeName` y `normalizePresentationName` que ya existen. Es coherencia con el
  precedente, no reinvención.
- [x] Permisos: no se deciden aquí (decisión 20). Sin service no hay permiso que testear.
- [x] RLS ENABLE + FORCE en las dos tablas: en el SQL (test estático con sensibilidad más
  `guard-rls-force.test.ts`) y **en la base real**, comprobado por mí contra
  `pg_class.relrowsecurity` / `relforcerowsecurity` -> `true`/`true` en `suppliers` y en
  `supplier_catalog_lines`.
- [x] Acceso a datos solo por Prisma. Ningún cliente de Supabase en el diff.
- [x] Migración versionada y reversible con `down.sql`, y `db:rollback` deja
  `_prisma_migrations` coherente. **Ejecutado por mí con datos dentro** (ver abajo).
- [x] Sin secretos hardcodeados. El `.env` del worktree está git-ignorado y no entra al diff.
- [x] Webhooks: no aplica.
- [x] Módulos hexagonales: `index.ts` solo reexporta de `./domain`; carpetas exactamente
  `domain`/`ports`/`adapters`; ningún `'use server'`; cierre transitivo del barrel sin
  `@prisma/client`, `next/*`, `react`, `@/lib/shared` ni `@/lib/composition`; todo modelo con
  `/// @module`; `lib/composition` sin tocar; no reaparecen
  `lib/services|repositories|interfaces`; nada nuevo en la raíz de `lib/`.
- [x] Configuración: nada que cambie entre entornos quedó en el código.
- [x] `./init.sh` verde (corrida del leader).
- [ ] `progress/history.md`: **no hay entrada de QC-42** (menor 3). Es un paso posterior a
  esta review según el propio orden de `CHECKPOINTS.md`, así que no lo trato como
  bloqueante, pero queda anotado para que la ficha no se cierre sin él.

### El migration.sql frente al esquema de Prisma y frente a la base
- [x] Comparé los tres, no dos: `pnpm exec prisma migrate diff --from-schema-datamodel
  db/schema.prisma --to-url <DATABASE_URL> --script`. El diff devuelve **exactamente ocho
  AddForeignKey y nada más**, y las ocho son el drift conocido y deliberado del repo:
  `products_created_by/updated_by_fkey`, `recipe_lines_product_id_fkey` y
  `recipes_created_by/updated_by_fkey` (QC-20 y QC-24, ya en `dev`), más las **tres de
  QC-42** (`supplier_catalog_lines_product_id_fkey`, `suppliers_created_by_fkey`,
  `suppliers_updated_by_fkey`). Ninguna columna, ningún tipo, ningún índice y ninguna tabla
  aparecen en el diff: **el esquema Prisma, el migration.sql y la base dicen lo mismo.**
- [x] Estado real de la base leído directamente: `cost` y `min_purchase` `numeric(14,4)`,
  `delivery_time` `integer`, `name`/`name_normalized`/`phone`/`email` `text`,
  `created_by`/`updated_by` `uuid` anulables, `suppliers_name_unique` como
  `UNIQUE (name_normalized) WHERE (deleted_at IS NULL)`, los cuatro CHECK con su definición
  exacta y las cuatro FK con sus acciones (RESTRICT x3, CASCADE x1). Coincide con
  `design.md > 4`.
- [x] **DRIFT protegido y documentado como en Product y Recipe**: los `/// OJO 1/2/3` de
  `Supplier` y los `/// OJO 1/2` de `SupplierCatalogLine` en `db/schema.prisma` nombran las
  cinco cosas invisibles para Prisma (las tres FK a mano, el índice parcial, los CHECK, la
  RLS), y la cabecera de `migration.sql` las enumera con la advertencia explícita de revisar
  a mano toda migración futura. Es literalmente el mismo trato que `model Recipe` y
  `model Product`: no queda peor que el precedente.

### El down.sql en el caso incómodo — con datos dentro
Ejecutado por mí, no leído. La ronda 1 revirtió sobre tablas efectivamente vacías; aquí las
dos tablas tenían filas comprometidas (COMMIT real, no una transacción de test):

1. Sembré con el cliente Prisma, fuera de transacción: una `presentation`, un `product`, un
   `supplier` y una `supplier_catalog_line` (`cost=9.9999`, `min_purchase=2.5`,
   `delivery_time=3`). Confirmado `suppliers=1`, `supplier_catalog_lines=1`.
2. Huella completa del esquema `public` **antes**: tablas, todas las columnas con tipo y
   nulabilidad, todos los `pg_constraint` con su `pg_get_constraintdef`, todos los
   `indexdef`, `relrowsecurity`/`relforcerowsecurity` de cada tabla y `_prisma_migrations`.
3. `pnpm run db:rollback` -> revertida sin error **con las filas dentro**. El `DROP TABLE` no
   necesitó `CASCADE`: no hay ninguna FK entrante a las dos tablas, y las salientes hacia
   `products`/`users` caen con ellas.
4. Huella **después**. Diferencia contra la anterior: **solo** las dos tablas de QC-42 y todo
   lo que cuelga de ellas (18 columnas, 10 constraints, 7 índices, sus 2 filas de RLS y su
   fila de `_prisma_migrations`). **Cero residuos y cero daño colateral**: ninguna tabla,
   columna, constraint ni índice ajeno cambió. El `product` sembrado **sobrevivió** al
   rollback: la línea se fue, el producto no, que es exactamente lo que piden R19 y la
   decisión 2.
5. `pnpm run db:migrate` -> reaplicada. Huella final **idéntica** a la del paso 2. R34 se
   cumple con datos dentro, no solo sobre tablas vacías.

### La frontera del módulo
- [x] `lib/modules/proveedores/index.ts` es importable desde cliente: su cierre transitivo de
  imports es **un solo archivo**, `domain/supplier-name.ts`, que no tiene ni un `import`. No
  arrastra `@prisma/client`, `next/*`, `react`, `@/lib/shared` ni `@/lib/composition`.
- [x] Cero cruce a `identity` o `inventario` por ruta profunda, y cero por ORM: el `dmmf` del
  cliente generado da `relationTargets('SupplierCatalogLine') === ['Supplier']`,
  `relationTargets('Supplier') === ['SupplierCatalogLine']`, y ni `Product` ni `User` ganan
  campo de vuelta.
- [x] Los tres `.gitkeep` (`ports/`, `adapters/driven/`, `adapters/driving/`) **no son deuda
  disfrazada**: `module-contract.test.ts` afirma que las tres carpetas están vacías de
  fuentes `.ts` Y que los `.gitkeep` siguen ahí. Si QC-43 mete un adaptador, el test lo
  obliga a actualizar la afirmación en vez de dejarla mintiendo. Es el armazón que pide R23.

### QC-42 no tocó products (decisión cerrada 2)
Comprobado en los tres sitios, no en uno:
- **Esquema**: `git diff origin/dev...HEAD -- db/schema.prisma` no toca ninguna línea dentro
  de `model Product`; el test estático afirma además que `Product` no gana ningún campo ni
  relación hacia `Supplier`/`SupplierCatalogLine`.
- **Migración**: ningún `ALTER TABLE "products"` ni `CREATE TABLE "products"`; las únicas
  menciones a `products` están dentro de un `REFERENCES`.
- **Base**: `products` tiene sus 14 columnas y **`unit`, no `unit_id`** — o sea, esta base no
  tiene la migración de QC-32 y el terreno está limpio — y sobrevivió intacta al ciclo
  rollback -> reapply que corrí con datos.

### Convenciones y seguridad
- [x] Identificadores de base en inglés y `snake_case`, con vocabulario cerrado y test de
  sensibilidad que rechaza `proveedor`, `catalogo`, `costo`, `nombre_normalizado`,
  `Suppliers`.
- [x] `decimal(14,4)` exacto; ningún `float`/`double`/`real` en los dos modelos
  (`docs/architecture.md > Dominio` n.º 4).
- [x] R20 cubierto por guardia real: ver mutación M3.
- [x] Sin secretos, sin webhooks, capas separadas.

### Las 8 preguntas abiertas
No las cuento como hallazgos: el humano aprobó el spec con ellas abiertas. Verifiqué que el
código hace lo que la posición por defecto dice, que es lo único revisable: el CHECK es
`phone IS NOT NULL OR email IS NOT NULL` (así que `''` pasa, pregunta 6), la línea no lleva
`created_by`/`updated_by` (pregunta 7, decisión 14) y el CHECK no es parcial, así que alcanza
a los proveedores dados de baja (pregunta 8). Coherente con lo escrito.

## Mutaciones que probé en esta ronda, y cuáles cayeron

Todas revertidas con `git checkout`; `git status --porcelain` vacío tras cada una.

**M1 — `normalizeSupplierName`: quitar la línea que descarta los diacríticos.**
-> **NO cayó** (57/57 verdes). Investigado: es un **mutante equivalente**, no un agujero.
Tras `normalize('NFD')` el acento queda como carácter combinante suelto, y el último paso
—descartar todo lo que no sea `[a-z0-9]`— ya lo elimina. La línea es redundante, no es la que
hace el trabajo. El test sí muerde en lo que importa: sigue exigiendo que «Químicos» y
«Quimicos» den la misma clave `quimicos`, y el caso «nombres distintos siguen dando claves
distintas» impide la degeneración a cadena vacía. **No es hallazgo.**

**M2 — `delivery_time`: `INTEGER` -> `DECIMAL(14,4)` en `migration.sql` Y `Int?` ->
`Decimal? @db.Decimal(14, 4)` en `db/schema.prisma` (R16).**
-> **CAYÓ**: dos tests rojos, «delivery_time es INTEGER, no decimal»
(`proveedores-migration.test.ts`) y «delivery_time es Int opcional»
(`proveedores-schema.test.ts`). R16 está cubierto por tests que muerden.

**M3 — cruce por ORM visto por la guardia genérica (R20): añadí a
`lib/modules/inventario/adapters/driven/persistence/product-prisma.ts` una función que
consulta `prisma.supplierCatalogLine`.**
-> **CAYÓ**: `guard-arquitectura-modulos.test.ts` reporta «accede a
'prisma.supplierCatalogLine' (modelo 'SupplierCatalogLine', dueño 'proveedores') desde el
módulo 'inventario' (R16)». Verifiqué además que el mapeo modelo -> campo del cliente de la
guardia maneja bien un nombre de tres palabras (`toLowerCamel`), que era mi sospecha
concreta: no falla ahí.

**M4 — sonda de comportamiento contra Postgres real (no una mutación de código): dos tablas
temporales, una con `delivery_time INTEGER` y otra con `delivery_time NUMERIC(14,4)`, e
inserté el texto 3.5 ligado como parámetro, igual que hace el test de integración.**
-> **Las dos rechazan con el mismo SQLSTATE `42804`.** Es la prueba del menor 1.

## Hallazgos

### Mayores (bloqueantes)

**Ninguno.**

### Menores

**menor 1 — el caso «rechaza un plazo con parte fraccionaria» de la integración no muerde, y
su comentario afirma algo falso (R16).**
En `tests/integration/proveedores/proveedores-constraints.int.test.ts`, el caso «rechaza un
plazo con parte fraccionaria y acepta uno entero (R16)» espera `42804` al insertar el texto
3.5 en `delivery_time`, y nueve líneas de comentario justifican ese código diciendo que «un
plazo fraccionario lo rechaza el TIPO de la columna (INTEGER)». **No es cierto.** Medido
contra Postgres real (M4): una columna `NUMERIC(14,4)` devuelve **el mismo `42804`** ante el
mismo parámetro. Lo que ese `expect` verifica no es que la columna sea entera, sino que un
parámetro de texto no se liga a una columna de familia numérica, algo que seguiría siendo
cierto con `delivery_time` declarado decimal: la aserción **no puede fallar** bajo la
mutación que su propio comentario dice vigilar. Agrava un poco que, a diferencia de `cost` y
`min_purchase` —de los que sí se lee `information_schema` y se comprueba
`numeric_precision=14`, `numeric_scale=4`—, **ningún test lee el tipo real de `delivery_time`
en la base**.

*Por qué es menor y no mayor*: R16 no depende de ese caso. Lo cubren además el contrato
estático del esquema y el del SQL, y probé por mutación (M2) que **los dos caen**. El
requisito está cubierto por tests que muerden; lo roto es una aserción concreta y el
razonamiento escrito a su lado, que induce a error a quien lo lea después. Arreglo barato
para QC-43 o para una tanda de limpieza: leer `data_type` de `delivery_time` en
`information_schema.columns` y exigir `integer`, igual que ya se hace con los dos decimales.

**menor 2 — R33 se cierra solo contra el texto del SQL; nada lo comprueba en la base.**
El mapa dice `R33 | M, G1`, y la cabecera del test de integración lo justifica: «un test de
RLS escrito con Prisma sale verde pase lo que pase». Eso es cierto para probar que la RLS
**bloquea**, pero no para leer su **estado**: consultar `relrowsecurity` y
`relforcerowsecurity` en `pg_class` es una lectura de catálogo que funciona perfectamente, y
hoy no la hace ningún test. La corrí a mano y el estado real es correcto (true/true en las
dos tablas), así que no hay defecto: hay una comprobación automatizable que no se automatizó.
**Lo bajo a menor y no lo cuento como regresión de QC-42**: grepeé todo `tests/` y **ninguna
feature del repo** (QC-4, QC-14, QC-20, QC-24) comprueba la RLS contra `pg_class`. QC-42
sigue el precedente. Vale como mejora del arnés, no como corrección de esta ficha.

**menor 3 — el estado en disco de la ficha está desactualizado (para el leader, no para el
implementer).** En el commit `69a070e`:
- `feature_list.json` tiene QC-42 en estado `pending` con la feature implementada, revisada y
  el gate verde. Debería estar al menos `in_progress`.
- `progress/current.md` (línea 15) sigue diciendo «pending — worktree montado (F1.0 hecho)» y
  «Parada en F1.2 ... no existe `specs/QC-42-modelo-proveedores/requirements.md`». Existe
  desde el commit `667ab98`: la fila contradice al disco.
- `progress/history.md` no tiene entrada de QC-42 (checkpoint de «Verificación final»).

Nada de esto es código y nada rompe el gate —con `pending`, la validación del límite de dos
`in_progress` por zona ni siquiera mira la ficha—, pero es la regla 3 de `CLAUDE.md`
incumplida en su propio archivo de estado.

**menor 4 — la rama arrastra dos commits ajenos a QC-42 que entrarían a `dev` con el PR.**
`git diff origin/dev...HEAD` incluye `specs/QC-22-pantalla-de-productos/requirements.md`
(+68) y `specs/QC-25-crud-de-recetas/requirements.md` (+71), que vienen de `30186f3`
(«chore(QC-22): acotada, sembrada y ficha nueva QC-45») y `899dc25` («chore(QC-25): acotada y
sembrada»), ambos **anteriores** al primer commit de QC-42 (`ee47f69`). No es obra del
implementer: la rama se cortó de una punta de `dev` local que ya los tenía. Son sembrados de
spec, benignos y probablemente deseados. Lo anoto para que el leader lo decida a conciencia
al abrir el PR y no se entere en el merge.

## Contraste con la ronda 1

**Coincido en el veredicto y en casi todo el fondo.** La ronda 1 hizo trabajo real, no una
firma: su mutación de añadir el `@relation` y regenerar el cliente para ver caer las
aserciones del `dmmf` es la verificación correcta del encargo específico de esta feature
(R22), y la repasé sin encontrarle fallo. Los seis casos de sensibilidad que enumera están
efectivamente escritos dentro de los tests, no inventados.

**Discrepo en dos puntos, los dos de matiz y ninguno de veredicto:**

1. «Ninguno menor tampoco» es demasiado. Existe al menos una aserción que no puede fallar
   (menor 1), y se encuentra midiendo, no leyendo: el comentario del test es tan explícito y
   tan seguro de sí mismo que leerlo convence. Es exactamente el tipo de cosa que un cero
   absoluto sobre 36 requisitos suele estar escondiendo.
2. La ronda 1 apunta la RLS como «confirmado contra `pg_class`» con un check de checklist. Lo
   confirmado fue **una comprobación manual anotada en la bitácora**, no un test del gate. La
   distinción importa: lo manual no protege el siguiente commit. Es mi menor 2.

**Añado lo que la ronda 1 no hizo**, y por eso esta ronda no fue redundante: el `down.sql`
con datos comprometidos dentro, con huella completa del esquema comparada en los tres
momentos; el careo esquema Prisma contra migración contra base real con `prisma migrate
diff`, que es lo que descarta de verdad que los tres se hayan separado; la mutación de la
guardia de módulos con un nombre de modelo de tres palabras (R20); y M1, M2 y M4.

## Veredicto

**APROBADO** — 0 mayores, 4 menores. Ninguno bloquea el PR. Los menores 1 y 2 son deuda de
test y se arreglan en QC-43 o en una tanda de limpieza; los menores 3 y 4 son estado de
leader, no código, y se cierran antes del merge.
