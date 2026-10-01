-- Indice parcial de los pedidos bloqueados. Es el indice que usa la revision que los desbloquea:
-- filtra por empresa y por estado, y ordena por `(created_at, id)`, que es el orden en que la
-- revision los recorre.
--
-- Va en una migracion aparte, y no junto al `ADD VALUE`, porque el predicado compara contra
-- 'BLOQUEADO' y Postgres rechaza usar un valor recien anadido al enum dentro de la misma
-- transaccion que lo anade (`unsafe use of new value`). Mismo motivo por el que la migracion de
-- los estados de empaque separo el indice de packed_by de los valores nuevos.

CREATE INDEX "orders_blocked_company_created_idx"
  ON "orders" ("company_id", "created_at", "id")
  WHERE "status" = 'BLOQUEADO' AND "deleted_at" IS NULL;
