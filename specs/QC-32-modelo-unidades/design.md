# QC-32 — modelo-unidades · design.md

> Zona: `backend` · Complejidad: `high` · depends_on: `QC-24` ·
> Rama: `feature/QC-32-modelo-unidades`
>
> El **qué** está en `requirements.md` (R1–R28) y su alcance lo cerró el humano el 2026-09-02.
> Aquí va el **cómo**: la forma exacta del modelo `Unit`, la migración que **altera dos tablas
> que no son suyas** y su `down.sql`, la guardia de datos que la hace fallar antes que perder
> nada, el armazón del módulo `unidades` con su contrato, el conjunto arrancador y el
> reapuntado del código de `inventario` que hoy trata la unidad como texto.
>
> **Ronda 3 (2026-09-03).** El humano corrigió el alcance: el conjunto arrancador pasa a ser
> **cuatro filas de la propia migración** y el aparato del seed se retira entero. Lo que cambia
> está en § 1, § 5.1, § 5.4, § 6 y § 9, marcado ronda a ronda y sin borrar lo anterior. Lo que
> **no** cambia: la migración que altera dos tablas ajenas, sus dos guardias de datos, el
> `down.sql` y el reapuntado a `unit_id`.
>
> Precedentes literales que se copian, no se reinventan: **QC-24 — modelo-recetas**
> (`specs/QC-24-modelo-recetas/`, `db/migrations/20260902163256_recipes_and_recipe_lines/`) para
> la FK que cruza de módulo como escalar sin `@relation`, la forma del módulo nuevo y el reparto
> de tests; **QC-14/QC-20** (`db/migrations/20260902005510_products_and_presentations/`,
> `.../20260902170759_product_audit_and_presentation_uniqueness/`) para la columna normalizada
> persistida con índice único y para el patrón de migración que altera una tabla existente;
> ~~**QC-6** (`scripts/seed.ts`, `lib/modules/identity/domain/seed-initial-access.ts`) para el
> seed idempotente que **lee lo que falta y crea exactamente eso**~~ — precedente **ya no
> aplicable** desde la ronda 3: esta ficha no tiene seed de aplicación (§ 6.2).

---

## 1. Qué construye esta feature, y qué archivos toca

| Archivo | Qué se hace |
| --- | --- |
| `db/schema.prisma` | **Nuevo** modelo `Unit` con `/// @module unidades`. **Se modifican** `Product` (`unit: String?` → `unitId: String? @db.Uuid`) y `RecipeLine` (`unit: String` → `unitId: String @db.Uuid`). |
| `db/migrations/<ts>_units_catalog/migration.sql` | UP: guardia de datos (§ 4.1), `CREATE TABLE units`, índice único del nombre normalizado, **el `INSERT` de las cuatro unidades arrancadoras (§ 6.1, ronda 3)**, las dos columnas `unit_id` con sus FK escritas a mano, los índices de FK, el `DROP COLUMN unit` de las dos tablas y los dos `ALTER` de RLS. |
| `db/migrations/<ts>_units_catalog/down.sql` | DOWN manual: guardia simétrica (§ 4.6) y vuelta al esquema exacto anterior. |
| `lib/modules/unidades/index.ts` | **Nuevo**: contrato público del módulo. |
| `lib/modules/unidades/domain/unit-name.ts` | **Nuevo**: `normalizeUnitName`, la única definición de la normalización (R4). |
| `lib/modules/unidades/domain/unit-catalog.ts` | **Nuevo**: `UnitId`, `UnitRef`, `UnitCatalog` — la costura hacia los demás módulos (§ 5.2). |
| `lib/modules/unidades/ports/.gitkeep`, `adapters/driven/.gitkeep`, `adapters/driving/.gitkeep` | **Nuevo**: las tres carpetas del armazón nacen vacías, igual que en `lib/modules/recetas` (§ 5.1, ronda 3). Las llena QC-38. |
| ~~`lib/modules/unidades/domain/starter-units.ts`~~ | **RETIRADO en la ronda 3** (§ 6.2). El arrancador vive en el `INSERT` de la migración. |
| ~~`lib/modules/unidades/domain/seed-units.ts`~~ | **RETIRADO en la ronda 3**: no hay caso de uso de seed. |
| ~~`lib/modules/unidades/ports/unit-seed-repository.ts`~~ | **RETIRADO en la ronda 3**: sin caso de uso no hay puerto. |
| ~~`lib/modules/unidades/adapters/driven/persistence/unit-seed-repository-prisma.ts`~~ | **RETIRADO en la ronda 3**: hoy **ningún** archivo del repo consulta `units`. |
| `lib/composition/index.ts` | **Vuelve a quedar sin tocar por esta ficha** (ronda 3, § 5.4): `unidades` no cablea nada. |
| `scripts/seed.ts` | **Vuelve a quedar sin llamada de unidades** (ronda 3): solo roles y usuario inicial de QC-6. |
| `lib/modules/inventario/domain/product-input.ts`, `product-view.ts`, `product-catalog.ts` | `unit: string` → `unitId: UnitId` (R19). |
| `lib/modules/inventario/adapters/driven/persistence/product-prisma.ts`, `adapters/driving/product-actions.ts` | Reapuntado del campo (select, create, update, lectura del `FormData`). |
| `tests/unit/unidades/schema/unidades-schema.test.ts`, `.../unidades-migration.test.ts`, `tests/unit/unidades/domain/unit-name.test.ts`, `tests/unit/unidades/module-contract.test.ts` | Estáticos y unitarios (§ 9). En la ronda 3, `unidades-migration.test.ts` **gana** el bloque del arrancador (R25, R26) y `module-contract.test.ts` **rehace** el criterio de «quién consulta la tabla»; `domain/seed-units.test.ts` y `seed-wiring.test.ts` **se retiran** con el seed. |
| `tests/integration/unidades/unidades-constraints.int.test.ts` | Contra Postgres real (§ 9). ~~`unidades-seed.int.test.ts`~~ **retirado en la ronda 3**. |
| Tests existentes de `inventario` que nombran `unit` | Se **acotan** al campo nuevo: `tests/unit/inventario/product-input.test.ts`, `product-prisma.test.ts`, `product-actions.test.ts`, `product-service.test.ts`, `tests/unit/inventario/schema/inventario-schema.test.ts`, `tests/integration/inventario/product-crud.int.test.ts`, `inventario-constraints.int.test.ts`; y de `recetas`: `tests/unit/recetas/schema/recetas-schema.test.ts`, `recetas-migration.test.ts`, `tests/integration/recetas/recetas-constraints.int.test.ts`. Ver § 7. |

