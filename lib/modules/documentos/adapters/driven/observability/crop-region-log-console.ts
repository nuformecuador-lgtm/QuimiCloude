/**
 * La UNICA implementacion de `CropRegionLog`: escribe una linea por region saltada en el registro
 * del servidor.
 *
 * `escribir` entra por parametro para que un test pueda espiarlo sin tocar la consola global.
 */
import type { CropRegionLog, CropRegionSkipSummary } from '../../../ports/crop-region-log';

/** Prefijo fijo, para que la linea sea localizable con una busqueda exacta. */
const PREFIJO = 'crop-catalog-images';

export function createCropRegionLogConsole(
  escribir: (linea: string) => void = (linea) => console.log(linea),
): CropRegionLog {
  return {
    skip(summary: CropRegionSkipSummary): void {
      escribir(
        `[${PREFIJO}] ruta='${summary.path}' pagina=${summary.page} indice=${summary.index} causa=${summary.cause}`,
      );
    },
  };
}
