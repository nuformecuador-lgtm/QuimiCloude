-- QC-86: `order_assignments`, la asignacion de responsables a un pedido, dentro del modulo
-- `asignaciones` (modulo NUEVO). Ver `specs/QC-86-modelo-de-asignacion-de-pedidos/design.md`
-- secciones 1.1, 2.1, 2.2, 2.3, 4.2 y 5.1.
--
-- De Prisma salen: el `CREATE TABLE "order_assignments"` con su `order_assignments_pkey`
-- PRIMARY KEY ("order_id","user_id"), y los dos indices `order_assignments_user_id_idx` y
-- `order_assignments_work_group_id_idx`.
--
-- COMPLETADO A MANO (design.md > 5.1):
--   1. El CHECK `order_assignments_work_group_name_matches_group`, con sus DOS ramas
--      (design.md > 2.3; R7). Es la unica garantia de que la congelacion del grupo no se queda a
--      medias: o van las dos columnas o no va ninguna. Prisma no modela CHECKs, asi que este
--      archivo es el unico sitio donde vive. Precedente literal:
--      `orders_cancellation_reason_matches_status` (QC-34).
--   2. Las TRES FK (design.md > 2.1 y 2.2). Van a mano porque ninguna columna lleva `@relation`
--      —dos de los tres padres son de OTROS modulos (`pedidos`, `identity`) y un `include` de
--      Prisma atravesaria la frontera sin que ninguna guardia de imports lo viera— y porque las
--      dos hacia `identity` son COMPUESTAS y COMPARTEN la columna `company_id`, que Prisma no
--      modela:
--        - hacia `orders`: SIMPLE, porque `orders` NO tiene `company_id` (epica QC-46; R14).
--        - hacia `users` y hacia `work_groups`: COMPUESTAS, con `company_id` DENTRO. Es la
--          decision cerrada 6 y el riesgo n.o 1 de la ficha: la fila declara UNA empresa y esa
--          empresa tiene que ser a la vez la de la persona Y —si hay grupo— la del grupo, asi
--          que persona y grupo son de la misma empresa POR CONSTRUCCION (R11). NO son
--          simplificables a `FOREIGN KEY ("user_id") REFERENCES "users"("id")`: asi la decision
--          6 deja de existir sin que nada se ponga rojo hasta que QC-88 liste pedidos ajenos.
--      Las TRES son `ON DELETE RESTRICT ON UPDATE CASCADE` (R10, R20, R22): pedido y persona
--      tienen borrado LOGICO en este ERP, asi que un `DELETE` fisico sobre ellos es ya una
--      anomalia y tiene que ser RUIDOSA; y el grupo NO se lleva por delante a los responsables
--      de un pedido en ejecucion (decision cerrada 7), a diferencia de la pertenencia de QC-83,
--      que si iba en CASCADE porque es PARTE del grupo.
--      NINGUNA lleva el modo de coincidencia estricto (`MATCH` + `FULL`), y es deliberado
--      (design.md > 2.1, riesgo 2): Postgres usa `MATCH SIMPLE`, que NO evalua una FK compuesta
--      si alguna columna referenciada es NULL, y eso es exactamente lo que hace posible la
--      asignacion SUELTA (`work_group_id IS NULL`, R13). El modo estricto exigiria que las dos
--      columnas fueran NULL a la vez, y `company_id` es NOT NULL: romperia R13 en el acto. La
--      cadena literal no aparece en NINGUNA linea de este archivo, ni siquiera en un comentario,
--      para que el test de esquema pueda buscarla en crudo.
--      CONSECUENCIA ACEPTADA: las tres FK y el CHECK son DRIFT para Prisma. Toda migracion
--      futura que toque `order_assignments` va a emitir su `DROP CONSTRAINT` y HAY QUE BORRARLO
--      A MANO del SQL generado, igual que ya pasa con las FK escritas a mano por QC-20, QC-24,
--      QC-32, QC-33, QC-40, QC-65, QC-76 y QC-83.
--   3. Los CUATRO `INSERT` de permisos del paso 5 (design.md > 4.2; R28), con la forma literal de
--      QC-66 (`20260910120000_user_permissions_catalog`).
--   4. Los dos `ALTER TABLE ... ROW LEVEL SECURITY` del final (R33).
--
-- LAS DOS FK COMPUESTAS APUNTAN A `users_id_company_id_key` y a `work_groups_id_company_id_key`,
-- que YA EXISTEN desde QC-83 (`20260908210000_work_groups_and_members`, paso 4). Sin una
-- restriccion unica en el padre sobre exactamente esas columnas, Postgres responde `42830`. Por
-- eso `depends_on: QC-83` no es decorativo. Esta migracion NO las crea ni las toca: a diferencia
-- de QC-83, esta ficha no necesita anadir ninguna restriccion unica a ninguna tabla preexistente
-- (design.md > 1.3, R32).
--
-- BORRADOS A MANO, por DRIFT, exactamente como hicieron
-- `20260904180600_companies_and_user_company`, `20260907183034_permissions_and_role_permissions`
-- y `20260908210000_work_groups_and_members`:
--   1. Los 21 `DROP CONSTRAINT` que Prisma genero sobre `orders` (3), `product_batches` (2),
--      `products` (1), `recipe_lines` (2), `recipes` (2), `supplier_catalog_lines` (4),
--      `suppliers` (2), `units` (2), `users` (1) y `work_group_members` (2). Son las FK escritas
--      a mano por QC-20, QC-24, QC-32, QC-33, QC-40, QC-65, QC-76, QC-79 y QC-83; Prisma no las
--      conoce (los identificadores `*_id` son escalares SIN `@relation` a proposito) y por eso
--      queria eliminarlas. Borrarlas aqui habria dejado sin integridad referencial a diez tablas.
--   2. Los CHECK escritos a mano sobre `orders` (QC-34) y `units` (QC-76): Prisma no los modela,
--      asi que tampoco los conoce y no puede recrearlos. Esta migracion no los menciona.
--   3. Los 9 `DROP INDEX` sobre `presentations` y `units`. Son los indices de orden, filtro y
--      busqueda que QC-57 escribio a mano en `20260904160000_list_query_indexes/migration.sql`,
--      incluidos los GIN de trigramas, que Prisma no modela.
-- Fuera de estos comentarios, ninguna de esas tablas aparece en una linea ejecutable de este
-- archivo.
--
-- ESTA MIGRACION NO EJECUTA NINGUN DDL SOBRE NINGUNA TABLA PREEXISTENTE (R32). Lo UNICO que
-- escribe sobre tablas preexistentes son los cuatro `INSERT` del paso 5, sobre `permissions` y
-- `role_permissions`, que son aditivos e idempotentes. No hay backfill de asignaciones: la tabla
-- nace VACIA y todos los pedidos que ya existen quedan sin responsables, que es exactamente lo
-- que dice la decision cerrada 10 (R18, design.md > 5.2). Ningun fixture existente se rompe.
--
-- `updated_at` es NOT NULL SIN default de base —lo rellena `@updatedAt` del cliente Prisma—, asi
-- que un `INSERT` crudo que no la ponga falla. Misma nota que QC-4, QC-47 y QC-83.
--
-- Prisma ejecuta cada `migration.sql` dentro de UNA transaccion, asi que si cualquier paso falla
-- la migracion queda sin aplicar y sin marcar.

