-- QC-154 (F1.4) — busqueda de clientes sin acentos: tres columnas normalizadas y sus indices.
--
-- ESCRITA A MANO, no generada con `prisma migrate dev --create-only`, y es deliberado
-- (design.md > 17.2): `customers` tiene FK escalares sin `@relation`, clave candidata y RLS
-- forzada que Prisma no conoce, y una generacion automatica emitiria `DROP` de drift. Aqui NO
-- hay ni un solo `DROP`: esta migracion solo ANADE columnas y CREA indices.
--
-- Mecanismo copiado de `20260904160000_list_query_indexes`: columna anulable, relleno con
-- `translate` (mismo juego de caracteres, sin `unaccent()`), `SET NOT NULL` despues del
-- relleno, y GIN de trigramas parcial sobre los vivos.

-- ---------------------------------------------------------------------------
-- 1. Extension de trigramas. `IF NOT EXISTS`: puede estar ya puesta por otra migracion.
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ---------------------------------------------------------------------------
-- 2. Las tres columnas nuevas, anulables por ahora: se rellenan antes de exigir NOT NULL.
-- ---------------------------------------------------------------------------
ALTER TABLE "customers" ADD COLUMN "first_names_normalized" text;
ALTER TABLE "customers" ADD COLUMN "last_names_normalized" text;
ALTER TABLE "customers" ADD COLUMN "city_normalized" text;

-- Relleno de las filas que YA existen, vivas y dadas de baja: reproduce en SQL
-- `normalizeCustomerText` para el juego de caracteres del precedente.
UPDATE "customers"
SET
  "first_names_normalized" = regexp_replace(
    lower(
      translate(
        "first_names",
        'áàäâéèëêíìïîóòöôúùüûñÁÀÄÂÉÈËÊÍÌÏÎÓÒÖÔÚÙÜÛÑ',
        'aaaaeeeeiiiioooouuuunAAAAEEEEIIIIOOOOUUUUN'
      )
    ),
    '[^a-z0-9]', '', 'g'
  ),
  "last_names_normalized" = regexp_replace(
    lower(
      translate(
        "last_names",
        'áàäâéèëêíìïîóòöôúùüûñÁÀÄÂÉÈËÊÍÌÏÎÓÒÖÔÚÙÜÛÑ',
        'aaaaeeeeiiiioooouuuunAAAAEEEEIIIIOOOOUUUUN'
      )
    ),
    '[^a-z0-9]', '', 'g'
  ),
  "city_normalized" = regexp_replace(
    lower(
      translate(
        "city",
        'áàäâéèëêíìïîóòöôúùüûñÁÀÄÂÉÈËÊÍÌÏÎÓÒÖÔÚÙÜÛÑ',
        'aaaaeeeeiiiioooouuuunAAAAEEEEIIIIOOOOUUUUN'
      )
    ),
    '[^a-z0-9]', '', 'g'
  );

ALTER TABLE "customers" ALTER COLUMN "first_names_normalized" SET NOT NULL;
ALTER TABLE "customers" ALTER COLUMN "last_names_normalized" SET NOT NULL;
ALTER TABLE "customers" ALTER COLUMN "city_normalized" SET NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. Indices de busqueda: GIN de trigramas parcial sobre los clientes vivos, uno por columna.
--    Sin UNIQUE ni indice de orden: no lo pide el requisito y no los modela Prisma.
-- ---------------------------------------------------------------------------
CREATE INDEX "customers_first_names_normalized_trgm_idx" ON "customers" USING gin ("first_names_normalized" gin_trgm_ops) WHERE "deleted_at" IS NULL;
CREATE INDEX "customers_last_names_normalized_trgm_idx" ON "customers" USING gin ("last_names_normalized" gin_trgm_ops) WHERE "deleted_at" IS NULL;
CREATE INDEX "customers_city_normalized_trgm_idx" ON "customers" USING gin ("city_normalized" gin_trgm_ops) WHERE "deleted_at" IS NULL;
