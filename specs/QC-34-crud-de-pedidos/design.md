# QC-34 — crud-de-pedidos · design.md

> Zona: `backend` · Complejidad: `high` · depends_on: `QC-33`, `QC-8` ·
> Rama: `feature/QC-34-crud-de-pedidos`
>
> El **qué** está en `requirements.md` (R1–R58) y su alcance lo cerró el humano el 2026-09-04 en la
> tabla de 25 decisiones. Aquí va el **cómo**, y las cinco piezas caras son: **la migración** que
> añade un valor a un tipo enumerado y tiene que saber deshacerlo (§ 3); **la secuencia por año** que
> cierra la pregunta abierta 2 de QC-33 (§ 4); **las transiciones de estado** como regla de
> aplicación y por qué no bajan a la base (§ 5); **la lectura de nombres** de receta y unidad, con lo
> que `recetas` tiene que publicar (§ 6); y **`cancelOrder`** como único camino hacia `CANCELADO`
> (§ 8).
>
> **El modelo ya existe y está mergeado.** QC-33 está `done`: `Order`, `OrderStatus` y
> `OrderPriority` viven en `db/schema.prisma` con la migración
> `db/migrations/20260903191204_orders/`, y `lib/modules/pedidos/` existe con su `index.ts`, su
> `domain/` de tres archivos y `ports/`, `adapters/driven/`, `adapters/driving/` vacías con
> `.gitkeep`. Esta ficha **no re-especifica el modelo**: lo consume, lo cambia en tres puntos y llena
> el armazón.
>
> **Precedentes literales que se copian, no se reinventan:** `specs/QC-43-crud-de-proveedores/` y
> `specs/QC-25-crud-de-recetas/` para la forma del CRUD —factories en `domain/`, `requireAdmin` en la
> primera línea, puertos con resultados discriminados, adaptador driven único dueño de Prisma, Server
> Actions en `adapters/driving/`, errores con `code` estable—; `specs/QC-20-crud-de-productos/` para
> el reparto de la paginación (D15/D16/D17/D21). **Cada vez que este diseño se aparta de ellos, lo
> dice y explica por qué.**

---

## 1. Qué construye esta feature, y qué archivos toca

| Archivo | Qué se hace |
| --- | --- |
| `db/schema.prisma` | `enum OrderStatus` gana el valor `CANCELADO`; `Order` gana `cancellationReason String? @map("cancellation_reason")`. **Nada más**: los `CHECK`, la secuencia y la función no los modela Prisma (R48). |
| `db/migrations/<ts>_order_cancellation/migration.sql` | UP de § 3, escrito **entero a mano**. |
| `…/down.sql` | DOWN de § 3.5: recrea el tipo, con guardia de datos (R49, R50). |
| `lib/modules/pedidos/domain/actor.ts` | **Nuevo**: `Actor`, `requireAdmin`. El rol se importa de `identity` (§ 2.1). |
| `lib/modules/pedidos/domain/errors.ts` | **Nuevo**: `PedidosError` y sus clases con `code` estable (§ 7.5). |
| `lib/modules/pedidos/domain/page.ts` | **Nuevo**: `Page<T>`, `PageQuery`, `pageQuerySchema` (copia literal de `recetas/domain/page.ts`). |
| `lib/modules/pedidos/domain/order-transitions.ts` | **Nuevo**: la tabla de transiciones y `assertTransition` (§ 5). |
| `lib/modules/pedidos/domain/order-input.ts` | **Nuevo**: esquemas `zod` de alta, edición, cancelación y consulta (§ 7). |
| `lib/modules/pedidos/domain/order-view.ts` | **Nuevo**: `OrderView`, `OrderSummary`, `NewOrder` (§ 7.3). |
| `lib/modules/pedidos/domain/{create,get,list,update,cancel,delete}-order.ts` | **Nuevos**: las seis factories de caso de uso. |
| `lib/modules/pedidos/ports/order-repository.ts` | **Nuevo**. Se **borra** `ports/.gitkeep`. |
| `lib/modules/pedidos/adapters/driven/persistence/order-prisma.ts` | **Nuevo**: único archivo del módulo que toca `@prisma/client`. Se **borra** `adapters/driven/.gitkeep`. |
| `lib/modules/pedidos/adapters/driving/order-actions.ts` | **Nuevo**: las Server Actions (R54). Se **borra** `adapters/driving/.gitkeep`. |
| `lib/modules/pedidos/index.ts` | Añade tipos, esquemas, errores y las seis factories — **solo** de `./domain`. Lo que ya reexporta no se toca. |
| `lib/modules/recetas/domain/recipe-catalog.ts` | **Se amplía (módulo ajeno, aditivo)**: `RecipeRef` y `RecipeCatalog.findRefsIncludingDeleted` (§ 6.2). |
| `lib/modules/recetas/adapters/driven/persistence/recipe-catalog-prisma.ts` | **Nuevo, en módulo ajeno**: la implementación. `recetas` es el único que puede tocar `prisma.recipe`. |
| `lib/modules/recetas/index.ts` | Reexporta el tipo y la interfaz nuevos. **Ninguna firma existente cambia.** |
| `lib/composition/index.ts` | **Bloque nuevo al final**: `recipeCatalog`, `orderRepository` y la fachada `pedidos`. No se reordena ni reformatea nada de lo que hay (hay otras sesiones en este archivo). |
| `tests/…` | Ver § 11. |

**No se toca `app/`, ni `components/`, ni `middleware.ts`, ni `e2e/`** (R57): la pantalla es QC-35.
**No se toca `lib/modules/unidades/**`**: su contrato ya publica `UnitCatalog.findRefs` y `unidades`
no tiene borrado lógico, así que no necesita ampliación (§ 6.3). **No se toca
`lib/shared/pagination.ts`**: se consume tal cual (R37).

---

## 2. Autorización y actor

### 2.1 `requireAdmin`, primera línea de los seis (R1–R4)

```ts
// lib/modules/pedidos/domain/actor.ts
import { ROLE_ADMINISTRADOR } from '@/lib/modules/identity';   // barrel, NUNCA ruta profunda
import { UnauthorizedError } from './errors';

export type Actor = { readonly id: string; readonly roleName: string | null };

export function requireAdmin(actor: Actor | null | undefined): asserts actor is Actor {
  if (!actor || actor.roleName !== ROLE_ADMINISTRADOR) throw new UnauthorizedError();
}
```

**De dónde sale el literal, verificado en este árbol y no supuesto:**
`lib/modules/identity/domain/roles.ts` declara `ROLE_ADMINISTRADOR = 'Administrador'` y dice ser «el
ÚNICO sitio del repo que escribe a mano los literales»; **el barrel de `identity` ya lo exporta**
(`lib/modules/identity/index.ts` línea 17). La regla de dependencias permite a `domain/` importar el
barrel de otro módulo (`docs/architecture.md > La regla de dependencias`, primera fila). Así R4 se
cumple sin crear la **quinta** copia del literal: hoy hay cuatro (`identity` y las de `inventario`,
`recetas` y `unidades`), y el board ya tiene una ficha propia para retirar las tres copias — **no es
de esta ficha** y `pedidos` nace del lado correcto sin aumentar la deuda. Es exactamente lo que
recomendó `QC-43 design.md > 3`.

- **Antes de `zod` y antes de tocar ningún puerto.** El test de R2 llama a cada caso de uso con un
  actor `Operador` y **dobles que fallan si los llaman**: eso es lo que distingue una autorización
  real de un `if` decorativo.
- **Falla cerrado** (R3), con igualdad exacta y sin `includes`: `«Administradores externos»` no se
  cuela.
- **Consultar también pasa por aquí** (decisión 1): `getOrder` y `listOrders` llaman a `requireAdmin`
  igual que las mutaciones.
