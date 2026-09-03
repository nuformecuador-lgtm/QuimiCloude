/**
 * Lee las tres variables de entorno del Storage de recetas (D11, R28; `design.md > 9.4`).
 * Mismo patron que `initial-access-credentials-env.ts` de `identity` (QC-6): se leen
 * **en el momento de la invocacion** -dentro de una funcion, nunca al importar el
 * modulo-, y si falta alguna el error las NOMBRA sin filtrar ningun valor. Esto es lo
 * que hace que la suite entera pase con las tres variables vacias (R43): ningun test
 * construye el adaptador real de Storage, y este archivo por si solo no hace ninguna
 * llamada de red.
 */

export type RecipeImageStorageConfig = {
  readonly url: string;
  readonly bucket: string;
  readonly key: string;
};

/**
 * Los tres nombres de variable viven UNICAMENTE como elementos de este arreglo, cadenas
 * literales en posicion de valor -mismo criterio que `initial-access-credentials-env.ts`-.
 */
const REQUIRED_ENV_VAR_NAMES = ['SUPABASE_STORAGE_URL', 'SUPABASE_STORAGE_BUCKET', 'SUPABASE_STORAGE_KEY'] as const;

/** Vacia o solo-espacios cuenta como ausente. Devuelve el valor SIN recortar. */
function readRequiredEnv(name: string): string {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') {
    throw new Error(`falta la variable de entorno ${name}`);
  }
  return raw;
}

/**
 * Resuelve las tres variables por posicion (no por nombre de propiedad, para no repetir
 * ninguno de los tres nombres como identificador aparte del arreglo de arriba). Si falta
 * una o varias, el error las nombra TODAS juntas y nunca incluye ningun valor (R28).
 */
export function readRecipeImageStorageConfigFromEnv(): RecipeImageStorageConfig {
  const missing: string[] = [];
  const resolved: string[] = [];

  for (const name of REQUIRED_ENV_VAR_NAMES) {
    try {
      resolved.push(readRequiredEnv(name));
    } catch {
      missing.push(name);
    }
  }

  if (missing.length > 0) {
    throw new Error(`faltan las variables de entorno: ${missing.join(', ')}`);
  }

  const [url, bucket, key] = resolved as [string, string, string];
  return { url, bucket, key };
}
