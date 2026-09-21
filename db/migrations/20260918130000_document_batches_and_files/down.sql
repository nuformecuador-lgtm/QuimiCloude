-- Revierte `migration.sql`. `DROP TABLE` se lleva por delante los CHECK, los indices y las claves
-- foraneas de la tabla que borra, asi que no hay que soltarlos uno a uno.
--
-- El ORDEN entre las dos tablas si importa, y en este sentido: `document_files` guarda la FK
-- compuesta hacia `document_batches`, asi que la tanda no se puede borrar mientras exista el
-- archivo que la apunta. Al reves haria falta un CASCADE, que borraria mas de lo que dice.

DROP TABLE "document_files";

DROP TABLE "document_batches";

DROP TYPE "DocumentFileStatus";

DROP TYPE "DocumentStrategy";
