# QC-76 — equivalencia-y-ambito-de-unidades · design.md

> El QUÉ está en `requirements.md` (R1–R38) y las 30 decisiones cerradas mandan sobre este
> archivo. Aquí va el CÓMO: modelo de datos, migración, dónde vive el filtro de empresa, el
> contrato de la conversión, las alternativas descartadas y el mapa `R<n> → test`.

## 1. Estado de partida (lo que ya hay en esta rama)

La rama nace de `origin/dev` (`95b9b51`), que ya trae QC-74 (permisos) y QC-54 (rol Administrador
unificado). Lo que existe hoy del módulo:

| Pieza | Archivo | Estado |
| --- | --- | --- |
| Tabla | `db/migrations/20260903121404_units_catalog/migration.sql` | **aplicada**: `units(id, name, name_normalized, symbol, created_at, updated_at)`, único `units_name_normalized_key` **global**, cuatro filas arrancadoras, RLS `ENABLE` + `FORCE` |
| Modelo | `db/schema.prisma` → `model Unit` (`/// @module unidades`) | sin `company_id`, sin derivación, sin `deletedAt` |
| Contrato | `lib/modules/unidades/index.ts` | publica `normalizeUnitName`, `UnitId`/`UnitRef`/`UnitCatalog`, `createListUnits`/`ListUnits`/`isUnitPage`/`MAX_UNITS`, `requirePermission`/`Actor`, los errores y el contrato de consulta |
| Caso de uso | `domain/list-units.ts` | `requirePermission(actor,'unidades.consultar')` → zod → `sanitizeListQuery` → log → repositorio |
| Puerto | `ports/unit-repository.ts` | `listAll(limit, query)` y `listPage(query)` |
| Adaptador Prisma | `adapters/driven/persistence/unit-prisma.ts` | `buildUnitWhere(query)` es el **único** `where` del listado: lo comparten `findMany` y `count` |
| Otro adaptador driven | `adapters/driven/persistence/unit-catalog-prisma.ts` | `findUnitRefs(ids)` para `recetas`. **No se toca** (R36) |
| Driving | `adapters/driving/unit-actions.ts` | `listUnitsAction()` resuelve el actor con `identity.getSessionUser()` |
| Sesión | `lib/modules/identity` | `getSessionContext(): Promise<SessionContext \| null>` con `{ userId, companyId, roleName }` (QC-48) |

Dos hechos que condicionan todo lo de abajo:

1. **`units` ya tiene `FORCE ROW LEVEL SECURITY` sin ninguna policy.** La migración de QC-32 ordenó
   su `INSERT` **antes** de los dos `ALTER` por eso mismo, y hay un test que lo vigila. Nuestra
   migración necesita **escribir** en `units` (R28) sobre una tabla que ya está forzada: ver 3.2.
2. **`buildUnitWhere` ya es el punto único de consulta del listado.** R18 no pide inventarlo, pide
   que la condición de empresa entre ahí y que **no se pueda construir sin ella**.

## 2. Modelo de datos

### 2.1 Columnas nuevas en `units`

| Columna | Tipo SQL | Nulo | Por qué |
| --- | --- | --- | --- |
| `company_id` | `UUID` | **sí** | La empresa dueña. `NULL` = unidad **de sistema** (R11). Sin columna `system` (R12, decisión 11) |
| `unit_id` | `UUID` | sí | La unidad de la que deriva. El nombre lo fija la decisión 2 |
| `factor` | `DECIMAL(14,4)` | sí | Cuántas unidades de la apuntada caben en una de esta (R3). Misma precisión que el dinero de QC-33: decimal exacto, nunca `float` |

En `db/schema.prisma`:

```prisma
model Unit {
  id             String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  name           String
  nameNormalized String   @map("name_normalized")
  symbol         String?
  companyId      String?  @map("company_id") @db.Uuid
  baseUnitId     String?  @map("unit_id")    @db.Uuid
  factor         Decimal? @db.Decimal(14, 4)
  createdAt      DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt      DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  @@index([companyId], map: "units_company_id_idx")
  @@index([baseUnitId], map: "units_unit_id_idx")
  @@map("units")
}
```

