# QC-49 — aislamiento-por-empresa-en-inventario · design.md

> Cómo se construye lo que `requirements.md` pide. El alcance y las decisiones cerradas están allí y
> no se reabren aquí.

## 1. Panorama: qué se mueve y qué no

Hoy `inventario` es el módulo hexagonal completo de `docs/architecture.md`: nueve casos de uso, dos
puertos de repositorio (`ProductRepository`, `PresentationRepository`), un puerto de costura hacia
otros módulos (`ProductCatalog`), tres adaptadores driven de persistencia y dos Server Actions.
Ninguna de sus tres tablas tiene columna de empresa (comprobado contra la base el 2026-09-11).

Esta feature toca **cuatro capas, en este orden**:

| Capa | Qué cambia |
| --- | --- |
| Base + Prisma | `company_id` NOT NULL en `products`, `presentations`, `product_batches`; FK, índices, unicidad por empresa, dos disparadores de coherencia, backfill (§ 2, § 3) |
| Dominio | `Actor` gana `companyId`; nace `InventoryScope`; los puertos exigen el ámbito en la firma (§ 4) |
| Adaptador driven | **un único punto** donde se escribe «de la empresa», y toda consulta y escritura lo compone (§ 5) |
| Adaptador driving | las dos Server Actions construyen el actor con **las dos caras** de la sesión (§ 4.1) |

Lo que **no** se mueve: el contrato genérico de consulta (QC-57), la derivación de la unidad desde el
lote más reciente (QC-80), el alta con primer lote (QC-90), el orden por defecto, la paginación y la
forma de todos los resultados públicos (R31).

**La frontera es el service, no la RLS** (`docs/architecture.md > Acceso a datos y autorizacion`):
Prisma conecta como dueño de las tablas y no setea `request.jwt.claims`, así que ninguna policy
filtra ninguna consulta de esta aplicación. La RLS se conserva activada y forzada porque es defensa
en profundidad para una vía que hoy no se usa (R5, R26).

## 2. Modelo de datos

### 2.1 Las tres columnas

```
products.company_id        UUID NOT NULL  REFERENCES companies(id) ON DELETE RESTRICT ON UPDATE CASCADE
presentations.company_id   UUID NOT NULL  REFERENCES companies(id) ON DELETE RESTRICT ON UPDATE CASCADE
product_batches.company_id UUID NOT NULL  REFERENCES companies(id) ON DELETE RESTRICT ON UPDATE CASCADE
```

- **Obligatoria en las tres** (R1). Se aparta a conciencia de QC-76, que hizo `units.company_id`
  *opcional* justo para que existieran las unidades de sistema: aquí **no hay inventario de
  sistema**, y una columna opcional significaría «fila que ve todo el mundo», que es exactamente lo
  que la decisión cerrada 3 descarta.
- **El lote lleva la suya** (R2, decisión cerrada 2). No se deriva por `join` con su producto porque
  QC-81 necesita la unicidad `(empresa, lote)` y un índice no puede indexar la columna de otra tabla.
- `ON DELETE RESTRICT`: hoy `companies` tiene borrado lógico (QC-47), así que ninguna fila desaparece
  y R25 se cumple sin hacer nada; el `RESTRICT` deja escrito que un borrado físico de empresa no
  puede dejar inventario huérfano.
- En `db/schema.prisma` las tres van como **escalar sin `@relation`**, exactamente como
  `units.company_id` (QC-76 § 2.1) y por el mismo motivo: `Company` es de `identity` y las tres
  tablas son de `inventario`; con `@relation`, el cliente Prisma permitiría
  `include: { company: true }` desde `inventario` —una lectura de otro módulo que ninguna guardia
  detecta, porque no es un import ni un `prisma.company`—. **La FK va escrita a mano en el
  `migration.sql` y es drift para Prisma**: toda migración futura de estas tres tablas hay que
  revisarla a mano, y el comentario `///` del modelo lo dice.

### 2.2 Índices

```
products_company_id_idx           ON products (company_id)
product_batches_company_id_idx    ON product_batches (company_id)
presentations_company_name_unique ON presentations (company_id, name_normalized)   -- UNIQUE
```

