#!/usr/bin/env node
/**
 * `pnpm run build` — el build de Vercel y el de los devs en local.
 *
 * Dentro de Vercel (`VERCEL` definida: Vercel la pone en todo build) migrate y seed solo corren en
 * production y en preview, cada uno contra su propia base:
 * - production: migrate, generate, seed base y `next build`.
 * - preview: lo mismo mas el seed de demostracion, y solo si el scope Preview pasa la comprobacion
 *   previa de `scripts/entorno-de-preview.mjs` (base y storage del proyecto de preview, ningun
 *   efecto fuera de la app). Si no la pasa, el build falla antes del primer paso: una preview con
 *   la `DATABASE_URL` de produccion migraria produccion con las migraciones de un PR sin mergear.
 * - cualquier otro caso (development, `VERCEL_ENV` vacio o ausente) se los salta: si falta el dato,
 *   se falla hacia el lado seguro, que es no tocar la base.
 * Fuera de Vercel (local, CI) el build corre entero, como siempre, sea cual sea `VERCEL_ENV`.
 *
 * Node y no una cadena de `&&` en package.json: la regla necesita un `if` y este repo se trabaja
 * tambien desde Windows.
 */
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { comprobarEntornoDePreview } from './entorno-de-preview.mjs';

const MIGRAR = 'prisma migrate deploy';
const GENERAR = 'prisma generate';
const SEMBRAR = 'tsx scripts/seed.ts';
const SEMBRAR_DEMO = 'tsx scripts/seed-demo.ts';
const CONSTRUIR = 'next build';

const CON_TODO = [MIGRAR, GENERAR, SEMBRAR, CONSTRUIR];
const CON_TODO_Y_DEMO = [MIGRAR, GENERAR, SEMBRAR, SEMBRAR_DEMO, CONSTRUIR];
const SIN_BASE = [GENERAR, CONSTRUIR];
const DE_BASE = [MIGRAR, SEMBRAR];

/**
 * Comandos del build, en orden, para un entorno dado, y la linea que explica la decision. Con
 * `problemas` el build no debe ejecutar ningun paso.
 * @param {Record<string, string | undefined>} env
 * @returns {{ pasos: string[], saltados: string[], motivo: string, problemas?: string[] }}
 */
export function pasosDelBuild(env) {
  if (!env.VERCEL) {
    return { pasos: [...CON_TODO], saltados: [], motivo: '[build] fuera de Vercel -> con migrate y seed' };
  }
  const vercelEnv = env.VERCEL_ENV;
  if (vercelEnv === 'production') {
    return { pasos: [...CON_TODO], saltados: [], motivo: '[build] Vercel production -> con migrate y seed' };
  }
  if (vercelEnv === 'preview') {
    const comprobacion = comprobarEntornoDePreview(env);
    if (!comprobacion.ok) {
      return {
        pasos: [],
        saltados: [...CON_TODO_Y_DEMO],
        motivo: '[build] Vercel preview -> configuracion de preview incompleta',
        problemas: comprobacion.problemas,
      };
    }
    return {
      pasos: [...CON_TODO_Y_DEMO],
      saltados: [],
      motivo: '[build] Vercel preview -> con migrate, seed y seed de demostracion (base de preview)',
    };
  }
  const motivo = vercelEnv
    ? `[build] Vercel ${vercelEnv} -> sin migrate ni seed (solo production y preview tocan la base)`
    : '[build] Vercel sin VERCEL_ENV -> sin migrate ni seed (lado seguro)';
  return { pasos: [...SIN_BASE], saltados: [...DE_BASE], motivo };
}

/**
 * Corre los pasos del build en orden y para en el primero que falla.
 * @param {Record<string, string | undefined>} env
 * @param {(comando: string) => { status: number | null, error?: Error }} ejecutar
 * @param {{ log: (linea: string) => void, error: (linea: string) => void }} salida
 * @returns {number} el codigo de salida del build: 0 si todos los pasos salieron bien, el del
 *   paso que fallo si no, y 1 si la configuracion no se cumple, si un paso no se pudo lanzar o si
 *   salio sin codigo.
 */
export function ejecutarBuild(env, ejecutar, salida) {
  const { pasos, motivo, problemas } = pasosDelBuild(env);
  salida.log(motivo);
  if (problemas && problemas.length > 0) {
    for (const problema of problemas) salida.error(`[build] ${problema}`);
    return 1;
  }
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