- La RLS de QC-33 sigue activa y forzada y **no autoriza nada** (R7): Prisma se conecta como dueño de
  las tablas. Es defensa en profundidad; el requisito lo cierra el test de servicio
  (`CHECKPOINTS.md > Datos y seguridad`).

### 2.2 El actor y los dos autores (R5, R6)

Los casos de uso reciben `actor: Actor | null | undefined` **por parámetro**. Quien lo resuelve es la
Server Action, con `identity.getSessionUser()` desde `@/lib/composition` (§ 9). El `id` que llega
**existe en `users`** —la sesión real está cableada desde QC-8—, así que las dos FK de auditoría de
QC-33 se satisfacen. `createdBy` y `updatedBy` **nunca** salen del `FormData`: los esquemas de
entrada ni siquiera tienen esos campos, así que un cliente no puede enviarlos (R6, R9).

---

## 3. La migración: un valor nuevo en un tipo enumerado

Es la parte cara y la que más fácil se hace mal. Cuatro cosas en un solo `migration.sql`, y la cuarta
es § 4.

### 3.1 El valor nuevo, y por qué no se puede usar en la misma transacción

```sql
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'CANCELADO';
```

**Postgres no deja usar el valor recién añadido en la misma transacción que lo añadió.** Desde PG 12
el `ADD VALUE` sí puede ir dentro de un bloque de transacción —y Prisma Migrate ejecuta cada
migración en una— pero cualquier referencia posterior al literal `'CANCELADO'` **como valor del enum**
en esa misma transacción falla con `55P04 unsafe use of new value "CANCELADO" of enum type`.

Y esta migración necesita nombrarlo dos veces, en los dos `CHECK` de § 3.3 y § 3.4. La salida es
**comparar por texto, no por enum**:

```sql
"status"::text = 'CANCELADO'      -- SI: literal de texto, no valor de enum
"status" = 'CANCELADO'            -- NO: 55P04 en la misma transaccion
```

El cast `enum → text` es `IMMUTABLE`, así que sigue siendo legítimo dentro de un `CHECK` (el mismo
muro que QC-33 tuvo que rodear con `AT TIME ZONE 'UTC'` en su quinto `CHECK`, y por el mismo motivo).
**No se simplifica**, y el test estático de la migración lleva su mutación: quitar el `::text` tiene
que poner el predicado en rojo.

La alternativa —partir la ficha en **dos carpetas de migración**, una con el `ADD VALUE` y otra con
todo lo demás— está evaluada y descartada en § 10.1.

### 3.2 La columna del motivo (R27, R30)

```sql
ALTER TABLE "orders" ADD COLUMN "cancellation_reason" TEXT;
```

- **`TEXT` sin longitud**, y el tope de **500** vive en `zod` (decisión 4, heredada de QC-43 y de
  QC-42 D15). Cambiar el tope no puede ser una migración.
- **Anulable**, porque el motivo solo existe en un pedido cancelado: es la mitad de R30.
- Nombre en inglés (R51), valor del enum en castellano.

### 3.3 El motivo existe si y solo si el pedido está cancelado (R30)

```sql
ALTER TABLE "orders" ADD CONSTRAINT "orders_cancellation_reason_matches_status"
  CHECK (("status"::text = 'CANCELADO') = ("cancellation_reason" IS NOT NULL));
```

Es una igualdad de dos booleanos, no una implicación, y por eso cubre **los dos** sentidos que pide la
decisión 4: cancelar sin motivo se rechaza **y** escribir motivo sin cancelar también. `status` es
`NOT NULL`, así que ningún lado puede evaluar a `NULL` —el agujero clásico del `CHECK` que se cumple
por ser nulo, el mismo que QC-43 tapó con `COALESCE`—.

**Es una adición del diseño, y se dice.** La decisión 4 exige el rechazo pero no dice dónde vive; se
baja a la base por la misma filosofía que la decisión 9 declara explícitamente («en la base y no solo
en la aplicación», QC-20 D16). Coste: las filas existentes tienen `status <> 'CANCELADO'` y
`cancellation_reason IS NULL`, así que el `ADD CONSTRAINT` no tiene que limpiar nada — hoy. **Dentro
de un mes esto ya no será verdad**, y por eso va en esta ficha.

### 3.4 El `CHECK` de borrado, ampliado (R32, decisión 9)

```sql
ALTER TABLE "orders" DROP CONSTRAINT "orders_delivered_not_deleted";
ALTER TABLE "orders" ADD CONSTRAINT "orders_delivered_not_deleted"
  CHECK ("deleted_at" IS NULL OR "status"::text NOT IN ('ENTREGADO', 'CANCELADO'));
```

**El nombre no cambia.** Es la misma regla con la definición ampliada; renombrarla obligaría a QC-35 y
a cualquier traductor de SQLSTATE a conocer dos nombres para lo mismo (criterio de QC-43 § 2.1, que
sí renombró el otro porque allí el nombre pasaba a mentir; aquí `delivered_not_deleted` sigue siendo
verdad, solo que incompleto — **anotado como fleco menor en § 12**).

Sigue siendo simétrico, y hay que leerlo en los dos sentidos, como enseñó QC-33: bloquea borrar un
`ENTREGADO` **o** un `CANCELADO`, bloquea poner `ENTREGADO` o `CANCELADO` a un pedido ya borrado, y
**no** bloquea nada más — borrar un `PENDIENTE` o un `EN_CURSO` sigue siendo legal (QC-33 R30). El
test de integración necesita **los seis** casos, no uno.

### 3.5 El `down.sql`: recrear el tipo, y qué pasa con las filas canceladas (R49, R50)

`ALTER TYPE ... DROP VALUE` **no existe en Postgres**, en ninguna versión. Revertir obliga a recrear
el tipo entero, y el orden importa:

```sql
-- 0. GUARDIA DE DATOS. Revertir NO puede convertir un pedido cancelado en otra cosa: no hay
--    ningun estado destino que signifique lo mismo, y elegir uno (PENDIENTE, ENTREGADO) seria
--    inventar un hecho de negocio en un script de rollback. Si hay filas CANCELADO, el rollback
--    ABORTA y no toca nada -- la transaccion entera se deshace con el RAISE.
DO $$
DECLARE cancelled bigint;
BEGIN
  SELECT count(*) INTO cancelled FROM "orders" WHERE "status"::text = 'CANCELADO';
  IF cancelled > 0 THEN
    RAISE EXCEPTION 'ROLLBACK ABORTADO: hay % pedido(s) en estado CANCELADO. '
      'Revertir esta migracion los dejaria sin estado valido. Decide que hacer con ellos '
      '(borrarlos fisicamente o moverlos a mano) y vuelve a intentarlo.', cancelled;
  END IF;
END $$;

-- 1. Los dos CHECK que nombran 'CANCELADO' caen ANTES del cambio de tipo: un ALTER COLUMN TYPE
--    tiene que revalidar toda restriccion que toque la columna, y una que menciona un valor
--    inexistente en el tipo nuevo no se puede revalidar.
ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "orders_cancellation_reason_matches_status";
ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "orders_delivered_not_deleted";

-- 2. La columna del motivo.
ALTER TABLE "orders" DROP COLUMN IF EXISTS "cancellation_reason";

-- 3. EL TIPO SE RECREA. No hay DROP VALUE: se renombra el viejo, se crea el nuevo con los tres
--    valores de QC-33, se reescribe la columna casteando por texto y se borra el viejo.
--    El DEFAULT hay que quitarlo antes del ALTER TYPE y volver a ponerlo despues: Postgres no
--    sabe recastear un default de un tipo que esta cambiando.
ALTER TYPE "OrderStatus" RENAME TO "OrderStatus_old";
CREATE TYPE "OrderStatus" AS ENUM ('PENDIENTE', 'EN_CURSO', 'ENTREGADO');
ALTER TABLE "orders" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "orders" ALTER COLUMN "status" TYPE "OrderStatus"
  USING ("status"::text::"OrderStatus");
ALTER TABLE "orders" ALTER COLUMN "status" SET DEFAULT 'PENDIENTE';
DROP TYPE "OrderStatus_old";

-- 4. El CHECK de borrado vuelve a su definicion LITERAL de QC-33 (no basta con dropearlo: eso
--    dejaria la base sin ninguna regla de borrado, que NO es «el esquema anterior»).
ALTER TABLE "orders" ADD CONSTRAINT "orders_delivered_not_deleted"
  CHECK ("deleted_at" IS NULL OR "status" <> 'ENTREGADO');

-- 5. El aparato de secuencias de la seccion 4 (funcion + todas las secuencias creadas al vuelo).
DROP FUNCTION IF EXISTS "next_order_sequence"(integer);
DO $$
DECLARE seq record;
BEGIN
  FOR seq IN SELECT c.relname FROM pg_class c
              WHERE c.relkind = 'S' AND c.relname LIKE 'orders_sequence_%'
  LOOP
    EXECUTE format('DROP SEQUENCE IF EXISTS %I', seq.relname);
  END LOOP;
END $$;
```

