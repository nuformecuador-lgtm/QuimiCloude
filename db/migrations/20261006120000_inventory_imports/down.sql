-- DOWN de inventory_imports. Lo aplica `pnpm run db:rollback` en una sola transaccion.
--
-- Borrar la tabla arrastra sus FK, indices, CHECK y RLS. Se pierde el registro de las
-- importaciones confirmadas. `IF EXISTS` para que deshacer dos veces seguidas no falle.

DROP TABLE IF EXISTS "inventory_imports";
