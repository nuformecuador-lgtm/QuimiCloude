-- Reversion exacta de `migration.sql`. `DROP TABLE` se lleva la tabla, sus indices, sus FK y su RLS.
-- Sin CASCADE: si una migracion posterior cuelga una FK de esta tabla, revertir esta sin revertir
-- aquella debe fallar ruidosamente. Los tipos caen despues porque la tabla los usa.

DROP TABLE "whatsapp_connections";
DROP TYPE "whatsapp_connection_status";
DROP TYPE "whatsapp_connection_origin";
