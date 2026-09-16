# QC-60 — aislamiento-por-empresa-en-pedidos · design.md

> Cómo se construye lo que `requirements.md` pide. El **Alcance** y la tabla de **decisiones
> cerradas** los fijó el humano el 2026-09-15 y aquí **no se reabren**: lo que sigue es *cómo* se
> cumplen, no *si* se cumplen.
>
> Precedente que manda: **QC-49** (`specs/QC-49-aislamiento-por-empresa-en-inventario/`), la ficha
> hermana de la misma épica. Ocho de las catorce decisiones se heredan de allí y lo dicen por
> escrito, así que aquí se copian sus soluciones en vez de reinventarlas, y solo se argumenta lo que
> es **propio de pedidos**: el correlativo y el enlace compuesto de `order_assignments`.

## 0. Hallazgos

Medidos en disco y contra la base el 2026-09-15, dentro de este worktree.

### 0.1. Ninguna contradicción con las decisiones cerradas

Reviso las catorce y **ninguna choca con el código**. Lo que sigue es lo que hay que saber antes de
leer el resto, no objeciones.

### 0.2. La tabla de decisiones tiene **catorce** filas, no trece

El encargo del leader habla de «13 decisiones cerradas». La semilla
(`requirements.md:53-67`) trae **14**: la decimocuarta es «Identificadores, marcas de tiempo y
borrado». **No reabro nada**: cubro las catorce en la tabla de trazabilidad, y la catorce sale como
R8 y R9. Lo digo aquí porque el leader va a contar.

### 0.3. El estado real de la tabla

- `db/schema.prisma:1080-1105`, modelo `Order`: **no hay `companyId`**. Índice único
  `@@unique([orderYear, orderSequence], map: "orders_order_year_order_sequence_key")` (`:1100`).
  Tres FK escritas a mano (`recipes`, `users` × 2), seis `CHECK`, cuatro índices parciales de QC-57
  y RLS `ENABLE` + `FORCE`, todo **drift para Prisma** y avisado en los `///` del modelo
  (`:1060-1078`).
- **Un pedido es `recipe_id` + `quantity`.** No existe ninguna tabla de líneas: la decisión 1 lo
  dice y el esquema lo confirma.
- `db/migrations/20260904135210_order_cancellation/migration.sql:86-102`: la función
  `next_order_sequence(p_year integer)` hace `nextval` sobre **una secuencia por año**
  (`orders_sequence_2026`), creada perezosamente en la primera alta del año, con
  `pg_advisory_xact_lock(hashtext(seq_name))` **solo** en esa rama. Se evalúa **dentro del
  `INSERT`** (`order-prisma.ts:192-209`, `$queryRaw`, la única operación del módulo que no usa la
  API tipada).
- La cabecera de esa misma migración (`:22-29`) **documenta el agujero de la secuencia**: solo sabe
  de los números que ella entregó, y quien cargue filas por otra vía tiene que hacer `setval` a
  mano. Este párrafo es la razón principal de §3.
- Base de desarrollo: **3 pedidos vivos**, todos de QuimiCloud, correlativos **37, 44 y 77** de
  2026; **0 filas** en `order_assignments`; **48 empresas**, una sola real; 5 recetas.
- `recipes` **no tiene** `company_id` (QC-50, `pending`).

### 0.4. `order_assignments` ya está medio resuelto, y el esquema lo dice

`db/schema.prisma:1122-1157`, bloques `OJO 1` y `OJO 2`: las FK hacia `users` y `work_groups` **ya
son compuestas con `company_id`** y apuntan a `users_id_company_id_key` y
`work_groups_id_company_id_key`. La del pedido es **simple a propósito** y el comentario escribe por
qué: «`orders` no tiene `company_id` —eso es la épica QC-46— y esta ficha NO se lo añade (R14)».
Esta ficha es la que cobra ese cheque. Con **0 filas** guardadas, cuesta cero.

### 0.5. El actor de `pedidos` todavía no lleva empresa; el de `asignaciones` sí

`lib/modules/pedidos/domain/actor.ts:16-19`: `Actor = { id, permissions }`.
`order-actions.ts:114-118`: `currentActor()` llama **solo** a `getSessionUser()`.
`lib/modules/asignaciones/domain/actor.ts:35` **sí** declara `companyId`, y su Server Action ya pide
las dos caras de la sesión. O sea: el lado de `asignaciones` de R27 no necesita fontanería nueva.

### 0.6. No hay «un único punto de consulta» hoy

Hay **siete** sitios que tocan la tabla: cinco en `order-prisma.ts` (`createOrder` en SQL crudo,
`findAliveOrderById`, `buildOrderWhere` —compartido por el `findMany` y el `count`—,
`updateAliveOrder`, `cancelAliveOrder`, `softDeleteAliveOrder`) y uno en
`order-catalog-prisma.ts` (`findAliveOrderTargetById`). El SQL crudo del alta es el que rompe el
molde de QC-49: no se le puede esparcir un `Prisma.OrderWhereInput`.

### 0.7. El aislamiento de los tests de integración (QC-77)

Igual que anotó QC-81: añadir una migración cambia la huella de la plantilla y se reconstruye sola;
`EXPECTED_FAILING_MIGRATION` (`tests/helpers/test-database.ts:95`) tolera **una sola** migración que
falle sobre base vacía, la de QC-49 — **la de esta ficha no puede fallar sobre base vacía** (§2.3);
y todo archivo nuevo de `tests/integration/**` hay que declararlo en
`tests/integration/aislamiento.json`.

## 1. Panorama: qué se mueve y qué no

