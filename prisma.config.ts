import { defineConfig } from "prisma/config";

// Con un archivo de config presente, el CLI de Prisma NO carga el `.env` por su
// cuenta ("Prisma config detected, skipping environment variable loading"): lo
// cargamos aqui con la utilidad nativa de Node (v20.12+) para que los `env(...)`
// del schema se resuelvan al correr el CLI (migrate, generate, studio). Si no hay
// `.env`, se usan las variables ya presentes en process.env.
try {
  process.loadEnvFile();
} catch {
  // sin .env: se usan las variables ya presentes en process.env
}

// El CLI de Prisma (`migrate deploy`, `studio`) necesita una conexion en modo
// SESION: `migrate deploy` toma un advisory lock, que vive en la sesion y no
// sobrevive al pooler transaccional. El runtime necesita lo contrario — el
// pooler transaccional (`:6543`), porque en modo sesion cada instancia de
// Vercel retiene sus conexiones y agota el pool del proyecto (ver
// `lib/db/prisma-client.ts`). Son dos necesidades incompatibles, asi que van en
// dos variables, declaradas en `db/schema.prisma`:
//   - DIRECT_URL   → pooler en modo sesion (`:5432`). Solo el CLI (`directUrl`).
//   - DATABASE_URL → pooler transaccional (`:6543`). Solo el runtime (`url`).
// En local no hay pooler y una sola URL sirve para ambas cosas: si DIRECT_URL no
// esta definida, se iguala a DATABASE_URL para que el schema valide igual.
if (!process.env.DIRECT_URL && process.env.DATABASE_URL) {
  process.env.DIRECT_URL = process.env.DATABASE_URL;
}

export default defineConfig({
  schema: "db/schema.prisma",
});
