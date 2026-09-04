# QC-57 — orden-y-filtro-en-listados · design.md

> Zona `backend` · Complejidad `high` · `depends_on` null · Rama
> `feature/QC-57-orden-y-filtro-en-listados`
>
> Traduce `requirements.md` a estructura, contratos y SQL. **No reabre ninguna fila** de
> `## Decisiones cerradas (no reabrir)`. Cierra la **pregunta abierta 1** (§4), **propone** la 2
> (§5) y abre tres nuevas, escritas en `requirements.md > Preguntas abiertas`.

## 0. Qué NO toca esta feature

- **Ninguna pantalla.** Es backend. `app/**` y `components/**` se quedan como están: consumirlas es
  QC-56, QC-35, QC-39 y QC-45. La única excepción es la **llamada** del selector de ingredientes
  del formulario de recetas, que hoy pasa `search` y tiene que pasar el contrato nuevo (R24) — es
  cambiar la forma del argumento, no la pantalla.
- **Ningún permiso.** `requireAdmin` sigue siendo la primera línea de los siete casos de uso y
  nadie gana ni pierde acceso (R33).
- **Ningún modelo nuevo, ninguna tabla nueva, ninguna RLS nueva.** Se añade **una** columna y
  **índices**; la RLS de cada tabla ya existe y no se toca.
- **Ninguna dependencia de npm.** Ver §11.
- **Ningún E2E** (R35, fila 19).

## 1. Panorama

```
Server Action / página  ──► caso de uso (domain)                 ──► puerto ──► adaptador driven
                             1. requireAdmin(actor)                            (Prisma)
                             2. <lista>QuerySchema.parse(input)   ← zod, R30
                             3. sanitize(query, WHITELIST)        ← R4, R5, R8
                             4. log.ignored(...)                  ← R6, puerto
                             5. repo.listAlive(queryYaSaneada)    ← R13
```

Las siete listas, con el archivo que hoy las implementa:

| # | Lista | Caso de uso | Adaptador |
| --- | --- | --- | --- |
| 1 | productos | `inventario/domain/list-products.ts` | `product-prisma.ts:246` |
| 2 | presentaciones | `inventario/domain/list-presentations.ts` | `presentation-prisma.ts:121` |
| 3 | recetas | `recetas/domain/list-recipes.ts` | `recipe-prisma.ts:234` |
| 4 | proveedores | `proveedores/domain/list-suppliers.ts` | `supplier-prisma.ts:231` |
| 5 | catálogo de proveedor | `listBySupplierAlive` (puerto `supplier-catalog-repository.ts`) | `supplier-catalog-line-prisma.ts:389` |
| 6 | unidades | `unidades/domain/list-units.ts` | `unit-prisma.ts:16` |
| 7 | pedidos | `pedidos/domain/list-orders.ts` | `order-prisma.ts:283` |

Siete listas repartidas en **cinco carpetas de módulo** (`inventario` y `proveedores` llevan dos
cada una). Los siete adaptadores ordenan **fijo** hoy; los siete pasan a ordenar por lo que traiga
el contrato, con el orden de hoy como defecto (R11).

## 2. El problema central: compartir la FORMA sin compartir el ARCHIVO

La fila 13 lo deja cerrado y `page.ts` ya lo tiene escrito: **el dominio no puede importar
`lib/shared/**`** (`docs/architecture.md > La regla de dependencias`). `pageQuerySchema` está
declarado cuatro veces por eso, y esta ficha **no lo unifica**. Lo mismo vale para el contrato de
lista: cada módulo declara el suyo.

### 2.1 Decisión: duplicación deliberada + una guardia de equivalencia

Cada módulo gana un archivo `domain/list-query.ts` con:

1. los **tipos** del contrato (§3.1), idénticos en los cinco;
2. una **fábrica** de esquema zod que recibe la lista blanca del listado y devuelve el esquema;
3. la **lista blanca** de cada listado del módulo (§5);
4. la función pura **`sanitize`** que aplica R5, R7 y R8 y devuelve `{ query, ignored }`.