- Postgres no indexa el lado hijo de una FK y por ahí pasa la verificación del `RESTRICT`; por eso
  los dos índices propios. **No son parciales**: la verificación del `RESTRICT` tiene que ver también
  los productos con borrado lógico (mismo razonamiento que `work_groups_company_id_idx` en QC-83).
- `presentations` **no** lleva índice propio de empresa: el único compuesto la tiene de cabeza y
  sirve igual (R10).
- **Los índices de listado de QC-57 no se recomponen** (`products_name_idx`, `products_stock_idx`,
  …). Lo correcto a largo plazo sería anteponerles `company_id`; con 23 productos y 114
  presentaciones vivas eso es afinar sobre un `seq scan` que ya gana. Coste aceptado y anotado: la
  respuesta, cuando el volumen la pida, es una migración de índices compuestos, no un rediseño.

### 2.3 La unicidad del nombre pasa a ser por empresa

`presentations.name_normalized` es **único global** hoy (`presentations_name_normalized_key`,
QC-20). Pasa a ser único **dentro de la empresa**:

```sql
DROP INDEX "presentations_name_normalized_key";
CREATE UNIQUE INDEX "presentations_company_name_unique"
  ON "presentations" ("company_id", "name_normalized");
```

Tres razones, y las tres son de aislamiento y no de comodidad:

1. **Dos empresas tienen que poder tener cada una su «Garrafa 20 L».** Con el índice global, la
   primera que la crea se la quita a todas las demás.
2. **El índice global es un oráculo de existencia.** Un alta que responde «ya existe una
   presentación con un nombre equivalente» sobre una fila que quien pregunta no puede ver le está
   contando algo del catálogo de otra empresa. Eso es la misma fuga que R15 cierra por otro lado.
3. Es exactamente lo que hizo **QC-76** con las unidades (D-unicidad / R14), y conviene que las dos
   tablas se lean igual.

**Diferencia con QC-76, deliberada**: allí hicieron falta **dos índices parciales** por columna
(`units_company_name_unique` + `units_system_name_unique`) porque `company_id` es opcional y dos
`NULL` no chocan en un único índice. Aquí la columna es NOT NULL, así que **un solo índice
compuesto, no parcial**, dice la regla entera. Y al no ser parcial ni funcional, **Prisma sí sabe
modelarlo**: se declara como `@@unique([companyId, nameNormalized], map: "presentations_company_name_unique")`
en `model Presentation`, con lo que deja de haber drift en ese punto y `P2002` se sigue traduciendo a
`'duplicate'` sin tocar `presentation-prisma.ts`.

**`products` no gana ninguna unicidad** (R21). Que dos productos puedan llamarse igual es decisión
cerrada de QC-20 (D14) y esta ficha no la reabre. Lo que sí cambia es la **resolución por nombre** del
alta (`findAliveIdByName`, QC-90): pasa a mirar solo los vivos **de la empresa del actor** (R18), que
es filtro, no restricción.

### 2.4 Coherencia: lo que un CHECK no puede decir

Ni un `CHECK` ni una FK pueden mirar otra fila. Las dos reglas que hacen falta son predicados sobre
la fila padre, así que van en disparadores `BEFORE INSERT OR UPDATE`, con `RAISE EXCEPTION`,
`ERRCODE = '23514'` y **un mensaje propio y distinguible por caso** —para que el test de integración
pueda afirmar *cuál* saltó y no solo «lanza algo»—. Precedente exacto: `units_check_derivation`
(QC-76).

**a) `product_batches_check_company` (R22).** La empresa del lote tiene que coincidir con la de su
producto **y** con la de su presentación. Sin él, un lote de la empresa A podría colgar de un
producto de la B y el listado de A enseñaría existencias ajenas por la puerta de atrás.