---

## 2. Modelo de datos

### 2.1 `Unit` → tabla `units`

```prisma
/// Catalogo de unidades de medida (QC-32). Modulo propio `unidades`: `inventario`,
/// `recetas` y lo que venga lo consumen por su contrato publico `@/lib/modules/unidades`,
/// nunca por esta tabla.
///
/// NO lleva `deletedAt` a proposito (decision cerrada 11, R8), igual que `Role` y
/// `Presentation`: el borrado logico es un UPDATE y una FK no puede bloquear un UPDATE, asi
/// que la columna neutralizaria en silencio la unica garantia real de R13.
///
/// `nameNormalized` la calcula el dominio de `unidades` (`normalizeUnitName`, funcion pura) y
/// se persiste junto a `name` en toda escritura. El `@@unique` es la UNICA garantia de la
/// unicidad (R5): no hay comprobacion previa por igualdad -- seria una carrera.
///
/// `symbol` NO tiene indice unico y es deliberado (R7, pregunta abierta 1): la identidad de la
/// unidad es su nombre.
/// @module unidades
model Unit {
  id             String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  name           String
  nameNormalized String   @map("name_normalized")
  symbol         String?
  createdAt      DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt      DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  @@unique([nameNormalized], map: "units_name_normalized_key")
  @@map("units")
}
```

| Campo | Columna | Tipo Postgres | Nulo | Requisito |
| --- | --- | --- | --- | --- |
| `id` | `id` | `UUID DEFAULT gen_random_uuid()` | no | R1 |
| `name` | `name` | `TEXT` | **no** | R1, R2, R6 |
| `nameNormalized` | `name_normalized` | `TEXT` | **no** | R4, R5 |
| `symbol` | `symbol` | `TEXT` | **sí** | R1, R3, R6, R7 |
| `createdAt` | `created_at` | `TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP` | no | R9 |
| `updatedAt` | `updated_at` | `TIMESTAMPTZ(6)` (lo rellena `@updatedAt`) | no | R9 |

- **`@@unique` total, no parcial.** `presentations` lo resolvió así y por el mismo motivo: sin
  `deleted_at` no hay filas «muertas» que liberar (R8). Aquí Prisma **sí** modela el índice —a
  diferencia de `recipes`—, así que vive en el esquema y no a mano.
- **`symbol` es `TEXT` anulable**, no `TEXT NOT NULL DEFAULT ''`: R3 exige que la ausencia sea
  ausencia. Quien pinte la unidad sin símbolo muestra el nombre, y eso es QC-38/QC-39.
- **No hay `Unit[]` de vuelta hacia `Product` ni `RecipeLine`**: la relación no existe para
  Prisma (§ 4.3), solo para Postgres.

### 2.2 Lo que cambia en `Product` (`inventario`)

```prisma
  // antes:  unit  String?
  unitId         String?   @map("unit_id") @db.Uuid
```

Opcional, como fijó QC-14 y confirma la decisión 7 (R10). **Escalar sin `@relation`** (§ 4.3), con
`@@index([unitId], map: "products_unit_id_idx")`.

### 2.3 Lo que cambia en `RecipeLine` (`recetas`)

```prisma
  // antes:  unit  String
  unitId    String   @map("unit_id") @db.Uuid
```

Obligatorio, como fijó QC-24 y confirma la decisión 8 (R11). **Escalar sin `@relation`**, con
`@@index([unitId], map: "recipe_lines_unit_id_idx")`.

> Los tres comentarios «OJO» que ya viven en `Product` y `RecipeLine` se **amplían**, no se
> sustituyen: el siguiente que lea el esquema tiene que entender por qué `unit_id` no tiene
> `@relation` sin ir a buscar este archivo.

---

## 3. La normalización del nombre (R4)

Misma pieza que `normalizePresentationName` (QC-20) y `normalizeRecipeName` (QC-24), en el dominio
de `unidades` y publicada por su contrato:

```ts
// lib/modules/unidades/domain/unit-name.ts
/** Forma canonica para comparar nombres de unidad: recorta, ignora mayusculas, quita acentos y
 *  quita todo lo que no sea [a-z0-9]. «Mililitro», «mililitro» y «MILI-LITRO» producen la misma
 *  clave. Es la UNICA definicion (R4): la columna `name_normalized` y cualquier consumidor
 *  futuro usan esta. */
export function normalizeUnitName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]/g, '');
}
```

**Por qué se copia en vez de compartirse.** Existe ya dos veces en el repo (`inventario`,
`recetas`) y ahora tres. La alternativa —moverla a `lib/shared/`— se evalúa y se descarta en
§ 8.4: `lib/shared/**` es hoja del grafo y no conoce módulos, así que técnicamente cabría, pero
convertiría el criterio de identidad de tres catálogos distintos en **una sola pieza acoplada**
que ninguna feature puede cambiar sin tocar a las otras dos. Son doce líneas puras, con test
propio en cada módulo.

