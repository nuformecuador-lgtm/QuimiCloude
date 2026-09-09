-- QC-83: el grupo de trabajo y su tabla de pertenencia, dentro del modulo `identity`. Ver
-- `specs/QC-83-modelo-de-grupos-de-trabajo/design.md` secciones 1, 2 y 3.1.
--
-- De Prisma salen: los dos `CREATE TABLE` con sus dos PK, los indices
-- `work_groups_company_id_idx`, `work_groups_id_company_id_key`,
-- `work_group_members_user_id_idx` y `users_id_company_id_key`, y la FK
-- `work_groups_company_id_fkey`.
--
-- COMPLETADO A MANO (design.md > 3.1):
--   1. El indice unico `work_groups_name_unique`: COMPUESTO con la empresa, FUNCIONAL
--      (`lower("name_normalized")`) y PARCIAL (`WHERE "deleted_at" IS NULL`). Prisma no modela
--      ninguna de las tres cosas, asi que NO esta en `db/schema.prisma` y este archivo es el
--      unico sitio donde vive. Es la UNICA garantia de R4: no hay `SELECT` previo por igualdad
--      —seria una carrera— y el choque se traduce del SQLSTATE 23505. Compuesto con
--      `company_id` porque dos empresas pueden tener cada una su «Turno noche» (R5), y parcial
--      porque un grupo dado de baja libera su nombre (R6), el precedente de
--      `companies_name_unique`, `recipes_name_unique`, `suppliers_name_unique` y
--      `users_email_unique`.
--   2. Las DOS FK COMPUESTAS de `work_group_members` (design.md > 2.1; R13, R14, R15). Son el
--      corazon de la ficha: la fila declara UNA empresa y esa empresa tiene que ser a la vez la
--      del grupo Y la de la persona, asi que grupo y persona son de la misma empresa POR
--      CONSTRUCCION y no hay estado intermedio en el que no lo sean. NO son simplificables a
--      `FOREIGN KEY ("user_id") REFERENCES "users"("id")`: asi deja de existir la decision
--      cerrada 1 sin que nada se ponga rojo. Van a mano porque son compuestas y COMPARTEN la
--      columna `company_id`, y que Prisma admita dos relaciones reutilizando el mismo escalar
--      es un DESCONOCIDO (design.md > 2.2, regla 6 de `CLAUDE.md`).
--      CONSECUENCIA ACEPTADA: las dos son DRIFT para Prisma. Toda migracion futura que toque
--      `work_group_members` va a emitir su `DROP CONSTRAINT` y HAY QUE BORRARLO A MANO del SQL
--      generado, igual que ya pasa con las FK escritas a mano por QC-20, QC-24, QC-32, QC-33,
--      QC-40, QC-65 y QC-76.
--   3. Los cuatro `ALTER TABLE ... ROW LEVEL SECURITY` del final (R24).
--
-- BORRADOS A MANO, por DRIFT, exactamente como hicieron
-- `20260904180600_companies_and_user_company` (cabecera, punto 6) y
-- `20260907183034_permissions_and_role_permissions`:
--   1. Los 18 `DROP CONSTRAINT` que Prisma genero sobre `orders` (3), `products` (3),
--      `recipe_lines` (2), `recipes` (2), `supplier_catalog_lines` (4), `suppliers` (2) y
--      `units` (2). Son las FK escritas a mano por QC-20, QC-24, QC-32, QC-33, QC-40 y QC-76;
--      Prisma no las conoce (los identificadores `*_id` son escalares sin `@relation` a
--      proposito) y por eso queria eliminarlas.
--   2. El `DROP CONSTRAINT "users_account_status_changed_by_fkey"` sobre `users`: la misma
--      historia, es la FK que QC-65 escribio a mano. Esta migracion NO la toca.
--   3. Los 9 `DROP INDEX` sobre `presentations` y `units`. Son los indices de orden, filtro y
--      busqueda que QC-57 escribio a mano en
--      `20260904160000_list_query_indexes/migration.sql`, incluidos los GIN de trigramas, que
--      Prisma no modela.
-- Fuera de estos comentarios, ninguna de esas tablas aparece en una linea ejecutable de este
-- archivo (R23).
--
-- LA UNICA MODIFICACION SOBRE UNA TABLA PREEXISTENTE es el indice unico
-- `users_id_company_id_key` del paso 4 (R23). No cambia ninguna columna de `users`, no puede
-- rechazar ninguna fila que hoy se acepte —`id` ya es la PK, asi que es unico TRIVIALMENTE— y
-- ninguna consulta existente necesita cambiar para usarlo. Existe solo para que la FK compuesta
-- hacia `users` tenga a donde apuntar: sin restriccion unica en el padre, Postgres responde
-- `42830`. `users` tampoco gana ni pierde RLS: la tiene activada Y forzada desde QC-4.
--
-- ESTA MIGRACION NO ESCRIBE NI UNA FILA: no hay `INSERT`, `UPDATE` ni `DELETE`. Las dos tablas
-- nacen vacias y ninguna tabla existente gana una columna obligatoria (design.md > 3.2), asi
-- que ningun fixture se rompe.
--
-- Prisma ejecuta cada `migration.sql` dentro de UNA transaccion, asi que si cualquier paso
-- falla la migracion queda sin aplicar y sin marcar.