Tres cosas que el implementer tiene que tener presentes:

1. **El `RENAME TO` + `CREATE` + `USING` es la única forma que existe.** Si alguien «simplifica» esto
   con un `DROP TYPE` a secas, Postgres lo rechaza por dependencia de la columna; y si lo hace
   dropeando la columna, pierde el estado de todos los pedidos.
2. **Cualquier otro objeto que dependa del tipo bloquearía el `RENAME`/`DROP`.** Hoy solo depende
   `orders.status`; el `down.sql` de QC-33 sigue debajo y no cambia (borra la tabla y los dos tipos).
3. **El paso 0 es lo que hace que R50 sea testeable.** Un `down.sql` que convirtiera los cancelados a
   `PENDIENTE` pasaría verde y correría el dato en silencio, que es exactamente lo que
   `docs/conventions.md` llama un error que nadie ve.

### 3.6 Orden del UP y cabecera

`ADD VALUE` → `ADD COLUMN` → `CHECK` del motivo → `DROP`/`ADD` del `CHECK` de borrado → la función de
§ 4. El archivo abre con la **misma cabecera de aviso** que el `migration.sql` de QC-33: todo lo de
dentro salvo la columna es **drift** para Prisma, y toda migración futura sobre `orders` hay que
revisarla a mano para que no se lleve por delante las cuatro FK, los seis `CHECK`, el RLS ni la
función. Si se pierden, el esquema sigue validando y el cliente sigue compilando: **no se entera
nadie**.

---

## 4. La secuencia por año (R11, R12, R13) — cierra la pregunta abierta 2 de QC-33

La decisión 10 elige **una secuencia de la base por año**, y descarta expresamente las otras dos que
QC-33 § 5.3 dejó sobre la mesa: `max+1` con reintento (carrera real) y el bloqueo serializado (cola).
Lo que la decisión no dice —y este diseño tiene que decidir— es **cómo nace la secuencia del año que
todavía no existe**, porque son secuencias infinitas en el tiempo y ninguna migración puede
precrearlas todas.

### 4.1 Una función que entrega el siguiente número y crea la secuencia si falta

```sql
-- Entrega la siguiente posicion del correlativo del ano pedido (QC-34 R11, R12; cierra la
-- pregunta abierta 2 de QC-33). Una SECUENCIA POR ANO, creada al vuelo la primera vez.
--
-- POR QUE UNA SECUENCIA Y NO UN CONTADOR EN UNA TABLA: `nextval` NO bloquea ni espera, asi que
-- dos altas simultaneas del mismo ano se llevan numeros distintos sin que ninguna haga cola --
-- que es literalmente lo que pide la decision 10. Un `INSERT ... ON CONFLICT DO UPDATE
-- RETURNING` sobre una tabla de contadores tambien seria atomico, pero mantiene el lock de fila
-- HASTA EL COMMIT: serializa todas las altas del ano, que es la opcion que la decision descarto.
--
-- HUECOS: una transaccion abortada consume su numero y nadie lo reutiliza. Es exactamente lo que
-- QC-33 R42 y la decision cerrada 27 aceptaron a conciencia.
CREATE OR REPLACE FUNCTION "next_order_sequence"(p_year integer)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  seq_name text := format('orders_sequence_%s', p_year);
BEGIN
  RETURN nextval(seq_name::regclass)::integer;
EXCEPTION WHEN undefined_table THEN
  -- PRIMERA ALTA DEL ANO. El lock de aviso serializa SOLO esta rama -- la creacion, una vez al
  -- ano -- y nunca el camino normal de `nextval`. Sin el, dos altas simultaneas el 1 de enero
  -- pueden intentar crear la misma secuencia y una se lleva un 42P07/23505 de `pg_class`.
  PERFORM pg_advisory_xact_lock(hashtext(seq_name));
  EXECUTE format('CREATE SEQUENCE IF NOT EXISTS %I AS integer MINVALUE 1 START WITH 1', seq_name);
  RETURN nextval(seq_name::regclass)::integer;
END;
$$;
```

- **El camino normal no toma ningún lock**: es un `nextval` y punto (R11).
- **La rama de creación se ejecuta una vez al año** y se serializa con un `pg_advisory_xact_lock`,
  que se suelta solo al terminar la transacción. Dos altas simultáneas que sean las dos la primera del
  año acaban las dos bien, con posiciones distintas (R12): la segunda entra al lock cuando la primera
  ya confirmó, encuentra la secuencia por el `IF NOT EXISTS` y sigue.
- **Lo que sí se asume:** si la primera alta del año hace `ROLLBACK` **después** de crear la
  secuencia, la secuencia queda creada y el número 1 consumido — la fila `2027-0000001` no existe y
  el primer pedido del año será el `2027-0000002`. Es un hueco, y los huecos están aceptados
  (decisión 10, QC-33 R42). *(En Postgres la creación de una secuencia sí es transaccional, así que
  también puede desaparecer con el rollback; el caso siguiente la vuelve a crear. Las dos ramas
  acaban bien y ninguna produce un duplicado.)*
- **Nombres en inglés** (R51): `next_order_sequence`, `orders_sequence_2026`.

### 4.2 Quién la llama, y cómo encaja con el `CHECK` del año (R10)

El **adaptador driven** hace el alta con **una sola sentencia**:

```sql
INSERT INTO "orders" (
  "order_year", "order_sequence", "recipe_id", "quantity", "unit_id", "unit_price",
  "priority", "status", "created_by", "updated_by", "created_at", "updated_at"
) VALUES (
  $1, next_order_sequence($1), $2, $3, $4, $5, $6, 'PENDIENTE', $7, $7, $8, $8
)
RETURNING "id", "order_year", "order_sequence";
```

Tres consecuencias que hay que respetar al pie de la letra:

1. **El año y `created_at` salen del MISMO instante.** El caso de uso recibe un `now: Date` —patrón
   ya usado por `recetas` y `proveedores`— y el adaptador escribe `created_at = now` y
   `order_year = now.getUTCFullYear()`. Si se dejara el `DEFAULT CURRENT_TIMESTAMP` de la columna y
   se calculara el año en JavaScript, un alta a las 23:59:59.999 UTC del 31 de diciembre podría
   escribir un año y una fecha de años distintos, y el `CHECK` `orders_order_year_matches_created_at`
   (QC-33 R41) la rechazaría con `23514`. **Es la trampa que QC-33 § 3 dejó avisada por escrito**, y
   se cierra usando un único reloj.
2. **Es `$executeRaw`/`$queryRaw`, no la API tipada de Prisma**, porque `next_order_sequence($1)`
   tiene que evaluarse **dentro del `INSERT`**: leerlo antes en otro viaje sería el mismo número con
   dos idas y venidas, sin ganar nada. El resto de las operaciones sí usan la API tipada.