-- ---------------------------------------------------------------------------------------
-- 1. CreateTable — la asignacion (design.md > 1.1). PK compuesta `(order_id, user_id)`: la misma
-- persona no puede estar dos veces en el mismo pedido, VENGA POR DONDE VENGA (R3, R5, decision
-- cerrada 3 «gana el primero que la trajo»); el segundo `INSERT` choca con `23505` y no hay
-- ningun camino que se lo salte. Su indice cubre ademas la consulta caliente «quienes son los
-- responsables de este pedido».
--
-- `work_group_id` y `work_group_name` son la CONGELACION (R6) y van las DOS anulables: una
-- asignacion suelta no tiene ni grupo ni nombre. Que vayan juntas o ninguna lo impone el CHECK
-- del paso 3, no una convencion. `work_group_name` es TEXT SIN longitud, porque es una COPIA de
-- `work_groups.name`, que tampoco la tiene (QC-83 R2): un tope aqui convertiria un renombrado
-- legitimo del origen en un error de asignacion. La marca de «vino de un grupo» NO es una
-- columna aparte: es `work_group_id IS NOT NULL` (design.md > 9.1).
--
-- NO HAY `deleted_at`, y es un requisito con nombre (R15, decision cerrada 5): sacar a alguien de
-- un pedido BORRA la fila. Es la excepcion explicita al borrado logico, heredada de QC-83 dec. 4.
-- Anadirlo «por coherencia» degradaria la PK a un indice unico PARCIAL y obligaria a TODA lectura
-- de responsables, para siempre, a acordarse de filtrar (design.md > 2.5).
-- ---------------------------------------------------------------------------------------
CREATE TABLE "order_assignments" (
    "order_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "work_group_id" UUID,
    "work_group_name" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "order_assignments_pkey" PRIMARY KEY ("order_id","user_id")
);