| Capa | Qué cambia |
| --- | --- |
| Base + Prisma | `orders.company_id` NOT NULL, FK, índice, unicidad `(empresa, año, secuencia)`, clave candidata `(id, company_id)`, FK compuesta de `order_assignments`, muerte de `next_order_sequence(integer)`, backfill (§2, §3) |
| Dominio | `Actor` gana `companyId`; nace `OrderScope`; el puerto y el catálogo exigen el ámbito en la firma (§4) |
| Adaptador driven | **un único punto** donde se escribe «de la empresa», y las siete operaciones lo componen (§5) |
| Adaptador driving | `currentActor()` pide **las dos caras** de la sesión (§4.1) |
| Frontera con `asignaciones` | `OrderCatalog.findAliveById` gana la empresa; sus cuatro llamantes ya la tienen (§6) |

Lo que **no** se mueve: el contrato genérico de consulta (QC-57), el orden por defecto, la
paginación, la forma de todos los resultados públicos, la tabla de transiciones, el borrado lógico y
los seis `CHECK` de `orders` (R34).

**La frontera es el service, no la RLS.** Prisma conecta como dueño de las tablas y no setea
`request.jwt.claims`: ninguna policy filtra nada. La RLS se conserva activada y forzada como defensa
en profundidad (R4, R30). Es la decisión cerrada 10 y ya está escrita en `actor.ts:37-39`.

## 2. Modelo de datos

### 2.1. La columna

```
orders.company_id  UUID NOT NULL  REFERENCES companies(id) ON DELETE RESTRICT ON UPDATE CASCADE
```

- **Obligatoria** (R1). No hay «pedido de sistema» que justifique la columna opcional de QC-76.
- `ON DELETE RESTRICT`: `companies` tiene borrado lógico (QC-47), así que R29 se cumple sin hacer
  nada; el `RESTRICT` deja escrito que un borrado físico no puede dejar pedidos huérfanos.
- En `db/schema.prisma` va como **escalar sin `@relation`**, como las otras tres FK de `Order` y por
  el mismo motivo que ya escribe su `///`: con `@relation`, el cliente Prisma dejaría hacer
  `include: { company: true }` desde `pedidos` —una lectura de `identity` que ninguna guardia de
  imports ve—. **La FK va escrita a mano en el `migration.sql` y es drift** (R8, riesgo 1 de §11).

### 2.2. Índices y claves

```sql
-- fuera el único GLOBAL
DROP INDEX "orders_order_year_order_sequence_key";

-- la unicidad pasa a medirse dentro de la empresa (R11)
CREATE UNIQUE INDEX "orders_company_year_sequence_key"
  ON "orders" ("company_id", "order_year", "order_sequence");

-- clave candidata que hace posible la FK compuesta de `order_assignments` (R25)
ALTER TABLE "orders" ADD CONSTRAINT "orders_id_company_id_key" UNIQUE ("id", "company_id");
```

- **No hace falta `orders_company_id_idx` aparte** (R10): `orders_company_year_sequence_key` lleva
  `company_id` **de cabeza** y sirve para el filtro de listado y para la verificación del `RESTRICT`.
  Es el mismo criterio con el que QC-49 dejó `presentations` sin índice propio. Y no es parcial: la
  verificación del `RESTRICT` tiene que ver también los pedidos con borrado lógico.
- `orders_id_company_id_key` es literalmente el patrón de `users_id_company_id_key` y
  `work_groups_id_company_id_key` (QC-83), a los que las otras dos FK de `order_assignments` ya
  apuntan. Sin ella, la FK compuesta fallaría con `42830`.
- **Los cuatro índices parciales de QC-57 no se recomponen** (`orders_status_idx`,
  `orders_priority_idx`, `orders_created_at_idx`, `orders_quantity_idx`). Lo correcto a largo plazo
  sería anteponerles `company_id`; con **3 pedidos** eso es afinar sobre un `seq scan` que ya gana.
  Coste aceptado y anotado, mismo criterio que QC-49 §2.2.
- En Prisma: `@@unique([companyId, orderYear, orderSequence], map: "orders_company_year_sequence_key")`
  sustituye al `@@unique([orderYear, orderSequence])`. No es parcial ni funcional, así que Prisma sí
  sabe modelarlo y **en ese punto no queda drift**. `orders_id_company_id_key` se declara también
  como `@@unique([id, companyId], map: "orders_id_company_id_key")`, por la misma razón.

### 2.3. El enlace compuesto de `order_assignments` — y aquí se cruza una frontera

```sql
ALTER TABLE "order_assignments" DROP CONSTRAINT "order_assignments_order_id_fkey";
ALTER TABLE "order_assignments" ADD CONSTRAINT "order_assignments_order_id_company_id_fkey"
  FOREIGN KEY ("order_id", "company_id") REFERENCES "orders"("id", "company_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
```

**La frontera, declarada explícitamente** (decisión cerrada 5, y es deliberada): `order_assignments`
pertenece al módulo **`asignaciones`** (`/// @module asignaciones`, `db/schema.prisma:1188`), no a
`pedidos`. Esta feature toca **una tabla de otro módulo**, y lo hace en la capa donde eso es legal
—la base de datos, no el código—: ni `pedidos` importa nada de `asignaciones`, ni al revés más allá
del contrato público que ya existe (§6). Lo que cambia es una restricción de integridad que el
propio esquema de `asignaciones` dejó pedida por escrito.

Reglas que hay que respetar al escribirla, tomadas de los cinco bloques `OJO` del modelo:

