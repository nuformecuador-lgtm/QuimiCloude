/**
 * La misma variable que usa `identity` para sus enlaces, con un lector propio: un módulo no importa
 * los adaptadores de otro. Se lee dentro de cada llamada, nunca al importar.
 */
const PUBLIC_BASE_URL_VAR = 'APP_BASE_URL';

/** `null` si falta: quien la usa decide qué hacer sin ella. */
export function readPublicBaseUrl(): string | null {
  const raw = process.env[PUBLIC_BASE_URL_VAR];
  if (raw === undefined || raw.trim() === '') return null;
  return raw.trim().replace(/\/+$/, '');
}