-- ---------------------------------------------------------------------------------------
-- 2. CreateIndex — los dos sentidos que la PK no cubre. `order_assignments_user_id_idx` sirve
-- «que pedidos tengo asignados» —la consulta de QC-88— y la verificacion del `RESTRICT` al
-- borrar una persona (R22): un indice compuesto solo sirve las consultas que empiezan por su
-- primera columna. `order_assignments_work_group_id_idx` sirve la verificacion del `RESTRICT`
-- hacia `work_groups` (R10) y el «quitar este grupo de este pedido» de QC-87 (R17). NO hay
-- indice por `company_id`, y es deliberado (design.md > 1.1): nadie consulta asignaciones por
-- empresa aqui ni en las dos fichas siguientes.
-- ---------------------------------------------------------------------------------------
CREATE INDEX "order_assignments_user_id_idx" ON "order_assignments"("user_id");

CREATE INDEX "order_assignments_work_group_id_idx" ON "order_assignments"("work_group_id");

-- ---------------------------------------------------------------------------------------
-- 3. Check (A MANO) — el grupo y su nombre congelado existen el uno por el otro (R7,
-- design.md > 2.3). Sin el caben dos filas imposibles: una que dice que vino de un grupo y no
-- sabe como se llamaba, y otra que guarda el nombre de un grupo del que no vino.
--
-- LO QUE EL CHECK NO GARANTIZA, y hay que decirlo: que `work_group_name` sea DE VERDAD el nombre
-- que el grupo tenia en ese instante. Eso no lo puede saber ninguna restriccion —comprobar
-- «coincide con el nombre actual» seria exactamente lo contrario de congelar— y es
-- responsabilidad del caso de uso de QC-87, que escribira las dos columnas en el mismo `INSERT`.
-- La base garantiza que HAY un nombre; que sea el correcto lo demuestra el test de integracion
-- que renombra el grupo despues (R8).
-- ---------------------------------------------------------------------------------------
ALTER TABLE "order_assignments" ADD CONSTRAINT "order_assignments_work_group_name_matches_group" CHECK (
    ("work_group_id" IS NULL     AND "work_group_name" IS NULL)
    OR
    ("work_group_id" IS NOT NULL AND "work_group_name" IS NOT NULL)
);