**Por qué no es columna generada:** mismo motivo técnico que QC-24 § 3 —`unaccent()` es `STABLE`,
no `IMMUTABLE`, y no sirve ni para una columna generada ni para un índice—. El riesgo aceptado es
el mismo: un `INSERT` por consola puede dejar `name_normalized` incoherente con `name`.

---

## 4. La migración: lo delicado de esta ficha

Es la primera migración del repo que **borra columnas de dos tablas de otros módulos**. Todo el
diseño de abajo existe para que no se pierda un dato ni por accidente ni por prisa.

### 4.1 La guardia de datos, lo PRIMERO del UP (R22)

```sql
-- QC-32: la migracion supone la base VACIA de unidades escritas (decision cerrada 6).
-- Si NO lo esta, se PARA aqui: perder el texto de unidad seria perder el dato, y esta
-- decision se reabre con el humano (requirements.md > pregunta abierta 2).
DO $$
DECLARE
  productos_con_unidad BIGINT;
  lineas_con_unidad    BIGINT;
BEGIN
  SELECT count(*) INTO productos_con_unidad FROM "products" WHERE "unit" IS NOT NULL;
  SELECT count(*) INTO lineas_con_unidad    FROM "recipe_lines" WHERE "unit" IS NOT NULL;
  IF productos_con_unidad > 0 OR lineas_con_unidad > 0 THEN
    RAISE EXCEPTION
      'QC-32: hay % producto(s) y % linea(s) de receta con unidad escrita. La migracion se detiene para no perder ese dato: reabre la decision (specs/QC-32-modelo-unidades/requirements.md, pregunta abierta 2) antes de aplicarla.',
      productos_con_unidad, lineas_con_unidad;
  END IF;
END $$;
```

- **Va la primera**, antes del `CREATE TABLE`. Prisma Migrate ejecuta cada `migration.sql` dentro
  de **una transacción**, así que un `RAISE EXCEPTION` deshace todo lo anterior y la migración
  queda sin aplicar y sin marcar: eso es exactamente lo que R22 pide («no DEBE aplicar ninguno de
  sus cambios»). Aun así se pone primero para que el mensaje llegue antes que cualquier otro
  error.
- `recipe_lines."unit"` es `NOT NULL`, así que `WHERE "unit" IS NOT NULL` cuenta **todas** sus
  filas. Se escribe con el predicado igualmente, para que las dos ramas se lean iguales y para que
  siga siendo correcta si alguien afloja esa columna antes de aplicar.
- El mensaje **dice qué hacer**, no solo que falló. Un `RAISE` sin salida es una pared.

### 4.2 Orden del UP

1. Guardia de datos (§ 4.1).
2. `CREATE EXTENSION IF NOT EXISTS pgcrypto;` (autocontenida, como QC-4/QC-14/QC-24).
3. `CREATE TABLE "units" (...)` con sus seis columnas.
4. `CREATE UNIQUE INDEX "units_name_normalized_key" ON "units"("name_normalized");`
5. `ALTER TABLE "products" ADD COLUMN "unit_id" UUID;`
6. `ALTER TABLE "recipe_lines" ADD COLUMN "unit_id" UUID NOT NULL;` — se puede porque la guardia
   ya garantizó que `recipe_lines` está vacía; si tuviera filas, Postgres fallaría aquí por sí
   solo, que es la segunda red.
7. Las dos FK escritas a mano (§ 4.3).
8. `CREATE INDEX "products_unit_id_idx"` y `"recipe_lines_unit_id_idx"`.
9. `ALTER TABLE "products" DROP COLUMN "unit";` y `ALTER TABLE "recipe_lines" DROP COLUMN "unit";`
10. `ALTER TABLE "units" ENABLE ROW LEVEL SECURITY;` + `... FORCE ROW LEVEL SECURITY;` (R21).

**Los `DROP COLUMN` van al final, después de todo lo demás.** No cambia el resultado —la
transacción es atómica— pero sí el orden en que se lee el archivo: primero se construye lo nuevo,
al final se quita lo viejo.

### 4.3 Las dos FK escritas a mano (R12, R13, R18)

```sql
ALTER TABLE "products" ADD CONSTRAINT "products_unit_id_fkey"
  FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "recipe_lines" ADD CONSTRAINT "recipe_lines_unit_id_fkey"
  FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
```

Es literalmente el razonamiento de QC-24 § 4.1, aplicado a la frontera nueva. Dos garantías a la
vez:

1. **Integridad real**: un producto o una línea apuntando a una unidad inexistente es basura
   (R12), y eso solo lo garantiza una FK de verdad.
2. **Frontera de módulo**: si la FK llevara `@relation`, Prisma ofrecería
   `prisma.product.findMany({ include: { unit: true } })` — una lectura de la tabla de `unidades`
   desde `inventario` **que ninguna guardia detecta**, porque no es un import. La guardia de
   módulos busca `prisma.<modelo>` y rutas de import; un `include` no es ni una cosa ni la otra.

`ON DELETE RESTRICT` es la decisión 10 y es la **única** garantía real de R13 — de ahí que la
decisión 11 prohíba `deleted_at` en el catálogo: un borrado lógico es un `UPDATE` y ninguna FK
reacciona a un `UPDATE`, así que la columna dejaría R13 en el aire sin que nada se pusiera rojo.
`ON UPDATE CASCADE` por convención del repo (las cinco FK que ya existen lo llevan).

Coste aceptado, el mismo de QC-24: Prisma no valida estas FK, el error llega en tiempo de
ejecución, y toda migración futura de `products` o `recipe_lines` hay que revisarla a mano para
que el drift no las borre. Va escrito en la cabecera del `migration.sql`.

### 4.4 RLS (R21)

```sql
ALTER TABLE "units" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "units" FORCE ROW LEVEL SECURITY;
```

Sin policies, *deny by default*, igual que QC-4, QC-14 y QC-24. No es la frontera de autorización
—esa vive en el service y la fija QC-38—. `tests/guards/guard-rls-force.test.ts` cubre la
migración nueva sin tocar la guardia.