1. **Sin `@relation`** en el esquema Prisma. La FK nueva es **drift**, igual que las tres que ya hay.
2. **A mano en el `migration.sql`.** Si se genera con `prisma migrate dev`, va a emitir
   `DROP CONSTRAINT` sobre las dos FK compuestas a `identity` y sobre el `CHECK` del nombre de
   grupo: **hay que borrarlo a mano del SQL generado** (R26). Es el riesgo 5 que el esquema ya
   nombra. Lo vigila un test de texto de la migración.
3. **`MATCH SIMPLE`**, el de Postgres por defecto, y **no se escribe `MATCH FULL`** en ninguna FK del
   archivo. En la del pedido da igual —`order_id` y `company_id` son las dos NOT NULL—, pero
   escribir `MATCH FULL` «por coherencia» en la del grupo mataría las asignaciones sueltas (`OJO 3`).
4. **Cero filas** hoy, así que no hay backfill ni guardia de datos que escribir para esta FK. El
   `down.sql` sí lleva la suya (R6): si alguien guardó asignaciones cuya empresa no es la de su
   pedido, volver a la FK simple las dejaría mintiendo.

Efecto útil inmediato: asignar un pedido de otra empresa pasa a ser **imposible por construcción**,
sin que `asignaciones` escriba una sola línea. El caso de uso lo rechazará antes y con mejor mensaje
(§6), pero la base ya no depende de que nadie se olvide.

### 2.4. Nada de disparadores

A diferencia de QC-49, aquí **no hace falta ningún disparador de coherencia**: las dos reglas que
QC-49 tuvo que escribir en plpgsql —«el lote es de la empresa de su producto» y «la unidad es de su
empresa o de sistema»— aquí las expresa una **FK compuesta**, que es una restricción declarativa y
más barata. La única coherencia que queda sin cubrir es pedido → receta, y está **fuera de alcance
por decisión cerrada 4** (R32).

## 3. El correlativo: el punto caliente

### 3.1. El problema, en una frase

Hoy el número lo reparte `next_order_sequence(p_year)` con una **secuencia por año** evaluada dentro
del `INSERT`. El eje deja de ser el año y pasa a ser `(empresa, año)`. Hay dos formas de llevarlo
allí y **no son equivalentes**.

### 3.2. Lo elegido: bloqueo de aviso por `(empresa, año)` + `max()+1` + índice único

Es el patrón que **QC-81** dejó escrito y verificado para el lote (`§3.2` y `§6 A` de su
`design.md`), adaptado. Dentro de una `prisma.$transaction`, **dos sentencias**:

```
1. SELECT pg_advisory_xact_lock(<ns>, hashtext('orders_sequence:' || :companyId || ':' || :year))
2. INSERT INTO "orders" (company_id, order_year, order_sequence, …)
   VALUES (
     :companyId::uuid,
     :year::integer,
     (SELECT COALESCE(max("order_sequence"), 0) + 1
        FROM "orders" WHERE "company_id" = :companyId::uuid AND "order_year" = :year::integer),
     …)
   RETURNING "id", "order_year", "order_sequence"
```

**Por qué el lock es una sentencia aparte y va ANTES del `INSERT`, y no dentro de una función
evaluada en el `INSERT` —que es como está hoy—.** Prisma trabaja en `READ COMMITTED`, donde **cada
sentencia toma su propia instantánea al empezar**. Si la sesión B pidiera el lock *dentro* de la
sentencia que calcula el máximo, su instantánea ya estaría tomada **antes** de que A comiteara: B
leería el mismo máximo que A y propondría el mismo número. Tomándolo en una sentencia anterior, B
**espera** ahí; cuando A comitea y B sigue, la sentencia 2 arranca después y su instantánea **sí**
ve la fila de A. Esto es lo que hace que R14 se cumpla sin depender del reintento. El argumento
completo, con el precedente medido, está en QC-81 `design.md > 3.2`.

Detalles que no son adorno:

- **El lock es `xact`**: se suelta solo al comitear o abortar, no hay camino que lo deje tomado. Se
  pide **uno solo**, así que no hay orden de adquisición y no hay interbloqueo posible. Se usa la
  forma de **dos enteros** (`(ns, clave)`), que no colisiona con el `pg_advisory_lock(bigint)` de
  `tests/helpers/test-database.ts`.
- **El máximo NO filtra `deleted_at` ni el estado** (R12): un pedido borrado o cancelado conserva su
  número y no lo libera. `softDeleteAliveOrder` ya lo dice por escrito (`order-prisma.ts:534-537`).
- **La serie es por `(empresa, año)`**, no por empresa: el `CHECK
  orders_order_year_matches_created_at` de QC-33 sigue en pie y el año sigue saliendo del mismo
  `now` que `created_at` (`order-prisma.ts:165-170`). Eso no se toca.
- **El alta sigue en SQL crudo**, y ahora con más razón: el `max()` tiene que evaluarse **dentro**
  del `INSERT` para que no haya ventana entre leerlo y escribirlo. Lo que cambia es que el
  `$queryRaw` pasa a ir dentro de un `prisma.$transaction`, porque el lock de aviso `xact` tiene que
  compartir transacción con el `INSERT`.

**La función `next_order_sequence(integer)` muere en esta migración** (`DROP FUNCTION`), porque su
firma ya no puede expresar la serie y dejarla viva sería una segunda definición del correlativo
esperando a que alguien la llame. El `down.sql` la recrea **idéntica** (R5).