**b) `presentations_check_unit_scope` (R23).** La unidad de una presentación tiene que ser de **su**
empresa o **de sistema** (`units.company_id IS NULL`). Es la lectura literal de QC-76 R9 desde el
otro lado de la frontera. La función hace `SELECT` sobre `units`, que es de otro módulo: eso es legal
en SQL —la FK `presentations_unit_id_fkey` ya cruza— y **no** abre ningún camino para que el cliente
Prisma de `inventario` lea `units`, que es lo que la guardia de módulos protege. No es
`SECURITY DEFINER`, por el mismo motivo que escribió QC-76: quien escribe la presentación ya tiene
que poder leer la unidad. **Sujeto a «Preguntas abiertas 1»**: si el humano lo difiere, cae este
disparador y su requisito, y nada más.

El adaptador traduce el `23514` de (a) y (b) a `'invalid_company_scope'` / `'invalid_unit'` según la
operación —nunca con un `catch` común, mismo criterio que `presentation-prisma.ts` ya aplica a sus
dos `P2003`—, y el caso de uso lo convierte en `ValidationError` (`invalid_input`): es entrada que
no cuadra, no un permiso que falta.

## 3. La migración

Una migración nueva, `db/migrations/<ts>_inventory_company_scope/`, con `migration.sql` y `down.sql`
(R6). **Escrita entera a mano**, no generada por `prisma migrate dev`: las tres tablas ya cargan con
objetos que Prisma no conoce (FK a `users` escritas a mano, CHECK, índices parciales y GIN, RLS
forzada) y `migrate dev` los lee como drift y propone resetear una base con datos. Se aplica con
`pnpm run db:migrate` (`prisma migrate deploy`), que no mira drift.

### 3.1 UP, en orden

1. `ADD COLUMN "company_id" UUID` **anulable** en las tres tablas.
2. **Backfill** (R3), entre paréntesis de RLS: `ALTER TABLE … NO FORCE ROW LEVEL SECURITY` antes y
   `ENABLE` + `FORCE` después. `FORCE` deniega también al dueño —que es con quien conecta Prisma— y
   sin policies el `UPDATE` afectaría a cero filas en silencio. Todo dentro de la única transacción
   de la migración, así que no hay ventana con la tabla sin forzar. Mismo patrón que QC-76 § 5.
   - La empresa se resuelve **por nombre normalizado** (`name_normalized = 'quimicloud'`, lo que
     produce `normalizeCompanyName(INITIAL_COMPANY_NAME)`), **nunca por identificador**: los uuid los
     genera `gen_random_uuid()` y son distintos en cada base.
   - **Si no hay coincidencia**, se acepta un único fallback: que `companies` tenga exactamente
     **una** fila. Cualquier otro caso —cero, o varias sin la de nombre— `RAISE EXCEPTION` y la
     migración entera se deshace (R3). Nunca se elige «una cualquiera».
   - Se actualizan **todas** las filas, incluidas las de productos con `deleted_at` no nulo: la
     columna va a ser NOT NULL y un borrado lógico sigue siendo una fila.
   - Cada `UPDATE` comprueba `ROW_COUNT` contra el número de filas de la tabla y aborta si no
     coinciden: fallar antes que dejar el inventario a medias.
   - **Ningún `DELETE`, ningún `INSERT`** (R4). Las 36 empresas de residuo y las presentaciones de
     residuo se quedan donde están: eso es QC-77.
3. `SET NOT NULL` en las tres columnas.
4. Las tres FK a `companies`, los dos índices de FK y el intercambio de índice único de
   `presentations` (§ 2.2, § 2.3).
5. Las dos funciones y los dos disparadores de coherencia (§ 2.4). Van **después** del backfill: con
   el `presentations_check_unit_scope` puesto antes, el `UPDATE` del backfill podría dispararlo sobre
   filas que aún no tienen empresa.
6. `ENABLE` + `FORCE ROW LEVEL SECURITY` en las tres, explícito (R5).

### 3.2 DOWN

Revierte en orden inverso y deja el esquema exacto anterior, **con el índice único global
restaurado** (R6). Lo primero del archivo es la **guardia de datos** (R7), en la línea de QC-76:

- si hay alguna fila de las tres tablas cuya empresa **no** sea la que escribió el UP → abortar:
  quitar la columna convertiría inventario de varias empresas en un único montón indistinguible, que
  es peor que no poder revertir;
- si hay dos presentaciones con el mismo `name_normalized` → abortar con un mensaje que explica qué
  pasa y qué hacer, en vez de un `23505` suelto al recrear el índice global.

Ninguna fila se borra. `pnpm run db:rollback` lo aplica y deja `_prisma_migrations` coherente.

## 4. Cómo llega el `companyId` hasta el caso de uso y el repositorio

Sin que `inventario/domain/**` importe nada de sesión, cookie ni `next/*`, y sin importar las tripas
de `identity`. La respuesta es la de QC-76, verificada contra el código de esta rama:

### 4.1 El actor lo trae, y lo rellena el adaptador driving

`lib/modules/inventario/domain/actor.ts` gana un campo:

```ts
export type Actor = {
  readonly id: string;
  readonly companyId: string;          // NUEVO
  readonly permissions: readonly string[];
};
```

Va **dentro del actor** y no como parámetro suelto de cada caso de uso por la razón que escribió
QC-76: viaja siempre junto a los permisos, así que ningún llamante nuevo puede olvidarse de pasarla
ni, peor, **elegirla**. El archivo ya importa `assertPermission` del **barrel** de `identity`, que es
un import permitido por la tabla de `docs/architecture.md`; **no se añade ningún import nuevo**.

`product-actions.ts` y `presentation-actions.ts` construyen el actor con **las dos caras** de la
sesión, exactamente como `unit-actions.ts` y `role-actions.ts`:

```ts
const [sessionUser, sessionContext] = await Promise.all([
  identity.getSessionUser(),
  identity.getSessionContext(),
]);
if (sessionUser === null || sessionContext === null) return null;   // falla cerrado (R12)
return { id: sessionUser.id, companyId: sessionContext.companyId, permissions: sessionUser.permissions };
```

Con actor `null`, `requirePermission` rechaza en la primera línea del caso de uso, antes de tocar el
repositorio. **Sin contexto no hay actor, y sin actor no hay consulta.**

> Esta será la **cuarta** copia de `currentActor` en el repo (identity, unidades, y las dos de
> inventario). `role-actions.ts` dejó escrito que «cuando aparezca la tercera copia se extrae, y el
> sitio natural es `adapters/driving/current-actor.ts`». **No se extrae aquí**: sería un archivo
> compartido entre módulos —cada `Actor` es un tipo distinto de su propio dominio— y esta ficha ya
> toca siete archivos de producción. Queda anotado para la ficha que lo aborde.

### 4.2 El dominio traduce actor → ámbito, y el puerto lo exige

Nace `lib/modules/inventario/domain/inventory-scope.ts`, dominio puro:

```ts
/** Empresa EN CUYO NOMBRE se consulta o se escribe. No autoriza: filtra. */
export type InventoryScope = { readonly companyId: string };
```

Cada método de `ProductRepository` y `PresentationRepository` gana `scope: InventoryScope` en su
firma. Que esté en la firma y no dentro del adaptador es lo que hace que **una llamada** que se
olvide del ámbito **no compile** (R13) — el mismo argumento que el docblock de `UnitRepository` ya
escribe.

**Corrección del 2026-09-11 (la detectó el `reviewer` en F2.2, y es una corrección de una afirmación
falsa, no una relajación).** Este párrafo decía «una llamada **o una implementación** que se olvide
del ámbito NO COMPILE», y la segunda mitad es falsa: TypeScript admite asignar una función de **menor
aridad** donde se espera una de mayor, así que `const repo: ProductRepository = { findAliveById }`
con un `findAliveById(id)` sin `scope` **compila** — verificado con el `tsc` de este repo, y es
exactamente como `lib/composition/index.ts` ata las funciones sueltas del adaptador. Las
**escrituras** se salvan de rebote porque Prisma exige `companyId: string` obligatorio en los
`…UncheckedCreateInput`; las **lecturas** no tienen ese seguro.

Lo que sí cierra esa mitad, y de forma mecánica:

- `tests/guards/guard-ambito-empresa-inventario.test.ts` (nueva): **método a método** de los dos
  puertos —y, además, función a función de todo `adapters/driven/persistence/`— comprueba que la
  implementación **declara** `scope: InventoryScope` y que el `scope` **llega hasta** una envoltura
  de `./company-scope` (aquí o por un ayudante del mismo archivo al que se le pase). Es **por
  función**, no por archivo: muerde con una sola consulta mal escrita, que es justo lo que las dos
  guardias de `tests/unit/inventario/company-scope.test.ts` —por archivo— dejaban pasar. Única
  excepción, escrita como tal en la propia guardia: `findProductRefs` (R29 → QC-50).
- `tests/integration/inventario/company-scope-queries.int.test.ts`: el rechazo cruzado real de las
  doce operaciones contra Postgres, cada una con su control positivo.

La exigencia no baja: una implementación sin ámbito sigue siendo inaceptable y sigue detectándose
**antes del merge y sin revisión humana**. Lo que cambia es quién la detecta.

El caso de uso solo hace de correa: exige el permiso primero, valida la entrada, y pasa
`{ companyId: actor.companyId }` al puerto. No construye SQL y no conoce ninguna condición.

## 5. El único punto de consulta

Hoy no hay uno: hay **tres** adaptadores driven (`product-prisma.ts`, `presentation-prisma.ts`,
`product-catalog-prisma.ts`) y dentro de los dos primeros, dos constructores de `where`
(`buildProductWhere`, `buildPresentationWhere`) más nueve consultas sueltas de lectura y escritura.
Escribir `companyId: scope.companyId` en cada una serían **doce** sitios que mañana pueden divergir,
y la consulta nueva que se olvide de uno le enseña a una empresa lo que no es suyo.

Nace `lib/modules/inventario/adapters/driven/persistence/company-scope.ts`:

```ts
/** LA definicion de «de la empresa» del modulo `inventario`. Se escribe UNA vez. */
function companyScope(scope: InventoryScope): { companyId: string } {
  return { companyId: scope.companyId };
}

export function productCompanyScope(s: InventoryScope): Prisma.ProductWhereInput { return companyScope(s); }
export function presentationCompanyScope(s: InventoryScope): Prisma.PresentationWhereInput { return companyScope(s); }
```

Las envolturas existen **solo para tipar**: todas delegan en la misma función, así que hay una
definición y no varias. A las dos de `where` se suma una tercera, `companyScopeColumns`, para la
forma que exige una **creación** (`…UncheckedCreateInput` pide `companyId: string` obligatorio, y
esparcir un `…WhereInput` en el `data` de un `create` no compila): es la misma definición con otro
tipo, no una copia.

**Nota del 2026-09-11 (cierre de la revisión F2.2).** Este párrafo publicaba una cuarta envoltura,
`batchCompanyScope` (`Prisma.ProductBatchWhereInput`). Se implementó y **se borró**, porque al
terminar no tenía ningún consumidor de producción —su único uso era su propio test—:
`product_batches` **no tiene ninguna lectura propia** en el módulo. Su única lectura llega por la
fila de producto de `addBatchToAlive`, que ya va acotada con `productCompanyScope`, y sus dos
creaciones se acotan con `companyScopeColumns`. Una exportación que solo usa su test parece
cobertura y no filtra ninguna consulta. **QC-81**, que necesita la unicidad `(empresa, lote)`, la
reintroduce **con su consumidor en la misma tanda** el día que le haga falta un `where` de lote.

Reglas de uso, que el test hace cumplir:

- **Toda lectura** compone el ámbito con `AND` con lo demás —nunca fundiéndolo en el mismo objeto que
  la búsqueda, como avisa QC-76: `OR` y `nameNormalized` al mismo nivel dejarían que un término de
  búsqueda ampliara lo visible—.
- **Toda escritura** que apunte a una fila existente (`updateMany`, `deleteMany`, el `findFirst` de
  `addBatchToAlive`) lleva el ámbito en el `where`, **no** en un `if` posterior sobre la fila leída.
  Mismo criterio que `deleted_at IS NULL` desde QC-20 R16.