### 4.5 Identificadores en inglés (R20)

`units`, `unit_id`, `name_normalized`, `symbol`, `units_name_normalized_key`,
`products_unit_id_fkey`, `recipe_lines_unit_id_fkey`, `products_unit_id_idx`,
`recipe_lines_unit_id_idx`. Sin excepciones.

### 4.6 El `down.sql` (R23, R24)

```sql
-- QC-32 DOWN. Simetrico al UP: primero la guardia, despues la reversion.
DO $$
DECLARE
  referencias BIGINT;
BEGIN
  SELECT (SELECT count(*) FROM "products" WHERE "unit_id" IS NOT NULL)
       + (SELECT count(*) FROM "recipe_lines")
    INTO referencias;
  IF referencias > 0 THEN
    RAISE EXCEPTION
      'QC-32 down: hay % fila(s) apuntando a una unidad del catalogo. Revertir borraria esa referencia sin poder reconstruir el texto anterior: vacia o migra esas filas a mano antes de revertir.',
      referencias;
  END IF;
END $$;

ALTER TABLE "recipe_lines" DROP CONSTRAINT "recipe_lines_unit_id_fkey";
ALTER TABLE "products"     DROP CONSTRAINT "products_unit_id_fkey";
DROP INDEX "recipe_lines_unit_id_idx";
DROP INDEX "products_unit_id_idx";
ALTER TABLE "recipe_lines" DROP COLUMN "unit_id";
ALTER TABLE "products"     DROP COLUMN "unit_id";
ALTER TABLE "products"     ADD COLUMN "unit" TEXT;
ALTER TABLE "recipe_lines" ADD COLUMN "unit" TEXT NOT NULL;
DROP TABLE "units";
```

Tres cosas que no son evidentes:

- **La guardia del DOWN no está en ninguna decisión cerrada; sale de aplicar la decisión 6 al
  revés** («falla en vez de descartar»), y por eso tiene requisito propio (R24). Sin ella, el
  DOWN o bien pierde en silencio la unidad de cada fila, o bien revienta con un error de Postgres
  que no explica nada.
- **`ADD COLUMN "unit" TEXT NOT NULL` sin `DEFAULT` solo es legal si `recipe_lines` está vacía**,
  y la guardia acaba de garantizarlo. Es deliberado no poner un `DEFAULT ''`: eso dejaría un
  esquema **parecido** al anterior, no el **exacto** que R23 pide, y sembraría unidades en blanco.
- **`pgcrypto` no se toca** (la crean también QC-4, QC-14 y QC-24), y el orden es el inverso
  exacto del UP.

R23 se cierra de verdad con el ciclo `db:migrate` → `db:rollback` → `db:migrate` (T10), no con el
test estático, que solo lee texto.

---

## 5. El módulo `unidades`

### 5.1 Carpetas que nacen

**Actualizado en la ronda 3 (2026-09-03).** El árbol que queda, sin el aparato del seed:

```
lib/modules/unidades/
  index.ts                       # CONTRATO PUBLICO: solo reexporta de ./domain
  domain/
    unit-name.ts                 # normalizeUnitName (R4)
    unit-catalog.ts              # UnitId, UnitRef, UnitCatalog (R16, R19)
  ports/.gitkeep                 # vacia: no hay puerto todavia (lo trae QC-38)
  adapters/
    driven/.gitkeep              # vacia: NADIE consulta `units` hoy (R26)
    driving/.gitkeep             # vacia: la llena QC-38
```

Lo que había hasta la ronda 2 y **se retiró**: `domain/starter-units.ts`, `domain/seed-units.ts`,
`ports/unit-seed-repository.ts` y
`adapters/driven/persistence/unit-seed-repository-prisma.ts`. Las tres carpetas quedan vacías con
`.gitkeep`, **igual que `lib/modules/recetas`** —el precedente del repo para un módulo que hoy es
solo modelo y contrato—. La guardia de módulos prohíbe cualquier carpeta que no sea `domain/`,
`ports/` o `adapters/`, y sigue verde con las tres presentes y vacías.

```ts
// lib/modules/unidades/index.ts — CONTRATO PUBLICO del modulo `unidades`.
// Solo reexporta simbolos de ./domain. Debe poder importarse desde un componente de cliente sin
// arrastrar servidor: nada de 'use server', @prisma/client ni next/* en su cierre de imports.
export { normalizeUnitName } from './domain/unit-name';
export type { UnitCatalog, UnitId, UnitRef } from './domain/unit-catalog';
```

`unidades` **no** hay que añadirlo a `REQUIRED_MODULES` de
`tests/guards/guard-arquitectura-modulos.test.ts`: la guardia descubre los módulos leyendo
`lib/modules/` y le aplica todas las demás reglas igual. Tocar la guardia no es de esta ficha.

### 5.2 Lo que publica el contrato hacia los demás módulos (R16, R19)

```ts
// lib/modules/unidades/domain/unit-catalog.ts
/** Identificador de una unidad visto DESDE FUERA de `unidades`. Es lo unico que otro modulo
 *  guarda de una unidad (p. ej. `products.unit_id`, `recipe_lines.unit_id`). */
export type UnitId = string;

/** Lo que otro modulo puede saber de una unidad sin tocar su tabla. `symbol` es `null` cuando la
 *  unidad no lo declara (R3): quien la pinte muestra el nombre. */
export type UnitRef = {
  readonly id: UnitId;
  readonly name: string;
  readonly symbol: string | null;
};

/** Servicio que `unidades` ofrece a los demas modulos (`docs/architecture.md > Dominio` n.o 2:
 *  «se comparten servicios via interfaz, nunca repositorios ni tablas»). Lo implementa un
 *  adaptador driven DE UNIDADES —el unico que puede tocar `prisma.unit`— y lo cablea
 *  `lib/composition`. Esta ficha NO lo implementa: no hay consumidor todavia (QC-38/QC-33). */
export interface UnitCatalog {
  /** Referencias de las unidades existentes entre los ids pedidos. Los ids que no existan
   *  simplemente no vienen en la respuesta. */
  findRefs(ids: readonly UnitId[]): Promise<readonly UnitRef[]>;
}
```

