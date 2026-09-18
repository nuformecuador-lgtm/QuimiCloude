/**
 * El texto del prompt de cada estrategia, leido EN EL MOMENTO DE LA INVOCACION —dentro de una
 * funcion, nunca al importar el modulo—.
 *
 * Que se lea aqui y no en el top-level es lo que permite que `lib/composition` —que importa
 * todo, y lo importa la suite entera— construya la fachada del modulo sin leer una sola
 * variable ni tocar la red, y que la suite corra sin las dos variables configuradas.
 *
 * Sin texto por defecto, de repuesto ni heredado de la otra estrategia: si no hay variable, no
 * hay texto. Un valor por defecto escrito a mano se descubre en produccion, no en un test.
 */
import type { PdfStrategy } from '../../../domain/pdf-strategy';

/**
 * Los dos nombres viven UNICAMENTE como valores de este `Record`. Es un `Record` y no un
 * `switch`: si manana hay una tercera estrategia, esto no compila hasta que alguien le de su
 * variable.
 */
const ENV_VAR_BY_STRATEGY: Record<PdfStrategy, string> = {
  catalogo: 'CATALOG_PROMPT',
  formula: 'FORMULA_PROMPT',
};

/**
 * Vacia o solo-espacios cuenta como ausente. Devuelve el valor SIN recortar: un prompt puede
 * querer su salto de linea final.
 */
export function readStrategyPromptFromEnv(strategy: PdfStrategy): string {
  const name = ENV_VAR_BY_STRATEGY[strategy];
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') {
    throw new Error(`falta la variable de entorno ${name}`);
  }
  return raw;
}
