/**
 * Las tres variables se leen EN EL MOMENTO DE LA INVOCACION, nunca al importar el modulo: asi la
 * composicion arma la fachada sin bucket configurado y sin tocar la red.
 *
 * Si falta alguna, el error las NOMBRA sin incluir jamas ningun valor.
 */

export type CropStorageConfig = {
  readonly url: string;
  readonly bucket: string;
  readonly key: string;
};

/**
 * Los tres nombres viven UNICAMENTE como elementos de este arreglo, cadenas literales en posicion de
 * valor. Repetirlos como identificador aparte seria tener dos sitios que dicen como se llama lo
 * mismo.
 *
 * La direccion del proyecto y la credencial se COMPARTEN con el resto de buckets del repositorio:
 * son el proyecto y la credencial, no el bucket, y duplicarlas serian dos verdades para el mismo
 * dato. Lo unico propio de estos recortes es el nombre del bucket.
 */
const REQUIRED_ENV_VAR_NAMES = [
  'SUPABASE_STORAGE_URL',
  'SUPABASE_CROPS_BUCKET',
  'SUPABASE_STORAGE_KEY',
] as const;

/** Vacia o solo-espacios cuenta como ausente. Devuelve el valor SIN recortar. */
function readRequiredEnv(name: string): string {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') {
    throw new Error(`falta la variable de entorno ${name}`);
  }
  return raw;
}

/**
 * Resuelve las tres por POSICION, no por nombre de propiedad, para no volver a escribir ninguno de
 * los tres nombres fuera del arreglo de arriba. Si faltan varias, el error las nombra TODAS juntas
 * —una a una obligaria a tres intentos para descubrir que el entorno esta sin configurar— y nunca
 * incluye ningun valor.
 */
export function readCropStorageConfigFromEnv(): CropStorageConfig {
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