- **Toda creación** escribe `companyId: scope.companyId` desde esta misma función (R17). La empresa
  no llega nunca por `NewProduct`, `NewProductBatch` ni `PresentationData`: **lo que no viaja en el
  tipo no se puede escribir por accidente** —el mismo argumento con el que QC-76 dejó `companyId`
  fuera de `UnitWriteRow`—.
- **Única excepción, explícita**: `findProductRefs` (`product-catalog-prisma.ts`) se queda sin ámbito
  (R29), con destino QC-50. Se escribe en el docblock del archivo y en el de `company-scope.ts`, no
  se deja como olvido.

## 6. Contratos de entrada/salida

### 6.1 Puertos (las firmas que cambian)

```ts
interface ProductRepository {
  create(data: NewProduct, now: Date, scope: InventoryScope): Promise<{ id: string }>;
  findAliveById(id: string, scope: InventoryScope): Promise<ProductView | null>;
  updateAlive(id: string, data: NewProduct, now: Date, scope: InventoryScope): Promise<boolean>;
  softDeleteAlive(id: string, now: Date, scope: InventoryScope): Promise<boolean>;
  listAlive(query: ListQuery, scope: InventoryScope): Promise<Page<ProductView>>;
  findAliveIdByName(name: string, scope: InventoryScope): Promise<string | null>;
  createWithFirstBatch(p: NewProduct, b: NewProductBatch, now: Date, scope: InventoryScope): Promise<{ id: string; batchId: string }>;
  addBatchToAlive(productId: string, b: NewProductBatch, now: Date, scope: InventoryScope): Promise<{ batchId: string } | null>;
}

interface PresentationRepository {
  create(data: PresentationData, scope: InventoryScope): Promise<{ id: string } | 'duplicate' | 'invalid_unit'>;
  replace(id: string, data: PresentationData, scope: InventoryScope): Promise<'ok' | 'not_found' | 'duplicate' | 'invalid_unit'>;
  deleteById(id: string, scope: InventoryScope): Promise<'deleted' | 'not_found' | 'in_use'>;
  list(query: ListQuery, scope: InventoryScope): Promise<Page<PresentationView>>;
}
```

El ámbito va **al final** de cada firma: el diff queda mínimo y ninguna llamada existente cambia de
orden de argumentos. Los resultados discriminados no crecen: **«de otra empresa» se devuelve como
`null` / `false` / `'not_found'`**, o sea por el mismo camino que «no existe», que es justo lo que
R15 y R16 piden. El dominio no necesita distinguirlos porque no debe distinguirlos.

### 6.2 Salida pública

`ProductView`, `PresentationView` y los estados de las Server Actions **no ganan `companyId`** (R19).
La empresa entra en la consulta y no sale hacia el navegador — mismo criterio con el que QC-39 dejó
`companyId` dentro de `unit-prisma.ts` y publicó solo `isSystem`.

### 6.3 Errores: nada nuevo en el catálogo

El acceso cruzado **reutiliza el catálogo cerrado de QC-70** y no inventa ningún código:

| Caso | Código | Por qué |
| --- | --- | --- |
| Ficha / edición / borrado / lote de un **producto** de otra empresa | `product_not_found` | Ya existe y su mensaje es exactamente el que hay que dar |
| Edición / borrado de una **presentación** de otra empresa | `presentation_not_found` | Íd. |
| Entrada que rompe la coherencia (lote con empresa distinta de su producto, unidad ajena) | `invalid_input` | Es entrada inválida, como ya lo es una FK rota en este módulo |

**Nunca `unauthorized`.** Distinguir «no puedes» de «no existe» sobre datos ajenos es un oráculo de
existencia: quien sondea identificadores aprendería qué filas tienen las demás empresas. Es la misma
decisión que `update-unit.ts` ya toma (QC-76: `companyId !== actor.companyId` → `UnitNotFoundError`)
y el mismo criterio con el que la zona privada responde 404 y no 403 (`docs/architecture.md >
Permisos y autenticacion`). **No se añade ninguna fila a `ERROR_CODES`** y la guardia del catálogo
sigue verde.

