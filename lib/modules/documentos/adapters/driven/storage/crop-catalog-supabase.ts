import { StorageClient } from '@supabase/storage-js';

import { readCropStorageConfigFromEnv } from '../config/crop-storage-config-env';

/**
 * Implementa `CropCatalog` contra el MISMO bucket y la MISMA configuracion que el adaptador que
 * sube los recortes: es el bucket de los recortes, y leerlos para mostrarlos no es un bucket
 * distinto de subirlos. `CropStorage` no se toca: este es un puerto y un adaptador aparte, solo de
 * lectura.
 *
 * La configuracion se resuelve EN CADA LLAMADA, nunca al importar el archivo, mismo criterio que
 * el resto de adaptadores de almacenamiento del modulo. Los errores del servicio se ENVUELVEN
 * nombrando la operacion y la entrada, sin incluir jamas ningun secreto.
 */

/** Tope de entradas por pagina que soporta la lista de un archivo: mas que suficiente para un
 *  documento del maximo de paginas del modulo con varios recortes por pagina. */
const LIST_LIMIT = 1000;

function bucketApi(): ReturnType<StorageClient['from']> {
  const config = readCropStorageConfigFromEnv();
  const client = new StorageClient(config.url, {
    apikey: config.key,
    Authorization: `Bearer ${config.key}`,
  });
  return client.from(config.bucket);
}

/**
 * `list` del puerto: las rutas completas de los recortes bajo `<empresa>/<archivo>/`. El servicio
 * devuelve el NOMBRE relativo al prefijo pedido; la ruta completa se reconstruye aqui.
 */
export async function listCrops(companyId: string, documentFileId: string): Promise<readonly string[]> {
  const prefix = `${companyId}/${documentFileId}`;
  const api = bucketApi();

  const { data, error } = await api.list(prefix, { limit: LIST_LIMIT });
  if (error) {
    throw new Error(`fallo al listar los recortes del archivo ${documentFileId}: ${error.message}`);
  }

  return data.filter((item) => item.id !== null).map((item) => `${prefix}/${item.name}`);
}

/**
 * `createSignedReadUrl` del puerto: la misma operacion de la libreria que ya usa el almacenamiento
 * de los PDF, contra el bucket de recortes.
 */
export async function createCropSignedReadUrl(path: string, expiresInSeconds: number): Promise<string> {
  const api = bucketApi();

  const { data, error } = await api.createSignedUrl(path, expiresInSeconds);
  if (error) {
    throw new Error(`fallo al firmar la lectura del recorte en la ruta ${path}: ${error.message}`);
  }

  return data.signedUrl;
}
