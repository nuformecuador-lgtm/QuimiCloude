#!/usr/bin/env node
/**
 * `pnpm run build` — el build de Vercel y el de los devs en local.
 *
 * Las previews de Vercel comparten base con produccion: una preview que corriera
 * `prisma migrate deploy` aplicaria a produccion las migraciones de una rama sin mergear, y el
 * seed escribiria en ella. Por eso, dentro de Vercel (`VERCEL` definida: Vercel la pone en todo
 * build), migrate y seed corren SOLO con `VERCEL_ENV=production`. Cualquier otro caso en Vercel
 * (preview, development, `VERCEL_ENV` vacio o ausente) se los salta: si falta el dato, se falla
 * hacia el lado seguro, que es no tocar la base. Fuera de Vercel (local, CI) el build corre
 * entero, como siempre, sea cual sea `VERCEL_ENV`.
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

const CON_TODO = [MIGRAR, GENERAR, SEMBRAR, CONSTRUIR];
const SIN_BASE = [GENERAR, CONSTRUIR];
const DE_BASE = [MIGRAR, SEMBRAR];

/**
 * Comandos del build, en orden, para un entorno dado, y la linea que explica la decision.
 * @param {Record<string, string | undefined>} env
 * @returns {{ pasos: string[], saltados: string[], motivo: string }}
 */
export function pasosDelBuild(env) {
  if (!env.VERCEL) {
    return { pasos: [...CON_TODO], saltados: [], motivo: '[build] fuera de Vercel -> con migrate y seed' };
  }
  const vercelEnv = env.VERCEL_ENV;
  if (vercelEnv === 'production') {
    return { pasos: [...CON_TODO], saltados: [], motivo: '[build] Vercel production -> con migrate y seed' };
  }
  const motivo = vercelEnv
    ? `[build] Vercel ${vercelEnv} -> sin migrate ni seed (comparte base con produccion)`
    : '[build] Vercel sin VERCEL_ENV -> sin migrate ni seed (lado seguro)';
  return { pasos: [...SIN_BASE], saltados: [...DE_BASE], motivo };
}

/**
 * Corre los pasos del build en orden y para en el primero que falla.
 * @param {Record<string, string | undefined>} env
 * @param {(comando: string) => { status: number | null, error?: Error }} ejecutar
 * @param {{ log: (linea: string) => void, error: (linea: string) => void }} salida
 * @returns {number} el codigo de salida del build: 0 si todos los pasos salieron bien, el del
 *   paso que fallo si no, y 1 si un paso no se pudo lanzar o salio sin codigo.
 */
export function ejecutarBuild(env, ejecutar, salida) {
  const { pasos, motivo } = pasosDelBuild(env);
  salida.log(motivo);
  for (const paso of pasos) {
    salida.log(`[build] ${paso}`);
    const r = ejecutar(paso);
    if (r.error) {
      salida.error(`[build] no se pudo lanzar \`${paso}\`: ${r.error.message}`);
      return 1;
    }
    if (r.status !== 0) return r.status ?? 1;
  }
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // `shell: true`: en Windows los binarios de node_modules/.bin son `.cmd` y spawn sin shell
  // no los encuentra.
  const codigo = ejecutarBuild(
    process.env,
    (paso) => spawnSync(paso, { shell: true, stdio: 'inherit' }),
    { log: console.log, error: console.error },
  );
  process.exit(codigo);
}