La copia es literal entre módulos, igual que las cuatro `normalize*Name` de hoy —cuatro funciones
con el mismo cuerpo, una por módulo— y las cuatro `pageQuerySchema`. Lo que impide que las copias
**diverjan** no es un import: es
`tests/guards/guard-contrato-listados.test.ts`, que somete a los cinco esquemas la **misma batería
de entradas canónicas** y exige el mismo veredicto y la misma salida saneada (R32). Seis copias sin
esa guardia no son un contrato, son seis contratos parecidos.

**Precio, escrito:** cinco archivos que hay que editar a la vez cuando el contrato cambie, y una
guardia que falla ruidosamente si alguien edita solo uno. Se acepta porque la alternativa rompe la
regla de dependencias, que es bloqueante.

### 2.2 Alternativa descartada A — un módulo `lib/modules/listados`

La regla de dependencias **sí permite** que `domain/` importe el **barrel** de otro módulo
(`@/lib/modules/N`). Un módulo nuevo `listados`, sin tablas ni puertos, exportando los tipos y la
fábrica del esquema, pasaría `guard-arquitectura-modulos` sin tocarla, y dejaría **una** copia.

**Se descarta.** Tres razones, en orden de peso:

1. **Contradice la fila 13 en su espíritu.** El humano decidió que se comparte la forma, no el
   archivo, y que la duplicación es deliberada. Un módulo-paraguas es el archivo compartido con
   otro nombre.
2. **Un módulo aquí es un área funcional del ERP** (`docs/architecture.md > Módulos, no pantallas
   sueltas`: inventario, compras, producción…), y cada modelo declara su `/// @module`. Un módulo
   sin tabla, sin caso de uso y sin dueño de negocio es una carpeta técnica disfrazada, y abre la
   puerta a `lib/modules/utils`.
3. **Acopla los cinco módulos a uno.** Hoy `inventario` no depende de `recetas` para listar; con
   esto, los cinco dependerían de `listados` para poder listar. El coste de un cambio pasa de
   «edito cinco archivos con la guardia vigilándome» a «toco el módulo del que cuelga todo».

### 2.3 Alternativa descartada B — `lib/shared/list-query.ts`

Es la salida obvia y **está prohibida**: `domain/` no puede importar `lib/shared/**`, y la guardia
de arquitectura lo hace fallar. Ya lo descartó el humano en la fila 13; se anota aquí para que
nadie lo vuelva a proponer creyendo que se pasó por alto.

## 3. Contrato de entrada/salida

Todo `readonly`, `strict: true`, sin `any`. Nombres orientativos; lo vinculante es la forma.

### 3.1 Entrada — la misma forma que QC-55 emite

`specs/QC-55-tabla-de-datos-compartida/design.md > 3.1` define `DataTableParams`. **Este contrato
la copia campo a campo y nombre a nombre**, para que **nadie tenga que traducir** (es la pregunta
abierta 1 de QC-55, que así queda sin materia):

```ts
type SortDirection = 'asc' | 'desc';
type ListSort = { readonly columnId: string; readonly direction: SortDirection };

type ListFilterValue =
  | { readonly kind: 'text'; readonly value: string }
  | { readonly kind: 'numberRange'; readonly min: number | null; readonly max: number | null }
  | { readonly kind: 'select'; readonly values: readonly string[] }
  | { readonly kind: 'dateRange'; readonly from: string | null; readonly to: string | null };

type ListQuery = {
  readonly page: number;            // >= 1, defecto 1  (pageQuerySchema de hoy)
  readonly pageSize?: number;       // >= 1; el defecto 10 y el tope 25 los pone el adaptador
  readonly sort: ListSort | null;   // UNA columna o nada (R9)
  readonly filters: Readonly<Record<string, ListFilterValue>>;
  readonly search: string;          // '' = sin búsqueda (R20)
};
```

Consecuencias que hay que leer despacio:

- **`columnId` ES el nombre del campo** (R3). QC-55 llama `columnId` a la clave y la decisión
  cerrada 1 dice que quien llama manda el nombre del campo de la base; se unifican declarando que
  **el `id` de columna de estas siete tablas es el nombre del campo**. QC-56 declara sus columnas
  con ese id y no escribe ningún traductor. Si algún día una columna de pantalla no corresponde a
  un campo (una columna calculada, la de acciones), simplemente **no** está en la lista blanca y
  R5 la ignora: el caso ya está cubierto sin código extra.
- **`columnId` va en `camelCase`**, como los campos del cliente Prisma y como los tipos `*View`
  (`presentationId`, `qtyAlert`, `unitPrice`). El esquema de la base es `snake_case` por
  `@@map`/`@map` (cabecera de `db/schema.prisma`), y traducir `camelCase → snake_case` es del
  adaptador driven, que es el único que puede conocer Prisma. Sigue siendo «el nombre del campo de
  la base en inglés» (fila 17), en la única grafía que el dominio puede pronunciar.
- **`sort` es objeto o `null`, no lista** (R9, fila 4). Cierra la pregunta abierta 5 de QC-55.
- Los cuatro `kind` son **exactamente** los cuatro de QC-55 (R12). Un quinto no existe: `z.union`
  de cuatro variantes discriminadas, y lo que no discrimina muere en el `parse`.

### 3.2 Salida

**No cambia.** `Page<T>` (`items`, `total`, `page`, `pageSize`, `totalPages`) sigue siendo la
salida de las siete listas, con `total` y `totalPages` describiendo el conjunto **ya filtrado**
(R14) — que es lo que hoy ya hace `listAliveProducts` usando el **mismo `where`** para el
`findMany` y para el `count`, y ese patrón se extiende a las siete. Unidades es la excepción de
forma: §7.

### 3.3 Semánticas que el contrato fija

| Punto | Decisión | Por qué |
| --- | --- | --- |
| `text` | `contains`, sobre la columna normalizada del campo si la hay, si no sobre la columna en crudo con `mode: 'insensitive'` | Es lo que hace hoy la búsqueda de productos |
| `numberRange` | extremos **inclusivos**; `null` = sin cota por ese lado | Un rango con un solo extremo es el caso normal en una tabla |
| `select` | `IN (...)`; lista **vacía** = filtro ausente, no «ningún resultado» | Una lista vacía es «no he elegido nada», y devolver cero filas por eso es la trampa que R5 evita en su caso hermano |
| `dateRange` | `YYYY-MM-DD`, extremos **inclusivos**, interpretados en **UTC** (`from` a las 00:00:00Z, `to` al final del día) | **Posición por defecto, no decisión: pregunta abierta 4.** Las columnas son `timestamptz` y QC-55 emite la fecha sin huso |
| Nulos al ordenar | comportamiento **por defecto** de Postgres, sin `NULLS FIRST/LAST` explícito | **Posición por defecto, no decisión: pregunta abierta 5** |
| Varios filtros | conjunción: todos a la vez (R15) | Es lo que ya hacen los dos filtros de `listOrdersSchema` |

## 4. La normalización de la búsqueda (cierra la pregunta abierta 1)

### 4.1 Decisión: COLUMNA PERSISTIDA

La búsqueda compara contra **`name_normalized`**, una columna real, escrita en cada escritura por
la función pura del dominio de cada módulo (`normalizeUnitName`, `normalizeRecipeName`,
`normalizeSupplierName`, `normalizePresentationName` y la nueva de producto). Las cinco tienen el
mismo cuerpo: `trim` → `toLowerCase` → `NFD` → quitar diacríticos → quitar todo lo que no sea
`[a-z0-9]`.

Cuatro razones:

1. **Cinco de las seis tablas buscables ya la tienen y ya la escriben.** `presentations`,
   `recipes`, `suppliers`, `supplier_catalog_lines` y `units` persisten `name_normalized` para la
   unicidad. El camino de escritura ya existe, está probado y no se toca. La única que falta es
   `products` — que no la tenía porque su nombre **no** es único (decisión cerrada 6 de QC-14).