Mismo patrón, mismas razones y misma forma que `ProductCatalog` (QC-24 § 5.2): el servicio lo
publica **el dueño del dato**, porque su implementación tiene que poder ejecutar `prisma.unit` y
eso solo lo permite la guardia dentro de `unidades`. Son **solo tipos**: desaparecen al compilar,
así que no son código muerto — son la costura que la FK de § 4.3 hace inevitable.

### 5.3 El reapuntado de `inventario` (R19)

`unit` ya existe como texto en cinco archivos de producción de `inventario` (QC-14 + QC-20). El
cambio es mecánico y **no** añade lógica:

| Archivo | Antes | Después |
| --- | --- | --- |
| `domain/product-input.ts` | `unit: z.string().trim().nullish()` | `unitId: z.string().uuid().nullish()` |
| `domain/product-view.ts` | `unit?: string \| null` / `unit: string \| null` | `unitId?: UnitId \| null` / `unitId: UnitId \| null` |
| `domain/product-catalog.ts` | `ProductRef.unit: string \| null` | `ProductRef.unitId: UnitId \| null` |
| `adapters/driven/persistence/product-prisma.ts` | `unit: true` / `unit: row.unit` / `unit: data.unit ?? null` | lo mismo con `unitId` |
| `adapters/driving/product-actions.ts` | `unit: readOptionalFormString(formData, 'unit')` | `unitId: readOptionalFormString(formData, 'unitId')` |

Tres decisiones dentro de ese cambio:

- **`ProductRef` lleva `unitId`, no un `UnitRef` embebido.** Quien necesite el nombre de la unidad
  para pintarla pide `UnitCatalog.findRefs`. Embeberla obligaría a `inventario` a resolver el
  catálogo en cada lectura de producto —un `include` que ni existe— y a que el contrato de
  `inventario` arrastrara el de `unidades` hacia sus consumidores.
- **`inventario` importa `UnitId` por el barrel** (`@/lib/modules/unidades`), que es exactamente
  lo que la tabla de `docs/architecture.md > La regla de dependencias` permite desde `domain/`.
- **`unitId` sigue siendo opcional en el esquema zod** (R10). Que el uuid **exista** no lo valida
  zod: lo rechaza la base con `23503` (R12). Traducir ese error a un mensaje de usuario es de
  QC-38 —y va a tropezar con lo que QC-24 § 10.1 dejó anotado: por la API tipada, Prisma convierte
  el SQLSTATE en `P2003` antes de que llegue a `meta.code`—.

### 5.4 `lib/composition/index.ts` — **ANULADA en la ronda 3 (2026-09-03)**

Decía que aquí sí había algo que cablear, porque había un puerto y un adaptador reales: el seed.
El texto era:

> ```ts
> // lib/composition/index.ts (añadido por QC-32)
> import { createSeedStarterUnits } from '@/lib/modules/unidades';
> import { unitSeedRepositoryPrisma } from '@/lib/modules/unidades/adapters/driven/persistence/unit-seed-repository-prisma';
>
> export const unidades = {
>   seedStarterUnits: createSeedStarterUnits({ repository: unitSeedRepositoryPrisma }),
> } as const;
> ```

**Ya no.** Retirado el seed, `unidades` **no cablea nada** y `lib/composition/index.ts` vuelve a
quedar como con QC-24: sin `export const unidades`. El `UnitCatalog` que publica el contrato
(§ 5.2) lo implementa y cablea **QC-38**, cuando haya consumidor. Que la composición **no** nombre
ningún seed de unidades es la mitad negativa de **R26**, y `module-contract.test.ts` lo vigila.

---

## 6. El conjunto arrancador: cuatro filas de la migración (R25, R26)

> **Reescrita entera en la ronda 3 (2026-09-03)**, por la corrección de alcance del humano
> (`requirements.md` > decisiones cerradas, fila del 2026-09-03). Lo que decía esta sección
> —`STARTER_UNITS` con **cinco** unidades en `domain/starter-units.ts` y el caso de uso
> idempotente `seedStarterUnits` de § 6.2, cableado en la composición y llamado por
> `scripts/seed.ts`— **queda anulado**: se implementó en las rondas 1 y 2 y se ha retirado. La
> historia está en `progress/impl_QC-32-modelo-unidades.md`.

### 6.1 Las cuatro unidades, en el SQL

El catálogo nace **con la tabla**. En `db/migrations/20260903121404_units_catalog/migration.sql`,
justo **después** del `CREATE UNIQUE INDEX "units_name_normalized_key"` y **antes** de los `ALTER
TABLE "units" … ROW LEVEL SECURITY`:

```sql
INSERT INTO "units" ("name", "name_normalized", "symbol", "updated_at") VALUES
  ('mililitro', 'mililitro', 'ml', CURRENT_TIMESTAMP),
  ('litro',     'litro',     'l',  CURRENT_TIMESTAMP),
  ('gramo',     'gramo',     'gr', CURRENT_TIMESTAMP),
  ('kilogramo', 'kilogramo', 'kg', CURRENT_TIMESTAMP);
```

Cuatro cosas de este bloque no son cosméticas:

1. **El orden respecto al RLS.** `FORCE ROW LEVEL SECURITY` sin policies deniega **también al
   dueño de la tabla**, que es con quien se conecta Prisma (§ 4.4). Un `INSERT` colocado después
   del `FORCE` no insertaría nada. Va antes, y el test estático lo comprueba.
