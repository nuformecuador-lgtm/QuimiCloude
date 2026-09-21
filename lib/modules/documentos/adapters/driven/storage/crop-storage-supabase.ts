import { StorageClient } from '@supabase/storage-js';

import { readCropStorageConfigFromEnv } from '../config/crop-storage-config-env';

/**
 * Implementa el puerto del recorte contra el bucket PROPIO de estos PNG.
 *
 * La configuracion se resuelve EN CADA LLAMADA —nunca al importar el archivo, ni una sola vez al
 * construir un cliente en el top-level—: importar este adaptador sin invocar su unica operacion no
 * debe fallar con las variables vacias, que es lo que sostiene el cableado del punto de composicion
 * y la suite sin red.
 *
 * El bucket que se lee aqui es el PROPIO de estos recortes, distinto del de los PDF y del publico
 * de imagenes de receta: ni una sola de estas operaciones puede alcanzarlos.
 *
 * El error del servicio se ENVUELVE diciendo que operacion fallo y sobre que ruta. No se traga
 * ninguno: la libreria devuelve el fallo en `error` en vez de lanzarlo, asi que ignorarlo seria
 * fingir que la subida ocurrio.
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