2. **Buscar y comparar dejan de discrepar** (fila 9): la misma columna que decide «este nombre ya
   existe» es la que decide «este nombre coincide con lo que buscas». Una sola definición.
3. **No hay función de base que reproduzca esa normalización.** No es `lower(unaccent(x))`: el
   repo además **borra espacios y signos**, así que «MILI-LITRO» y «mililitro» son la misma clave.
   Reproducirlo en SQL obliga a escribir una función `plpgsql` propia y a mantenerla en paralelo
   con cinco funciones de TypeScript. Es exactamente lo que el propio esquema prohíbe por escrito
   («No se escribe otra: dos definiciones de “mismo nombre” en el mismo módulo divergen»,
   `SupplierCatalogLine`).
4. **Índice limpio.** Un índice sobre una columna es un objeto que Prisma ve, que la guardia de
   migraciones puede leer y que `down.sql` revierte sin ceremonia.

**Coste aceptado:** una columna más en `products` (texto, del tamaño del nombre), un backfill en la
migración, y la obligación de escribirla en toda alta y edición de producto — lo mismo que ya
cuesta en las otras cinco tablas.

### 4.2 Alternativa descartada — función de base + índice funcional

`CREATE INDEX ... ON products ((lower(unaccent(name))))`. **Se descarta**, y por un motivo técnico
duro además del de coherencia:

- **`unaccent()` no es `IMMUTABLE`** en Postgres (depende de un diccionario que se puede cambiar),
  y Postgres **rechaza** una expresión no inmutable en un índice. La salida habitual es envolverla
  en una función propia marcada `IMMUTABLE` a sabiendas de que es una promesa que el diccionario
  puede romper: se firma un objeto de base frágil para ahorrar una columna.
- **Aunque se hiciera, no bastaría**: la normalización del repo quita signos y espacios (razón 3
  de §4.1), así que la función propia habría que escribirla igual, y entonces habría dos
  definiciones de «mismo nombre», una en SQL y otra en TypeScript, que nada obliga a coincidir.
- **No ahorra la migración**, que es lo único que la hacía atractiva: los índices de orden y filtro
  (R21) traen migración de todos modos (fila 10).

### 4.3 El punto que hay que decidir: cómo se indexa una búsqueda por SUBCADENA

Se conserva la semántica de hoy: **subcadena** (`contains`), no prefijo. Cambiarla a prefijo sería
una regresión silenciosa para el selector de ingredientes, que hoy encuentra por fragmento.

Y aquí está el problema honesto: **un índice btree no acelera `LIKE '%texto%'`**. Solo el prefijo
(`'texto%'`, y aun así solo con `text_pattern_ops` o colación `C`). Servir una subcadena con índice
requiere un **GIN de trigramas**, o sea la extensión de Postgres **`pg_trgm`**.

**No se da por buena** (regla 7 de `CLAUDE.md`). Las dos salidas, para que el humano elija al
aprobar el spec:

| | **Vía A (recomendada)** | **Vía B (sin extensión)** |
| --- | --- | --- |
| Qué se instala | `CREATE EXTENSION IF NOT EXISTS pg_trgm` en la migración | nada |
| Índice de búsqueda | `GIN (name_normalized gin_trgm_ops)` en las 6 tablas | `btree (name_normalized text_pattern_ops)` en las 6 |
| Semántica | **subcadena**, como hoy | **prefijo**: `solucion` sí encuentra `Solución Buffer pH 7`, pero `buffer` no |
| Riesgo | una extensión más en la base; `down.sql` **no** hace `DROP EXTENSION` (podría estar en uso por otra cosa), solo borra los índices | regresión de comportamiento respecto de hoy (fila 11) |
| Cambio si se cambia de idea | dos líneas del adaptador y un índice | ídem |