2. **`updated_at` va explícito.** `id` y `created_at` tienen `DEFAULT`; `updated_at` es
   `NOT NULL` **sin** default (lo rellena Prisma en tiempo de ejecución, § 2.1), así que en SQL
   crudo hay que darlo.
3. **`name_normalized` se escribe LITERAL**, y es el punto frágil de la ficha: no hay forma de
   llamar a `normalizeUnitName` (TypeScript, § 3) desde una migración. Es un duplicado que se
   puede desincronizar en silencio —cambiar la normalización o un literal y que nadie se entere—,
   y por eso **R26** existe y lo vigila un test que importa la función real y la aplica a los
   literales extraídos del SQL (§ 9).
4. **`down.sql` no necesita nada nuevo**: su `DROP TABLE "units"` se lleva las cuatro filas. Su
   guardia sigue mirando lo que apunta al catálogo, no el catálogo (§ 4.6): cuatro unidades
   **sin** referencias no bloquean la reversión, y eso es correcto.

Los nombres van en **minúscula** y las **cuatro** llevan símbolo (pregunta abierta 4, cerrada por
el humano). «unidad» **no** está: se retiró del arrancador. El símbolo sigue siendo **opcional** en
la columna (R3) aunque ninguna fila arrancadora estrene ya la ausencia; quien lo estrene será una
unidad dada de alta por QC-38, y lo cubre el test de integración «acepta una unidad sin simbolo».

Los símbolos no se normalizan ni se comparan (R7), y la normalización **ignora mayúsculas**, así
que `litro` y `mililitro` son claves distintas y no chocan contra el índice único.

### 6.2 Por qué ya no hay caso de uso, y qué se retiró

Un catálogo cerrado de cuatro filas que nace con su tabla no necesita un caso de uso idempotente
que lo siembre: la idempotencia la da `_prisma_migrations` —una migración se aplica una vez—, no un
`findMany` previo. Retirado el seed, **ningún archivo del repositorio consulta `units`**: ni el
dominio, ni la composición, ni `scripts/seed.ts`. Esa es la frontera que R15/R16 protegían con «un
solo archivo puede tocar la tabla», leída al día de hoy, y **no queda más floja**: lo que antes era
«exactamente un sitio» ahora es «ninguno», y `module-contract.test.ts` ejercita el barrido contra
una entrada sintética con `prisma.unit.findMany` para demostrar que la lista vacía no es vacía por
vacuidad. El primer sitio legítimo llegará con QC-38, y tendrá que pasar por su spec.

Archivos retirados: `lib/modules/unidades/domain/starter-units.ts`,
`lib/modules/unidades/domain/seed-units.ts`, `lib/modules/unidades/ports/unit-seed-repository.ts`,
`lib/modules/unidades/adapters/driven/persistence/unit-seed-repository-prisma.ts`, el
`export const unidades` de `lib/composition/index.ts`, y la llamada más el `console.log` de
unidades de `scripts/seed.ts` —que vuelve a hablar solo de roles y usuario inicial (QC-6)—.

Y con ellos sus tests: `tests/unit/unidades/domain/seed-units.test.ts`,
`tests/unit/unidades/seed-wiring.test.ts` y
`tests/integration/unidades/unidades-seed.int.test.ts`. `unidades-constraints.int.test.ts` **se
queda**: no dependía del seed, cada caso crea sus propias filas dentro de su transacción.

---

## 7. Contratos de entrada/salida, y los tests ajenos que hay que acotar

**Ningún contrato externo**: esta feature no expone endpoints, rutas ni Server Actions (R27). Los
contratos que produce son internos y están en § 5.2 y § 3.

**Tests de otras features que esta ficha rompe.** Se anotan aquí porque `tasks.md` exige listar
todo archivo que se toca, y porque el precedente de QC-24 (que acotó dos tests ajenos) dejó dicho
cómo se hace: **se acotan, no se borran**, conservando lo que el requisito de su feature vigila y
con el porqué fechado dentro del propio test.

| Test | Qué afirma hoy que deja de ser cierto |
| --- | --- |
| `tests/unit/inventario/schema/inventario-schema.test.ts` | que `Product` declara `unit String?` |
| `tests/unit/inventario/product-input.test.ts`, `product-prisma.test.ts`, `product-actions.test.ts`, `product-service.test.ts` | el campo `unit` como texto libre en el esquema zod, el `select`, el `FormData` y las factories |
| `tests/integration/inventario/product-crud.int.test.ts`, `inventario-constraints.int.test.ts` | altas de producto con `unit: 'kg'` como texto |
| `tests/unit/recetas/schema/recetas-schema.test.ts` | «`unit` de la línea es `String` obligatorio y **no hay enum ni catálogo de unidades**» — esa aserción **caduca por diseño** con QC-32 |
| `tests/unit/recetas/schema/recetas-migration.test.ts` | la columna `unit TEXT NOT NULL` en el SQL de `recipe_lines` |
| `tests/integration/recetas/recetas-constraints.int.test.ts` | los casos de R15 de QC-24 («acepta cualquier texto como unidad de línea») |

**Ninguno de estos cambios reabre un requisito de QC-14, QC-20 o QC-24.** R15 de QC-24 decía
«texto libre» porque el catálogo no existía; el humano lo cambió el 2026-09-02 con la decisión 13
de esta ficha, que dice literalmente que altera esas dos tablas. Lo que se conserva de R15 es la
parte que sigue viva: la unidad de la línea es **obligatoria** (R11) y **anotativa** (R14).

---

## 8. Alternativas descartadas

### 8.1 Declarar `unit_id` con `@relation` de Prisma — **descartada**

