/**
 * El puerto de la CONFIGURACION de infraestructura del procesamiento por lotes: dos plazos que
 * cambian por entorno y por eso no viven en `domain/limits.ts`.
 */

export interface ProcessingConfig {
  /** Plazo de caducidad de una fila, en segundos. */
  timeoutSeconds(): number;
  /** Tope de reintentos que la cola aplica a un mensaje. */
  maxRetries(): number;
}
