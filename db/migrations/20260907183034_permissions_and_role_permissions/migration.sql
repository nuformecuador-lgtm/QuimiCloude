-- QC-74: el catalogo de permisos y su asignacion a roles. Ver
-- `specs/QC-74-modelo-de-permisos/design.md` seccion 1.
--
-- De Prisma salen: los dos `CREATE TABLE`, el unico `permissions_module_action_key`, el
-- indice `role_permissions_permission_code_idx` y las dos FK de `role_permissions`.
--
-- COMPLETADO A MANO: los cuatro `ALTER TABLE ... ROW LEVEL SECURITY` del final (R22).
--
-- BORRADOS A MANO, por DRIFT, exactamente como hizo
-- `20260904180600_companies_and_user_company` (ver su cabecera, punto 6):
--   1. Los 17 `DROP CONSTRAINT` que Prisma genero sobre `orders`, `products`, `recipe_lines`,
--      `recipes`, `supplier_catalog_lines` y `suppliers`. Son las FK escritas a mano por
--      QC-20, QC-24, QC-32, QC-33 y QC-40; Prisma no las conoce (los identificadores `*_id`
--      son escalares sin `@relation` a proposito) y por eso queria eliminarlas.
--   2. Los 9 `DROP INDEX` sobre `presentations` y `units`. Son los indices de orden, filtro y
--      busqueda que QC-57 escribio a mano en
--      `20260904160000_list_query_indexes/migration.sql`, incluidos los GIN de trigramas, que
--      Prisma no modela.
-- Esta migracion no toca ninguna tabla existente salvo por la FK que `role_permissions` apunta
-- a `roles`.
--
-- ESTA MIGRACION NO INSERTA NINGUNA FILA (design.md > 1.3). El catalogo y las asignaciones los
-- siembra `seedInitialAccess`, para que las guardias y la base lean el MISMO dato: si el
-- catalogo estuviera en SQL y la guardia en TypeScript habria dos verdades.
--
-- Prisma ejecuta cada `migration.sql` dentro de UNA transaccion, asi que si cualquier paso
-- falla la migracion queda sin aplicar y sin marcar.

-- ---------------------------------------------------------------------------------------
-- 1. CreateTable — el catalogo (design.md > 1.1; R1, R2). `code` es la PK DE TEXTO, mismo
-- patron que `document_types.code`. Sin `deleted_at`: un permiso se retira con una migracion.
-- ---------------------------------------------------------------------------------------
CREATE TABLE "permissions" (
    "code" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("code")
);

-- ---------------------------------------------------------------------------------------
-- 2. CreateTable — la asignacion (design.md > 1.2; R7). PK compuesta: una asignacion no puede
-- duplicarse y su indice cubre la consulta caliente (`WHERE role_id = ?`).
--
-- NO HAY NINGUNA COLUMNA DE EMPRESA, y es un requisito con nombre (R6): el permiso cuelga del
-- rol y de nada mas.
-- ---------------------------------------------------------------------------------------
CREATE TABLE "role_permissions" (
    "role_id" UUID NOT NULL,
    "permission_code" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_code")
);

-- ---------------------------------------------------------------------------------------
-- 3. CreateIndex — la pareja modulo+accion es unica (un `<modulo>.<accion>` no se declara dos
-- veces), y el sentido inverso `permiso -> roles` necesita su propio indice: Postgres no
-- indexa el lado hijo de una FK y la PK compuesta solo sirve consultas que empiezan por
-- `role_id`.
-- ---------------------------------------------------------------------------------------
CREATE UNIQUE INDEX "permissions_module_action_key" ON "permissions"("module", "action");

CREATE INDEX "role_permissions_permission_code_idx" ON "role_permissions"("permission_code");

-- ---------------------------------------------------------------------------------------
-- 4. AddForeignKey — RESTRICT en las dos, igual que `users.role_id`: no se borra un rol ni un
-- permiso arrastrando sus asignaciones en silencio.
-- ---------------------------------------------------------------------------------------
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_code_fkey" FOREIGN KEY ("permission_code") REFERENCES "permissions"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------------------
-- 5. RLS (A MANO) activada Y forzada en las dos tablas nuevas, AL FINAL DEL TODO (R22, design
-- .md > 1.4). Sin `FORCE`, el dueno de la tabla —que es con quien se conecta Prisma— la ignora
-- entera. Se activa SIN policies, igual que `roles` y `document_types` desde QC-4:
-- deny-by-default para cualquier via que no sea Prisma. Es defensa en profundidad, NO la
-- frontera de autorizacion (`docs/architecture.md > Acceso a datos y autorizacion`), que vive
-- en el service.
--
-- Va lo ultimo tambien porque esta migracion no escribe filas: `FORCE` sin policies deniega
-- tambien al dueno cuando no es superusuario, asi que cualquier escritura futura colocada
-- despues de estos ALTER podria no escribir nada EN SILENCIO (leccion de QC-32).
-- ---------------------------------------------------------------------------------------
ALTER TABLE "permissions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "permissions" FORCE ROW LEVEL SECURITY;
ALTER TABLE "role_permissions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "role_permissions" FORCE ROW LEVEL SECURITY;