Es lo natural y lo que Prisma empuja: daría `include`, tipos ligados y validación del esquema. Se
descarta porque regala el cruce de frontera que QC-15 prohíbe —`include: { unit: true }` desde
`inventario` o desde `recetas`— y **ninguna guardia lo detectaría**, porque no es un import.
Además obligaría a declarar el campo de vuelta `products Product[]` y `lines RecipeLine[]` dentro
del modelo `Unit`, que es de otro módulo: el esquema pasaría a decir que `unidades` conoce a sus
consumidores, que es justo al revés de lo que un catálogo compartido debe hacer. Coste asumido:
Prisma no valida esas FK y hay que protegerlas del drift a mano (§ 4.3).

### 8.2 Convertir los textos existentes en unidades («migrar el dato») — **descartada por el humano**

Consta para que el implementer no la reconsidere: la decisión 6 dice que la base está vacía y que
la migración **falla** si no lo está. Una conversión automática —crear una unidad por cada texto
distinto— parece amable y es una trampa: normalizaría «kg», «Kg», «kilos» y «kg." en cuatro
unidades basura que después hay que fusionar a mano, y lo haría **sin que nadie mire**. Fallar
ruidosamente devuelve la decisión al humano, que es de quien es.

### 8.3 `ON DELETE SET NULL` en `products.unit_id` — **descartada**

Sería posible (la columna es anulable) y evitaría que una unidad quede «atrapada» por productos
viejos. Se descarta porque contradice la decisión 10 —«no se puede borrar una unidad en uso»— y
porque convertiría «esta unidad se borró» en «este producto no declara unidad», que son cosas
distintas. Es el mismo argumento con el que QC-20 rechazó `SET NULL` en las FK de auditoría.
Además en `recipe_lines` ni siquiera es posible: la columna es `NOT NULL`.

### 8.4 Mover la normalización a `lib/shared/` y compartirla entre los tres catálogos — **descartada**

Sería DRY: hoy `normalizePresentationName`, `normalizeRecipeName` y `normalizeUnitName` son la
misma función escrita tres veces, y `lib/shared/**` es hoja del grafo, así que la regla de
dependencias lo permitiría. Se descarta porque las tres funciones **no son la misma decisión**:
son el criterio de identidad de tres catálogos que pertenecen a tres módulos distintos y que
pueden divergir (a un día alguien puede querer que las unidades **sí** distingan «l» de «L»).
Unificarlas ataría tres features entre sí para ahorrar doce líneas puras, y cada cambio futuro
tendría que pasar por las tres. Coste aceptado: si algún día las tres tienen que cambiar a la vez,
hay que tocar tres archivos y tres tests.

### 8.5 Un `enum` de Postgres en vez de una tabla — **descartada**

Cinco valores fijos caben en un `enum` y ahorrarían tabla, FK e índice. Se descarta porque añadir
un valor a un `enum` es una migración (y quitarlo, casi imposible), y porque el catálogo tiene
**pantalla propia** planificada (QC-39) y CRUD (QC-38): un usuario tiene que poder añadir «tonelada»
sin desplegar. Además un `enum` no tiene sitio donde guardar el símbolo.

### 8.6 Meter el catálogo dentro de `inventario` — **descartada por el humano**

Consta para no reconsiderarla: la decisión 1 fijó módulo propio y la 2 épica propia (QC-37).
Habría ahorrado toda la costura de § 5.2, a cambio de que `recetas` y, mañana, `pedidos`
dependieran de `inventario` para algo que no es inventario.

---

## 9. Cómo se verifica

| Nivel | Archivo | Qué demuestra |
| --- | --- | --- |
| Estático | `tests/unit/unidades/schema/unidades-schema.test.ts` | La **declaración**: `Unit` con sus seis campos, `symbol` opcional, `@@unique` sobre `name_normalized`, **ausencia** de `deletedAt`, `/// @module unidades`; y en las dos tablas ajenas, `unitId` uuid **sin `@relation`** (opcional en `Product`, obligatorio en `RecipeLine`) y **ninguna** columna `unit` de texto. Lee `db/schema.prisma` como texto. |
| Estático | `tests/unit/unidades/schema/unidades-migration.test.ts` | El **SQL**: la guardia `RAISE EXCEPTION` del UP y la del DOWN, las dos FK con `ON DELETE RESTRICT`, el índice único, los `DROP COLUMN "unit"`, los dos `ALTER` de RLS, identificadores en inglés, y que `down.sql` revierte exactamente el UP (`unit` vuelve `TEXT` en `products` y `TEXT NOT NULL` en `recipe_lines`). Con **tests de sensibilidad** obligatorios: mutar `RESTRICT` a `CASCADE`, quitar el bloque `DO $$` del UP y quitar el `NOT NULL` del DOWN, y comprobar que el predicado cae en los tres casos. Un test que no puede fallar no vigila nada. |
| Unitario | `tests/unit/unidades/domain/unit-name.test.ts` | La normalización: acentos, mayúsculas, signos, espacios, cadena vacía e idempotencia (`f(f(x)) === f(x)`), que es la propiedad que hace segura la columna persistida. |
| Estático (ronda 3) | `tests/unit/unidades/schema/unidades-migration.test.ts` > «el conjunto arrancador» | **R25 y R26.** Las cuatro filas del `INSERT`, en orden, con su nombre y su símbolo, y ninguna más; que `normalizeUnitName(name) === name_normalized` **importando la función real** —lo único que se da cuenta si el literal del SQL y la normalización se desincronizan (§ 6.1.3)—; y que el `INSERT` va después del `CREATE TABLE` y **antes** del `FORCE ROW LEVEL SECURITY` (§ 6.1.1). Con tres mutaciones de sensibilidad en memoria: cambiar un `name_normalized`, quitar el `INSERT` y añadir una quinta fila. |
| ~~Unitario~~ | ~~`tests/unit/unidades/domain/seed-units.test.ts`~~ | **RETIRADO en la ronda 3** con el caso de uso que probaba. Lo mismo con `tests/unit/unidades/seed-wiring.test.ts`. |
| Unitario | `tests/unit/unidades/module-contract.test.ts` | La forma del módulo y las fronteras: `index.ts` solo reexporta de `./domain`; carpetas exactamente `domain`/`ports`/`adapters`; ningún `'use server'` alcanzable desde el barrel; `inventario` y `recetas` importan `unidades` **solo por el barrel**; y la feature no crea adaptadores driving, rutas ni Server Actions (R27). **Ronda 3:** donde decía «`prisma.unit` aparece solo en el adaptador driven» ahora dice **«no aparece en ningún archivo»** (§ 6.2), y para que esa lista vacía no sea vacía por vacuidad el barrido es una función pura que se aplica dos veces: a los archivos reales (`[]`) y a esos mismos más una entrada sintética con `prisma.unit.findMany` (que **debe** salir señalada). Además vigila la mitad negativa de R26: `lib/composition/index.ts` no nombra ningún seed de unidades y `scripts/seed.ts` no nombra `unidades`. |
| Integración | `tests/integration/unidades/unidades-constraints.int.test.ts` | Que la base **de verdad** rechaza y permite lo que debe. Cada caso en `prisma.$transaction` con `ROLLBACK`, cada operación que debe fallar dentro de un `SAVEPOINT`, y se afirma sobre el **SQLSTATE** (`23502`, `23503`, `23505`), **nunca** sobre el texto del mensaje: en esta máquina Postgres responde en español. Las operaciones que deben fallar van con `$executeRaw`, no con la API tipada (QC-24 § 10.1). Copiar los helpers de `tests/integration/recetas/recetas-constraints.int.test.ts`. |
| ~~Integración~~ | ~~`tests/integration/unidades/unidades-seed.int.test.ts`~~ | **RETIRADO en la ronda 3** con el seed. Lo que queda por comprobar contra base real —que tras el UP las cuatro filas están con su nombre, su símbolo y su normalizado— es del **ciclo de T10**, no de un test de Vitest: la migración se aplica una vez y el gate corre sobre una base ya migrada. Evidencia en `progress/impl_QC-32-modelo-unidades.md > Ronda 3`. |
| Guardia (ya existe) | `tests/guards/guard-rls-force.test.ts` | R21. |
| Guardia (ya existe) | `tests/guards/guard-arquitectura-modulos.test.ts` | R15, R16, R17. |
| Guardia (ya existe) | `tests/guards/guard-dependencias-aprobadas.test.ts` | R28. |