**Los cuatro checks de `docs/architecture.md > Dependencias de terceros`, aplicados a `pg_trgm`:**
no aplican tal cual —no es un paquete de npm, no está en `package.json` y
`guard-dependencias-aprobadas` no la ve—. Lo que sí se puede afirmar sin red: `pg_trgm` es un
módulo **contrib del propio Postgres**, con su misma licencia (PostgreSQL License, tipo BSD/MIT), y
se libera con cada versión de Postgres. Lo que **no** se ha verificado y por tanto es un
desconocido (regla 6): que el proyecto de Supabase de este ERP la tenga habilitada o permita
habilitarla con el rol de `DIRECT_URL`. **Eso lo confirma el humano o la primera ejecución de la
migración**, y por eso la vía B existe escrita.

**Sin decisión, la implementación no arranca la tarea del índice de búsqueda** (`tasks.md > T4`).

### 4.4 Qué tablas toca la migración

**Una sola migración, siete tablas, una columna nueva.**

| Tabla | Columna nueva | Índice de búsqueda | Índices de orden/filtro |
| --- | --- | --- | --- |
| `products` | **`name_normalized`** (única columna nueva de la ficha) + backfill + `NOT NULL` | sí (nuevo) | sí |
| `presentations` | — (ya existe) | sí (nuevo; el único de hoy es el `UNIQUE` btree, que no sirve para subcadena) | sí |
| `recipes` | — (ya existe) | sí (nuevo; el de hoy es único **parcial**) | sí |
| `suppliers` | — (ya existe) | sí (nuevo; ídem) | sí |
| `supplier_catalog_lines` | — (ya existe) | sí (nuevo; el de hoy es **compuesto** y `name_normalized` no va en cabeza) | sí |
| `units` | — (ya existe) | sí (nuevo) | sí |
| `orders` | — (no busca, fila 3 / R17) | — | sí (`status`, `priority`, `created_at`) |

## 5. Listas blancas propuestas (propone la pregunta abierta 2)

Salen de lo que cada pantalla ya muestra y de los tipos `*View`. **`deletedAt` no aparece en
ninguna** (R7), ni tampoco `nameNormalized` (es el cómo, no el qué), ni `imagePath`, ni `steps`.

| Lista | Ordenable | Filtrable (forma) | Busca por `name` |
| --- | --- | --- | --- |
| productos | `name`, `presentationName`, `stock`, `qtyAlert`, `createdAt`, `updatedAt` | `presentationId` (select), `unitId` (select), `stock` (numberRange), `qtyAlert` (numberRange), `createdAt` (dateRange) | sí |
| presentaciones | `name`, `createdAt`, `updatedAt` | `createdAt` (dateRange) | sí |
| recetas | `name`, `createdAt`, `updatedAt` | `createdAt` (dateRange) | sí |
| proveedores | `name`, `createdAt`, `updatedAt` | `createdAt` (dateRange) | sí |
| catálogo de proveedor | `name`, `cost`, `minPurchase`, `deliveryTime`, `createdAt` | `presentationId` (select), `unitId` (select), `cost` (numberRange), `deliveryTime` (numberRange) | sí |
| unidades | `name`, `symbol`, `createdAt` | — | sí |
| pedidos | `orderYear`+`orderSequence` (el correlativo, como **un** campo `orderNumber`), `priority`, `status`, `createdAt`, `quantity`, `unitPrice` | `status` (select), `priority` (select), `createdAt` (dateRange) | **no** (R17) |

Cuatro notas que no son adorno:

- **`presentationName` en productos** no es una columna de `products`: es un `JOIN` a
  `presentations`. Prisma lo ordena con `orderBy: { presentation: { name: 'asc' } }`. Se declara
  ordenable porque la pantalla ya muestra esa columna; se declara **no filtrable por texto** (para
  eso está `presentationId`, que es un `select` y usa el índice existente
  `products_presentation_id_idx`).
