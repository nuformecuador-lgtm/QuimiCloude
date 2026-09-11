# QC-86 — modelo-de-asignacion-de-pedidos · design.md

> El QUÉ está en `requirements.md` (R1–R37) y el alcance lo cerró el humano antes del spec. Aquí
> va el CÓMO: **una** tabla nueva en un **módulo nuevo** (`asignaciones`), **dos** entradas nuevas
> en el catálogo cerrado de permisos, **una** migración con su `down.sql`, el armazón del módulo
> (barril y tipos) y **cero** service, caso de uso, Server Action o pantalla (R36).
>
> Los precedentes directos, y se siguen en vez de reinventarse:
> **QC-83** (`specs/QC-83-modelo-de-grupos-de-trabajo/design.md`) para la coherencia de empresa con
> **FK compuestas** y la excepción al borrado lógico; **QC-47** para el `down.sql` que revierte al
> esquema exacto; **QC-74** para cómo se declara un permiso; y **QC-66**
> (`db/migrations/20260910120000_user_permissions_catalog/`) para cómo llegan dos permisos nuevos a
> una instalación que ya existe.
>
> Lo que QC-86 añade y QC-83 no tenía: un **snapshot** (el nombre del grupo congelado), una **FK
> compuesta anulable**, un **CHECK** que ata dos columnas, y la primera tabla del repo que cruza
> **tres módulos** (`pedidos`, `identity`, `asignaciones`).

---

## 0. Hallazgos: decisiones cerradas que NO son implementables tal cual

Ninguno bloqueante. Se anotan aquí porque el encargo pide decirlo en vez de cambiar la decisión.

1. **La decisión 6 no se puede cumplir entera, y la propia decisión ya lo dice.** El triángulo
   «persona ↔ grupo ↔ pedido» no se cierra porque `orders` no tiene `company_id` (épica QC-46). Lo
   que esta ficha garantiza en la base es **persona ↔ grupo ↔ fila**, y el pedido queda fuera. No
   es una omisión: es **R14**, escrito como requisito para que nadie lo «arregle» añadiendo una
   columna de empresa a `orders` desde aquí. El día que llegue QC-46, cerrar el triángulo es una FK
   compuesta más (§2.4).
2. **La decisión 4 («quitar el grupo se lleva a sus personas») no es una garantía de la base, y no
   puede serlo en esta ficha.** Quitar un grupo de un pedido es una **operación**, y esta ficha no
   tiene ninguna: no hay caso de uso (decisión 2). Lo que el modelo sí hace, y es lo máximo
   exigible aquí, es **poder representarlo sin ambigüedad**: `(order_id, work_group_id)` identifica
   exactamente esas filas y ninguna otra (**R17**). Quien ejecuta el borrado es **QC-87**.
3. **«Sin deduplicar en ninguna lectura» (decisión 3) no tiene lectura que vigilar en esta ficha.**
   Se traduce a una propiedad de la tabla: la PK hace imposible la segunda fila (**R3**) y no hay
   ninguna columna que guarde un segundo origen (**R5**). Si QC-88 tuviera que deduplicar, sería
   porque alguien rompió R3 o R5.

---

## 1. Modelo de datos

### 1.1 `order_assignments` (tabla nueva, única de esta ficha)

```prisma
/// @module asignaciones
model OrderAssignment {
  orderId          String   @map("order_id") @db.Uuid
  userId           String   @map("user_id") @db.Uuid
  companyId        String   @map("company_id") @db.Uuid
  workGroupId      String?  @map("work_group_id") @db.Uuid
  workGroupName    String?  @map("work_group_name")
  createdAt        DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt        DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  @@id([orderId, userId], map: "order_assignments_pkey")
  @@index([userId], map: "order_assignments_user_id_idx")
  @@index([workGroupId], map: "order_assignments_work_group_id_idx")
  @@map("order_assignments")
}
```

- **PK compuesta `(order_id, user_id)`** (R3, R5): la misma persona no puede estar dos veces en el
  mismo pedido, **venga por donde venga**. Es la traducción literal de la decisión 3 —«gana el
  primero que la trajo»—: el segundo `INSERT` choca con `23505` y no hay ningún camino que se lo
  salte. El índice de la PK cubre además la consulta caliente «quiénes son los responsables de este
  pedido» y, por su prefijo `order_id`, el barrido de un pedido entero. Mismo patrón que
  `work_group_members` (QC-83) y `role_permissions` (QC-74).
- **`order_assignments_user_id_idx` sirve el sentido inverso**, «qué pedidos tengo asignados», que
  es exactamente la consulta de **QC-88** y la que verifica el `RESTRICT` al borrar una persona
  (R22). La PK no lo cubre: un índice compuesto solo sirve las consultas que empiezan por su
  primera columna.