3. **El índice único de QC-33 R21 sigue siendo la garantía real.** La secuencia hace que en operación
   normal nadie colisione; el índice es lo que impide el duplicado si alguien inserta por consola. El
   adaptador traduce igualmente `23505` sobre `orders_order_year_order_sequence_key` a un error de
   dominio con `code` propio, para que ese caso no llegue como excepción de Prisma sin traducir —que
   es lo que la pregunta abierta 2 de QC-33 temía.

### 4.3 Lo que este diseño NO añade

**Ninguna restricción de continuidad** y **ninguna tabla de contadores**. Los huecos se aceptan
(decisión 10, QC-33 R42) y el test de integración lo comprueba **en positivo**: un alta que se aborta
y la siguiente que llega con la posición siguiente-a-la-siguiente.

### 4.4 Importaciones y restauraciones (pregunta abierta 4 de `requirements.md`)

La secuencia solo sabe de los números que ella misma entregó. Si alguien carga pedidos de un año por
otra vía, hay que ajustarla con `setval`. **Esta ficha no crea ninguna herramienta de importación y
hoy no existe ninguna en el repo**; queda escrito en la cabecera de la migración y en la pregunta
abierta 4, sin rellenarlo con un supuesto.

---

## 5. Las transiciones de estado (R22, R23) — regla de aplicación, con su test

```ts
// lib/modules/pedidos/domain/order-transitions.ts
import type { OrderStatus } from './order-classification';

/** Lo que la decision cerrada 5 permite, escrito una sola vez. Cancelar NO esta aqui: es
 *  `cancelOrder` y solo el (decision 7, R24, R26). Quedarse en el mismo estado es legal:
 *  editar la cantidad de un pedido sin moverlo de PENDIENTE no es una transicion. */
const ALLOWED: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  PENDIENTE: ['PENDIENTE', 'EN_CURSO', 'ENTREGADO'],
  EN_CURSO:  ['EN_CURSO', 'ENTREGADO'],
  ENTREGADO: [],   // final: ni siquiera 'ENTREGADO', porque un ENTREGADO no admite EDICION (R21)
  CANCELADO: [],   // final, por el mismo motivo
};
```

`assertTransition(from, to)` lanza `InvalidTransitionError` si `to` no está en la lista de `from`.
Los dos estados finales tienen la lista **vacía a propósito**: R21 dice que un pedido final no admite
**ninguna** edición, así que ni siquiera «quedarse igual» es legal — la comprobación de R21 y la de
R22 caen sobre la misma tabla y no hay dos verdades.

**Por qué esto no baja a la base, y hay que decirlo porque el resto de la ficha hace lo contrario:**

- **Un `CHECK` no puede verlo.** Un `CHECK` evalúa la fila **resultante**, nunca la anterior: no sabe
  de dónde venía el pedido. Es una limitación del instrumento, no una preferencia.
- **Un trigger sí podría, y aun así no.** Tres motivos: (a) **QC-33 R19 fijó explícitamente que la
  base no restringe las transiciones** y que la restricción es de esta ficha, así que bajarla sería
  reabrir una decisión cerrada; (b) un trigger **no distingue quién escribe**, y esta ficha necesita
  justo eso —`updateOrder` no puede escribir `CANCELADO` pero `cancelOrder` sí (§ 8)—, con lo que el
  trigger tendría que conocer los casos de uso, que es lógica de negocio dentro de la base; (c) **no
  hay ni un trigger en este repositorio**, y el primero traería su convención, su `down.sql`, su
  drift y su forma de testearse.
- **Coste asumido y escrito:** un `UPDATE` por consola puede retroceder un pedido de `ENTREGADO` a
  `PENDIENTE`. Lo que la base **sí** sigue garantizando es lo caro de deshacer: que un entregado o un
  cancelado no se borre (§ 3.4) y que un cancelado tenga motivo (§ 3.3).

---

## 6. Leer los nombres de la receta y de la unidad (R43, R44, R45)

### 6.1 El problema

La decisión 14 pide que la consulta devuelva los **nombres**, apartándose de QC-20 D21 y de QC-25,
que devuelven solo ids. La decisión 15 aprieta más: el nombre tiene que venir **aunque la receta esté
dada de baja**. Y QC-33 R32 prohíbe a `pedidos` tocar `recipes` con Prisma. Las tres a la vez solo se
resuelven de una forma: **`recetas` publica la consulta y la implementa dentro de su propio módulo**.

### 6.2 Lo que `recetas` publica (aditivo, R44)

```ts
// lib/modules/recetas/domain/recipe-catalog.ts — se AMPLIA, `RecipeId` no se toca.
export type RecipeId = string;

/** Lo que otro modulo puede saber de una receta sin tocar su tabla. `isDeleted` va en el Ref y
 *  no en dos metodos distintos a proposito (`design.md > 10.3`): quien lee un pedido necesita
 *  el nombre de una receta dada de baja (QC-34 R44) y quien valida un alta necesita rechazarla
 *  (QC-34 R15), y las dos preguntas se responden con la MISMA lectura. */
export type RecipeRef = {
  readonly id: RecipeId;
  readonly name: string;
  readonly isDeleted: boolean;
};

export interface RecipeCatalog {
  /** Referencias de las recetas pedidas, INCLUIDAS LAS DADAS DE BAJA, que vienen con
   *  `isDeleted: true`. Un id que no existe simplemente no vuelve. El nombre es explicito
   *  para que nadie lo confunda con `ProductCatalog.findRefs`/`UnitCatalog.findRefs`, que
   *  devuelven SOLO lo vivo. */
  findRefsIncludingDeleted(ids: readonly RecipeId[]): Promise<readonly RecipeRef[]>;
}
```

La implementación es un adaptador driven **de `recetas`** —`recipe-catalog-prisma.ts`, junto a
`recipe-prisma.ts`—, que es el único autorizado a consultar `prisma.recipe`, y lo cablea
`lib/composition`. `pedidos` solo conoce el **tipo** `RecipeCatalog`, importado del barrel.

**Por qué esto no rompe la frontera de QC-33 R32, dicho entero:** R32 prohíbe que `pedidos` consulte
el modelo de receta y que importe `recetas` por ruta profunda; obliga a que «todo lo que sepa de una
receta le llegue por los contratos públicos, **que DEBEN publicarlo**». La frase final es la que
autoriza esto: ampliar el contrato de `recetas` es exactamente el mecanismo que R32 previó, y es el
mismo movimiento que QC-25 hizo con `ProductCatalog` en `inventario` y con `UnitCatalog` en
`unidades`. La consulta a `recipes` se escribe **dentro de `recetas`**; `pedidos` no gana ni un
import nuevo hacia sus tripas. Lo que `pedidos` no puede hacer —y la guardia de módulos lo vigila— es
un `prisma.recipe` propio o un `include` desde `orders`, y por eso QC-33 dejó las cuatro FK como
escalares sin `@relation`.

### 6.3 `unidades` no se toca

`UnitCatalog.findRefs(ids)` ya existe, ya está implementado
(`unidades/adapters/driven/persistence/unit-catalog-prisma.ts`) y ya está cableado en
`lib/composition` como `unitCatalog`. `units` **no tiene borrado lógico** (QC-32 decisión 11), así
que «existe» y «está vigente» son lo mismo y no hace falta ninguna variante. Se **reutiliza la
constante existente**, no se crea una segunda (mismo criterio que QC-43 con `productCatalog`).

### 6.4 Cómo se evita el N+1 en una página de 10 (R45)

El caso de uso de listado hace, **en este orden**:

