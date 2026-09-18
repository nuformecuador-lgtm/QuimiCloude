// lib/composition/edge.ts — CABLEADO QUE PUEDE CORRER EN EL BORDE (`design.md > 5`).
//
// Sigue habiendo **un solo punto de composicion**: este archivo no es un segundo sitio donde se
// eligen implementaciones, es la mitad de `lib/composition` que el runtime del borde puede
// cargar. `guard-arquitectura-modulos` autoriza el import de adaptadores driven a toda la
// carpeta `lib/composition/**` por PREFIJO —no por archivo—, asi que la frontera no se ensancha
// ni hay regla que tocar (R21).
//
// Por que no vale `lib/composition/index.ts`: ese archivo cablea los adaptadores Prisma, y basta
// importarlo desde `middleware.ts` para arrastrar `@prisma/client` al bundle del borde, donde no
// carga (R4, R15). La separacion es por lo que cada archivo ARRASTRA, no por gusto.
//
// Aqui solo puede entrar lo que no toque `next/headers`, `node:crypto`, Prisma ni el cliente
// compartido de base. `tests/guards/guard-middleware-edge.test.ts` lo hace cumplir recorriendo el
// cierre de imports desde `middleware.ts`, asi que un import prohibido no se queda en la revision:
// pone el gate en rojo.
import { Redis } from '@upstash/redis';

import {
  SESSION_COOKIE_NAME,
  readSessionSecret,
  verifySessionValue,
} from '@/lib/modules/identity/adapters/driven/session/session-token';
import type { SessionTokenVerifier } from '@/lib/modules/identity/ports/session-token-verifier';
import { REQUEST_ID_HEADER, newRequestId } from '@/lib/modules/observabilidad';
import { createInMemoryRateLimiter } from '@/lib/modules/rate-limit/adapters/driven/in-memory-rate-limiter';
import { createUpstashRateLimiter } from '@/lib/modules/rate-limit/adapters/driven/upstash-rate-limiter';
import type { RateLimiter } from '@/lib/modules/rate-limit/ports/rate-limiter';
import {
  checkRequestRate,
  parseRateLimitConfig,
  type RateLimitBucket,
  type RateLimitVerdict,
} from '@/lib/modules/rate-limit';
import { LOGIN_ROUTE } from '@/lib/shared/routes';

/**
 * El verificador de la cookie tal y como lo ve el borde. `readSessionSecret()` se llama DENTRO de
 * `verify` y no al cablear: leerlo al cargar el modulo romperia el build (no hay entorno de
 * ejecucion) y dejaria el fallo cerrado de R18 sin forma de probarse. Que lance cuando el secreto
 * falta es parte del contrato: quien lo captura y traduce a «sin sesion» es el adaptador driving.
 */
const sessionTokenVerifier: SessionTokenVerifier = {
  cookieName: SESSION_COOKIE_NAME,
  verify: (raw) => verifySessionValue(raw, readSessionSecret()),
};

/** Fachada edge-safe del modulo `identity`. Hoy la consume solo el middleware. */
export const identityEdge = { sessionTokenVerifier } as const;

/**
 * Fachada edge-safe del modulo `observabilidad` (QC-71 T3). La consume el mismo adaptador
 * driving que ya ocupa el middleware: el borde no conoce `lib/modules/observabilidad/domain/**`,
 * conoce esta fachada.
 *
 * No arrastra nada: `newRequestId` usa el global `crypto.randomUUID()` y su archivo no declara
 * ningun `import` (R2, R3). Por eso ampliar este archivo no acerca ni un paquete prohibido al
 * cierre del borde, y `guard-middleware-edge` lo sigue demostrando sin que haya que tocarla.
 */
export const observabilidadEdge = {
  newRequestId,
  requestIdHeader: REQUEST_ID_HEADER,
} as const;

/**
 * Nombra la variable en el aviso, nunca su valor: la clave de deduplicacion sí incluye el valor
 * crudo, para que un segundo valor invalido de la MISMA variable vuelva a avisar.
 */
const warnedInvalidConfig = new Set<string>();

function warnInvalidConfig(env: NodeJS.ProcessEnv, names: readonly string[]): void {
  for (const name of names) {
    const dedupeKey = `${name}:${env[name]}`;
    if (warnedInvalidConfig.has(dedupeKey)) continue;
    warnedInvalidConfig.add(dedupeKey);
    console.warn(`[rate-limit] variable de entorno invalida, se usa el valor por defecto: ${name}`);
  }
}

let inMemoryLimiter: RateLimiter | undefined;

function getInMemoryLimiter(): RateLimiter {
  inMemoryLimiter ??= createInMemoryRateLimiter();
  return inMemoryLimiter;
}

interface UpstashLimiters {
  readonly url: string;
  readonly token: string;
  readonly byBucket: Record<RateLimitBucket, RateLimiter>;
}

let upstashLimiters: UpstashLimiters | undefined;

/** Un limitador por cuota, recreado solo si cambian las credenciales. */
function getUpstashLimiter(url: string, token: string, bucket: RateLimitBucket): RateLimiter {
  if (!upstashLimiters || upstashLimiters.url !== url || upstashLimiters.token !== token) {
    const redis = new Redis({ url, token });
    upstashLimiters = {
      url,
      token,
      byBucket: {
        login: createUpstashRateLimiter(redis, 'rate-limit:login'),
        general: createUpstashRateLimiter(redis, 'rate-limit:general'),
      },
    };
  }
  return upstashLimiters.byBucket[bucket];
}

/**
 * Sin cuenta de Upstash, en produccion no hay contador que valga: cada instancia de Vercel
 * llevaria su propia cuenta en memoria, asi que se trata como si el contador no respondiera.
 */
const MISSING_UPSTASH_CREDENTIALS_REASON = 'sin-credenciales-de-upstash-en-produccion';

/** Fachada edge-safe del limite de peticiones por origen. */
export const rateLimitEdge = {
  loginRoute: LOGIN_ROUTE,
  check: async (input: {
    readonly origin: string;
    readonly bucket: RateLimitBucket;
  }): Promise<RateLimitVerdict> => {
    const { config, warnings } = parseRateLimitConfig(process.env);
    warnInvalidConfig(process.env, warnings);

    const quota = config[input.bucket];
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;

    if (url && token) {
      return checkRequestRate(
        { origin: input.origin, bucket: input.bucket, quota },
        { limiter: getUpstashLimiter(url, token, input.bucket), timeoutMs: config.timeoutMs },
      );
    }

    if (process.env.VERCEL_ENV === 'production') {
      return { outcome: 'degraded', reason: MISSING_UPSTASH_CREDENTIALS_REASON };
    }

    return checkRequestRate(
      { origin: input.origin, bucket: input.bucket, quota },
      { limiter: getInMemoryLimiter(), timeoutMs: config.timeoutMs },
    );
  },
} as const;