- **`orderNumber` en pedidos** es el par `(orderYear, orderSequence)` presentado como un solo campo
  ordenable; el adaptador lo traduce a `orderBy: [{ orderYear: dir }, { orderSequence: dir }]`. Es
  la única traducción uno-a-dos del contrato, y existe porque el número visible no está guardado
  (lo compone `formatOrderNumber`).
- **`status` y `priority` son enums de Postgres**; el `select` valida contra
  `ORDER_STATUS_VALUES`/`ORDER_PRIORITY_VALUES` (conjunto cerrado, R19 de QC-33) y un valor de
  fuera se ignora como campo no declarado (R5). `priority` ordena por **orden de declaración del
  enum**, que es el orden de la prioridad y no el alfabético — está escrito en `schema.prisma` y no
  se toca.
- **`cost`, `minPurchase`, `quantity`, `unitPrice` son `Decimal(14,4)`**. El `numberRange` de QC-55
  emite `number`. En el **borde** el rango llega como `number` y el **adaptador** lo convierte a
  `Prisma.Decimal` antes de comparar; el dominio nunca ve un `Decimal` ni compara importes en coma
  flotante (`docs/architecture.md > Anti-patrones`).

## 6. Estructura de archivos

```
lib/modules/inventario/
  domain/list-query.ts          # NUEVO: tipos + fábrica de esquema + sanitize
  domain/product-queryable.ts   # NUEVO: lista blanca de productos
  domain/presentation-queryable.ts   # NUEVO: lista blanca de presentaciones
  domain/product-name.ts        # NUEVO: normalizeProductName (gemela de las otras cuatro)
  domain/page.ts                # `productQuerySchema` DESAPARECE (R24); `pageQuerySchema` se queda
  domain/list-products.ts       # + sanitize + log
  domain/list-presentations.ts  # idem
  ports/list-query-log.ts       # NUEVO: el puerto de R6
  adapters/driven/persistence/product-prisma.ts        # orderBy/where dinámicos + name_normalized
  adapters/driven/persistence/presentation-prisma.ts   # idem
lib/modules/recetas/      … mismas piezas (una lista)
lib/modules/proveedores/  … mismas piezas (dos listas)
lib/modules/unidades/     … mismas piezas (una lista, página opcional)
lib/modules/pedidos/      … mismas piezas (una lista, sin búsqueda)

lib/shared/observability/list-query-log.ts   # NUEVO: la ÚNICA implementación del puerto
lib/composition/index.ts                      # cablea esa implementación en los cinco módulos
db/migrations/<ts>_list_query_indexes/{migration.sql,down.sql}   # NUEVO
tests/guards/guard-contrato-listados.test.ts  # NUEVO (R32)
```

## 7. Unidades: la página opcional (R27, R28)

Hoy `listUnits(actor)` no recibe consulta y devuelve el catálogo entero acotado a `MAX_UNITS = 200`
(R40 de QC-32: ninguna consulta sin límite declarado). Pasa a `listUnits(input, actor)` con
`input` **opcional**:

- **sin `input`, o con `input` sin `page` ni `pageSize`** → se comporta **exactamente como hoy**:
  `listAll(MAX_UNITS)`, salida `readonly UnitRef[]`, y el selector de unidad del formulario de
  recetas no se entera. El orden, el filtro y la búsqueda **sí** se aplican si vienen.
- **con `page` o `pageSize`** → salida `Page<UnitRef>`, con 10/25 (R29).

La firma devuelve una **unión discriminada por la forma de la entrada**, no dos métodos: dos
métodos obligarían a QC-39 a elegir cuál llamar según lo que traiga la URL, que es justo la
decisión que este contrato quita de encima de las pantallas.

## 8. El log del campo omitido (R6)

`sanitize` es **pura** y devuelve `{ query, ignored: readonly string[] }`. El caso de uso pasa
`ignored` a un puerto:

```ts
// lib/modules/<m>/ports/list-query-log.ts   (declarado en los cinco módulos, §2.1)
export interface ListQueryLog {
  ignoredFields(listName: string, fields: readonly string[]): void;
}
```

