export type SecretContext = {
  readonly companyId: string;
  readonly recordId: string;
  readonly field: string;
};

const CONTEXT_LABEL = 'integraciones.secret';

/**
 * Cadena canónica que liga el valor cifrado a su fila. JSON y no unir con `:`: con `:`,
 * `('a:b', 'c', 'd')` y `('a', 'b:c', 'd')` darían la misma cadena.
 */
export function encodeSecretContext(version: string, context: SecretContext): string {
  return JSON.stringify([
    CONTEXT_LABEL,
    version,
    context.companyId,
    context.recordId,
    context.field,
  ]);
}

export function isCompleteSecretContext(context: SecretContext): boolean {
  return context.companyId !== '' && context.recordId !== '' && context.field !== '';
}
