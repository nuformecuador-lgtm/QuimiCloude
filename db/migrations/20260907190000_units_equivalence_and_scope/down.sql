-- DOWN de la migracion units_equivalence_and_scope (QC-76). Convencion propia del repo:
-- Prisma Migrate no genera down migrations (`docs/architecture.md > Migraciones up/down`). Lo
-- aplica `pnpm run db:rollback` (`scripts/db-rollback.ts`), que ejecuta este archivo y borra la
-- fila de `_prisma_migrations` en UNA SOLA TRANSACCION: cualquier `RAISE EXCEPTION` de aqui
-- deshace todo y la migracion sigue aplicada, entera, con su fila intacta.
--
-- Revierte EXACTAMENTE el `migration.sql`, en ORDEN INVERSO, y deja el esquema anterior (R33):
-- sin las tres columnas, sin los tres CHECK, sin las dos FK, sin los dos indices de FK, sin los
-- cuatro indices unicos parciales, sin funcion ni disparador, CON el indice unico global
-- `units_name_normalized_key` de QC-32 restaurado y con la RLS activada y forzada. Las unidades
-- del catalogo siguen todas ahi: este archivo NO borra ninguna fila.
--
-- LA GUARDIA DE DATOS VA LA PRIMERA (R34), en la linea de QC-32 R24 -- fallar antes que perder
-- el dato. Sin ella el DOWN haria dos cosas irreparables EN SILENCIO:
--   1. quitar `company_id` convertiria las unidades PRIVADAS de cada empresa en unidades DE
--      SISTEMA visibles para todas, que es peor que no poder revertir; y
--   2. quitar `unit_id` y `factor` tiraria cualquier equivalencia declarada despues de aplicar
--      la migracion, que no hay forma de reconstruir.
-- Ademas, recrear el indice unico GLOBAL fallaria de todos modos si dos empresas tuvieran una
-- unidad con el mismo nombre: mejor un mensaje que dice que pasa y que hacer, que un 23505
-- suelto.
--
-- Las dos unicas derivaciones que este DOWN acepta descartar son las que escribio SU PROPIO UP
-- (R28): `litro -> mililitro` con factor 1000 y `kilogramo -> gramo` con factor 1000. Cualquier
-- otra es dato que alguien creo despues, y no es de este archivo decidir tirarlo.

-- ---------------------------------------------------------------------------------------
-- 1. Guardia de datos (R34).
-- ---------------------------------------------------------------------------------------
DO $$
DECLARE
  unidades_de_empresa BIGINT;
  derivaciones_ajenas BIGINT;
BEGIN
  SELECT count(*) INTO unidades_de_empresa FROM "units" WHERE "company_id" IS NOT NULL;
  IF unidades_de_empresa > 0 THEN
    RAISE EXCEPTION
      'QC-76 down: hay % unidad(es) con empresa (company_id no nulo). Revertir borraria esa columna y las convertiria en unidades de sistema visibles para TODAS las empresas: la reversion se detiene entera (R34). Mueve o elimina esas unidades a mano antes de revertir.',
      unidades_de_empresa;
  END IF;

  -- Toda derivacion que no sea una de las dos que dejo el UP. La FK `units_unit_id_fkey`
  -- garantiza que el padre existe, asi que el JOIN no pierde ninguna fila derivada.
  SELECT count(*) INTO derivaciones_ajenas
    FROM "units" AS derived
    JOIN "units" AS base ON base."id" = derived."unit_id"
   WHERE derived."unit_id" IS NOT NULL
     AND NOT (
       (derived."name_normalized" = 'litro'
          AND base."name_normalized" = 'mililitro'
          AND derived."factor" = 1000.0000)
       OR
       (derived."name_normalized" = 'kilogramo'
          AND base."name_normalized" = 'gramo'
          AND derived."factor" = 1000.0000)
     );
  IF derivaciones_ajenas > 0 THEN
    RAISE EXCEPTION
      'QC-76 down: hay % unidad(es) derivadas que no son las dos que dejo el UP (litro->mililitro 1000 y kilogramo->gramo 1000). Revertir borraria esa equivalencia sin poder reconstruirla: la reversion se detiene entera (R34).',
      derivaciones_ajenas;
  END IF;
END $$;

-- ---------------------------------------------------------------------------------------
-- 2. Disparador y funcion (bloque 4 del UP). El disparador primero: la funcion no se puede
-- borrar mientras alguien la use.
-- ---------------------------------------------------------------------------------------
DROP TRIGGER "units_check_derivation_trigger" ON "units";
DROP FUNCTION units_check_derivation();

-- ---------------------------------------------------------------------------------------
-- 3. La unicidad vuelve a ser GLOBAL (bloque 3 del UP, al reves). Los cuatro parciales caen y
-- se recrea `units_name_normalized_key` tal y como lo dejo QC-32: unico, TOTAL, sobre
-- `name_normalized`. Sin el, el catalogo quedaria sin ninguna garantia de unicidad, que no es
-- «el esquema anterior» sino uno peor.
-- ---------------------------------------------------------------------------------------
DROP INDEX "units_system_symbol_unique";
DROP INDEX "units_company_symbol_unique";
DROP INDEX "units_system_name_unique";
DROP INDEX "units_company_name_unique";

CREATE UNIQUE INDEX "units_name_normalized_key" ON "units"("name_normalized");

-- ---------------------------------------------------------------------------------------
-- 4. Restricciones e indices de FK (bloque 2 del UP, al reves). Se dropean EXPLICITAMENTE en
-- vez de dejar que caigan con sus columnas, para que este archivo diga exactamente que quita.
-- ---------------------------------------------------------------------------------------
ALTER TABLE "units" DROP CONSTRAINT "units_unit_id_fkey";
ALTER TABLE "units" DROP CONSTRAINT "units_company_id_fkey";
ALTER TABLE "units" DROP CONSTRAINT "units_no_self_derivation_check";
ALTER TABLE "units" DROP CONSTRAINT "units_factor_positive_check";
ALTER TABLE "units" DROP CONSTRAINT "units_derivation_pair_check";

DROP INDEX "units_unit_id_idx";
DROP INDEX "units_company_id_idx";

-- ---------------------------------------------------------------------------------------
-- 5. Y al final las tres columnas (bloque 1 del UP). Llegar hasta aqui significa que la guardia
-- conto cero unidades de empresa y cero derivaciones ajenas, asi que no se pierde ningun dato
-- que no sea el que escribio el propio UP.
--
-- LIMITE CONOCIDO, el mismo que anota el down de QC-32: las columnas desaparecen del final de
-- la tabla, que es donde `ADD COLUMN` las puso, asi que el orden ordinal queda como estaba. No
-- hay nada que reordenar aqui.
-- ---------------------------------------------------------------------------------------
ALTER TABLE "units"
  DROP COLUMN "factor",
  DROP COLUMN "unit_id",
  DROP COLUMN "company_id";

-- ---------------------------------------------------------------------------------------
-- 6. La RLS se queda ACTIVADA Y FORZADA, que es como estaba antes del UP (R33, R30). El UP
-- abrio y cerro su parentesis `NO FORCE`/`FORCE` alrededor del UPDATE; este DOWN no escribe
-- datos, asi que no necesita abrirlo. Los dos ALTER van igualmente, explicitos e idempotentes:
-- si alguien revierte a mitad de un UP fallido, la tabla no puede quedarse sin forzar.
-- ---------------------------------------------------------------------------------------
ALTER TABLE "units" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "units" FORCE ROW LEVEL SECURITY;
