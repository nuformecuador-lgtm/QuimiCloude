-- Indice parcial de los pedidos terminados, gemelo de `orders_company_finished_idx`: el listado de
-- terminados filtra por empresa y ordena por `finished_at` descendente y despues por numero.
--
-- Va en una migracion aparte porque el predicado compara contra el valor 'TERMINADO' del enum, y
-- Postgres rechaza usar un valor recien anadido dentro de la transaccion que lo anade (55P04).

CREATE INDEX "orders_company_terminated_idx"
  ON "orders" ("company_id", "finished_at" DESC NULLS LAST, "order_year" DESC, "order_sequence" DESC)
  WHERE "deleted_at" IS NULL AND "status" = 'TERMINADO';