- **`order_assignments_work_group_id_idx` sirve dos cosas a la vez**: la verificación del
  `RESTRICT` hacia `work_groups` (R10) y el «quitar este grupo de este pedido» de QC-87 (R17), que
  filtra por `(order_id, work_group_id)` —el prefijo `order_id` de la PK y este índice cubren los
  dos órdenes de acceso razonables—.
- **No hay índice por `company_id`, y es deliberado.** Nadie consulta asignaciones por empresa en
  esta ficha ni en las dos siguientes, y las dos verificaciones de `RESTRICT` que pasan por el lado
  hijo entran por `user_id` y por `work_group_id`, que sí tienen índice. El que haga falta lo añade
  quien estrene la consulta —mismo criterio que `users.account_status` en QC-65 R19—.
- **`work_group_id` y `work_group_name` son la congelación** (R6), y van **las dos anulables**: una
  asignación suelta no tiene ni grupo ni nombre. Que vayan **juntas o ninguna** no es una convención
  amable, es el CHECK de §2.3 (R7).
- **`work_group_name` es `TEXT` sin longitud** (R24 no pide tope y R6 tampoco): es una **copia** de
  `work_groups.name`, que ya es `TEXT` sin longitud (QC-83 R2). Poner aquí un tope que el origen no
  tiene convertiría un renombrado legítimo en un error de asignación.
- **La marca de «vino de un grupo» NO es una columna aparte.** Es `work_group_id IS NOT NULL`. La
  alternativa —un `enum` `assignment_source`— está descartada en §9.1 con su motivo.
- **NO hay `deleted_at`, y es un requisito con nombre** (R15, decisión cerrada 5): sacar a alguien
  de un pedido **borra la fila**. Ver §2.5.
- **`created_at` y `updated_at` van igual** (R23, decisión cerrada 13) aunque la fila casi nunca se
  actualice. `updated_at` es `NOT NULL` **sin default de base** —lo rellena `@updatedAt` del cliente
  Prisma—, así que **un `INSERT` crudo que no la ponga falla**. Misma nota que QC-4, QC-47 y QC-83.
- **Ninguna columna lleva `@relation`**, y aquí sí aplica el argumento habitual del repo **además**
  del de QC-83: dos de los tres padres (`orders`, `users`/`work_groups`) son de **otros módulos**
  (`pedidos`, `identity`), así que un `include` de Prisma podría atravesar la frontera sin que
  ninguna guardia de imports lo viera —es exactamente la nota que `Order` lleva escrita en el
  esquema para sus tres FK—. Y, como en QC-83, dos de las FK son **compuestas y comparten
  `company_id`**, que Prisma no modela. Las cuatro van **escritas a mano** en `migration.sql`.

**Lo que eso cuesta, y se acepta:** las cuatro FK y el CHECK son **drift** para Prisma. Toda
migración futura que toque `order_assignments` va a emitir `DROP CONSTRAINT` sobre ellos y **hay que
borrarlo a mano del SQL generado**, exactamente como ya se hace con `orders`, `products`,
`recipe_lines` y `work_group_members`. Se mitiga con los comentarios `/// OJO` en el modelo y con el
test de esquema (§6), que falla si el SQL de la ficha deja de declararlos.

### 1.2 Lo que NO se modela

- **Ningún `id` propio de la asignación.** La identidad de la fila es `(order_id, user_id)` y no hay
  nada que la referencie desde fuera. Un uuid suyo solo añadiría una columna que nadie usa.
- **Ninguna columna de «quién asignó» ni «cuándo se quitó».** No está pedido por ninguna decisión
  cerrada, y `created_at` ya responde «cuándo se asignó». Añadir `assigned_by` sin caso de uso que
  lo escriba deja una columna que nace `NULL` para siempre.
- **Ninguna tabla de «grupos aplicados al pedido».** Sería la forma natural de recordar que «Turno
  noche» se aplicó aunque se saque a todas sus personas —y la decisión 5 dice justo lo contrario:
  «el pedido queda con el grupo aplicado pero sin ella» se representa con las **demás filas** de ese
  grupo—. Ver §9.2.
- **Ningún estado de la asignación** (aceptada, en curso, terminada). Ejecutar la receta es QC-63.

### 1.3 Ninguna tabla preexistente cambia

Y esta vez es literal (R32): a diferencia de QC-83, que tuvo que añadir `users_id_company_id_key`,
**las dos restricciones únicas que esta ficha necesita ya existen**, creadas por QC-83:
`users_id_company_id_key` y `work_groups_id_company_id_key`. `db/schema.prisma` solo gana el modelo
nuevo; ni una línea de `User`, `Company`, `WorkGroup`, `WorkGroupMember` u `Order` se toca.

---

## 2. Los cuatro puntos delicados

### 2.1 La coherencia de empresa: dos FK COMPUESTAS, una de ellas anulable

Es la decisión cerrada 6 y el riesgo n.º 1. `order_assignments` lleva `company_id` propio y **las dos
FK hacia `identity` lo incluyen**:

```sql
ALTER TABLE "order_assignments"
  ADD CONSTRAINT "order_assignments_user_id_fkey"
  FOREIGN KEY ("user_id", "company_id")
  REFERENCES "users" ("id", "company_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "order_assignments"
  ADD CONSTRAINT "order_assignments_work_group_id_fkey"
  FOREIGN KEY ("work_group_id", "company_id")
  REFERENCES "work_groups" ("id", "company_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
```

Leído en voz alta: la fila declara **una** empresa, y esa empresa tiene que ser a la vez la de la
persona **y** —si hay grupo— la del grupo. Como la igualdad es transitiva, persona y grupo son de la
misma empresa **por construcción** (R11), sin ningún estado intermedio en el que no lo sean.

**El detalle que hay que escribir, porque es donde se rompe silenciosamente:** la FK hacia
`work_groups` es **compuesta con una columna anulable**. Postgres usa `MATCH SIMPLE` por defecto, y
`MATCH SIMPLE` **no verifica nada si alguna de las columnas referenciadas es `NULL`**. Aquí eso es
justo lo que se quiere: una asignación suelta tiene `work_group_id IS NULL`, la FK no se evalúa y la
fila se acepta (**R13**). **`MATCH FULL` rompería R13**, porque exigiría que las dos columnas fueran
`NULL` a la vez y `company_id` es `NOT NULL`. No se escribe `MATCH FULL` y el test de esquema
comprueba que no aparece.

**Qué pasa en cada intento de romperlo:**

| Intento | Qué responde Postgres |
| --- | --- |
| `INSERT` con una persona de la empresa A y un grupo de la B | `23503` contra una de las dos FK, según cuál se evalúe primero (R11) |
| `INSERT` con `company_id` que no es ni la de la persona ni la del grupo | `23503` contra las dos (R11) |
| `INSERT` sin grupo, con la empresa de la persona | **aceptado** — la FK del grupo no se evalúa (R13) |
| `INSERT` sin grupo, con una empresa que no es la de la persona | `23503` contra la FK de la persona |
| `UPDATE users SET company_id = <otra>` con esa persona asignada | el `ON UPDATE CASCADE` propaga la empresa nueva a sus asignaciones y **entonces** falla la FK del grupo con `23503` (R12) |
| `UPDATE work_groups SET company_id = <otra>` con el grupo ya aplicado | simétrico: cascada y fallo contra la FK de la persona (R12) |
| `INSERT` desde un seed, un script o una consola | exactamente lo mismo: **no hay camino que se salte esto** |

Ese último renglón es toda la decisión cerrada 6: dejarlo en manos del caso de uso de QC-87 significa
que un script, un seed o un bug futuro escriben la fila cruzada y **nada da rojo** hasta que QC-88
muestre pedidos ajenos.

**`ON DELETE RESTRICT` en las dos, y es distinto de QC-83.** Allí la pertenencia hacia `work_groups`
iba en `CASCADE` porque la pertenencia *es parte del* grupo. Aquí **no**: la asignación es un hecho
**congelado del pedido**, no una parte del grupo. Que borrar físicamente «Turno noche» se llevara por
delante a los responsables de un pedido en ejecución es precisamente lo que la decisión 7 prohíbe
(R10). Hacia `users`, `RESTRICT` por la razón de siempre: una persona no se borra físicamente en este
ERP (QC-4), así que un `DELETE` sobre `users` es ya una anomalía y tiene que ser **ruidosa** (R22).

### 2.2 La FK hacia el pedido: simple, y cruza de módulo

```sql
ALTER TABLE "order_assignments"
  ADD CONSTRAINT "order_assignments_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "orders" ("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
```

**Simple y no compuesta**, porque `orders` no tiene `company_id` (§0, hallazgo 1, R14). `RESTRICT`
(R20): el pedido tiene **borrado lógico** (QC-33 decisión 19), así que un `DELETE` físico sobre
`orders` es una anomalía, y su asignación es parte de su historia (decisión cerrada 11). Dar de baja
un pedido es un `UPDATE` y **ninguna FK reacciona a un `UPDATE`**: las asignaciones se quedan sin
que nadie haga nada (R19).

Es una FK **entre módulos** (`asignaciones` → `pedidos`), escrita a mano y sin `@relation`, con el
precedente exacto de `products.unit_id` y de las tres FK de `orders`.

### 2.3 El CHECK que ata el grupo con su nombre congelado

```sql
ALTER TABLE "order_assignments"
  ADD CONSTRAINT "order_assignments_work_group_name_matches_group"
  CHECK (
    ("work_group_id" IS NULL     AND "work_group_name" IS NULL)
    OR
    ("work_group_id" IS NOT NULL AND "work_group_name" IS NOT NULL)
  );
```

Es R7, y es la única garantía de que la congelación **no se queda a medias**. Sin él caben dos filas
imposibles: una que dice que vino de un grupo y no sabe de cuál se llamaba, y otra que guarda el
nombre de un grupo del que no vino. El precedente literal del repo es
`orders_cancellation_reason_matches_status` (QC-34): dos columnas que existen la una por la otra se
atan con un CHECK, no con una convención.

