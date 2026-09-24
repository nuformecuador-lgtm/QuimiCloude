// lib/modules/pedidos/adapters/driven/config/cron-secret-env.ts
/**
 * La puerta del proceso diario: compara la cabecera `Authorization: Bearer <secreto>` contra
 * `CRON_SECRET`, leida EN LA LLAMADA y nunca al importar el modulo -mismo criterio que
 * `readSessionSecret` y `readQstashConfigFromEnv`-, para que cargar este archivo sin la variable
 * configurada no falle por si solo.
 *
 * `timingSafeEqual` es de `node:crypto`: la ruta declara `runtime = 'nodejs'`
 * (`app/api/cron/caducar-pedidos/route.ts`), asi que existe. No hace falta la version WebCrypto
 * de `identity` -esa la escribieron para el borde, que aqui no corre-.
 */
import { timingSafeEqual } from 'node:crypto';

export type CronSecretVerification = 'ok' | 'unauthorized' | 'misconfigured';

const BEARER_PREFIX = 'Bearer ';

/** Compara en tiempo constante SOLO si las dos cadenas tienen la misma longitud en bytes:
 *  `timingSafeEqual` lanza si no, y una longitud distinta ya es "no coincide". */
function equalsInConstantTime(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, 'utf8');
  const bufferB = Buffer.from(b, 'utf8');
  if (bufferA.length !== bufferB.length) return false;

  return timingSafeEqual(bufferA, bufferB);
}

export function verifyCronSecret(authorizationHeader: string | null): CronSecretVerification {
  const secret = process.env.CRON_SECRET;
  if (typeof secret !== 'string' || secret.length === 0) return 'misconfigured';

  if (authorizationHeader === null || !authorizationHeader.startsWith(BEARER_PREFIX)) {
    return 'unauthorized';
  }

  const provided = authorizationHeader.slice(BEARER_PREFIX.length);
  return equalsInConstantTime(provided, secret) ? 'ok' : 'unauthorized';
}