**Las secuencias `orders_sequence_<año>` que ella creó no se borran**, y es deliberado: son el único
sitio donde vive el estado del contador **global** y el `down.sql` las necesita para cumplir R7. Del
UP al DOWN quedan como objetos inertes que nadie llama. Coste aceptado, anotado en §11.

### 3.3. Si aun así chocan (R15)

El índice único `orders_company_year_sequence_key` es **la** garantía; el lock es solo la manera de
no chocar casi nunca. `isDuplicateOrderNumber` (`order-prisma.ts:138-147`) ya reconoce el `23505`
por el **nombre del índice** dentro de la carga del error, y esa técnica **sigue siendo la
correcta aquí** —a diferencia de lo que corrigió QC-81—: el alta inserta con `$queryRaw`, así que el
conector **no** entrega `meta.target` con las columnas; lo único estructurado es el SQLSTATE y el
nombre de la restricción, que Postgres nunca traduce. Lo que cambia es **la constante**:
`ORDER_NUMBER_UNIQUE_INDEX` pasa a valer `'orders_company_year_sequence_key'`.

Ante ese choque, el adaptador **reintenta la transacción entera hasta 3 veces** —transacción nueva,
instantánea nueva, máximo nuevo—, con el reintento **fuera** de `prisma.$transaction` porque una
transacción abortada no admite más sentencias. Agotados los tres, devuelve `'duplicate_number'`, que
es el resultado discriminado que el puerto ya declara y que `create-order.ts:101` ya convierte en
`DuplicateOrderNumberError`. **Ni el puerto ni el catálogo de errores crecen.**

### 3.4. Consecuencias aceptadas, dichas en voz alta

- **Se acaban los huecos por transacción abortada.** Hoy `nextval` consume su número aunque el alta
  falle, y QC-33 R42 / QC-34 decisión 27 lo aceptaron por escrito. Con `max()+1` el número no se
  consume. Es una **derogación de un coste aceptado, no de un requisito**: aquellas fichas
  aceptaron que *pudiera* haber huecos, no exigieron que los hubiera. Los huecos que ya existen
  —37, 44, 77— se conservan intactos (R13), porque la serie continúa desde el máximo, no desde el
  recuento.
- **Cola por `(empresa, año)`.** Dos altas simultáneas de la misma empresa y el mismo año se
  serializan durante el `INSERT`. Con el volumen de esta aplicación es irrelevante, y es el precio
  de que la serie continúe desde el máximo real. **Empresas distintas no se esperan** (R14), porque
  la clave del lock las separa.
- **El backfill no tiene que sincronizar ningún contador** (R13). Con `max()+1` el estado del
  correlativo es **derivado del dato**, no un objeto aparte que pueda desincronizarse. El siguiente
  pedido de QuimiCloud en 2026 es el **78** sin que la migración escriba nada, y el agujero que la
  cabecera de QC-34 documenta (`:22-29`) deja de existir para siempre: una importación ya no puede
  dejar el contador atrasado.

## 4. Cómo llega el `companyId` hasta el caso de uso y el repositorio

Sin que `pedidos/domain/**` importe sesión, cookie ni `next/*`. Es la respuesta de QC-49 §4,
verificada contra el código de esta rama.

### 4.1. El actor lo trae, y lo rellena el adaptador driving

`lib/modules/pedidos/domain/actor.ts`:

```ts
export type Actor = {
  readonly id: string;
  readonly companyId: string;          // NUEVO
  readonly permissions: readonly string[];
};
```

Va **dentro del actor** y no como parámetro suelto de cada caso de uso: viaja siempre junto a los
permisos, así que ningún llamante nuevo puede olvidarse de pasarla ni —peor— **elegirla**. El archivo
ya importa del barrel de `identity`; **no se añade ningún import nuevo**.

`order-actions.ts` construye el actor con **las dos caras** de la sesión, exactamente como
`unit-actions.ts`, `product-actions.ts` y `order-assignment-actions.ts`:

```ts
const [sessionUser, sessionContext] = await Promise.all([
  identity.getSessionUser(),
  identity.getSessionContext(),
]);
if (sessionUser === null || sessionContext === null) return null;   // falla cerrado (R17)
return { id: sessionUser.id, companyId: sessionContext.companyId, permissions: sessionUser.permissions };
```

Con actor `null`, `requirePermission` rechaza en la primera línea del caso de uso, antes de tocar
ningún puerto. **Sin contexto no hay actor, y sin actor no hay consulta.** Las seis firmas públicas
de las Server Actions no cambian (R34).

### 4.2. El dominio traduce actor → ámbito, y el puerto lo exige

Nace `lib/modules/pedidos/domain/order-scope.ts`, dominio puro:

```ts
/** Empresa EN CUYO NOMBRE se consulta o se escribe. No autoriza: filtra. */
export type OrderScope = { readonly companyId: string };
```

Los **seis** métodos de `OrderRepository` y el único de `OrderCatalog` ganan `scope: OrderScope`
**al final** de la firma: el diff queda mínimo y ninguna llamada existente cambia de orden de
argumentos.

```ts
interface OrderRepository {
  create(data: NewOrder, year: number, actorId: string, now: Date, scope: OrderScope): Promise<OrderRow | 'duplicate_number'>;
  findAliveById(id: string, scope: OrderScope): Promise<OrderRow | null>;
  listAlive(query: ListQuery, scope: OrderScope): Promise<Page<OrderRow>>;
  updateAlive(id: string, data: NewOrder, actorId: string, now: Date, scope: OrderScope): Promise<'ok' | 'not_found'>;
  cancelAlive(id: string, reason: string, actorId: string, now: Date, scope: OrderScope): Promise<'ok' | 'not_found'>;
  softDeleteAlive(id: string, actorId: string, now: Date, scope: OrderScope): Promise<'ok' | 'not_found'>;
}
```