-- ---------------------------------------------------------------------------------------
-- 1. CreateTable — el grupo (design.md > 1.1). `id` UUID aleatorio generado por la BASE, ni
-- correlativo ni derivado del nombre (R1); `name` obligatorio, y esa obligatoriedad la impone
-- la base (R2); `name` es TEXT SIN longitud a proposito — el tope vive en el `zod` de QC-84, no
-- en el tipo, para que cambiarlo no sea una migracion (R2, decision cerrada 9);
-- `name_normalized` en columna propia, lo calcula `normalizeWorkGroupName` (R3); marcas de
-- tiempo (R11); y `deleted_at` anulable, que nace vacia y que NADIE escribe en esta ficha (R7)
-- —la baja logica es de QC-84—.
-- ---------------------------------------------------------------------------------------
CREATE TABLE "work_groups" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "name_normalized" TEXT NOT NULL,
    "company_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "work_groups_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------------------
-- 2. CreateTable — la pertenencia (design.md > 1.2). PK compuesta `(work_group_id, user_id)`:
-- la misma persona no puede estar dos veces en el mismo grupo (R16), y su indice cubre la
-- consulta caliente «quienes estan en este grupo». Las tres columnas de referencia son NOT NULL
-- (R13); `company_id` es columna PROPIA y es lo que hace posible la garantia del paso 7
-- (decision cerrada 1).
--
-- NO HAY `deleted_at`, y es un requisito con nombre (R18, decision cerrada 4): sacar a alguien
-- de un grupo BORRA la fila. Es la EXCEPCION EXPLICITA al borrado logico de QC-4, porque la
-- pertenencia no es una transaccion sino una relacion viva; el historico que importa —quien era
-- responsable de un pedido— lo congela QC-86 al asignar y no lee esta tabla. Anadir aqui un
-- `deleted_at` «por coherencia» romperia ademas la PK (design.md > 2.3).
--
-- `updated_at` es NOT NULL SIN default de base —lo rellena `@updatedAt` del cliente Prisma—,
-- asi que un `INSERT` crudo que no la ponga falla. Misma nota que QC-4, QC-32 y QC-47.
-- ---------------------------------------------------------------------------------------
CREATE TABLE "work_group_members" (
    "work_group_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "work_group_members_pkey" PRIMARY KEY ("work_group_id","user_id")
);

-- ---------------------------------------------------------------------------------------
-- 3. CreateIndex (A MANO) — no hay dos grupos VIVOS con el mismo nombre normalizado DENTRO de
-- la misma empresa (R4). Compuesto con `company_id` (R5), funcional y parcial (R6). El
-- `lower(...)` es redundante sobre una columna ya normalizada y se escribe igual, por simetria
-- con `users_email_unique` y `companies_name_unique` y para que la unicidad NO dependa de que
-- el llamante haya normalizado bien.
-- ---------------------------------------------------------------------------------------
CREATE UNIQUE INDEX "work_groups_name_unique" ON "work_groups" ("company_id", lower("name_normalized")) WHERE "deleted_at" IS NULL;

-- ---------------------------------------------------------------------------------------
-- 4. CreateIndex — las DOS DIANAS de las FK compuestas del paso 7 (design.md > 2.1). VAN ANTES
-- que ellas: una FK compuesta cuyo padre no tenga una restriccion unica sobre exactamente esas
-- columnas falla con `42830`. Las dos son unicas TRIVIALMENTE —`id` ya es la PK en las dos
-- tablas—, no imponen ninguna restriccion nueva y no cambian ningun plan de consulta existente.
-- Se declaran tambien en `db/schema.prisma` para que NO sean drift (riesgo 5 de design.md > 8).
-- `users_id_company_id_key` es la unica modificacion de esta migracion sobre una tabla
-- preexistente (R23), y el `down.sql` la quita (R25).
-- ---------------------------------------------------------------------------------------
CREATE UNIQUE INDEX "work_groups_id_company_id_key" ON "work_groups"("id", "company_id");

CREATE UNIQUE INDEX "users_id_company_id_key" ON "users"("id", "company_id");