**Sin E2E**, y con motivo (decisión 18, R27): no hay pantalla ni flujo navegable. `CHECKPOINTS.md`
pide E2E para «movimientos de inventario»; esta feature no mueve existencias. Lo decide QC-39.

Cuatro avisos para el implementer:

- **R22 y R24 no se pueden probar del todo con un test estático.** Hay que probarlos contra base
  real: insertar un producto con `unit` escrita **antes** de aplicar, comprobar que
  `pnpm run db:migrate` falla y que `units` **no** se creó; y en el DOWN, con una fila apuntando a
  una unidad. Va en T10 con la salida pegada en `progress/impl_QC-32-modelo-unidades.md`, porque
  el ciclo altera el estado de la base local y no cabe dentro de un test de Vitest que corre en el
  gate.
- Un test de RLS escrito con Prisma sale verde pase lo que pase (Prisma se conecta como dueño de
  las tablas). No se escribe: R21 se cierra con la guardia estática sobre el SQL.
- El test de integración necesita **productos, recetas y unidades** creadas dentro de la propia
  transacción: las FK son reales y no se depende del seed.
- `beforeAll` debe fallar con un mensaje claro («corre `pnpm run db:migrate`») si `units` no
  existe, no con un error de Prisma a mitad del primer caso.

---

## 10. Dependencias de terceros

**Ninguna dependencia nueva** (decisión cerrada 19, R28). Regla 7 de `CLAUDE.md` sin propuesta que
abrir, y `tests/guards/guard-dependencias-aprobadas.test.ts` sigue verde sin tocar `package.json`
— ese es exactamente el criterio de R28.

Dos candidatas que podrían parecerlo y **no** lo son:

| Candidata | Qué haría | Por qué no entra |
| --- | --- | --- |
| `unaccent` (extensión de Postgres) | Quitar acentos en SQL para normalizar el nombre | Es `STABLE`, no `IMMUTABLE`: no sirve para un índice ni para una columna generada sin envolverla (§ 3). Y es una extensión de la base, no un paquete npm: añadirla ataría el esquema a que Supabase la tenga habilitada. |
| `convert-units`, `js-quantities` y similares | Conversión entre unidades | **No hay conversión** y no la va a haber (decisión 12, R14). La unidad es anotativa. |

---

## 11. Preguntas abiertas que deja este diseño

Las de `requirements.md` no se repiten. Estas son propias del diseño, ninguna bloquea la
implementación y todas tienen posición por defecto:

1. **¿`units` necesita un índice por `symbol`?** No se crea. El catálogo es de cinco a veinte
   filas; un índice ahí no compra nada y añadirlo después es aditivo y barato.
2. **¿`ProductRef` debería llevar la `UnitRef` resuelta en vez del `unitId`?** Hoy lleva el id
   (§ 5.3). Si QC-25 o QC-38 descubren que **todos** sus consumidores acaban haciendo el mismo
   `findRefs` justo después, conviene reconsiderarlo entonces, con el consumidor delante.
3. **¿Quién valida que el `unitId` de un producto existe, antes de que lo rechace la base?** Hoy
   nadie: zod solo comprueba que es un uuid (§ 5.3) y el `23503` llega en tiempo de ejecución.
   Traducirlo a un mensaje de usuario es de QC-38, y ahí habrá que decidir si el service consulta
   `UnitCatalog` antes de escribir o si mapea el error. No se decide aquí porque no hay service
   (decisión 17).