Los resultados discriminados **no crecen**: «de otra empresa» se devuelve como `null` /
`'not_found'`, o sea por el mismo camino que «no existe», que es justo lo que R20 y R21 piden. El
dominio no necesita distinguirlos porque **no debe** distinguirlos.

**Que esté en la firma hace que una llamada que la omita no compile. Una implementación que la
omita, en cambio, SÍ compila** —TypeScript admite asignar una función de menor aridad donde se
espera una de mayor, y así es como `lib/composition/index.ts` ata las funciones sueltas del
adaptador—. Esto **no es una suposición**: lo verificó el `reviewer` de QC-49 contra el `tsc` de este
repo y está escrito en su `requirements.md:111-121` y su `design.md:240-263`. Por eso la segunda
mitad de R18 la cierra una **guardia estática por función**, no el compilador (§8).

El caso de uso solo hace de correa: exige el permiso primero, valida la entrada, y pasa
`{ companyId: actor.companyId }` al puerto. No construye SQL y no conoce ninguna condición.

## 5. El único punto de consulta

Nace `lib/modules/pedidos/adapters/driven/persistence/company-scope.ts`:

```ts
/** LA definicion de «de la empresa» del modulo `pedidos`. Se escribe UNA vez. */
function companyScope(scope: OrderScope): { companyId: string } {
  return { companyId: scope.companyId };
}

export function orderCompanyScope(s: OrderScope): Prisma.OrderWhereInput { return companyScope(s); }
export function companyScopeColumns(s: OrderScope): { companyId: string } { return companyScope(s); }
```

Las envolturas existen **solo para tipar**: delegan en la misma función, así que hay una definición y
no varias. Reglas de uso, que la guardia y los tests hacen cumplir:

- **Toda lectura** compone el ámbito con `AND` con lo demás —nunca fundiéndolo en el mismo objeto que
  los filtros—: un `OR` y `companyId` al mismo nivel dejarían que un filtro ampliara lo visible. En
  `buildOrderWhere` el ámbito entra **antes** de los filtros y al mismo nivel que `deletedAt: null`,
  que es exactamente el sitio donde el código ya demuestra que no se olvida.
- **Toda escritura que apunte a una fila existente** (`updateMany` × 3) lleva el ámbito **en el
  `where`**, no en un `if` posterior sobre la fila leída. Mismo criterio que `deleted_at IS NULL`
  desde QC-34 R40.
- **El `count` del listado usa literalmente el mismo objeto `where`** que el `findMany`, como ya hace
  hoy (R19): el total no puede describir un conjunto distinto del que se devuelve.
- **El alta escribe `companyId` desde `companyScopeColumns`** (R22). La empresa **no** viaja en
  `NewOrder` ni en `createOrderSchema`: lo que no está en el tipo no se puede escribir por accidente,
  y lo que el esquema no declara se rechaza por campo desconocido.
- **Ninguna excepción.** A diferencia de QC-49, que dejó `ProductCatalog.findRefs` fuera de ámbito
  (su R29) porque `recetas` lo llama sin sesión, aquí **`OrderCatalog` sí se acota** (§6): sus cuatro
  llamantes son casos de uso de `asignaciones` que ya tienen la empresa en su actor. La guardia de
  §8 no lleva lista de excepciones, y eso es una mejora sobre el precedente.

**El caso raro, y por qué no rompe la regla.** El alta va en SQL crudo y no puede recibir un
`Prisma.OrderWhereInput`. Recibe `companyScopeColumns(scope).companyId` como **parámetro tipado del
template tag** (`::uuid`), nunca interpolado como cadena; y lo usa en los **dos** sitios de la misma
sentencia: la columna que escribe y el `WHERE` del subselect del máximo (R24). La guardia comprueba
que esa función es la que le da el valor, no una lectura suelta de `scope.companyId`.

## 6. La frontera con `asignaciones`, del lado del código

`OrderCatalog.findAliveById(id)` pasa a `findAliveById(id, companyId)`. Razón: es una **consulta del
módulo `pedidos`** y el Alcance dice «toda consulta». Cuesta poco y cierra un agujero real:

- Sus **cuatro** llamantes (`assign-responsibles.ts:95`, `list-order-responsibles.ts:87`,
  `unassign-responsible.ts:60`, `remove-work-group-from-order.ts:60`) son casos de uso de
  `asignaciones` cuyo `Actor` **ya declara `companyId`** (`asignaciones/domain/actor.ts:35`). Pasan
  `actor.companyId` y nada más cambia.
- Sin esto, asignar responsables a un pedido ajeno moriría contra la FK compuesta de §2.3 con un
  `23503` sin traducir —un error feo en vez de «ese pedido no existe»—. Con esto, el caso de uso lo
  rechaza **en el service** con su error de siempre (R27).
- **Qué tipo se pasa.** `companyId: string` suelto y **no** `OrderScope`: `OrderScope` es un tipo
  interno de `pedidos` y exportarlo por el barrel para que `asignaciones` lo construya sería
  acoplarlos por un dato que ya es una cadena en los dos lados. Es la misma asimetría que el propio
  `OrderCatalog` ya practica (`OrderAssignmentTarget` es un tipo de frontera, no el `OrderRow`
  interno).

**Lo que esta ficha NO hace en `asignaciones`**: no toca sus consultas de listado ni su propio
ámbito por empresa —ya lo tiene—, no cambia ninguno de sus casos de uso más allá del argumento nuevo,
y no añade ni quita ninguna de sus restricciones (R26).