Tres decisiones dentro de ese bloque:

- **`@@unique([nameNormalized])` desaparece del esquema.** Los cuatro índices únicos nuevos son
  **parciales** y Prisma no modela índices parciales. Se escriben a mano en la migración y se
  vigilan con un test, exactamente como QC-4/QC-47 hicieron con `users_email_unique`,
  `users_username_unique` y `users_document_unique`. El `model` lleva encima el comentario que lo
  avisa: **si alguien vuelve a poner un `@unique` aquí, la unicidad deja de ser por ámbito y el
  siguiente `prisma migrate dev` genera un índice global que rompe R14 en silencio.**
- **`companyId` es escalar sin `@relation`.** `Company` es de `identity` y `Unit` de `unidades`: es
  exactamente el caso de `products.unit_id` (QC-32 R18). Así ninguna consulta de Prisma puede
  atravesar de una unidad a una empresa con un `include`, y la FK real la escribe la migración a
  mano.
- **`baseUnitId` también es escalar sin `@relation`**, aunque apunte al mismo módulo. Una
  auto-relación de Prisma obligaría a declarar el lado inverso (`derived Unit[]`) que nadie
  consulta: la conversión se calcula en el dominio a partir de dos descriptores (§5), nunca
  navegando. Coste asumido, el mismo que ya tiene el repo: **toda migración futura sobre `units` hay
  que revisarla a mano** para que el drift de `prisma migrate dev` no proponga borrar las FK, los
  `CHECK`, el disparador ni los índices parciales.

### 2.2 Restricciones declarativas

```sql
-- juntos o ninguno (R2)
ALTER TABLE "units" ADD CONSTRAINT "units_derivation_pair_check"
  CHECK (("unit_id" IS NULL) = ("factor" IS NULL));

-- factor siempre > 0 (R4, R5): 0.5000 pasa, 0 y -1 no
ALTER TABLE "units" ADD CONSTRAINT "units_factor_positive_check"
  CHECK ("factor" IS NULL OR "factor" > 0);

-- nadie deriva de si mismo (R7)
ALTER TABLE "units" ADD CONSTRAINT "units_no_self_derivation_check"
  CHECK ("unit_id" IS NULL OR "unit_id" <> "id");

-- FK a la empresa (R13) y a la unidad base (R8). RESTRICT en las dos.
ALTER TABLE "units" ADD CONSTRAINT "units_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "units" ADD CONSTRAINT "units_unit_id_fkey"
  FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
```

`units_company_id_fkey` con `RESTRICT` no cambia nada en la práctica —`companies` tiene borrado
lógico (QC-47), así que ninguna fila desaparece (R16)—, pero deja escrito que borrar una empresa de
verdad no puede dejar unidades huérfanas.

### 2.3 Los cuatro índices únicos por ámbito (R14, R15)

```sql
CREATE UNIQUE INDEX "units_company_name_unique"
  ON "units" ("company_id", "name_normalized") WHERE "company_id" IS NOT NULL;
CREATE UNIQUE INDEX "units_system_name_unique"
  ON "units" ("name_normalized") WHERE "company_id" IS NULL;
CREATE UNIQUE INDEX "units_company_symbol_unique"
  ON "units" ("company_id", "symbol") WHERE "company_id" IS NOT NULL AND "symbol" IS NOT NULL;
CREATE UNIQUE INDEX "units_system_symbol_unique"
  ON "units" ("symbol") WHERE "company_id" IS NULL AND "symbol" IS NOT NULL;
```

**Por qué dos por columna y no uno.** En un índice único normal dos `NULL` no chocan, así que
`UNIQUE (company_id, name_normalized)` a secas dejaría meter «kilogramo» de sistema tantas veces
como se quiera. Los índices parciales dicen las dos mitades de la regla por separado y se leen sin
saber cómo trata Postgres los nulos.

**El símbolo lleva `WHERE symbol IS NOT NULL` explícito** aunque el nulo ya no chocaría: es la mitad
de R15 que dice «único **cuando existe**», y escrita se lee sin razonar sobre nulos.

