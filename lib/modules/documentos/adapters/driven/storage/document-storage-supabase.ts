import { StorageClient } from '@supabase/storage-js';

import { readDocumentStorageConfigFromEnv } from '../config/document-storage-config-env';

import type { SignedUpload } from '../../../ports/document-storage';

/**
 * Implementa el puerto del almacenamiento contra el bucket PRIVADO de estos PDFs.
 *
 * La configuracion se resuelve EN CADA LLAMADA —nunca al importar el archivo, ni una sola vez al
 * construir un cliente en el top-level—: importar este adaptador sin invocar ninguna de sus
 * operaciones no debe fallar con las variables vacias, que es lo que sostiene el cableado del punto
 * de composicion y la suite sin red.
 *
 * El bucket que se lee aqui es el PROPIO de estos documentos, distinto del publico de imagenes: ni
 * una sola de estas operaciones puede alcanzarlo.
 *
 * **Ninguna operacion BORRA**, y no es olvido: el puerto no lo expresa, y el borrado del PDF
 * temporal es trabajo de quien procesa la tanda. Que la libreria ofrezca `remove` no lo convierte en
 * capacidad de este modulo.
 *
 * Los errores del servicio se ENVUELVEN diciendo que operacion fallo y sobre que ruta. No se traga
 * ninguno: la libreria devuelve el fallo en `error` en vez de lanzarlo, asi que ignorarlo seria
 * devolver una ruta que nadie escribio.
 */

function bucketApi(): ReturnType<StorageClient['from']> {
  const config = readDocumentStorageConfigFromEnv();
  const client = new StorageClient(config.url, {
    apikey: config.key,
    Authorization: `Bearer ${config.key}`,
  });
  return client.from(config.bucket);
}

/**
 * `createSignedUpload` del puerto: firma la subida de UNA ruta y devuelve con que caduca.
 *
 * **Sobre el plazo.** La libreria instalada no admite plazo al firmar una subida —su
 * `createSignedUploadUrl` solo recibe la ruta—, asi que `expiresAt` es el instante que declara ESTE
 * modulo: el plazo que el sistema promete y por el que se rige quien consuma el enlace. El servicio
 * puede seguir aceptando la firma despues de ese instante, de modo que el valor es el limite
 * propio, no una garantia del proveedor. Se devuelve calculado y no se inventa una caducidad que la
 * API no acepta.
 */
export async function createDocumentSignedUpload(
  path: string,
  expiresInSeconds: number,
): Promise<SignedUpload> {
  const api = bucketApi();

  const { data, error } = await api.createSignedUploadUrl(path);
  if (error) {
    throw new Error(`fallo al firmar la subida del documento en la ruta ${path}: ${error.message}`);
  }

  const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();
  return { path: data.path, uploadUrl: data.signedUrl, token: data.token, expiresAt };
}

/**
 * `createSignedReadUrl` del puerto. Existe porque el bucket es PRIVADO: sin ella, quien procese la
 * tanda no tendria forma de leer el archivo sin conocer al proveedor. La URL se devuelve a quien la
 * pide y no se persiste en ninguna parte: caduca sola.
 */
export async function createDocumentSignedReadUrl(
  path: string,
  expiresInSeconds: number,
): Promise<string> {
  const api = bucketApi();

  const { data, error } = await api.createSignedUrl(path, expiresInSeconds);
  if (error) {
    throw new Error(`fallo al firmar la lectura del documento en la ruta ${path}: ${error.message}`);
  }

  return data.signedUrl;
}

/**
 * `download` del puerto: los bytes del PDF, que es lo que come la conversion.
 *
 * La libreria entrega un `Blob`; el puerto habla en `Uint8Array` para no arrastrar el tipo del
 * transporte hasta el dominio.
 */
export async function downloadDocument(path: string): Promise<Uint8Array> {
  const api = bucketApi();

  const { data, error } = await api.download(path);
  if (error) {
    throw new Error(`fallo al descargar el documento en la ruta ${path}: ${error.message}`);
  }

  return new Uint8Array(await data.arrayBuffer());
}