## 7. La migración

Una migración nueva, `db/migrations/<ts>_orders_company_scope/`, con `migration.sql` y `down.sql`
(R5). **Escrita entera a mano**, no generada por `prisma migrate dev`: `orders` y
`order_assignments` cargan con seis `CHECK`, cinco FK escritas a mano —dos de ellas compuestas—,
cuatro índices parciales y RLS forzada, todo lo cual `migrate dev` lee como drift y propone resetear
una base con datos. Es el mismo motivo y las mismas palabras que QC-76, QC-80, QC-49 y QC-81. Se
aplica con `pnpm run db:migrate` (`prisma migrate deploy`), que no mira drift.

### 7.1. UP, en orden

| # | Paso | Por qué ahí |
|---|---|---|
| 0 | `ALTER TABLE "orders" NO FORCE ROW LEVEL SECURITY` | **La mina de QC-49**: la tabla está `ENABLE`+`FORCE` **sin ninguna policy**, y bajo `FORCE` eso deniega también al dueño —con quien conecta Prisma— incluido el `SELECT`. Esta migración lee y escribe `orders`. Se cierra en el paso 8 |
| 1 | `ADD COLUMN "company_id" UUID` **anulable** | No hay `DEFAULT` que poner que no sea mentira |
| 2 | **Backfill** (R2) | La empresa se resuelve por `name_normalized = 'quimicloud'`, **nunca por identificador**: los uuid los genera `gen_random_uuid()` y difieren en cada base. Único fallback: que `companies` tenga exactamente **una** fila. Cualquier otro caso —cero, o varias sin la de nombre— `RAISE EXCEPTION` y la migración entera se deshace. **Todas** las filas, incluidas canceladas y con `deleted_at`. `ROW_COUNT` se compara contra el total de la propia tabla y aborta si no coincide. **Ningún `INSERT`, ningún `DELETE`** (R3) |
| 3 | `SET NOT NULL` | Llegar aquí significa que no queda ninguna fila sin valor |
| 4 | FK a `companies` (§2.1) | Después del relleno, por lo mismo |
| 5 | Guardia + intercambio del índice único (§2.2) | Antes del `CREATE UNIQUE`, un `RAISE EXCEPTION` si dos filas de la misma empresa comparten `(año, secuencia)` —imposible hoy, porque el único global aún vive, pero se escribe igual: el mensaje explica qué pasa, en vez de un `23505` suelto (calcado de QC-81 §2.1 paso 1) |
| 6 | `orders_id_company_id_key` y la FK compuesta de `order_assignments` (§2.3) | La clave candidata **antes** que la FK que la referencia, o `42830` |
| 7 | `DROP FUNCTION "next_order_sequence"(integer)` (§3.2) | Después de todo lo demás: mientras exista, nadie la llama ya |
| 8 | `ENABLE` + `FORCE ROW LEVEL SECURITY` | Cierra el paréntesis del paso 0. Explícito e idempotente (R4) |

Todo ocurre dentro de la **única transacción** en la que Prisma ejecuta el archivo: cualquier
`RAISE EXCEPTION` deshace el archivo entero y la migración queda sin aplicar y **sin marcar** en
`_prisma_migrations`.

### 7.2. Sobre la base vacía

**Ninguna sentencia de este archivo puede abortar por tabla vacía**, y eso no es un efecto
colateral: `tests/helpers/test-database.ts:95` tolera **una sola** migración fallida al construir la
plantilla, la de QC-49, y si ésta también fallara la construcción se caería entera (§0.7). Con cero
pedidos: el backfill actualiza cero filas y `0 = 0` cumple la comprobación de `ROW_COUNT`; el
`SET NOT NULL` pasa; los índices se crean vacíos. **Pero el paso 2 sí aborta si no puede resolver la
empresa**, exactamente como QC-49 — y esa es la razón por la que la plantilla de test siembra la
empresa inicial antes de migrar lo que queda. La migración de esta ficha es **posterior** a la de
QC-49, así que se aplica en ese paso, con «QuimiCloud» ya sembrada.

### 7.3. DOWN — y por qué **tiene que abortar entero**

Revierte en orden inverso y deja el esquema exacto anterior, **con el índice único global
restaurado**, **la FK simple de `order_assignments` restaurada** y **`next_order_sequence(integer)`
recreada** (R5). Lo primero del archivo, tras abrir el mismo paréntesis de RLS del UP —su guardia
**lee** `orders`, que bajo `FORCE` sin policy también está denegada; es la lección que QC-49 tuvo que
corregir en revisión—, es la **guardia de datos** (R6):

1. **Dos empresas que comparten `(año, secuencia)`** → abortar. Recrear el índice único **global**
   es imposible si dos empresas llevan cada una su serie, y con 48 empresas eso deja de ser
   hipotético en cuanto la segunda dé de alta un pedido. La alternativa —renumerar, o borrar la fila
   que estorba— **descartaría dato de un cliente en silencio**, que es peor que no poder revertir.
   Precedente literal: **QC-49 R7** con las presentaciones homónimas.
2. **Alguna fila cuya empresa no sea la que escribió el UP** → abortar: quitar la columna convertiría
   los pedidos de varias empresas en un único montón indistinguible.
3. **Alguna asignación cuya empresa no sea la de su pedido** → abortar: volver a la FK simple dejaría
   esa fila mintiendo para siempre, y ninguna restricción la volvería a mirar.