1. `requireAdmin(actor)`.
2. `pageQuerySchema` + esquema de filtros.
3. **una** llamada al repositorio: `listAlive(filters, query)` → `Page<OrderRow>`. El caso de uso
   **no** calcula `offset`/`limit`: los deriva el adaptador driven con `lib/shared/pagination`
   (§ 10, R37). *(Corregido el 2026-09-04 al implementar; ver la nota al final de § 7.4.)*
4. `const recipeIds = [...new Set(rows.map(r => r.recipeId))]` y lo mismo con `unitIds`.
5. **una** llamada a `recipes.findRefsIncludingDeleted(recipeIds)` y **una** a
   `units.findRefs(unitIds)` — dos llamadas por página, no dos por fila.
6. Un `Map` por id y se compone cada `OrderSummary`.

**Tres consultas por página, siempre**, tenga la página 1 fila o 25. El test lo demuestra con dobles
que **cuentan invocaciones**: `expect(findRefsIncludingDeleted).toHaveBeenCalledTimes(1)` con los
ids deduplicados. Contar llamadas es lo único que hace testeable un «no hay N+1»; comprobar solo el
resultado pasaría verde con un bucle de diez consultas.

`recipeName` y `unitName` salen como `string | null`: `null` si el id no vuelve —una receta borrada
**físicamente** por consola, que las FK `RESTRICT` de QC-33 hacen casi imposible—. La fila **sigue
apareciendo**, mismo criterio que QC-25 R18 y QC-43 R37. Una receta **dada de baja** sí vuelve, con
su nombre (R44).

---

## 7. Contratos de entrada y salida

Validación con **zod** en el borde (R55). Los esquemas viven en `domain/` y se reexportan por el
contrato, así que la Server Action y —mañana— el formulario de QC-35 validan con el **mismo** esquema.

### 7.1 Alta

```ts
createOrderSchema = {
  recipeId:  uuid,                                   // R15
  quantity:  string decimal(14,4), > 0,              // R17
  unitId:    uuid,                                   // R16
  unitPrice: string decimal(14,4), >= 0,             // R18  (el cero SI vale)
  priority:  enum(ORDER_PRIORITY_VALUES) | omitido,  // R9, R19  (por defecto BAJA)
}
```

**No tiene** `status`, ni `cancellationReason`, ni `orderYear`/`orderSequence`, ni `createdAt`, ni
`createdBy`/`updatedBy` (R9, R6): lo que el esquema no declara, no puede llegar. Los importes viajan
como **cadena decimal**, nunca `number` —el dominio no puede importar `Prisma.Decimal` y `number` es
coma flotante binaria (`docs/architecture.md > Anti-patrones`)—; el adaptador driven convierte a
`Prisma.Decimal` y a la salida vuelve con `.toFixed(4)`. Literal de `recetas` y `proveedores`.

### 7.2 Edición — reemplazo completo, y sin `CANCELADO` (R20, R24)

```ts
const EDITABLE_STATUS = ['PENDIENTE', 'EN_CURSO', 'ENTREGADO'] as const;   // CANCELADO NO
updateOrderSchema = { ...createOrderSchema.shape, status: enum(EDITABLE_STATUS) }
// sin cancellationReason: el campo no existe en este esquema
```

`EDITABLE_STATUS` **se deriva de `ORDER_STATUS_VALUES` quitando `'CANCELADO'`**, no se escribe a mano:
así, el día que aparezca un quinto estado, el que lo añada tiene que decidir explícitamente si es
editable. Un `status: 'CANCELADO'` en la edición muere en `zod` con `invalid_input` **sin llegar al
caso de uso** (R24), y el test lo demuestra con un doble del repositorio que falla si lo llaman.

**Reemplazo completo** (R20), como QC-25 y QC-43: un parche parcial obligaría a distinguir «campo
ausente» de «campo a nulo» y a evaluar la transición contra un estado a medio llegar. Es la
**pregunta abierta 5**, con su posición por defecto escrita y su coste (subir la prioridad obliga a
reenviar todo el pedido).

### 7.3 Cancelación, consulta y salida

```ts
cancelOrderSchema = { reason: string().trim().min(1).max(500) }            // R27
listOrdersSchema  = pageQuerySchema.extend({
  status:   enum(ORDER_STATUS_VALUES).optional(),                          // R38
  priority: enum(ORDER_PRIORITY_VALUES).optional(),                        // R38
})                                                                          // sin texto ni numero (R39)
```

**Salida** (`OrderView`, la ficha): `id`, `number: { year, sequence }`, `numberText` —compuesto con
`formatOrderNumber`, R14—, `recipeId`, `recipeName`, `quantity`, `unitId`, `unitName`, `unitPrice`,
`priority`, `status`, `cancellationReason` (`string | null`, R29), `createdAt`, `updatedAt`,
`createdBy`, `updatedBy`. `OrderSummary` (cada fila del listado) lleva **lo mismo**: un pedido es una
sola línea y no hay nada pesado que dejar fuera, a diferencia de las `lines` de una receta.

`deletedAt` **no sale**: ninguna consulta devuelve borrados (R40), así que sería siempre `null`.
**No hay campo `total`**, y es la **pregunta abierta 3**: la posición por defecto es no devolverlo,
porque multiplicar dos decimales de 14 dígitos exigiría decidir hoy una aritmética que no está
aprobada (§ 13).

### 7.4 El puerto

```ts
// lib/modules/pedidos/ports/order-repository.ts
export interface OrderRepository {
  create(data: NewOrder, year: number, actorId: string, now: Date): Promise<OrderRow | 'duplicate_number'>;
  findAliveById(id: string): Promise<OrderRow | null>;
  listAlive(filters: OrderFilters, query: PageQuery): Promise<Page<OrderRow>>;
  updateAlive(id: string, data: NewOrder, actorId: string, now: Date): Promise<'ok' | 'not_found'>;
  cancelAlive(id: string, reason: string, actorId: string, now: Date): Promise<'ok' | 'not_found'>;
  softDeleteAlive(id: string, actorId: string, now: Date): Promise<'ok' | 'not_found'>;
}
```

- **`…Alive` no es adorno**: el filtro `deleted_at IS NULL` es del puerto y de su adaptador, no del
  dominio (R40), así que ningún caso de uso puede olvidarlo. Ninguna operación de restaurar y ningún
  listado de borrados (R31).
- **`NewOrder` no tiene `cancellationReason` ni admite `status: 'CANCELADO'`**: su campo `status` es
  del tipo `EditableOrderStatus`. **`cancelAlive` es el único método con `reason`**, y por tanto el
  único capaz de escribir el estado cancelado — la prohibición de R24 llega hasta el tipo (§ 8).
- **Resultados discriminados, nunca excepciones de Prisma**: el adaptador traduce `23505` sobre el
  índice del correlativo a `'duplicate_number'`, `23503` a un error de referencia y `23514` según el
  nombre de la restricción. El dominio nunca ve un SQLSTATE.
- **La comprobación de estado (R21, R22, R28, R32) vive en el caso de uso**, sobre el `OrderRow` que
  acaba de leer con `findAliveById`, no en el `where` del `UPDATE`: si viviera en el `where`, «no
  existe» y «está entregado» devolverían lo mismo y el usuario recibiría `not_found` ante un pedido
  que está viendo en pantalla. Coste asumido: entre el `SELECT` y el `UPDATE` cabe otra transacción,
  y dos ediciones simultáneas del mismo pedido pueden aplicar una transición que ya no es válida. Es
  la última escritura la que gana, no hay bloqueo optimista, y **nada de esto puede producir un
  estado imposible**, porque las dos invariantes caras siguen en la base (§ 3.3, § 3.4).