### 2.4 Un solo nivel y derivación dentro del ámbito: disparador (R6, R9)

Ni un `CHECK` ni una FK pueden mirar **otra fila**: «la unidad de la que derivo no deriva de nadie»
y «la unidad de la que derivo es mía o de sistema» son predicados sobre la fila padre. Se
implementan con una función `plpgsql` y un disparador `BEFORE INSERT OR UPDATE` sobre `units`
(precedente de función en el repo: `next_order_sequence`, `20260904135210_order_cancellation`):

```
units_check_derivation():
  -- 1. la fila que se escribe deriva de alguien
  si NEW.unit_id no es null:
      padre := SELECT company_id, unit_id FROM units WHERE id = NEW.unit_id
      si padre.unit_id no es null            -> RAISE (un solo nivel, R6)
      si NEW.company_id no es null
         y padre.company_id no es null
         y padre.company_id <> NEW.company_id -> RAISE (ambito del padre, R9)
      si NEW.company_id es null
         y padre.company_id no es null        -> RAISE (una de sistema no deriva de una de empresa)
  -- 2. la fila que se escribe es (o sigue siendo) padre de alguien
  si NEW.unit_id no es null y EXISTS (SELECT 1 FROM units WHERE unit_id = NEW.id)
                                          -> RAISE (un solo nivel leido al reves, R6)
  si TG_OP = 'UPDATE' y NEW.company_id distinto de OLD.company_id
     y EXISTS (hija con company_id distinto de NEW.company_id y NEW.company_id no null)
                                          -> RAISE (R9 leido al reves)
```

Cada `RAISE` lleva su propio mensaje y su `ERRCODE` (`23514`, violación de check) para que el test
pueda distinguir cuál saltó. El disparador es **`BEFORE`**, así que la fila no llega a escribirse.

La tercera rama del punto 1 —una unidad de sistema derivando de una de empresa— no la nombra
ninguna decisión, pero es la lectura literal de la decisión 9 («nunca de una unidad de otra
empresa»): una unidad que vale para todas las empresas no puede depender de la unidad privada de
una. Se implementa porque el disparador ya está mirando esa fila; si el humano la quisiera
permitida, se cae una rama del `IF`.

### 2.5 Lo que NO cambia

- **Sin `deleted_at`** (R32, decisión 21): el `RESTRICT` de R8 y el de QC-32 R13 son la única
  garantía real, y un borrado lógico es un `UPDATE` que ninguna FK bloquea.
- **`presentations` no se toca** (R37).
- **`products.unit_id` y `recipe_lines.unit_id` no se tocan.** Cambiar la base o el factor de una
  unidad en uso es legal (R10) precisamente porque esas tablas guardan **la referencia**, no una
  cantidad ya convertida: el `UPDATE` de `units` no encuentra nada que invalidar y no hace falta
  ninguna restricción que lo impida.

## 3. La migración

Carpeta nueva `db/migrations/<timestamp>_units_equivalence_and_scope/` con `migration.sql` y
`down.sql`. **La de QC-32 no se toca** (R27): está aplicada y editarla rompería su checksum en
`_prisma_migrations`.

### 3.1 UP, en orden

1. `ALTER TABLE "units" ADD COLUMN "company_id" UUID, ADD COLUMN "unit_id" UUID, ADD COLUMN "factor" DECIMAL(14,4);`
2. Los tres `CHECK` y las dos FK de §2.2, y los dos índices no únicos (`units_company_id_idx`,
   `units_unit_id_idx`) — el lado hijo de una FK no se indexa solo, y por ahí pasa la verificación
   del `RESTRICT` de R8 y del de la empresa.
3. `DROP INDEX "units_name_normalized_key";` y los cuatro índices únicos parciales de §2.3. El orden
   importa: el índice global tiene que caer **antes**, o dos empresas no podrán tener cada una su
   «kilogramo».
