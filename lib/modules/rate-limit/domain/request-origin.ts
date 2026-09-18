import { z } from 'zod';

/** Origen comun para peticiones sin una IP identificable. */
export const UNKNOWN_ORIGIN = 'unknown';

const ipv4 = z.ipv4();
const ipv6 = z.ipv6();

function isValidIp(candidate: string): boolean {
  return ipv4.safeParse(candidate).success || ipv6.safeParse(candidate).success;
}

/**
 * El origen de una peticion: la primera direccion de `x-forwarded-for`, o
 * {@link UNKNOWN_ORIGIN} si falta o no es una IP valida.
 */
export function resolveRequestOrigin(forwardedFor: string | null): string {
  if (!forwardedFor) {
    return UNKNOWN_ORIGIN;
  }

  const candidate = forwardedFor.split(',')[0]?.trim() ?? '';
  return isValidIp(candidate) ? candidate : UNKNOWN_ORIGIN;
}