> **Corrección del 2026-09-04, detectada al implementar (T6/T11) y aprobada por el leader.** Esta
> sección y § 6.4 declaraban `listAlive(filters, offset, limit): Promise<{ rows, total }>`, es decir,
> el **caso de uso** entregando `offset` y `limit`. Eso **contradice § 10**, que dice —con su motivo
> escrito— que `lib/shared/pagination` lo llama el **adaptador driven** porque `domain/` no puede
> importarlo. La contradicción no era cosmética: con la firma vieja, `listOrders` tendría que
> calcular el `offset` a mano, que es justo la reimplementación que **R37** prohíbe y que
> `tests/unit/pedidos/scope.test.ts` pone en rojo. Gana **§ 10**, que además es lo que hace todo el
> repo —`lib/modules/proveedores/ports/supplier-repository.ts` declara
> `listAlive(query: PageQuery): Promise<Page<SupplierView>>`, y `toOffsetLimit`/`buildPage` solo
> aparecen en `adapters/driven/persistence/**` de `inventario` y `proveedores`, nunca en `domain/`—.
> Las dos firmas quedan alineadas arriba. Ningún requisito cambia: sigue habiendo **una** llamada al
> repositorio y **una** a cada catálogo por página (R45), el orden y los filtros siguen en el
> adaptador (R38, R40, R41) y el defecto de 10 / tope de 25 siguen siendo de `lib/shared/pagination`
> (R35). El caso de uso mapea `Page<OrderRow>` a `Page<OrderSummary>` conservando `total`, `page`,
> `pageSize` y `totalPages`.

### 7.5 Errores (R56)

| Clase | `code` | Cuándo |
| --- | --- | --- |
| `UnauthorizedError` | `unauthorized` | R2, R3 |
| `NotFoundError` | `not_found` | pedido inexistente o ya borrado (R33) |
| `RecipeNotFoundError` | `recipe_not_found` | receta ausente, inexistente o dada de baja (R15) |
| `UnitNotFoundError` | `unit_not_found` | unidad inexistente (R16) |
| `InvalidTransitionError` | `invalid_transition` | transición no permitida, o edición de un pedido final (R21, R22) |
| `NotCancellableError` | `not_cancellable` | cancelar un `ENTREGADO` o uno ya cancelado (R28) |
| `NotDeletableError` | `not_deletable` | borrar un `ENTREGADO` o un `CANCELADO` (R32) |
| `DuplicateOrderNumberError` | `duplicate_number` | el `23505` del correlativo, traducido (§ 4.2) |
| `ValidationError` | `invalid_input` | la entrada no pasa `zod` (R17, R18, R19, R24, R27, R36) |

Todas derivan de `PedidosError` con `code` estable. Se **lanzan**; la Server Action las traduce a
`{ status: 'error', code, message }` con **el `code`, nunca el texto**. Nada de `catch` vacíos
(`docs/conventions.md`). Que `not_cancellable` y `not_deletable` sean distintos de
`invalid_transition` no es cosmético: QC-35 tiene que poder decir tres frases distintas sin leer el
mensaje.

---

## 8. `cancelOrder`: el único camino hacia `CANCELADO` (R24, R26, R30)

Cuatro capas, y ninguna sobra:

| Capa | Qué impide | Qué pasa si alguien la salta |
| --- | --- | --- |
| **Tipos** — `NewOrder.status: EditableOrderStatus`, `cancelAlive` es el único método con `reason` | Que `updateOrder` pueda ni siquiera *expresar* la cancelación | El `typecheck` falla |
| **`zod`** — `updateOrderSchema` no admite `'CANCELADO'` ni `reason` | Que llegue del formulario o de un cliente | `invalid_input`, y el repositorio no se toca |
| **Transiciones** — `ALLOWED` no lleva `CANCELADO` en ningún destino | Que una edición «pase por delante» de la regla | `invalid_transition` |
| **Base** — `orders_cancellation_reason_matches_status` | Un `UPDATE` por consola que cancele sin motivo o ponga motivo sin cancelar | `23514` |

Y el caso de uso:

```
cancelOrder(id, input, actor):
  requireAdmin(actor)                                   // R2
  reason = cancelOrderSchema.parse(input).reason        // R27  (trim, 1..500)
  row = orders.findAliveById(id)  ->  null ? NotFoundError            // R33
  row.status in ('PENDIENTE','EN_CURSO') ? ok : NotCancellableError   // R28
  orders.cancelAlive(id, reason, actor.id, now)         // R6, R29
```

El motivo **se escribe una vez y no se vuelve a tocar**: no hay ningún caso de uso capaz de
modificarlo, porque de `CANCELADO` no se sale (R21 deja el pedido sin edición y `ALLOWED.CANCELADO`
está vacío) y `cancelAlive` solo acepta pedidos no cancelados (R28). Eso es R29 sin necesidad de
ninguna columna inmutable.

---

## 9. Adaptador driving: las Server Actions (R54)

`lib/modules/pedidos/adapters/driving/order-actions.ts`, con `'use server'`, copiado en forma de
`supplier-actions.ts`:

- **`createOrderAction`, `updateOrderAction`, `cancelOrderAction`, `deleteOrderAction` reciben
  `FormData`**, porque salen de un formulario (decisión 19); la acción extrae los campos, los pasa
  por el esquema y llama al caso de uso ya cableado en `@/lib/composition`.
  **`getOrderAction` y `listOrdersAction` reciben argumentos ya tipados**: nadie las llama desde un
  `<form>`.
- **La acción no decide nada**: resuelve el actor con `identity.getSessionUser()`, traduce entrada y
  traduce resultado. Ni una regla de negocio, ni una segunda comprobación de rol.
- **Ningún route handler y ningún `fetch` a una ruta propia**
  (`docs/architecture.md > Server Actions vs Route Handlers`).
- **`revalidatePath` no se llama aquí**: no hay ninguna ruta que revalidar todavía (R57) y adivinar la
  de QC-35 sería inventarla.
- **No pasa por el barrel** (`docs/architecture.md`, excepción de los driving): QC-35 la importará por
  su ruta exacta.

**Punto de composición** — bloque nuevo al final de `lib/composition/index.ts`, sin reordenar nada:

```ts
const recipeCatalog: RecipeCatalog = { findRefsIncludingDeleted: findRecipeRefsIncludingDeleted };
const orderRepository: OrderRepository = { create, findAliveById, listAlive, updateAlive, cancelAlive, softDeleteAlive };

export const pedidos = {
  createOrder: createCreateOrder({ orders: orderRepository, recipes: recipeCatalog, units: unitCatalog }),
  getOrder:    createGetOrder({ orders: orderRepository, recipes: recipeCatalog, units: unitCatalog }),
  listOrders:  createListOrders({ orders: orderRepository, recipes: recipeCatalog, units: unitCatalog }),
  updateOrder: createUpdateOrder({ orders: orderRepository, recipes: recipeCatalog, units: unitCatalog }),
  cancelOrder: createCancelOrder({ orders: orderRepository }),
  deleteOrder: createDeleteOrder({ orders: orderRepository }),
} as const;
```

`unitCatalog` **ya está construido** en ese archivo (lo dejó QC-25): se reutiliza, no se crea una
segunda instancia.

---

## 10. Paginación y orden (R34–R37, R41)

Se consume `lib/shared/pagination.ts` **tal cual**, sin tocarlo: `DEFAULT_PAGE_SIZE = 10`,
`MAX_PAGE_SIZE = 25`, `toOffsetLimit`, `buildPage`. Quien los llama es el **adaptador driven**
—`domain/` no puede importar `lib/shared/**`—; el caso de uso valida la consulta con
`pageQuerySchema` (mínimo e integridad, R36) y delega. Es el reparto de **QC-20** y **QC-43**, no el
de `recetas`, que los inyecta: el motivo está en § 10.2 de aquel spec y vale igual aquí — el defecto
y el tope **ya tienen su test** en `tests/unit/pagination.test.ts`, y volver a probarlos desde
`pedidos` sería probar la librería.

**El orden (R41)** se escribe en el `ORDER BY` del adaptador:

