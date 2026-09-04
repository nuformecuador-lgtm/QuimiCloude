-- QC-62 R14: los pasos guardados NO se convierten, se BORRAN (decision cerrada 5).
-- Sin WHERE deleted_at IS NULL: alcanza tambien a las recetas borradas logicamente.
UPDATE "recipes" SET "steps" = '[]'::jsonb;
