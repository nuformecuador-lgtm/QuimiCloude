import { randomUUID } from 'node:crypto';

import { StorageClient } from '@supabase/storage-js';

import { readRecipeImageStorageConfigFromEnv } from '../config/storage-config-env';

import type { RecipeImageUpload } from '../../../ports/recipe-image-storage';

/**
 * Implementa `RecipeImageStorage` (D10, R22; `design.md > 9.1`, `> 9.3`) con
 * `@supabase/storage-js`. UNICO archivo del repo que importa esa libreria.
 *
 * La configuracion se lee EN CADA LLAMADA -nunca al importar el modulo, ni una sola vez
 * al construir el cliente en el top-level-, para que un archivo que solo IMPORTA este
 * adaptador (sin invocar ninguna de sus tres funciones) no falle con las variables
 * vacias (R43): eso es lo que permite que `lib/composition` construya la fachada del
 * modulo sin red y sin bucket.
 *
 * `remove(path)` es la UNICA operacion de borrado (R48): la llaman los dos caminos de la
 * edicion (reemplazar, R26; quitar, R47), y no existe ningun `clearImage` ni equivalente.
 */

function bucketApi(): ReturnType<StorageClient['from']> {
  const config = readRecipeImageStorageConfigFromEnv();
  const client = new StorageClient(config.url, { apikey: config.key, Authorization: `Bearer ${config.key}` });
  return client.from(config.bucket);
}

/** `upload` de `RecipeImageStorage`: genera `recetas/<uuid>.<ext>` y devuelve la RUTA. */
export async function uploadRecipeImage(image: RecipeImageUpload): Promise<string> {
  const api = bucketApi();
  const path = `recetas/${randomUUID()}.${image.extension}`;

  const { error } = await api.upload(path, image.bytes, {
    contentType: image.contentType,
    upsert: false,
  });
  if (error) {
    throw new Error(`fallo al subir la imagen de receta en la ruta ${path}: ${error.message}`);
  }

  return path;
}

/** `remove` de `RecipeImageStorage`: unica operacion de borrado del modulo (R48). */
export async function removeRecipeImage(path: string): Promise<void> {
  const api = bucketApi();
  const { error } = await api.remove([path]);
  if (error) {
    throw new Error(`fallo al borrar la imagen de receta en la ruta ${path}: ${error.message}`);
  }
}

/**
 * `publicUrl` de `RecipeImageStorage` (D5, D6, R24, R25): compone la URL PUBLICA de
 * lectura -sin firma ni caducidad- a partir de la ruta, la direccion del proyecto y el
 * bucket, todos de configuracion. No llama a ninguna API de enlaces firmados.
 */
export function recipeImagePublicUrl(path: string): string {
  const api = bucketApi();
  const { data } = api.getPublicUrl(path);
  return data.publicUrl;
}