```sql
ORDER BY "priority" DESC, "created_at" ASC, "order_year" ASC, "order_sequence" ASC
```

- `priority DESC` ordena `CRITICA → ALTA → MEDIA → BAJA` **porque Postgres ordena un enum por su orden
  de declaración**, que QC-33 R16 fijó de menor a mayor. **Esto es exactamente por lo que reordenar
  las cuatro líneas del enum cambiaría el listado**, y el test estático de QC-33 ya lo vigila.
- El desempate por el correlativo hace el orden **total** —la pareja `(año, posición)` es única y no
  parcial—, y eso es lo que hace la paginación estable (R41): sin él, dos pedidos creados en el mismo
  milisegundo podrían salir en dos páginas o en ninguna.
- **Consecuencia asumida y ya escrita en la decisión 13**: subir la prioridad de un pedido cambia la
  forma de la lista.

Los índices que esto querría (`priority, created_at`) **no se crean**: QC-33 dejó la pregunta abierta
2 de su diseño («¿hace falta un índice por `status`?») y añadirlo hoy, con la tabla vacía y sin una
medición, sería adivinar. Es aditivo y barato el día que haga falta.

---

## 11. Alternativas descartadas

### 11.1 Partir la ficha en dos migraciones (`ADD VALUE` en una, el resto en otra) — descartada

Es la salida canónica al `55P04` de § 3.1: la primera migración solo añade el valor, confirma, y la
segunda ya puede usarlo como valor del enum en los dos `CHECK`. Se descarta porque **la decisión 22
dice «una sola migración con su `down.sql`»**, porque dos carpetas obligan a dos `down.sql` que hay
que revertir en orden —y `scripts/db-rollback.ts` revierte de una en una, así que un rollback a medias
dejaría el tipo con un valor que ningún `CHECK` menciona— y porque el coste de evitarlo es **un
`::text` en dos líneas**, que además ya es la forma que hay que usar en el `down.sql` (donde el tipo
está a medio recrear). Coste aceptado: los dos `CHECK` comparan texto, así que un valor de enum mal
escrito en el SQL no lo detecta el planificador. Lo detecta el test estático, que exige el texto
exacto de los dos predicados.

### 11.2 Una tabla de contadores `order_sequences(year, last_sequence)` — descartada

Un `INSERT … ON CONFLICT (year) DO UPDATE SET last_sequence = last_sequence + 1 RETURNING` es
atómico, no necesita DDL en tiempo de ejecución, es trivial de revertir y **no deja huecos**. Se
descarta porque el lock de la fila del año **se mantiene hasta el `COMMIT`**: todas las altas de un
mismo año se serializan, que es literalmente la opción que la decisión 10 descartó («serializar con
bloqueo convierte cada alta en una cola»). Y la continuidad que compraría ya no vale nada: los huecos
están aceptados desde el 2026-09-03 (QC-33 R42). Consta aquí porque es lo que uno escribe por reflejo
al leer «un contador por año» y porque en un ERP pequeño **funcionaría**; se descarta por fidelidad a
la decisión, no por rendimiento medido.

### 11.3 Dos métodos en `RecipeCatalog` (`findRefs` vivas + `findRefsIncludingDeleted`) — descartada

Sería el calco exacto de `ProductCatalog.findRefs`, que devuelve solo lo vivo, y dejaría a cada
llamante pedir lo que necesita. Se descarta porque el alta y la edición necesitan **las dos
respuestas sobre los mismos ids** —«¿existe?» y «¿está viva?»— y con dos métodos o se hacen dos
consultas o se deduce la baja por ausencia, que confunde «no existe» con «está de baja» justo donde
R15 y R25 los distinguen. Un solo método con `isDeleted` en el `Ref` responde las dos con **una**
lectura. Coste aceptado: `recetas` publica un método cuyo nombre es más largo y más feo que el de sus
dos hermanos, precisamente para que nadie lo confunda con ellos.

### 11.4 Un trigger que valide las transiciones en la base — descartada

Ver § 5. Resumen: **QC-33 R19 lo prohíbe explícitamente**, un trigger no distingue `updateOrder` de
`cancelOrder`, y sería el primer trigger del repositorio. Consta para que nadie lo proponga como
«mejora» al ver que el resto de invariantes sí bajan a la base.

### 11.5 `cancelOrder` como una edición más con `status: 'CANCELADO'` — descartada por el humano

Consta para no reconsiderarla: la decisión 7 la cierra. Ahorraría un caso de uso, un método de puerto
y una Server Action. Se descarta porque el «motivo obligatorio» tendría que garantizarse **dentro** de
la edición, con un `if` que se puede olvidar, y porque la operación se queda sin nombre propio para el
permiso, para su test y para el botón de QC-35.

### 11.6 Guardar el motivo en una tabla de histórico de cambios de estado — descartada

Daría el rastro completo («quién pasó esto a EN_CURSO y cuándo») y no solo el de la cancelación. Se
descarta porque **nadie lo ha pedido**: la decisión 4 dice «columna nueva en el pedido», el pedido
tiene un solo estado final cancelado y un solo motivo, y una tabla de eventos traería su modelo, su
migración, su RLS y su ficha. Si algún día hace falta el histórico, es ficha propia de la épica QC-31
y esta columna no estorba.

### 11.7 Ordenar el listado por número correlativo descendente — descartada por el humano

Es lo natural en un listado de documentos y lo que hacen casi todos los ERP. La decisión 13 elige
prioridad y antigüedad **a propósito**: lo que importa de un pedido es a qué atender antes, no cuál se
creó último. El correlativo se queda como **desempate**, que es donde aporta (orden total y
paginación estable) sin decidir qué se ve arriba.

---

## 12. Cómo se verifica

**Sin E2E, y con motivo** (decisión 24, R57): esta ficha es backend puro y no aporta ningún flujo
navegable; Playwright no tendría pantalla que abrir. Lo decide **QC-35**. **El diferimiento se
declara aquí, no al final.**

