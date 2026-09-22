/**
 * El texto del prompt de una estrategia, resuelto EN LA INVOCACION. Sincrono: la unica fuente
 * prevista es el entorno del proceso, y volverlo asincrono obligaria a await sin necesidad.
 */
import type { PdfStrategy } from '../domain/pdf-strategy';

export type StrategyPrompt = {
  /** Lanza si el texto no esta configurado. El dominio traduce ese fallo; no lo propaga. */
  readonly promptFor: (strategy: PdfStrategy) => string;
};
