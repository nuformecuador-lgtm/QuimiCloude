import { cropsEnMemoria } from './crop-storage-memory';

import type { CropCatalog } from '../../../ports/crop-catalog';

/**
 * Implementa `CropCatalog` EN MEMORIA, listando el MISMO `Map` en el que
 * `crop-storage-memory.ts` guardo los bytes: leer los recortes para mostrarlos no es un
 * almacenamiento distinto de subirlos, ni en el doble ni en el adaptador real.
 *
 * No se cablea nunca por defecto: el punto de composicion solo lo elige cuando
 * `DOCUMENTS_E2E_DOUBLES` esta puesta, y ningun archivo versionado la pone salvo la configuracion
 * de Playwright.
 */

/**
 * Dominio reservado por el estandar: NO resuelve en ningun DNS. Mismo origen que el resto de los
 * dobles de almacenamiento del modulo, para que el especificador intercepte una sola familia de
 * URL.
 */
const E2E_STORAGE_ORIGIN = 'https://documentos-e2e.invalid';

export const cropCatalogMemory: CropCatalog = {
  list(companyId: string, documentFileId: string): Promise<readonly string[]> {
    const prefix = `${companyId}/${documentFileId}/`;
    const rutas = [...cropsEnMemoria.keys()].filter((ruta) => ruta.startsWith(prefix));
    return Promise.resolve(rutas);
  },

  createSignedReadUrl(path: string): Promise<string> {
    return Promise.resolve(`${E2E_STORAGE_ORIGIN}/crops/${path}`);
  },
};