-- ---------------------------------------------------------------------------------------
-- 5. CreateIndex — `work_groups_company_id_idx` NO es redundante con el del paso 3: ese es
-- PARCIAL, y la verificacion del `ON DELETE RESTRICT` del paso 6 tiene que ver tambien los
-- grupos dados de baja. Postgres tampoco indexa una columna solo por ser el lado hijo de una FK.
-- `work_group_members_user_id_idx` sirve el sentido inverso, «en que grupos esta esta persona»
-- —lo que preguntara QC-86 al asignar y QC-88 al listar por responsable—, que la PK compuesta
-- no cubre: un indice compuesto solo sirve las consultas que empiezan por su primera columna.
-- ---------------------------------------------------------------------------------------
CREATE INDEX "work_groups_company_id_idx" ON "work_groups"("company_id");

CREATE INDEX "work_group_members_user_id_idx" ON "work_group_members"("user_id");

-- ---------------------------------------------------------------------------------------
-- 6. AddForeignKey — el grupo pertenece a UNA empresa, obligatoria (R8), y esa empresa tiene
-- que existir (R9). `ON DELETE RESTRICT` (R10): borrar una empresa que todavia tenga grupos
-- —vivos o dados de baja— falla con `23503` y deja la empresa y sus grupos intactos. Mismo
-- trato que `users.company_id` en QC-47.
-- ---------------------------------------------------------------------------------------
ALTER TABLE "work_groups" ADD CONSTRAINT "work_groups_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------------------
-- 7. AddForeignKey (A MANO) — LAS DOS FK COMPUESTAS, el corazon de la ficha (R13, R14, R15,
-- decision cerrada 1). Cada una lleva `company_id` DENTRO, y por eso la fila cruzada —persona
-- de la empresa A en un grupo de la empresa B— la rechaza POSTGRES con `23503`, tanto al
-- insertar como al modificar, venga de un caso de uso, de un seed, de un script o de una
-- consola. No es una comprobacion que alguien pueda olvidarse de llamar: es la definicion de la
-- tabla.
--
-- El `ON UPDATE CASCADE` es lo que cierra R15: un `UPDATE users SET company_id = <otra>` con
-- esa persona en un grupo propaga la empresa nueva a sus filas de pertenencia y ENTONCES la FK
-- del grupo falla con `23503`; y simetricamente al mover de empresa un grupo poblado.
--
-- El `ON DELETE` es distinto en cada una a proposito (design.md > 2.1):
--   - hacia `work_groups`, CASCADE: la pertenencia es PARTE del grupo y no tiene vida propia,
--     igual que `recipe_lines` hacia `recipes`. En operacion normal no se dispara nunca —el
--     grupo se da de baja LOGICA y ninguna FK reacciona a un `UPDATE` (R21)—; es la red para un
--     borrado fisico, donde dejar pertenencias huerfanas seria peor.
--   - hacia `users`, RESTRICT: una persona no se borra fisicamente en este ERP (borrado logico,
--     QC-4), asi que un `DELETE` sobre `users` es ya una anomalia y tiene que ser RUIDOSA.
--     Mismo trato que `users.role_id` hacia `roles`. Dar de BAJA a una persona no toca ninguna
--     pertenencia (R20): es un `UPDATE`.
-- ---------------------------------------------------------------------------------------
ALTER TABLE "work_group_members" ADD CONSTRAINT "work_group_members_work_group_id_fkey" FOREIGN KEY ("work_group_id", "company_id") REFERENCES "work_groups"("id", "company_id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "work_group_members" ADD CONSTRAINT "work_group_members_user_id_fkey" FOREIGN KEY ("user_id", "company_id") REFERENCES "users"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------------------
-- 8. RLS (A MANO) activada Y forzada en las dos tablas nuevas, AL FINAL DEL TODO (R24,
-- design.md > 3.1 paso 8). Sin `FORCE`, el dueno de la tabla —que es con quien se conecta
-- Prisma— la ignora entera. Se activa SIN policies, igual que `roles`, `document_types`,
-- `companies`, `permissions` y `role_permissions`: deny-by-default para cualquier via que no
-- sea Prisma. Es defensa en profundidad, NO la frontera de autorizacion
-- (`docs/architecture.md > Acceso a datos y autorizacion`), que vive en el service.
--
-- Va lo ultimo aunque esta migracion no escriba filas, por la leccion de QC-32 y QC-74: `FORCE`
-- sin policies deniega tambien al dueno cuando no es superusuario, asi que cualquier escritura
-- futura colocada despues de estos ALTER podria no escribir nada EN SILENCIO.
-- ---------------------------------------------------------------------------------------
ALTER TABLE "work_groups" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "work_groups" FORCE ROW LEVEL SECURITY;
ALTER TABLE "work_group_members" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "work_group_members" FORCE ROW LEVEL SECURITY;