4. La función y el disparador de §2.4.
5. **La actualización de datos** (R28), entre paréntesis de RLS (§3.2): `litro → mililitro, 1000` y
   `kilogramo → gramo, 1000`, buscando las filas por `name_normalized` y no por id —los uuid los
   generó `gen_random_uuid()` y son distintos en cada base—. `company_id` **no se toca**: las cuatro
   nacieron sin él y `ADD COLUMN` las deja en `NULL`, que ya es «de sistema». Se escribe igualmente
   un `UPDATE ... SET company_id = NULL` explícito para que R28 se lea entera en el archivo.
6. Ningún `INSERT` y ningún `DELETE` (R29).
7. Los dos `ALTER TABLE "units" ... ROW LEVEL SECURITY` finales (R30).

### 3.2 El paréntesis de RLS alrededor del `UPDATE`

`units` ya está `FORCE ROW LEVEL SECURITY` **sin policies**, y eso deniega también al dueño de la
tabla. La migración de QC-32 resolvió el mismo problema colocando su `INSERT` antes del `FORCE`;
aquí el `FORCE` ya está puesto de antes, así que se abre y se cierra explícitamente:

```sql
ALTER TABLE "units" NO FORCE ROW LEVEL SECURITY;
UPDATE "units" SET ...;   -- R28
ALTER TABLE "units" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "units" FORCE ROW LEVEL SECURITY;
```

Todo dentro de la única transacción en la que Prisma ejecuta el `migration.sql`, así que no hay
ninguna ventana en la que la tabla quede sin forzar para nadie más. El `UPDATE` se cierra con un
`GET DIAGNOSTICS`/`IF ... RAISE`: si no actualizó exactamente dos filas derivadas, la migración
**aborta** en vez de dejar el catálogo a medias. Sin ese paréntesis el `UPDATE` podría afectar a
cero filas **en silencio** en cualquier base cuyo rol no tenga `BYPASSRLS`, que es justo el fallo que
ninguna suite vería.

### 3.3 DOWN

`down.sql` revierte exactamente el UP (R33): borra disparador y función, borra los cuatro índices
parciales, **recrea `units_name_normalized_key` global**, borra los `CHECK`, las dos FK, los dos
índices y las tres columnas, y deja la RLS activada y forzada. Las cuatro unidades siguen ahí.

Antes de nada, la **guardia de datos** (R34), en la línea de QC-32 R24 —fallar antes que perder el
dato—:

```sql
-- aborta si hay alguna unidad de empresa, o alguna derivada que no sea litro/kilogramo
```

Porque quitar `company_id` convertiría las unidades privadas de cada empresa en unidades de sistema
visibles para todas, que es peor que no poder revertir. Y recrear el índice global fallaría de todos
modos si dos empresas tuvieran el mismo nombre: mejor un mensaje que dice qué pasa que un `23505`
suelto.

## 4. El ámbito en el listado

### 4.1 Por dónde entra la empresa

`Actor` gana **un campo**: la empresa de quien pregunta.

```ts
// domain/actor.ts
export type Actor = {
  readonly id: string;
  readonly companyId: string;   // QC-76
  readonly permissions: readonly string[];
};
```

`unit-actions.ts` lo rellena resolviendo **las dos** caras de la sesión —`getSessionUser()` para el
id y los permisos, `getSessionContext()` para el `companyId`— y devuelve `null` si **cualquiera** de
las dos falta: sin contexto no hay actor, y sin actor `requirePermission` lanza antes de tocar el
repositorio (R19, falla cerrado). No se lee cookie ni cabecera desde la action, igual que hoy.

**Por qué en el `Actor` y no como tercer parámetro de `listUnits`.** La empresa es *de quien
pregunta*, igual que sus permisos, y va siempre junta con ellos; como parámetro suelto sería un
argumento que cada llamante nuevo puede olvidarse de pasar —o peor, elegir—. En el `Actor` el
typecheck obliga a construirlo entero en el único sitio que sabe leer la sesión. Que la empresa viaje
en la sesión **no autoriza** nada por sí sola (R20, `docs/architecture.md`): sirve para **filtrar**,
y el permiso se sigue comprobando aparte y primero.

### 4.2 El puerto y el punto único