**Lo que el CHECK NO garantiza, y hay que decirlo:** que `work_group_name` sea **de verdad** el
nombre que el grupo tenía en ese instante. Eso no lo puede saber ninguna restricción —comprobar
«coincide con el nombre actual» sería exactamente lo contrario de congelar—, y es
responsabilidad del caso de uso de **QC-87**, que escribirá las dos columnas en el mismo `INSERT`.
La base garantiza que **hay** un nombre; que sea el correcto se demuestra con el test de integración
que renombra el grupo después y comprueba que la fila no cambió (R8).

### 2.4 El día que llegue QC-46

Cuando `orders` gane `company_id`, cerrar el triángulo cuesta exactamente dos líneas: una restricción
única `orders (id, company_id)` y convertir `order_assignments_order_id_fkey` en compuesta. No hay
que migrar datos ni cambiar ninguna columna de esta tabla, porque `company_id` ya está aquí. Se
escribe para que QC-46 no tenga que descubrirlo.

### 2.5 El borrado es FÍSICO, y es la excepción explícita

Es la decisión cerrada 5 y hereda la de **QC-83 dec. 4**. Se argumenta porque
`docs/architecture.md > Anti-patrones` prohíbe el `DELETE` físico **en tablas transaccionales**:

1. **El histórico que importa es el congelado, no el rastro.** Lo que la empresa necesita saber es
   quién era responsable del pedido —y eso está en las filas vivas, con el nombre del grupo tal como
   era—, no quién estuvo asignado veinte minutos por error. Es la frase de la decisión cerrada,
   escrita al derecho.
2. **La baja lógica aquí costaría la PK.** `(order_id, user_id)` dejaría de ser único al haber filas
   muertas, así que habría que degradarla a un índice único **parcial** y **toda** lectura de
   responsables, para siempre, tendría que acordarse de filtrar. La que se olvide una vez enseña un
   pedido a alguien a quien ya se lo quitaron. Mismo coste que QC-83 midió, y aquí es peor: la
   lectura que se olvidaría es la de **QC-88**, que decide qué ve un Operador.
3. **El pedido sí es distinto** y por eso él sigue con borrado lógico (R19, R20).

---

## 3. El módulo nuevo `asignaciones`

```
lib/modules/asignaciones/
  index.ts                       ← contrato público
  domain/
    order-assignment.ts          ← los tipos de la asignación
```

Dos carpetas y nada más, y es lo máximo que permite la decisión 2: **sin `ports/`** (no hay puerto
que declarar sin caso de uso) y **sin `adapters/`** (no hay repositorio). La guardia
`tests/guards/guard-arquitectura-modulos.test.ts`, bloque 1, exige `index.ts` y **solo** carpetas
`domain`/`ports`/`adapters`: un módulo con `index.ts` + `domain/` la cumple.

**Qué publica el contrato** (R31), y nada más:

```ts
// lib/modules/asignaciones/domain/order-assignment.ts
/** De dónde vino un responsable: marcado suelto, o dentro de un grupo aplicado al pedido. */
export type AssignmentOrigin =
  | { readonly kind: 'direct' }
  | { readonly kind: 'workGroup'; readonly workGroupId: string; readonly workGroupName: string };

/** Un responsable de un pedido, tal como lo persiste la fila. `workGroupName` es el nombre
 *  CONGELADO: el que el grupo tenía al asignar, no el de hoy. */
export type OrderAssignment = {
  readonly orderId: string;
  readonly userId: string;
  readonly companyId: string;
  readonly origin: AssignmentOrigin;
};
```

Tres notas:

- **El tipo unión hace imposible la fila a medias en TypeScript**, igual que el CHECK la hace
  imposible en Postgres (R7). Las dos garantías dicen lo mismo en los dos sitios donde se puede
  romper; ninguna sustituye a la otra.
- **Dominio puro**: sin `zod`, sin `next/*`, sin `@prisma/client`. El contrato tiene que poder
  importarse desde un componente de cliente (guardia del contrato, bloque 6).
- **El módulo no importa nada de `pedidos` ni de `identity` todavía**, y por eso R31 se comprueba
  **en negativo**: los identificadores viajan como `string` (uuid), igual que en todo el repo. El día
  que necesite un tipo de otro módulo, lo pedirá a su **barril** (`@/lib/modules/pedidos`), nunca a
  una ruta interna: la guardia de módulos (bloque 5) lo hace cumplir.

**Lo que NO entra en el módulo** (R36): ni `ports/`, ni `adapters/`, ni `requirePermission`, ni
errores, ni esquemas `zod`. Un `AsignacionesError` sin caso de uso que lo lance es código muerto.

---

## 4. Los dos permisos

### 4.1 En el catálogo y en el seed (R25, R26, R27)

`lib/modules/identity/domain/permissions.ts` gana **dos** entradas y el catálogo pasa de **trece a
quince**:

```ts
{ code: 'asignaciones.consultar', module: 'asignaciones', action: 'consultar',
  description: 'Consultar los pedidos asignados.' },
{ code: 'asignaciones.modificar', module: 'asignaciones', action: 'modificar',
  description: 'Asignar y desasignar responsables de un pedido.' },
```

y `SEED_ROLE_PERMISSIONS` gana `asignaciones.consultar` **y** `asignaciones.modificar` en el
Administrador, y `asignaciones.consultar` en el **Operador**, que pasa a tener **dos** permisos
(`inventario.consultar` y este). Escritos **uno a uno**, sin comodín: decisión 2 del 2026-09-07,
que `tests/unit/identity/permissions.test.ts` vigila.

**Por qué el catálogo sigue viviendo en `identity` y no en el módulo nuevo:** lo cerró QC-74
(`design.md > 2`) y el propio archivo lo explica —repartirlo por módulo crearía un ciclo entre
barriles con constantes en `undefined`—. `asignaciones` es el **tercer** módulo cuyo permiso vive en
`identity` (como `pedidos`, `recetas`, etc.); es la norma del repo, no una excepción de esta ficha.

**Enmienda que hay que escribir, como hicieron QC-38 y QC-66:** QC-74 R2 dijo «exactamente diez
permisos»; QC-38 lo llevó a once, QC-66 a trece y **QC-86 a quince**. Va escrita en el comentario de
cabecera de `permissions.ts`, con esas palabras, en vez de disimularse.

### 4.2 En una instalación que ya existe (R28)

Los permisos no llegan solos por el seed: `scripts/seed.ts` corre en la instalación, no en cada
despliegue. El precedente es **QC-66**
(`db/migrations/20260910120000_user_permissions_catalog/migration.sql`), y se copia su forma:

```sql
INSERT INTO "permissions" ("code","module","action","description","updated_at") VALUES
  ('asignaciones.consultar','asignaciones','consultar','Consultar los pedidos asignados.', CURRENT_TIMESTAMP),
  ('asignaciones.modificar','asignaciones','modificar','Asignar y desasignar responsables de un pedido.', CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

-- El Administrador recibe los dos; el Operador, solo `consultar` (decisión cerrada 8).
-- El rol se resuelve POR NOMBRE con un subselect: `roles.id` es `gen_random_uuid()` y es
-- distinto en cada instalación.
INSERT INTO "role_permissions" ("role_id","permission_code")
SELECT "r"."id", "p"."code" FROM "roles" AS "r"
CROSS JOIN (VALUES ('asignaciones.consultar'),('asignaciones.modificar')) AS "p"("code")
WHERE "r"."name" = 'Administrador'
ON CONFLICT ("role_id","permission_code") DO NOTHING;

INSERT INTO "role_permissions" ("role_id","permission_code")
SELECT "r"."id", 'asignaciones.consultar' FROM "roles" AS "r"
WHERE "r"."name" = 'Operador'
ON CONFLICT ("role_id","permission_code") DO NOTHING;
```

**Los `ON CONFLICT DO NOTHING` son R28 entero**: aplicarla sobre una base donde el seed ya sembró
los códigos no falla y no reescribe nada. **Las descripciones se duplican entre el SQL y
`permissions.ts`** —una migración no puede llamar a TypeScript—, exactamente como QC-66; el test de
esquema las compara **importando la constante**, no copiándola, para que divergir sea rojo.

### 4.3 Nadie exige todavía estos permisos (R29)

Ni `page.tsx`, ni menú, ni `requirePermission`. Consecuencia útil: `asignaciones.consultar` existe y
no abre **nada**, que es justo lo que la decisión 8 quiere —«al Operador no se le da
`recetas.consultar`» porque ese permiso hoy abre también el formulario de edición—. La guardia
`guard-nav-permisos-declarados` va en el sentido menú → catálogo, así que un permiso sin enlace
**no** la pone roja; se verificó leyéndola.

---

## 5. La migración

**Una migración nueva**, `db/migrations/<ts>_order_assignments/` (con `<ts>` posterior a
`20260910120000`), con su `migration.sql` (UP) y su `down.sql` (DOWN, obligatorio,
`docs/architecture.md > Migraciones up/down`). **Una sola**, no dos: la tabla y los permisos entran
juntos porque revertirlos por separado no tiene ningún significado —un permiso de un módulo cuya
tabla no existe es exactamente el estado que la decisión 8 quiere evitar—.

### 5.1 Orden del `migration.sql` (UP)

El orden **no es cosmético**; cada paso depende del anterior:

1. `CREATE TABLE "order_assignments"` (§1.1), con su `order_assignments_pkey`
   `PRIMARY KEY ("order_id","user_id")`.
2. `CREATE INDEX "order_assignments_user_id_idx"` y
   `CREATE INDEX "order_assignments_work_group_id_idx"`.
