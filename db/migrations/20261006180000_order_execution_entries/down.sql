-- Reversion exacta de `migration.sql`. `DROP TABLE` se lleva sus indices, sus CHECK y sus FK; el
-- tipo cae despues porque la tabla lo usa. Sin CASCADE: si algo posterior depende de esta tabla,
-- revertir esta sola debe fallar.

DROP TABLE "order_execution_entries";
DROP TYPE "OrderExecutionAction";