```ts
// domain/unit-scope.ts  (nuevo, dominio puro, publicado por el contrato)
export type UnitScope = { readonly companyId: string };

// ports/unit-repository.ts
listAll(limit: number, query: ListQuery, scope: UnitScope): Promise<readonly UnitRef[]>;
listPage(query: ListQuery, scope: UnitScope): Promise<Page<UnitRef>>;
```

y en el adaptador, **la condición se escribe una sola vez** (R18):

```ts
// adapters/driven/persistence/unit-prisma.ts
export function companyScopeWhere(scope: UnitScope): Prisma.UnitWhereInput {
  return { OR: [{ companyId: scope.companyId }, { companyId: null }] };
}

export function buildUnitWhere(query: ListQuery, scope: UnitScope): Prisma.UnitWhereInput {
  const search = normalizedSearchCondition(query.search, normalizeUnitName);
  const scoped = companyScopeWhere(scope);
  return search === null ? scoped : { AND: [scoped, { nameNormalized: search }] };
}
```

`buildUnitWhere` **exige** el `scope` en su firma, así que una consulta futura que se olvide del
filtro no compila: es lo que la decisión 15 pide («la consulta nueva que se olvide de él enseña a
una empresa lo que no es suyo»), convertido en rojo de `typecheck` en vez de en un test que nadie
escribió. `listAll` y `listPage` siguen compartiendo el mismo objeto `where`, y el `count` de la
página usa **literalmente la misma constante** que su `findMany`, así que el `total` cuenta solo lo
visible (R17).

El caso de uso solo hace de correa: `deps.units.listPage(query, { companyId: actor.companyId })`.
Ni construye SQL ni conoce el `OR`.

### 4.3 Lo que se queda fuera a propósito

`findUnitRefs(ids)` (`unit-catalog-prisma.ts`) **no** recibe ámbito (R36). Sus llamantes son casos de
uso de `recetas`, que todavía no tienen empresa —`recetas` es QC-50 en la deuda de
`docs/architecture.md > Dominio`— y añadirle un parámetro obligaría a tocar ese módulo entero, que no
es esta ficha. Queda escrito aquí, no escondido: `companyScopeWhere` se exporta del adaptador
precisamente para que QC-50 lo reutilice y no escriba un segundo `OR`.

## 5. La conversión

### 5.1 Contrato

```ts
// domain/convert-quantity.ts  (dominio puro; el barrel lo reexporta)

/** Lo que hace falta saber de una unidad para convertir. Deliberadamente NO es `UnitRef`:
 *  quien convierte no necesita el nombre ni el simbolo. */
export type UnitConversion = {
  readonly id: UnitId;
  readonly baseUnitId: UnitId | null;
  readonly factor: string | null;   // decimal en TEXTO, nunca `number` (QC-33)
};

export function convertQuantity(
  quantity: string,
  from: UnitConversion,
  to: UnitConversion,
): string;
```

- **Decimales como texto**, entrada y salida, como ya hacen `pedidos` (`OrderContents.quantity`,
  `unitPrice`): un `decimal(14,4)` no cabe en un `number` sin riesgo de redondeo, y el dominio no
  puede importar el `Decimal` de Prisma (`docs/architecture.md > Anti-patrones`).
- **Errores**: `IncompatibleUnitsError` (`code: 'incompatible_units'`, R24) y la `ValidationError`
  que ya existe (R25), las dos bajo `UnidadesError`, así que el adaptador driving que algún día la
  exponga las serializa con el patrón de siempre.
- **Nadie la llama todavía** (R26, decisión 18): se publica y se prueba, y punto.

### 5.2 Algoritmo

Base efectiva de una unidad `u` = `u.baseUnitId ?? u.id`; factor efectivo = `u.factor ?? '1'`. Con
eso los tres casos —misma unidad, base contra derivada suya, dos derivadas de la misma base— son el
mismo cálculo, y la derivación de **un solo nivel** (R6) garantiza que no hay que recorrer nada:

```
si baseEfectiva(from) !== baseEfectiva(to) -> IncompatibleUnitsError
resultado = quantity * factorEfectivo(from) / factorEfectivo(to)
```

