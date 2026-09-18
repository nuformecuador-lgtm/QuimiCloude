-- Revierte `migration.sql` en orden inverso: los CHECK primero, luego los indices, luego las
-- claves foraneas, luego las dos tablas y por ultimo los dos enums.

DROP TABLE "document_files";

DROP TABLE "document_batches";

DROP TYPE "DocumentFileStatus";

DROP TYPE "DocumentStrategy";