Los tres mensajes dicen **cuántas filas** y **qué hacer**, no solo que falló.

Y después, R7: `setval('orders_sequence_<año>', max("order_sequence") de ese año)` para cada año
presente en `orders`. Es literalmente el remedio que la cabecera de la migración de QC-34 dejó
escrito (`:26-28`). Sin esto, revertir dejaría el contador global apuntando a un número ya usado y la
primera alta posterior chocaría contra el índice global recién recreado.

**Ninguna fila se borra.** `pnpm run db:rollback` lo aplica y deja `_prisma_migrations` coherente.

## 8. Verificación: cómo se cierra la segunda mitad de R18

Tres piezas, ninguna sustituible por otra:

1. **Guardia estática por función**, `tests/guards/guard-ambito-empresa-pedidos.test.ts` (nueva),
   calcada de `guard-ambito-empresa-inventario.test.ts`: **método a método** de `OrderRepository` y
   de `OrderCatalog` —y función a función de todo
   `pedidos/adapters/driven/persistence/`— comprueba que la implementación **declara**
   `scope: OrderScope` (o `companyId` en el caso del catálogo) y que ese valor **llega hasta** una
   envoltura de `./company-scope`. Es **por función**, no por archivo: muerde con una sola consulta
   mal escrita. **Sin lista de excepciones** (§5).
2. **Integración contra Postgres**: el rechazo cruzado real de las siete operaciones, cada una con su
   control positivo; el correlativo por empresa; la carrera; el backfill; la reversión abortada.
3. **Unit con dobles**: los seis casos de uso, el orden permiso → zod → puerto, y que «de otra
   empresa» sale como `order_not_found` y **jamás** como `unauthorized`.

**La carrera (R14) se prueba de verdad**, con el patrón que QC-81 dejó medido: varias altas de la
misma empresa lanzadas a la vez sin `await` intermedio, esperadas con `Promise.allSettled`
relanzando el primer rechazo antes de afirmar nada y antes de limpiar; se afirma que todas resuelven,
que los correlativos son distintos y consecutivos, y que **no hubo ningún reintento** —el número de
transacciones es exactamente el de altas—. Requiere un pool de Prisma de **más de una conexión**:
con `connection_limit=1` las altas se serializarían en el pool y el test pasaría **sin** el lock. Va
escrito en un comentario del propio test. La mutación que quita el lock tiene que ponerlo rojo.

## 9. Errores: nada nuevo en el catálogo

El acceso cruzado **reutiliza el catálogo cerrado de QC-70** y no inventa ningún código:

| Caso | Código | Por qué |
| --- | --- | --- |
| Ficha / edición / cancelación / borrado de un pedido de otra empresa | `order_not_found` | Ya existe y su mensaje es exactamente el que hay que dar |
| Pedido de otra empresa consultado por `OrderCatalog` desde `asignaciones` | el «no existe» que ese caso de uso ya da ante `null` | El catálogo devuelve `null`, que es su contrato de hoy |
| Choque del correlativo tras los tres intentos | `duplicate_number` | Ya existe (`DuplicateOrderNumberError`) |

**Nunca `unauthorized`.** Distinguir «no puedes» de «no existe» sobre datos ajenos es un oráculo de
existencia: quien sondea identificadores aprendería qué pedidos tienen las demás empresas. Es el
mismo criterio con el que la zona privada responde 404 y no 403
(`docs/architecture.md > Permisos y autenticacion`). **No se añade ninguna fila a `ERROR_CODES`** y la
guardia del catálogo sigue verde.

## 10. Alternativas descartadas

**A) Una secuencia de Postgres por `(empresa, año)`** —`orders_sequence_<uuid>_<año>`, con
`next_order_sequence(p_company uuid, p_year integer)` creándola perezosamente igual que hoy—. Es la
extensión literal de lo que ya existe y **no hace cola**: `nextval` no bloquea. **Descartada**, y por
cuatro motivos que se acumulan:

1. **El backfill tendría que sembrar contadores.** «No se renumera» (decisión 3) obliga a que
   QuimiCloud siga en 78, así que la migración tendría que **crear** `orders_sequence_<uuid>_2026` y
   hacerle `setval(77)`. El estado del correlativo pasa a vivir **fuera** del dato, en un objeto que
   puede desincronizarse —que es exactamente el agujero que la cabecera de QC-34 documenta
   (`:22-29`) y que obliga a un `setval` manual tras cada importación—. Con `max()+1` ese estado es
   derivado y no puede mentir.
2. **DDL disparado por un alta, ahora multiplicado por empresa.** Hoy es una secuencia al año; con
   48 empresas serían decenas de `CREATE SEQUENCE` al vuelo, cada uno tomando locks sobre `pg_class`
   desde el camino caliente del `INSERT` de un usuario.
3. **La reversión se vuelve irreversible.** El `down.sql` tendría que borrar un conjunto de
   secuencias que **no conoce** —se crearon en tiempo de ejecución— y reconstruir el contador global
   a partir de ellas.
4. **La cola que evita no la necesitamos.** Con este volumen de pedidos, serializar las altas
   simultáneas de *una misma empresa en un mismo año* no se nota; pagar por evitarla con los tres
   puntos anteriores es mal cambio.

**B) Una tabla de contadores `company_order_counters` con `UPDATE … RETURNING`.** Atómica y sin DDL
al vuelo. **Descartada** por el mismo motivo 1 de (A) —un segundo sitio donde la verdad puede
desincronizarse de `orders`, con su propio backfill— y porque mantiene el lock de fila hasta el
commit: hace **exactamente la misma cola** que el lock de aviso, añadiendo una tabla y una migración.
Es el mismo descarte que escribió QC-81 §6 D.