## 7. Composición

`lib/composition/index.ts` no cambia de forma: sigue atando puerto → implementación y **no resuelve
el actor** (eso es de la Server Action). Las funciones del adaptador cambian de firma, así que los
objetos `productRepository` y `presentationRepository` siguen compilando sin tocar una línea siempre
que los nombres se conserven — y se conservan.

## 8. El E2E sin dos sesiones simultáneas

`e2e/aislamiento-inventario.spec.ts`, siguiendo el patrón de `e2e/permisos.spec.ts` (fixture propio,
prefijo propio por worker, limpieza defensiva por antigüedad).

**El problema no existe**: no hacen falta dos sesiones vivas. La sesión real es **una sola**, la de la
empresa A; los datos de la empresa B **no necesitan sesión para existir** — se siembran directamente
con Prisma en el `beforeAll`, igual que `permisos.spec.ts` siembra su empresa y su usuario. Lo que se
prueba es qué hace *una* sesión frente a datos ajenos, y eso es exactamente lo que R27 pide.

Recorrido, un solo test encadenado (mismo criterio que `permisos.spec.ts`: partirlo obligaría a
recrear la sesión en cada paso y dejaría sin cubrir que los pasos encajan seguidos):

1. **Fixture**: empresa A con usuario y rol reales (hash real), empresa B con **un producto, una
   presentación y un lote**. Prefijos propios, todo borrado al final.
2. Login por la UI como el usuario de A.
3. `/inventario`: la tabla **no** contiene el producto de B (aserción sobre el HTML servido, no
   sobre el DOM filtrado en cliente). Ídem en `/configuracion/presentaciones` con la presentación
   de B.
4. **«Conociendo el identificador»**: se abre el diálogo de borrado de un producto **propio** y se
   sustituye por DOM el valor del campo oculto `data-testid="delete-product-id"` por el
   identificador del producto **de B**; se confirma. Se espera el mensaje de error
   (`delete-product-error`) y, comprobado con Prisma, que el producto de B siga con `deleted_at`
   nulo. Esto ejercita la Server Action real con un identificador ajeno, sin inventar ninguna ruta
   ni fabricar peticiones a mano.
5. **La unicidad por empresa, de verdad**: se crea en A una presentación con el **mismo nombre** que
   la de B y se espera que la operación tenga éxito.

**Lo que este E2E no cubre y cubren los otros niveles**: cada uno de los nueve casos de uso (test de
service con dobles), cada `where` del adaptador (test de integración contra la base) y los
disparadores y el backfill (test de integración + test de texto de la migración).

## 9. Alternativas descartadas

**A) Implementar el aislamiento con policies de RLS y `set_config('app.company_id', …)` por
petición.** Es la respuesta canónica en Supabase y la descartamos entera. Prisma se conecta con el
dueño de las tablas, no setea claims, y el pooler en modo transacción no garantiza que el
`set_config` y la consulta caigan en la misma sesión física: la policy filtraría de más o de menos
según la suerte del pool. Además `docs/architecture.md` ya lo tiene cerrado: **un aislamiento que
solo existe como policy no cuenta como implementado**. La RLS se queda como defensa en profundidad
(R5, R26).

**B) Repetir el filtro en cada caso de uso.** Es lo que sale solo si nadie decide nada: doce `where`
con `companyId` escritos a mano. Descartada por la decisión cerrada 7 y por QC-76 D15: ninguna base
lo garantiza, y la consulta número trece —la que escriba otra ficha dentro de tres semanas— se
olvida. El § 5 pone el ámbito en la **firma del puerto**, donde olvidarlo en una llamada no
compila y olvidarlo en una implementación lo caza la guardia por función del § 4.2.

**C) Una extensión del cliente Prisma (`$extends`) que inyecte el `where` globalmente.** Tentadora:
cero cambios en los adaptadores. Descartada por dos motivos. Es **implícita** —una consulta filtra
por algo que no está escrito en el archivo que la escribe, y el día que falle nadie sabrá por qué—; y
es **global**, así que afectaría a `identity`, `recetas`, `proveedores` y `pedidos`, que esta ficha no
aísla (R28).

