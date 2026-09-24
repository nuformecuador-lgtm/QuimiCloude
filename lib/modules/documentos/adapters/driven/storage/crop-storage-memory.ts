import type { CropStorage } from '../../../ports/crop-storage';

/**
 * Implementa el puerto de subida de recortes EN MEMORIA, para que el recorrido de extremo a
 * extremo pueda correr sin bucket configurado.
 *
 * No se cablea nunca por defecto: el punto de composicion solo lo elige cuando
 * `DOCUMENTS_E2E_DOUBLES` esta puesta, y ningun archivo versionado la pone salvo la configuracion
 * de Playwright.
 *
 * Los bytes SI se guardan, a diferencia del doble de `DocumentStorage`: `crop-catalog-memory.ts`
 * lee el mismo `Map` para listar y el especificador necesita ver un PNG real detras de la URL
 * firmada.
 */

/** Los bytes subidos, vivos mientras viva el proceso del servidor de pruebas. Compartido con `crop-catalog-memory.ts`. */
export const cropsEnMemoria = new Map<string, Uint8Array>();

export const cropStorageMemory: CropStorage = {
  upload(path: string, png: Uint8Array): Promise<void> {
    cropsEnMemoria.set(path, png);
    return Promise.resolve();
  },
};