Una **sola** implementación, en `lib/shared/observability/list-query-log.ts`, cableada en
`lib/composition/index.ts` (que sí puede importar `lib/shared/**`). Emite un `console.warn` con el
nombre del listado y los campos —**nunca** el valor buscado ni el contenido del filtro: podría ser
PII, y `docs/architecture.md > Anti-patrones` prohíbe registrarla—.

**Por qué puerto y no `console.warn` en el dominio:** el dominio no conoce el mundo exterior, y
—más práctico— R6 solo es testeable si el test puede **espiar** la llamada. Un `console.warn`
suelto se prueba parcheando la consola global, que ensucia el resto de la suite.

**Por qué no en la Server Action:** para que llegara ahí, `Page<T>` tendría que arrastrar la lista
de ignorados hasta la UI, y ese es el contrato que QC-55/QC-56 consumen. No se ensucia una salida
de negocio con un dato de diagnóstico.

## 9. Rutas, endpoints y Server Actions

**Ninguna ruta nueva y ningún route handler.** Cambian, en su forma de entrada, las Server Actions
de listado que ya existen (productos, presentaciones, recetas, proveedores, catálogo, unidades,
pedidos): pasan a aceptar `ListQuery`. Siguen siendo Server Actions
(`docs/architecture.md > Server Actions vs Route Handlers`) y siguen validando dentro del caso de
uso (R30).

Contrato I/O de las siete, en una línea: `(input: unknown, actor) -> Promise<Page<TView>>`, con
`unidades` como se describe en §7.

## 10. Migración e índices

Una migración, `<ts>_list_query_indexes`, con su `down.sql` (R22, fila 10, guardia de migraciones).

### 10.1 UP, en orden

1. `ALTER TABLE products ADD COLUMN name_normalized text;`
2. **Backfill en SQL** de `products.name_normalized` (R23). El SQL puede reproducir la
   normalización de los nombres existentes con
   `regexp_replace(lower(translate(name, 'áàäâéèëêíìïîóòöôúùüûñÁÀÄÂÉÈËÊÍÌÏÎÓÒÖÔÚÙÜÛÑ', 'aaaaeeeeiiiioooouuuunAAAAEEEEIIIIOOOOUUUUN')), '[^a-z0-9]', '', 'g')`
   — se usa `translate` y no `unaccent` porque no exige extensión y porque aquí es un **cálculo de
   una vez**, no un índice: que no sea `IMMUTABLE` da igual. La base está prácticamente vacía y el
   test de integración comprueba que la columna coincide con lo que devuelve la función de
   TypeScript para los mismos nombres.
3. `ALTER TABLE products ALTER COLUMN name_normalized SET NOT NULL;`
4. Índices de búsqueda en las seis tablas buscables (vía A o B, §4.3).
5. Índices de orden y filtro (§10.2).

### 10.2 Índices de orden y filtro

Solo los que **no existen ya**. Los que sí: `products_presentation_id_idx`, `products_unit_id_idx`,
`supplier_catalog_lines_presentation_id_idx`, `supplier_catalog_lines_unit_id_idx`,
`orders_recipe_id_idx`, `orders_unit_id_idx`, `orders_order_year_order_sequence_key` (sirve para
ordenar por el correlativo).

Nuevos, uno por campo declarado ordenable o filtrable que no lo tenga: `name` y `created_at` /
`updated_at` de las seis tablas con nombre; `stock` y `qty_alert` de `products`; `cost`,
`min_purchase` y `delivery_time` de `supplier_catalog_lines`; `status`, `priority`, `created_at`,
`quantity` y `unit_price` de `orders`; `symbol` de `units`.

