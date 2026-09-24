/**
 * La UNICA implementacion de `StrategyRunLog`: escribe una linea por ejecucion en el registro del
 * servidor.
 *
 * `escribir` entra por parametro para que un test pueda espiarlo sin tocar la consola global.
 *
 * La linea lleva la LONGITUD del texto, nunca el texto: el puerto ya lo impide y esto no lo relaja.
 */
import type { StrategyRunLog, StrategyRunSummary } from '../../../ports/strategy-run-log';

/** Prefijo fijo, para que la linea sea localizable con una busqueda exacta. */
const PREFIJO = 'process-pdf-by-strategy';

/** El hueco cuando el PDF no se pudo contar. */
const SIN_PAGINAS = 'sin-paginas';

/** El hueco cuando la estrategia era invalida y por tanto no hubo modo que registrar. */
const SIN_MODO = 'sin-modo';

export function createStrategyRunLogConsole(
  escribir: (linea: string) => void = (linea) => console.log(linea),
): StrategyRunLog {
  return {
    run(summary: StrategyRunSummary): void {
      const paginas = summary.pages === null ? SIN_PAGINAS : String(summary.pages);
      const modo = summary.mode ?? SIN_MODO;
      escribir(
        `[${PREFIJO}] estrategia=${summary.strategy} modo=${modo} ruta='${summary.path}' paginas=${paginas} longitud=${summary.textLength}`,
      );
    },
  };
}
