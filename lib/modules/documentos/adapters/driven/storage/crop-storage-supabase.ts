import { StorageClient } from '@supabase/storage-js';

import { readCropStorageConfigFromEnv } from '../config/crop-storage-config-env';

/**
 * Implementa el puerto del recorte contra el bucket PROPIO de estos PNG, distinto del de los PDF
 * y del publico de imagenes de receta.
 *
 * La configuracion se resuelve EN CADA LLAMADA, nunca al importar el archivo: asi importar este
 * adaptador sin invocar su operacion no falla con las variables vacias. El error del servicio se
 * ENVUELVE; no se traga ninguno, la libreria lo devuelve en `error` en vez de lanzarlo.
 */

function bucketApi(): ReturnType<StorageClient['from']> {
  const config = readCropStorageConfigFromEnv();
  const client = new StorageClient(config.url, {
    apikey: config.key,
    Authorization: `Bearer ${config.key}`,
  });
  return client.from(config.bucket);
}

/**
 * `upload` del puerto: sube los bytes de un PNG a una ruta del bucket de recortes.
 *
 * `upsert: true` porque un PDF reprocesado repite las mismas rutas: la subida debe sobrescribir el
 * recorte anterior, no rechazarse por ya existir.
 */
export async function uploadCrop(path: string, png: Uint8Array): Promise<void> {
  const api = bucketApi();

  const { error } = await api.upload(path, png, {
    contentType: 'image/png',
    upsert: true,
  });
  if (error) {
    throw new Error(`fallo al subir el recorte en la ruta ${path}: ${error.message}`);
  }
}