-- ---------------------------------------------------------------------------------------
-- 4.a AddForeignKey (A MANO) — el PEDIDO (design.md > 2.2; R20). SIMPLE y no compuesta, porque
-- `orders` no tiene `company_id`: el triangulo «persona <-> grupo <-> pedido» no se cierra en
-- esta ficha y es R14, escrito como requisito para que nadie lo «arregle» anadiendo una columna
-- de empresa a `orders` desde aqui. El dia que llegue QC-46 cuesta dos lineas: una restriccion
-- unica `orders (id, company_id)` y convertir esta FK en compuesta; `company_id` ya esta aqui.
-- `RESTRICT`: el pedido tiene borrado LOGICO (QC-33 dec. 19), asi que un `DELETE` fisico sobre
-- `orders` es una anomalia, y su asignacion es parte de su historia (decision cerrada 11). Dar
-- de baja un pedido es un `UPDATE` y NINGUNA FK reacciona a un `UPDATE`: las asignaciones se
-- quedan sin que nadie haga nada (R19). Es una FK ENTRE MODULOS (`asignaciones` -> `pedidos`),
-- con el precedente exacto de `products.unit_id` y de las tres FK de `orders`.
-- ---------------------------------------------------------------------------------------
ALTER TABLE "order_assignments" ADD CONSTRAINT "order_assignments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------------------
-- 4.b AddForeignKey (A MANO) — la PERSONA (design.md > 2.1; R11, R12, R22). COMPUESTA, con
-- `company_id` DENTRO: la fila declara una empresa y esa empresa tiene que ser la de la persona.
-- Apunta a `users_id_company_id_key` (QC-83). El `ON UPDATE CASCADE` es lo que cierra R12: un
-- `UPDATE users SET company_id = <otra>` con esa persona asignada propaga la empresa nueva a sus
-- asignaciones y ENTONCES falla la FK del grupo con `23503`. `RESTRICT` al borrar: una persona no
-- se borra fisicamente en este ERP (QC-4), asi que un `DELETE` sobre `users` es ya una anomalia y
-- tiene que ser RUIDOSA. Dar de BAJA a una persona no toca ninguna asignacion: es un `UPDATE`.
-- ---------------------------------------------------------------------------------------
ALTER TABLE "order_assignments" ADD CONSTRAINT "order_assignments_user_id_fkey" FOREIGN KEY ("user_id", "company_id") REFERENCES "users"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------------------
-- 4.c AddForeignKey (A MANO) — el GRUPO (design.md > 2.1; R10, R11, R12, R13). COMPUESTA y
-- ANULABLE, la novedad de esta ficha respecto a QC-83. Apunta a `work_groups_id_company_id_key`
-- (QC-83). Como Postgres usa el modo de coincidencia por defecto (`MATCH SIMPLE`), con
-- `work_group_id IS NULL` la FK NO SE EVALUA y la asignacion suelta se acepta (R13); con grupo
-- puesto, exige que sea de la misma empresa que ya declaro la persona, asi que la fila cruzada
-- —persona de la empresa A, grupo de la B— la rechaza POSTGRES con `23503`, venga de un caso de
-- uso, de un seed, de un script o de una consola. `ON DELETE RESTRICT`, y aqui es DISTINTO de QC-83: alli la pertenencia iba en CASCADE
-- porque ES parte del grupo; aqui la asignacion es un hecho CONGELADO DEL PEDIDO, y que borrar
-- fisicamente «Turno noche» se llevara por delante a los responsables de un pedido en ejecucion
-- es precisamente lo que la decision cerrada 7 prohibe.
-- ---------------------------------------------------------------------------------------
ALTER TABLE "order_assignments" ADD CONSTRAINT "order_assignments_work_group_id_fkey" FOREIGN KEY ("work_group_id", "company_id") REFERENCES "work_groups"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------------------
-- 5. Los permisos en una instalacion QUE YA EXISTE (design.md > 4.2; R28). `scripts/seed.ts`
-- corre en la instalacion, no en cada despliegue, asi que los dos codigos nuevos no llegarian
-- solos. Precedente literal: QC-66. El catalogo persistido pasa de TRECE a QUINCE.
--
-- Los dos codigos, modulos, acciones y descripciones son los de
-- `lib/modules/identity/domain/permissions.ts`, que sigue siendo el unico dueno del catalogo. Se
-- DUPLICAN aqui porque una migracion no puede llamar a TypeScript; el test de esquema los compara
-- IMPORTANDO esa constante, no copiandola, para que divergir sea rojo.
--
-- `ON CONFLICT DO NOTHING` es R28 entero: aplicarla sobre una base donde el seed ya sembro los
-- codigos no falla y no reescribe nada. `updated_at` no tiene default en `permissions`, asi que
-- se escribe explicito.
-- ---------------------------------------------------------------------------------------
INSERT INTO "permissions" ("code", "module", "action", "description", "updated_at") VALUES
  ('asignaciones.consultar', 'asignaciones', 'consultar',
   'Consultar los pedidos asignados.', CURRENT_TIMESTAMP),
  ('asignaciones.modificar', 'asignaciones', 'modificar',
   'Asignar y desasignar responsables de un pedido.', CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

-- El Administrador recibe los DOS; el Operador, solo `consultar` (decision cerrada 8). Escritas
-- UNA A UNA, sin comodin: `modificar` NO implica `consultar`. Al Operador NO se le da
-- `recetas.consultar` (R27), porque ese permiso hoy abre tambien el formulario de edicion. El rol
-- se resuelve POR NOMBRE con un subselect, NUNCA con un uuid escrito a mano: `roles.id` es
-- `gen_random_uuid()` y es distinto en cada instalacion.
INSERT INTO "role_permissions" ("role_id", "permission_code")
SELECT "r"."id", "p"."code"
FROM "roles" AS "r"
CROSS JOIN (VALUES ('asignaciones.consultar'), ('asignaciones.modificar')) AS "p"("code")
WHERE "r"."name" = 'Administrador'
ON CONFLICT ("role_id", "permission_code") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_code")
SELECT "r"."id", 'asignaciones.consultar'
FROM "roles" AS "r"
WHERE "r"."name" = 'Operador'
ON CONFLICT ("role_id", "permission_code") DO NOTHING;

-- ---------------------------------------------------------------------------------------
-- 6. RLS (A MANO) activada Y forzada en la tabla nueva, AL FINAL DEL TODO (R33,
-- design.md > 5.1 paso 6). Sin `FORCE`, el dueno de la tabla —que es con quien se conecta
-- Prisma— la ignora entera. Se activa SIN policies, igual que `roles`, `document_types`,
-- `companies`, `permissions`, `role_permissions`, `work_groups` y `work_group_members`:
-- deny-by-default para cualquier via que no sea Prisma. Es defensa en profundidad, NO la frontera
-- de autorizacion (`docs/architecture.md > Acceso a datos y autorizacion`), que vive en el
-- service —y en esta ficha todavia no hay ninguno (R36)—.
--
-- Va lo ultimo por la leccion de QC-32, QC-74 y QC-83: `FORCE` sin policies deniega tambien al
-- dueno cuando no es superusuario, asi que una escritura colocada DESPUES podria no escribir nada
-- EN SILENCIO. Los `INSERT` del paso 5 son sobre `permissions` y `role_permissions` —que ya
-- tienen su RLS de QC-74 y que esta migracion NO cambia—, pero el orden se respeta igual: es
-- gratis y evita la trampa cuando alguien anada un paso 7.
-- ---------------------------------------------------------------------------------------
ALTER TABLE "order_assignments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "order_assignments" FORCE ROW LEVEL SECURITY;
