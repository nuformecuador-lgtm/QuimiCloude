-- QC-62 R15: IRREVERSIBLE por decision del humano (decision cerrada 5). No hay copia de los
-- pasos anteriores en ninguna parte, asi que aqui no hay nada que restaurar. Se deja el estado
-- consistente con el UP en vez de fingir una vuelta atras.
UPDATE "recipes" SET "steps" = '[]'::jsonb;