**C) Dejar la función `next_order_sequence` tal cual y añadir la empresa solo al índice único.** Cero
cambios en el adaptador. **Descartada porque no cumple la decisión 2**: con un contador global, la
empresa B seguiría viendo huecos que delatan cuántos pedidos hace la A —que es literalmente el
motivo por el que la decisión existe—, y el correlativo de B empezaría en 78.

**D) Implementar el aislamiento con policies de RLS y `set_config('app.company_id', …)` por
petición.** La respuesta canónica en Supabase. **Descartada entera**: Prisma conecta con el dueño de
las tablas, no setea claims, y el pooler en modo transacción no garantiza que el `set_config` y la
consulta caigan en la misma sesión física. Además la decisión cerrada 8 y
`docs/architecture.md > Acceso a datos y autorizacion` ya lo tienen cerrado: **un aislamiento que
solo existe como policy no cuenta como implementado**. La RLS se queda como defensa en profundidad
(R4, R30).

**E) Repetir el filtro en cada una de las siete operaciones.** Es lo que sale solo si nadie decide
nada. **Descartada por la decisión cerrada 9**: la consulta número ocho —la que escriba otra ficha
dentro de tres semanas— se olvida, y le enseña a una empresa lo que no es suyo.

**F) Una extensión del cliente Prisma (`$extends`) que inyecte el `where` globalmente.** Cero cambios
en el adaptador. **Descartada** con los dos argumentos que QC-49 dejó en pie tras su revisión: es
**implícita** —la consulta filtra por algo que no está escrito en el archivo que la escribe— y es
**global**, así que alcanzaría a `recetas`, que R32 deja fuera. Y un motivo propio de esta ficha:
**el alta va en SQL crudo**, que ninguna extensión del cliente intercepta, así que la operación más
delicada se quedaría fuera de la red.

**G) Que `order_assignments` derive la empresa del pedido por `join` en vez de llevar la suya.** Cero
columna. **Descartada porque ya no procede**: la columna **existe** desde QC-86 y las dos FK
compuestas hacia `identity` la usan. Quitarla rompería `OJO 2` del esquema.

**H) Dejar la FK del pedido simple y comprobar la coherencia solo en el caso de uso.** Menos
migración. **Descartada por la decisión cerrada 5**, y además: hoy cuesta **cero** —0 filas— y
mañana, con asignaciones guardadas, costaría un backfill y una guardia. El propio esquema lo dejó
pedido por escrito.

**I) Acotar `OrderCatalog` copiando la excepción de QC-49 (`findProductRefs` sin ámbito).**
**Descartada**: aquella excepción existe porque `recetas` llama sin sesión, y aquí los cuatro
llamantes **tienen la empresa en su actor** (§6). Copiar la excepción sería heredar el problema sin
heredar el motivo, y dejaría a la guardia de §8 con una lista de excepciones que no necesita.

## 11. Dependencias de terceros

**Ninguna nueva** (R35). Esto es esquema, migración, una clave foránea compuesta, un bloqueo de aviso
de Postgres, una definición de ámbito y un campo más en un tipo: no hay nada que una librería
mantenida resuelva mejor, y todo lo que hace falta —`@prisma/client`, `pg` para los tests, zod— está
en el repo. Regla 7 de `CLAUDE.md` **sin propuesta que abrir**: no hay cuatro checks de salud que
reportar ni fila que añadir a `docs/dependencias.md`, `package.json` y `pnpm-lock.yaml` quedan sin
tocar y `guard-dependencias-aprobadas` sigue verde sin cambios. **Si alguna task acabara pidiendo
una, se para y se propone: no se instala** (`docs/architecture.md > Dependencias de terceros`).

## 12. Riesgos y costes aceptados

1. **Drift de Prisma, ahora en dos tablas.** La FK a `companies` y la FK compuesta de
   `order_assignments` viven escritas a mano en el SQL. Toda migración futura de `orders` o de
   `order_assignments` hay que revisarla a mano y **borrarle los `DROP CONSTRAINT` que genere**
   (R26). Los `///` de los dos modelos ya lo avisan y esta ficha los amplía.
2. **`orders_sequence_2026` queda como objeto inerte** entre el UP y un eventual DOWN (§3.2). Es el
   precio de que R7 sea cumplible; borrarla en el UP haría la reversión incompleta.
3. **Se acaban los huecos por transacción abortada** (§3.4). Derogación consciente de un coste que
   QC-33/QC-34 habían aceptado, no de un requisito suyo.
4. **Cola por `(empresa, año)`** en las altas simultáneas de la misma empresa (§3.4).
5. **La ventana pedido → receta sigue abierta hasta QC-50** (R32, pregunta abierta 1 de la semilla).
   Un pedido de A puede apuntar a una receta de B si alguien teclea el identificador. Declarado, con
   ficha destinataria, y **sin fecha**: QC-50 no está acotada.
6. **Índices de listado no recompuestos** (§2.2): decisión de volumen, no de corrección.
7. **El backfill depende de que exista «QuimiCloud»**. Sobre una base sin ella y con varias empresas,
   aborta entera y con mensaje: es lo que R2 pide, pero conviene saberlo antes de aplicarla en un
   entorno nuevo.

## 13. UI

No hay pantalla nueva ni cambio visual: `app/(private)/pedidos` ve menos filas, nada más. No se toca
ningún componente (R34). No aplica la regla multiplataforma más allá de lo que la pantalla ya cumple.