**Revisado el 2026-09-11 (F2.2).** Este descarte tenía un **tercer** motivo —«no da la garantía de
compilación»— y ese motivo **se cae** con la corrección del § 4.2: el enfoque explícito tampoco la da
para la implementación. **El descarte se sostiene igual**, y conviene decir por qué en vez de
maquillarlo: los otros dos motivos son **independientes** del compilador y cada uno basta por sí
solo. El de ser implícita es un argumento de legibilidad y de depuración, no de tipos. El de ser
global es un argumento de **alcance**: R28 deja fuera a cuatro módulos, y una extensión del cliente
los alcanzaría a todos —o habría que enseñarle a distinguir tabla por tabla, que es la misma
enumeración explícita con peor sitio donde vivir—. Y hay un motivo **nuevo a favor** del enfoque
elegido: el ámbito explícito en la firma admite el chequeo mecánico **por función** del § 4.2, que
sobre un `$extends` no existiría —no hay nada escrito en el archivo que una guardia pueda leer—.

**D) Presentaciones con `company_id` opcional, copiando el patrón de QC-76 (catálogo compartido con
presentaciones «de sistema»).** Encaja mejor con lo ya construido y ahorra la migración de datos.
Descartada porque **la decisión cerrada 3 la descarta**: no hay catálogo de presentaciones
compartido. Anotado además el coste técnico que evita: la columna opcional habría obligado a los dos
índices únicos parciales de QC-76 y a un `OR` en cada consulta, que es precisamente el `OR` que puede
ensanchar lo visible si alguien lo compone mal.

**E) Que el lote herede la empresa por `join` con su producto.** Cero columna, cero backfill en
`product_batches`. Descartada por la decisión cerrada 2: QC-81 necesita `UNIQUE (company_id, lot)` y
un índice no puede indexar la columna de otra tabla. Habría que rehacer la migración tres semanas
después, sobre más datos.

**F) Pasar el `companyId` como parámetro suelto a cada caso de uso, fuera del `Actor`.** Descartada
con el argumento literal de QC-76: como argumento separado, cada llamante nuevo puede olvidarse de
pasarlo o —peor— **elegirlo**. Dentro del actor viaja siempre junto a los permisos y lo rellena un
solo sitio, el adaptador driving, desde el contexto de sesión del servidor.

## 10. Dependencias de terceros

**Ninguna nueva** (R32). Esto es esquema, migración, dos disparadores, una definición de ámbito y un
campo más en un tipo: no hay nada que una librería mantenida resuelva mejor. Regla 7 de `CLAUDE.md`
sin propuesta que abrir, así que no hay cuatro checks que reportar ni fila que añadir a
`docs/dependencias.md`.

## 11. Riesgos y costes aceptados

1. **Drift de Prisma.** Las tres FK y los dos disparadores viven escritos a mano en el SQL. Toda
   migración futura de estas tablas hay que revisarla a mano; los comentarios `///` del esquema lo
   avisan en los tres modelos.
2. **`supplier_catalog_lines.presentation_id` queda sin coherencia de empresa** (pregunta abierta 3):
   `proveedores` se aísla en QC-59 y esta ficha no lo abre.
3. **`ProductCatalog.findRefs` sin ámbito** (R29, pregunta abierta 2), con destino QC-50.
4. **Índices de listado no recompuestos** (§ 2.2): decisión de volumen, no de corrección.
5. **El backfill depende de que exista la empresa «QuimiCloud»**. Si alguien corre la migración sobre
   una base sin ella y con varias empresas, aborta entera y con mensaje: es el comportamiento que R3
   pide, pero conviene saberlo antes de aplicarla en un entorno nuevo.

## 12. UI

No hay pantalla nueva ni cambio visual: las dos pantallas existentes ven menos filas, nada más. No
aplica la regla multiplataforma más allá de lo que ya cumplen.
