/**
 * El puerto del REGISTRO de una ejecucion por estrategia.
 *
 * Es un puerto y no un `console.log` suelto en el dominio por dos motivos: el dominio no conoce el
 * mundo exterior, y la unica forma de comprobar desde un test que se registro es espiar una
 * dependencia —parchear la consola global ensucia el resto de la suite—.
 *
 * **La firma no admite el TEXTO de la IA**, solo su longitud: puede ser enorme y traer datos de
 * terceros, asi que registrarlo por descuido no compila. Quien lo necesite lo tiene en el valor de
 * retorno del caso de uso.
 */
import type { PdfStrategy } from '../domain/pdf-strategy';
import type { AiReadMode } from '../domain/read-pdf-with-ai';

export type StrategyRunSummary = {
  readonly strategy: PdfStrategy;
  /**
   * `null` cuando lo invalido es la propia estrategia: el modo SALE de ella, asi que no hay ninguno
   * que decir sin inventarselo, y esa entrada se registra igual.
   */
  readonly mode: AiReadMode | null;
  readonly path: string;
  /** `null` cuando el archivo no se pudo contar; contar paginas es para el registro, no para el resultado. */
  readonly pages: number | null;
  readonly textLength: number;
};

export interface StrategyRunLog {
  run(summary: StrategyRunSummary): void;
}
