#!/usr/bin/env node
/**
 * `pnpm run build` — el build de Vercel y el de los devs en local.
 *
 * Las previews de Vercel comparten base con produccion: una preview que corriera
 * `prisma migrate deploy` aplicaria a produccion las migraciones de una rama sin mergear, y el
 * seed escribiria en ella. Por eso migrate y seed solo corren con `VERCEL_ENV=production`, o sin
 * `VERCEL_ENV` (local y CI), donde el build sigue siendo el de siempre.
 *
 * Node y no una cadena de `&&` en package.json: la regla necesita un `if` y este repo se trabaja
 * tambien desde Windows.
 */
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MIGRAR = 'prisma migrate deploy';
const GENERAR = 'prisma generate';
const SEMBRAR = 'tsx scripts/seed.ts';
const CONSTRUIR = 'next build';

/**
 * Comandos del build, en orden, para un entorno dado.
 * @param {Record<string, string | undefined>} env
 * @returns {{ pasos: string[], saltados: string[], motivo: string | null }}
 */
export function pasosDelBuild(env) {
  const vercelEnv = env.VERCEL_ENV;
  if (vercelEnv === undefined || vercelEnv === '' || vercelEnv === 'production') {
    return { pasos: [MIGRAR, GENERAR, SEMBRAR, CONSTRUIR], saltados: [], motivo: null };
  }
  return {
    pasos: [GENERAR, CONSTRUIR],
    saltados: [MIGRAR, SEMBRAR],
    motivo: `VERCEL_ENV=${vercelEnv} comparte base con produccion`,
  };
}

function main() {
  const { pasos, saltados, motivo } = pasosDelBuild(process.env);
  if (saltados.length > 0) {
    console.log(`[build] se salta ${saltados.map((s) => `\`${s}\``).join(' y ')}: ${motivo}.`);
  }
  for (const paso of pasos) {
    console.log(`[build] ${paso}`);
    // `shell: true`: en Windows los binarios de node_modules/.bin son `.cmd` y spawn sin shell
    // no los encuentra.
    const r = spawnSync(paso, { shell: true, stdio: 'inherit' });
    if (r.error) {
      console.error(`[build] no se pudo lanzar \`${paso}\`: ${r.error.message}`);
      process.exit(1);
    }
    if (r.status !== 0) process.exit(r.status ?? 1);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
