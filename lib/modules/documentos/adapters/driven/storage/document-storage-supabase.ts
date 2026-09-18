import { StorageClient } from '@supabase/storage-js';

import { readDocumentStorageConfigFromEnv } from '../config/document-storage-config-env';

import {
  MILLISECONDS_PER_SECOND,
  PROVIDER_UPLOAD_LINK_TTL_SECONDS,
} from '../../../domain/limits';

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
 * **`remove` borra de verdad**, y solo se llama tras terminar bien el procesamiento del archivo: en
 * cualquier otro estado la fila conserva su PDF.
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
 * **Sobre el plazo: son DOS HORAS y las pone el proveedor, no este modulo.** La operacion de la
 * libreria que firma una subida —`createSignedUploadUrl`— NO ACEPTA ningun plazo: solo recibe la
 * ruta. El servicio da al enlace una vida fija de dos horas, y no hay forma de pedir otra. Por eso
 * esta funcion no recibe `expiresInSeconds`: aceptarlo seria admitir un valor que se tiraria a la
 * basura.
 *
 * El instante que se reporta en `expiresAt` es el DEL PROVEEDOR —ahora mas su plazo—, no un limite
 * propio que el sistema prometa: nadie de este lado puede acortarlo ni alargarlo.
 */
export async function createDocumentSignedUpload(path: string): Promise<SignedUpload> {
  const api = bucketApi();

  const { data, error } = await api.createSignedUploadUrl(path);
  if (error) {
    throw new Error(`fallo al firmar la subida del documento en la ruta ${path}: ${error.message}`);
  }

  const expiresAt = new Date(
    Date.now() + PROVIDER_UPLOAD_LINK_TTL_SECONDS * MILLISECONDS_PER_SECOND,
  ).toISOString();
  return { path: data.path, uploadUrl: data.signedUrl, token: data.token, expiresAt };
}

/**
 * `createSignedReadUrl` del puerto. Existe porque el bucket es PRIVADO: sin ella, quien procese la
 * tanda no tendria forma de leer el archivo sin conocer al proveedor. La URL se devuelve a quien la
 * pide y no se persiste en ninguna parte: caduca sola.
 *
 * Aqui el plazo SI se pasa y SI se cumple —a diferencia de la subida—: la operacion de firmar una
 * lectura lo recibe y el servicio lo aplica.
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

/**
 * `remove` del puerto: borra la ruta del bucket. La libreria acepta una lista de rutas; aqui se
 * pasa siempre una sola, tal como declara el puerto.
 */
export async function removeDocument(path: string): Promise<void> {
  const api = bucketApi();

  const { error } = await api.remove([path]);
  if (error) {
    throw new Error(`fallo al borrar el documento en la ruta ${path}: ${error.message}`);
  }
}
