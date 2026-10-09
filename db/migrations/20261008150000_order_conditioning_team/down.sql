-- Reversion exacta de `migration.sql`. `DROP TABLE` se lleva sus indices, sus CHECK y sus FK, que
-- son de esta tabla: no queda nada en `orders`, `users` ni `work_groups`. Sin CASCADE: si algo
-- posterior depende de esta tabla, revertir esta sola debe fallar.

DROP TABLE "order_conditioning_team_members";