3. El **CHECK** de §2.3.
4. Las **tres FK** de §2.1 y §2.2, en este orden: pedido, persona, grupo. Las dos compuestas
   apuntan a `users_id_company_id_key` y `work_groups_id_company_id_key`, que **ya existen** desde
   QC-83 — sin ellas fallarían con `42830`, y por eso `depends_on: QC-83` no es decorativo.
5. Los **dos `INSERT` de permisos** y los **dos de asignaciones de rol** (§4.2).
6. Los dos `ALTER TABLE "order_assignments" ENABLE / FORCE ROW LEVEL SECURITY` (R33), **al final del
   todo**. El orden importa por la lección de QC-32, QC-74 y QC-83: `FORCE` sin policies deniega
   también al dueño cuando no es superusuario, así que una escritura colocada después podría no
   escribir nada **en silencio**. Aquí los `INSERT` del paso 5 son sobre `permissions` y
   `role_permissions` —que ya tienen su RLS de QC-74 y no la cambia esta migración—, pero el orden
   se respeta igual: es gratis y evita la trampa cuando alguien añada un paso 7.

**Lo que hay que borrar a mano del SQL que genere Prisma** (R32), igual que hicieron
`20260904180600_companies_and_user_company`, `20260907183034_permissions_and_role_permissions` y
`20260908210000_work_groups_and_members`: los `DROP CONSTRAINT` sobre `orders`, `products`,
`recipe_lines`, `recipes`, `supplier_catalog_lines`, `suppliers`, `units` y **`work_group_members`**
—las FK escritas a mano por QC-20, QC-24, QC-32, QC-33, QC-40, QC-76 y QC-83, que Prisma no
conoce—, los CHECK de `orders` y `units`, y los `DROP INDEX` de QC-57 sobre `presentations` y
`units`, incluidos los GIN de trigramas. Esta migración **no toca ningún objeto de esquema
preexistente**.

### 5.2 No hay backfill de asignaciones, y eso importa

La tabla nace **vacía** y ninguna tabla existente gana una columna obligatoria. De ahí se siguen
tres cosas:

- **Todos los pedidos que ya existen quedan sin responsables**, y eso es exactamente lo que la
  decisión cerrada 10 dice que tiene que pasar (R18). No hay ningún responsable que inventar.
- **Ningún fixture existente se rompe.** Nadie tiene que empezar a pasar un dato nuevo para que su
  `order.create` compile. Es lo que hace que R36 sea barato de cumplir y no una promesa.
- **La única escritura de datos de la migración son las cuatro filas de permisos** (§4.2), y son
  aditivas e idempotentes.

### 5.3 El `down.sql` (R34, R35)

Orden inverso y estricto:

1. `DELETE FROM "role_permissions" WHERE "permission_code" IN ('asignaciones.consultar','asignaciones.modificar');`
   — **primero**, porque `role_permissions_permission_code_fkey` es `RESTRICT` y borrar el permiso
   antes fallaría. Borra las asignaciones de **cualquier** rol, no solo las dos que puso el UP:
   dejar el permiso huérfano no es el estado anterior. Va **acotado por código**: ninguna otra
   asignación se pierde. Criterio literal del `down.sql` de QC-66.
2. `DELETE FROM "permissions" WHERE "code" IN ('asignaciones.consultar','asignaciones.modificar');`
   — el catálogo persistido vuelve a sus trece entradas.
3. `DROP TABLE "order_assignments";` — se lleva su PK, sus dos índices, su CHECK, sus tres FK y su
   RLS. **Sin `CASCADE`**, a propósito: el fallo debe ser ruidoso, no silencioso (mismo criterio que
   QC-74 y QC-83).
4. **`orders`, `users`, `work_groups`, `companies` y `roles` no se tocan en ninguna línea**, y
   `pgcrypto` tampoco.

**Sobre R35.** Este `down.sql` sí borra filas de tablas preexistentes (`permissions`,
`role_permissions`), y **es correcto**: son exactamente las que el UP insertó, acotadas por código, y
no borrarlas dejaría el catálogo con dos entradas que ningún código declara. Lo que **no** hace es
tocar ninguna otra fila, ni inventar ningún dato, ni recrear nada que pudiera chocar. El test de
migración (§6) comprueba **en negativo** que el `down.sql` no contiene ningún `UPDATE`, ningún
`INSERT`, ningún `DELETE` sin la cláusula `WHERE ... IN (<los dos códigos>)` y ningún `ALTER TABLE`
sobre una tabla preexistente: es la forma ejecutable de R35 en esta ficha.

**Lo que la reversión sí se lleva, y es inevitable:** las asignaciones que se hayan creado después de
aplicar el UP. Es el comportamiento normal de revertir un `CREATE TABLE`, igual que en QC-74 y QC-83.

---

## 6. Verificación: qué prueba qué

Sin service ni pantalla, el peso cae en tres sitios.