Aritmética con `BigInt` sobre enteros escalados (el decimal se parte en signo, dígitos y escala; la
multiplicación suma escalas; la división se hace sobre el numerador ampliado). El resultado sale
**exacto** siempre que la división termine, y se recorta sin ceros de relleno a la derecha: 1 litro
→ `1000`, 1 gramo → tonelada → `0.000001` (R23, nada de `0`). Cuando **no** termina, se aplica la
posición por defecto de la pregunta abierta 1 (12 decimales, truncando) — y si el humano la cierra de
otra forma, cambia una constante y su test, nada más.

### 5.3 Ninguna librería (R38, regla 7 de `CLAUDE.md`)

`docs/architecture.md > Anti-patrones` obliga a justificar aquí por qué el decimal se escribe a mano
en vez de usar `decimal.js` o `big.js`, que es exactamente lo que resolverían:

1. La decisión cerrada 26 dice **«Ninguna librería nueva»** y nació sabiendo que había una función
   de conversión: no es un olvido que este diseño pueda revertir por su cuenta.
2. El `Decimal` de `decimal.js` **ya está en el árbol**, dentro de `@prisma/client`, pero el dominio
   **no puede importarlo** (`domain/` no toca `@prisma/client`); tirar de él obligaría a instalarlo
   suelto, que es una dependencia nueva con su parada humana.
3. Lo que hay que hacer son **una multiplicación y una división** sobre enteros escalados. `BigInt`
   es nativo, no tiene coste de bundle y no hace falta `toDP`, ni modos de redondeo, ni potencias, ni
   raíces: si el alcance creciera hasta necesitarlos, la propuesta de librería se abre entonces, con
   sus cuatro checks y su fila en `docs/dependencias.md`, y no antes.

## 6. Contrato público (`index.ts`)

Gana exactamente cuatro símbolos y no pierde ninguno:

```ts
export { convertQuantity } from './domain/convert-quantity';
export type { UnitConversion } from './domain/convert-quantity';
export type { UnitScope } from './domain/unit-scope';
export { IncompatibleUnitsError } from './domain/errors';
```

Sigue sin arrastrar servidor (`module-contract.test.ts` lo comprueba): todo lo nuevo es dominio
puro. `Actor` no cambia de nombre, solo de forma.

## 7. Alternativas descartadas

**(a) Forzar «un solo nivel» con una FK compuesta en vez de un disparador.** El truco clásico:
columna generada `derives boolean = (unit_id IS NOT NULL)`, `UNIQUE (id, derives)`, una columna
`parent_derives` con `CHECK (parent_derives = false)` y `FOREIGN KEY (unit_id, parent_derives)
REFERENCES units(id, derives)`. Es declarativo, no necesita `plpgsql` y Postgres lo mantiene solo.
**Descartado** porque mete **dos columnas redundantes** en una tabla cuyo dueño acaba de rechazar
justamente eso —decisión 11, «dos campos que dicen casi lo mismo acaban contradiciéndose»— y porque
no sabe expresar la otra mitad (R9, el ámbito del padre), que necesitaría el disparador igualmente.
Un mecanismo para las dos reglas es más barato de leer que dos.

**(b) Un solo índice único con `NULLS NOT DISTINCT`** (`UNIQUE (company_id, name_normalized) NULLS
NOT DISTINCT`) en vez de los cuatro parciales. Es una línea en vez de dos por columna. **Descartado**
porque depende de Postgres ≥ 15 y de un matiz que casi nadie recuerda al leer, y porque el repo ya
tiene un patrón asentado de índices únicos parciales escritos a mano (`users_email_unique`,
`companies_name_unique`): romperlo aquí obligaría a explicar dos estilos en la misma base.

**(c) Filtrar por empresa con una policy de RLS** en vez de con el `where` del repositorio.
**Descartado por `docs/architecture.md > Acceso a datos y autorización`**, que lo prohíbe
explícitamente: Prisma se conecta como dueño y no setea `request.jwt.claims`, así que la policy no
filtraría ninguna consulta de esta aplicación. La RLS se mantiene activada y forzada (R30) como
defensa en profundidad, nunca como el filtro.

