/**
 * Se lee dentro de cada llamada, nunca al importar: la composición elige el doble en cada uso y la
 * elección puede cambiar dentro de un mismo proceso. Su ausencia significa el adaptador real.
 */
const E2E_DOUBLES_ENV_VAR_NAME = 'INTEGRATIONS_E2E_DOUBLES';

/** Vacía o solo espacios cuenta como ausente. */
export function integrationsE2EDoublesEnabled(): boolean {
  const raw = process.env[E2E_DOUBLES_ENV_VAR_NAME];
  return raw !== undefined && raw.trim() !== '';
}