- **Test de esquema y migración** (unidad, lee los archivos):
  `tests/unit/asignaciones/schema/order-assignments-migration.test.ts`. Como mínimo: que las **dos**
  FK hacia `identity` son **compuestas y llevan `company_id`** —si alguien las simplifica a
  `FOREIGN KEY ("user_id") REFERENCES "users"("id")`, este test es lo único que se pone rojo—; que
  **no** aparece `MATCH FULL` (§2.1); que el CHECK de §2.3 existe con sus dos ramas; que las tres FK
  son `ON DELETE RESTRICT`; que ni el esquema ni el SQL declaran `deleted_at` en la tabla (R15); que
  la tabla queda con RLS `ENABLE` **y** `FORCE` y que esos `ALTER` van al final (R33); que el UP no
  ejecuta **ningún** DDL sobre una tabla preexistente (R32); que los dos códigos y sus descripciones
  del SQL coinciden con `PERMISSIONS` **importado**, no copiado (R28); y que el `down.sql` cumple lo
  de §5.3 (R35).
- **Test de constraints contra Postgres real** (integración, cada caso dentro de una transacción que
  acaba en `ROLLBACK`): `tests/integration/asignaciones/order-assignments-constraints.int.test.ts`.
  Es el único sitio donde se demuestran R2, R3, R4, R7, R8, R9, R10, R11, R12, R13, R15, R16, R17,
  R18, R19, R20, R21, R22 y R23 con `SQLSTATE` de verdad.
- **Tests del catálogo y del seed** (unidad + integración): los que ya existen, **actualizados** al
  número nuevo (lista en `tasks.md`), más la guardia `guard-permisos-sembrados`, que se pone roja
  sola si uno de los dos permisos se queda sin rol (R26).

**Criterio de «hecho» que se aplica a los tres:** cada aserción cae al **mutar** lo que vigila, no al
leerla. Es lo que QC-47 exigió en su T11 y lo que separa un test de un comentario largo.

---

## 7. Dependencias de terceros

**Ninguna nueva** (R37, decisión cerrada 17). Es esquema Prisma, SQL escrito a mano y dos alias de
tipo. No hay ninguna utilidad escrita a mano que una librería del ecosistema resuelva mejor: no se
parsea, no se valida, no se calculan fechas ni decimales. Regla 7 de `CLAUDE.md` **sin propuesta que
abrir**, y por tanto **sin los cuatro checks de `docs/architecture.md > Dependencias de terceros`
que rellenar**. El diff de la rama sobre `package.json` y `pnpm-lock.yaml` tiene que quedar
**vacío**, y `tests/guards/guard-dependencias-aprobadas.test.ts` lo verifica.

---

## 8. Riesgos

1. **Que alguien simplifique las dos FK compuestas a dos FK simples.** El riesgo n.º 1, heredado de
   QC-83 y más silencioso aquí: el esquema valida, el cliente compila, todo verde, y la decisión 6
   deja de existir hasta que QC-88 liste pedidos ajenos. Mitigación: el test de esquema exige
   `company_id` en las dos, y el de integración inserta una fila cruzada y espera `23503`.
2. **Que alguien escriba `MATCH FULL` en la FK del grupo** «para que no se cuele un `NULL`». Rompería
   **R13** en el acto: ninguna asignación suelta podría existir. Mitigación: comentario `/// OJO` en
   el modelo, y el test de esquema comprueba que la cadena no aparece.
3. **Que alguien sustituya `work_group_name` por un `JOIN` a `work_groups`** «porque es
   desnormalización». Es lo contrario de la decisión 7: un `JOIN` devuelve el nombre de **hoy** y el
   requisito es el de **entonces** (R6, R8). Mitigación: R8 escrito como requisito y demostrado con
   un test que renombra el grupo después de asignar.
4. **Que alguien añada `deleted_at` a la asignación** «por coherencia con el resto del repo». Es lo
   que la decisión 5 descartó, y rompería además la PK (§2.5). Mitigación: R15 y el test de esquema
   en negativo.
5. **Que una migración futura borre las FK y el CHECK por drift** (§1.1). Es una certeza, no una
   posibilidad: Prisma no los conoce. Mitigación: `/// OJO` en el modelo, la nota en la cabecera del
   `migration.sql` y el test de esquema, que sigue leyendo el SQL de esta migración.
6. **Que el catálogo pase a quince y algún test que cuenta trece se «arregle» relajando la
   aserción.** Los números exactos son el contrato (QC-74 R2 y sus enmiendas). Mitigación: la lista
   nominal de archivos a actualizar está en `tasks.md`, y el criterio es **subir el número, nunca
   quitar la aserción**.

---

## 9. Alternativas descartadas

### 9.1 Una columna `source` (enum `DIRECT` / `WORK_GROUP`) además de `work_group_id`

Es lo primero que se le ocurre a cualquiera al leer «la marca de que vinieron de un grupo»:
una columna que lo diga con todas las letras. **Descartada**, y es la alternativa seria de la ficha:

- **Es un dato derivable, y por tanto un dato que se puede desincronizar.** `source = 'WORK_GROUP'`
  con `work_group_id IS NULL`, o `source = 'DIRECT'` con un grupo puesto, son dos filas imposibles
  más que habría que prohibir con **otro** CHECK. Se paga una columna, un tipo enum, un CHECK extra
  y una migración el día que cambie, a cambio de cero información nueva.
- **El repo ya tiene el patrón contrario y funciona**: `orders.cancellation_reason` no lleva una
  columna «está cancelado», porque eso ya lo dice `status`, y lo que hay es un CHECK que ata las
  dos (QC-34). `units.factor`/`base_unit_id` igual (QC-76).
- **Lo que la decisión cerrada pide es que el pedido *sepa* que vinieron de un grupo**, y
  `work_group_id IS NOT NULL` lo sabe exactamente igual de bien —y además dice **de cuál**—.

Se descarta, pero se anota: si algún día hubiera un **tercer** origen (una importación, una regla
automática) que no tuviera grupo al que apuntar, la columna `source` volvería a tener sentido, y
entonces sería una migración pequeña. Hoy hay dos orígenes y uno de ellos ya es una referencia.

### 9.2 Una tabla `order_work_groups` («qué grupos se aplicaron a este pedido»)

Modelar el grupo aplicado como una fila propia, y las personas colgando de ella. Es la modelización
«correcta» de libro y **descartada**, por tres razones:

- **La decisión 5 la rompe.** «Se puede sacar a UNA persona que vino dentro de un grupo, y el pedido
  queda con el grupo aplicado pero sin ella»: con dos tablas, la fila del grupo diría que está
  aplicado y habría que inventar una tercera tabla de excepciones para recordar a quién se sacó. Con
  una sola tabla, sacarla es `DELETE` de una fila y el resto del grupo sigue ahí. La forma más simple
  es además la que cumple el requisito.
- **La decisión 3 la rompe también.** «Un solo origen: gana el primero» se garantiza con la PK
  `(order_id, user_id)`. Con dos tablas, la misma persona podría estar bajo dos grupos aplicados y
  la garantía volvería a ser código.
- **Coste sin beneficio.** Una tabla más, una FK más, un `JOIN` más en QC-88, para poder responder
  «¿se aplicó Turno noche aunque no quede nadie de él?», que nadie ha preguntado.

### 9.3 No llevar `company_id` en la fila y validar en el service (QC-87)

La opción barata: FK simples y una comprobación en el caso de uso. **Descartada por el humano en la
decisión cerrada 6**, y se anota porque es lo que alguien va a proponer al ver una columna de empresa
en una tabla que ya referencia a una persona que tiene la suya. La razón está escrita en la decisión:
un script, un seed o un bug futuro escriben la fila cruzada y **nada da rojo**.
`docs/architecture.md > Acceso a datos y autorizacion` dice que la frontera de **autorización** vive
en el service —y sigue siendo verdad, QC-87 tendrá que filtrar por empresa igual—, pero eso no es lo
mismo que la **integridad referencial**, que es de la base desde siempre.

### 9.4 Un disparador (`TRIGGER`) que valide «misma empresa» al insertar

**Descartada** por las tres razones que QC-83 §9.1 ya escribió, y que valen aquí igual: solo mira la
tabla hija (un `UPDATE users SET company_id` no lo dispara, R12 muerto), es código nuestro en vez de
una garantía declarativa que el planificador verifica en **todos** los caminos de escritura, y cuesta
dos `SELECT` por fila. El repo tiene un trigger (`units_check_derivation`, QC-76) y por eso hay que
decir por qué **aquí no**: aquel expresa una regla que ninguna FK sabe expresar. Esta **sí** se
expresa con FK. Cuando la declaración alcanza, gana la declaración.

### 9.5 Meter las asignaciones en el módulo `pedidos`

Sería lo natural: la tabla se llama `order_assignments` y cuelga de un pedido. **Descartada por el
Alcance y por la decisión cerrada 1**, que lo cierra: dejaría un módulo `pedidos` con permisos que se
llaman `asignaciones.*` —o, peor, obligaría a llamarlos `pedidos.*` y a que el Operador recibiera
`pedidos.consultar`, que abre el CRUD entero de pedidos—. Y QC-88 acabaría pidiendo su sitio igual.
Técnicamente además no ahorra nada: la tabla necesita FK a `users` y a `work_groups`, que son de
`identity`, así que **cualquiera** que sea su módulo tendrá FK entre módulos escritas a mano.

### 9.6 Un `id` uuid propio en la asignación, con `@@unique([orderId, userId])`

El patrón de PK sintética. **Descartado**: nadie referencia una asignación desde fuera, así que el
uuid sería una columna y un índice que solo existen por costumbre. La PK natural ya es única, ya es
la consulta caliente y ya es la garantía de R3. Mismo criterio con el que QC-83 eligió
`(work_group_id, user_id)` y QC-74 `(role_id, permission_code)`.