**(d) Pasar `companyId` como tercer parámetro del caso de uso** en lugar de dentro del `Actor`.
Descartado en §4.1: sería un argumento que cada llamante puede olvidar o elegir.

**(e) Devolver la conversión como `number`.** Descartado: `float` para cantidades es anti-patrón
declarado del repo, y el resultado de convertir es justo donde el error binario se acumularía.

## 8. Riesgos conocidos

| Riesgo | Mitigación |
| --- | --- |
| El drift de `prisma migrate dev` propone borrar las FK, los `CHECK`, el disparador o los índices parciales, porque Prisma no los conoce | Comentario en el `model Unit` + `tests/unit/unidades/schema/unidades-schema.test.ts` y `unidades-migration.test.ts`, que leen esquema y SQL y fallan si desaparecen |
| El `UPDATE` de R28 afecta a cero filas por la RLS forzada | Paréntesis `NO FORCE` / `FORCE` (§3.2) **y** comprobación del número de filas con `RAISE` |
| Alguien añade un `@unique` en `nameNormalized` y la unicidad vuelve a ser global | Test de esquema: rojo si `units` declara cualquier `@@unique`/`@unique` |
| Una consulta futura del módulo se olvida del filtro de empresa | `buildUnitWhere` no compila sin `scope` (§4.2); `findUnitRefs` queda fuera **por escrito** (R36) |

## 9. Mapa `R<n> → verificación`

E2E **diferido con motivo** (decisión 25): esta ficha no aporta pantalla ni flujo navegable. Todo se
verifica con tests unitarios y de integración.

| Requisito | Dónde se prueba |
| --- | --- |
| R1, R2, R4, R5, R7, R13 | `tests/integration/unidades/unidades-constraints.int.test.ts` (INSERT/UPDATE directos) |
| R3 | esquema (`unidades-schema.test.ts`: `Decimal(14,4)`) + integración (un factor de 4 decimales vuelve intacto) |
| R6, R9 | `unidades-constraints.int.test.ts` (las cinco ramas del disparador) |
| R8 | `unidades-constraints.int.test.ts` (DELETE de una unidad con hija → `23503`) |
| R10 | `unidades-constraints.int.test.ts` (UPDATE del factor con producto y línea apuntando) |
| R11, R12, R32 | `unidades-schema.test.ts` (columnas presentes/ausentes) |
| R14, R15 | `unidades-constraints.int.test.ts` (choque dentro del ámbito y no-choque entre ámbitos) |
| R16 | `unidades-constraints.int.test.ts` (marcar `companies.deleted_at` no toca `units`) |
| R17 | `tests/integration/unidades/unit-repository.int.test.ts` (los dos modos + `total`) |
| R18 | `tests/unit/unidades/unit-prisma-where.test.ts` (el `where` de los dos modos lleva el `OR`) + `typecheck` |
| R19 | `tests/unit/unidades/unit-actions.test.ts` (sin contexto de sesión → error, repositorio no llamado) |
| R20 | `tests/unit/unidades/list-units.test.ts` (los cuatro casos de actor, y el permiso antes que zod) |
| R21 | `list-units.test.ts` y `list-units-query.test.ts` ya existentes, en verde sin cambios de expectativa |
| R22 | `tests/unit/unidades/module-contract.test.ts` (el barrel exporta y no arrastra servidor) |
| R23, R24, R25 | `tests/unit/unidades/domain/convert-quantity.test.ts` |
| R26 | guardia estática: ninguna referencia a `convertQuantity` fuera de `unidades` y sus tests |
| R27, R28, R29, R30, R31, R33, R34 | `tests/unit/unidades/schema/unidades-migration.test.ts` (lee `migration.sql` y `down.sql`) + integración sobre la base migrada |
| R35, R36, R37 | `unidades-migration.test.ts` / inspección de árbol: sin adaptador driving nuevo, `findUnitRefs` sin ámbito, `presentations` intacta |
| R38 | `tests/guards/guard-dependencias-aprobadas.test.ts` (`package.json` sin cambios) |