| Nivel | Archivo | Qué demuestra |
| --- | --- | --- |
| Unit (dominio) | `tests/unit/pedidos/authorization.test.ts` | R1, R2, R3, R4: los **seis** casos de uso rechazan al no-administrador **sin tocar ningún puerto** (dobles que lanzan si los llaman), y el literal del rol no aparece en `lib/modules/pedidos/**`. |
| Unit (dominio) | `tests/unit/pedidos/order-service.test.ts` | R6, R8, R9, R15, R16, R20, R21, R25, R33, R42, R46 con dobles del puerto y de los dos catálogos. |
| Unit (dominio) | `tests/unit/pedidos/order-transitions.test.ts` | R22, R23, R24: la tabla completa —las tres permitidas, el «quedarse igual», los retrocesos, los dos finales— y que `CANCELADO` no es destino de ninguna. |
| Unit (dominio) | `tests/unit/pedidos/cancel-order.test.ts` | R26, R27, R28, R29: motivo recortado, vacío, de 501 caracteres, cancelar desde los cuatro estados. |
| Unit (dominio) | `tests/unit/pedidos/delete-order.test.ts` | R31, R32, R33 en su parte de aplicación. |
| Unit (dominio) | `tests/unit/pedidos/list-orders.test.ts` | R34, R35, R36, R38, R39, R40, R41, R43, **R45** (dobles que **cuentan llamadas**: una a cada catálogo por página, con ids deduplicados), R44 (una receta con `isDeleted: true` sigue trayendo nombre). |
| Unit (borde) | `tests/unit/pedidos/order-input.test.ts` | R9, R17, R18, R19, R24, R27, R36, R55: los esquemas `zod`, incluido que `updateOrderSchema` **no admite** `'CANCELADO'` ni `reason`, y que `createOrderSchema` **ignora** `status`, `createdBy` y el correlativo. |
| Unit (driving) | `tests/unit/pedidos/order-actions.test.ts` | R5, R54, R56: `FormData` en las cuatro mutaciones, argumentos tipados en las dos consultas, actor de `identity`, traducción por `code` y no por texto. |
| Unit (estático) | `tests/unit/pedidos/schema/pedidos-migration.test.ts` | R48, R49, R50, R51: el `ADD VALUE`, la columna, los dos `CHECK` **con su texto exacto y su `::text`**, la función y su `pg_advisory_xact_lock`, que **no hay ningún otro `ALTER`**, y que el `down.sql` **recrea el tipo** (`RENAME TO` + `CREATE TYPE` + `USING`), **restaura el `CHECK` de QC-33 literal**, borra la función y las secuencias y lleva la **guardia de datos**. **Mutaciones de sensibilidad obligatorias**: quitar el `::text` de un `CHECK`, cambiar la igualdad de booleanos de R30 por una implicación, quitar `CANCELADO` del `NOT IN`, quitar el `DROP DEFAULT` del down, quitar la guardia del paso 0 y sustituir el bloque de recreación por un `ALTER TYPE ... DROP VALUE` — el predicado debe caer en los seis casos. |
| Unit (alcance) | `tests/unit/pedidos/scope.test.ts` | R37, R52, R53, R57, R58: ningún archivo bajo `app/`, ningún route handler, ningún spec E2E nuevo, ninguna reimplementación de la aritmética de paginación, ningún `.gitkeep` sobrante, el contrato sin `'use server'`, y `pedidos` sin `prisma.recipe`/`prisma.unit`/`prisma.user` ni imports profundos. |
| Unit (módulo ajeno) | `tests/unit/recetas/recipe-catalog.test.ts` | R44 por el lado de `recetas`: el contrato publica `findRefsIncludingDeleted` y `RecipeRef.isDeleted`, y ninguna firma anterior cambió. |
| Integración | `tests/integration/pedidos/order-crud.int.test.ts` | R8, R10, R30, R32, R40, R41 contra Postgres real: el `CHECK` del motivo en sus cuatro casos, el de borrado en sus **seis**, el `ORDER BY` con el enum, y que el año escrito satisface el `CHECK` de QC-33 R41 —incluido el caso frontera del 31 de diciembre a las 20:00 en Ecuador—. |
| Integración | `tests/integration/pedidos/order-sequence.int.test.ts` | R11, R12, R13: la primera alta de un año crea la secuencia y arranca en 1; dos altas del mismo año no colisionan; **dos altas concurrentes que son las dos la primera del año** (dos conexiones) acaban las dos bien; una transacción abortada **deja un hueco** y la siguiente no lo rellena; y un año nuevo vuelve a arrancar en 1. |
| Ciclo real | task T14 | R49 y R50 en su forma real: `db:migrate` → `db:rollback` → `db:migrate`, **y además** el intento de rollback con un pedido `CANCELADO` en la tabla, que debe abortar sin tocar filas. Salida pegada en `progress/impl_QC-34-crud-de-pedidos.md`. |
| Guardia (ya existe) | `tests/guards/guard-arquitectura-modulos.test.ts` | R52, R53. |
| Guardia (ya existe) | `tests/guards/guard-rls-force.test.ts` | R7. |
| Guardia (ya existe) | `tests/guards/guard-dependencias-aprobadas.test.ts` | R58. |

El mapa completo `R<n> → test` está en `tasks.md > Trazabilidad`.

**Seis avisos para el implementer**, todos aprendidos en fichas anteriores:

- **Las operaciones que deben fallar en la base van con `$executeRaw`**, no con la API tipada: Prisma
  traduce el SQLSTATE a su propio código antes de que llegue a `meta.code` (QC-24 § 10.1). Se afirma
  sobre el **SQLSTATE** (`23502`, `23503`, `23505`, `23514`, `22P02`, `55P04`), **nunca** sobre el
  texto del mensaje: en esta máquina Postgres responde en español.
- **El test de concurrencia de la secuencia necesita dos conexiones de verdad**, no dos `await` en
  la misma. Con una sola conexión no hay concurrencia y el caso pasa por casualidad.
- **El test de R2 tiene que demostrar que no se llega al repositorio**: doble que registra la llamada
  y `expect(...).not.toHaveBeenCalled()`. Un doble permisivo dejaría pasar una autorización puesta
  después de la consulta.
- **El `CHECK` de borrado necesita sus seis casos** (borrar `PENDIENTE` ✔, `EN_CURSO` ✔, `ENTREGADO` ✘,
  `CANCELADO` ✘, poner `ENTREGADO` a uno borrado ✘, poner `CANCELADO` a uno borrado ✘). Un test que
  solo prueba el rechazo deja pasar un `CHECK` demasiado estricto.
- **`beforeAll` debe fallar con un mensaje claro** («corre `pnpm run db:migrate`») si falta la columna
  `cancellation_reason` o el valor `CANCELADO`, no reventar a mitad del primer caso.
- **Un test de RLS escrito con Prisma sale verde pase lo que pase** (se conecta como dueño). No se
  escribe: R7 lo cierra la guardia estática sobre el SQL.

---

## 13. Dependencias de terceros (R58)

**Ninguna dependencia nueva, y ninguna propuesta que abrir.** Todo lo que este diseño necesita está
instalado y registrado en `docs/dependencias.md`: `zod` (borde), `@prisma/client` (persistencia y
`Prisma.Decimal`), `vitest`. La paginación ya está en `lib/shared/pagination.ts` y el formato del
correlativo en `pedidos/domain/order-number.ts` (QC-33). Los cuatro checks de
`docs/architecture.md > Dependencias de terceros` **no llegan a evaluarse** porque no se propone
ninguna librería.

Una candidata que **podría parecerlo y no entra**, y su condición:

| Candidata | Qué código nos ahorraría | Los cuatro checks | Por qué no entra |
| --- | --- | --- | --- |
| `decimal.js` / `big.js` | Multiplicar cantidad × precio unitario para devolver el **total** sin el redondeo binario de `number` (`docs/architecture.md > Anti-patrones`) | **No verificados: sin red no se pueden comprobar los cuatro, y un check no verificable NO es un sí** (regla 6 de `CLAUDE.md`; ya quedó anotado igual en `QC-33 design.md > 10`) | **Este diseño no multiplica nada.** El decimal vive entero en Postgres y viaja como texto (§ 7.1); la salida **no lleva total** (pregunta abierta 3). Si el humano cierra esa pregunta pidiendo el total, el `backend_dev` **para y propone**, no instala (regla 7): `decimal.js` viaja hoy como dependencia **transitiva** de Prisma, pero usarla desde el dominio sería una dependencia **directa** nueva con sus cuatro checks y su aprobación. |

---

## 14. Preguntas abiertas que deja este diseño

Las cinco de `requirements.md` no se repiten; las tres que abrió `spec_author` tienen aquí su posición
por defecto (§ 7.3 la del total, § 4.4 la de la importación, § 7.2 la del reemplazo completo).
Ninguna bloquea la implementación. Dos más, propias y menores:

1. **El nombre `orders_delivered_not_deleted` se queda corto.** Tras § 3.4 la restricción cubre
   `ENTREGADO` **y** `CANCELADO`, pero se conserva el nombre para no obligar a QC-35 ni a ningún
   traductor de SQLSTATE a conocer dos nombres para la misma regla. Se anota por si el humano prefiere
   pagar el renombrado ahora, que es una línea más en el UP y otra en el `down.sql`.
2. **No se crea ningún índice para el orden del listado** (§ 10). Con la tabla vacía y sin una
   medición, elegir entre `(priority, created_at)` y otros sería adivinar; es aditivo y barato el día
   que la lista crezca. Es la misma pregunta que QC-33 dejó anotada en su § 11.2 y sigue sin
   consumidor real delante.