Se declaran **parciales** (`WHERE deleted_at IS NULL`) en las tablas con borrado lógico
—`products`, `recipes`, `suppliers`, `supplier_catalog_lines`, `orders`—: es el filtro que **toda**
consulta de esos listados lleva (R7), así el índice es más pequeño y solo cubre lo que se consulta.
Prisma **no modela índices parciales**, exactamente como ya pasa con `recipes_name_unique` y
`suppliers_name_unique`, así que **viven escritos a mano en el `migration.sql`** y no en
`schema.prisma`, con el comentario correspondiente en el modelo.

### 10.3 La mina que hay que desarmar

`db/schema.prisma` documenta, modelo por modelo, que `products`, `recipes`,
`supplier_catalog_lines` y `orders` tienen **FK, CHECK y RLS escritos a mano** que Prisma **no
conoce**. Una migración generada con `prisma migrate dev --create-only` sobre esas tablas emite
`DROP CONSTRAINT` para todo eso. **El `migration.sql` generado se revisa a mano línea a línea antes
de aplicarlo**, y `tasks.md > T5` lo pone como criterio de hecho. Es el riesgo número uno de esta
ficha: la única columna nueva vive precisamente en `products`, que es la tabla con más drift del
repo.

### 10.4 DOWN

`down.sql` borra los índices creados y hace `DROP COLUMN products.name_normalized`. **No** hace
`DROP EXTENSION pg_trgm` si se eligió la vía A: borrar una extensión que otra cosa podría estar
usando es peor que dejarla. El `down.sql` lo dice en un comentario, no en silencio.

## 11. Dependencias

**Ninguna dependencia nueva de npm.** El contrato es `zod` (ya aprobado), la aritmética de página es
`lib/shared/pagination` (ya existe) y los `where`/`orderBy` dinámicos son de Prisma
(`Prisma.ProductWhereInput` y compañía ya se usan en los adaptadores). `package.json` no cambia y
`docs/dependencias.md` tampoco.

Lo único que hay que aprobar es **`pg_trgm`**, que **no** es una dependencia de npm sino una
extensión de Postgres: §4.3 lo desarrolla y lo deja como pregunta abierta 3.

## 12. Verificación (cómo se prueba cada bloque)

| Bloque | Nivel | Qué demuestra |
| --- | --- | --- |
| `sanitize` + esquemas | unit, por módulo | R1, R3, R4, R5, R7, R8, R9, R12, R20, R30 |
| Guardia de contrato | `tests/guards/guard-contrato-listados.test.ts` | R32 (los cinco esquemas dicen lo mismo), R31 (ningún `list-query.ts` importa `lib/shared`) |
| Casos de uso, con repositorio y log mockeados | unit | R6, R11, R17, R24, R25, R28, R33, R34 |
| Adaptadores driven | unit + integración | R10, R13, R14, R15, R16, R18, R19, R29 |
| Migración | `tests/unit/<m>/schema/*-migration.test.ts` + integración | R21, R22, R23 |
| Lo que ya pasaba | la suite de hoy, **sin tocar sus asertos de comportamiento** | R26 |
| E2E | **ninguno**, y es deliberado | R35 |

**Test en negativo que no puede faltar** (es donde esta feature se rompería sin que nadie lo note):
pedir orden por `deletedAt` y comprobar **las tres cosas a la vez** — que la consulta responde 200,
que el orden aplicado es el de por defecto, y que el log recibió el campo. Comprobar solo la
primera pasa en verde con un `catch` vacío.

## 13. Riesgos

1. **El drift de `products`** (§10.3). Mitigación: revisión manual del SQL generado, y los tests de
   esquema que ya vigilan las FK escritas a mano.
2. **`pg_trgm` sin decidir** (§4.3). Mitigación: la vía B está escrita y cuesta dos líneas.
3. **Cinco copias del contrato** (§2.1). Mitigación: la guardia de equivalencia, que es lo que
   convierte la duplicación en una decisión y no en un descuido.
4. **QC-56 depende de esto** y de que `columnId` sea el nombre del campo (§3.1). Si el humano
   prefiere otra grafía, se cambia **aquí** antes de que QC-56 escriba las columnas; después cuesta
   un traductor por pantalla.
