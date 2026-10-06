/**
 * La clave y el modelo de cada proveedor de IA, leidos EN EL MOMENTO DE LA INVOCACION —dentro
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
 * Los nombres viven UNICAMENTE como elementos de estos arreglos, cadenas literales en
 * posicion de valor, en el orden clave y modelo. Repetirlos como identificador aparte seria
 * tener dos sitios que dicen como se llama lo mismo.
 */
const ANTHROPIC_ENV_VAR_NAMES = ['ANTHROPIC_API_KEY', 'ANTHROPIC_MODEL'] as const;
const GEMINI_ENV_VAR_NAMES = ['GEMINI_API_KEY', 'GEMINI_MODEL'] as const;

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
 * ninguno de los nombres fuera de los arreglos de arriba. Si faltan varias, el error las
 * nombra TODAS juntas y nunca incluye ningun valor.
 */
function readConfigFromEnv(names: readonly [string, string]): AiConfig {
  const missing: string[] = [];
  const resolved: string[] = [];

  for (const name of names) {
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

/** Proveedor principal: Anthropic (Claude). */
export function readAnthropicConfigFromEnv(): AiConfig {
  return readConfigFromEnv(ANTHROPIC_ENV_VAR_NAMES);
}

/** Gemini: se conserva para usarlo como respaldo; hoy no esta cableado. */
export function readAiConfigFromEnv(): AiConfig {
  return readConfigFromEnv(GEMINI_ENV_VAR_NAMES);
}
