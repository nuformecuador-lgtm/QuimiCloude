/**
 * La clave y el modelo del proveedor de IA, leidos EN EL MOMENTO DE LA INVOCACION —dentro
 * de una funcion, nunca al importar el modulo—.
 *
 * Que se lean aqui y no en el top-level es lo que permite que `lib/composition` —que
 * importa todo, y lo importa la suite entera— construya la fachada del modulo sin leer una
 * sola variable ni tocar la red, y que la suite corra sin claves configuradas.
 *
 * El modelo no tiene valor por defecto: un identificador de modelo escrito a mano deja de
 * existir sin avisar, y eso se descubre en produccion, no en un test.
 */

export type AiConfig = {
  readonly apiKey: string;
  readonly model: string;
};

/**
 * Los dos nombres viven UNICAMENTE como elementos de este arreglo, cadenas literales en
 * posicion de valor. Repetirlos como identificador aparte seria tener dos sitios que dicen
 * como se llama lo mismo.
 */
const REQUIRED_ENV_VAR_NAMES = ['GEMINI_API_KEY', 'GEMINI_MODEL'] as const;

/** Vacia o solo-espacios cuenta como ausente. Devuelve el valor SIN recortar. */
function readRequiredEnv(name: string): string {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') {
    throw new Error(`falta la variable de entorno ${name}`);
  }
  return raw;
}

/**
 * Resuelve las dos por POSICION, no por nombre de propiedad, para no volver a escribir
 * ninguno de los dos nombres fuera del arreglo de arriba. Si faltan varias, el error las
 * nombra TODAS juntas y nunca incluye ningun valor.
 */
export function readAiConfigFromEnv(): AiConfig {
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

  const [apiKey, model] = resolved as [string, string];
  return { apiKey, model };
}
