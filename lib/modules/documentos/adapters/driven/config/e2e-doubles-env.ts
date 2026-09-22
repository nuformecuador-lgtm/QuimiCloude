/**
 * La variable que decide si el modulo se cablea con sus dobles de prueba, leida EN EL MOMENTO DE LA
 * INVOCACION —dentro de una funcion, nunca al importar el modulo—, exactamente como el resto de
 * lectores de este directorio.
 *
 * Que se lea aqui y no en el top-level es lo que permite que el punto de composicion construya la
 * fachada sin leer una sola variable, y que la eleccion pueda cambiar dentro de un mismo proceso.
 *
 * **Su AUSENCIA significa los adaptadores reales.** Solo estar puesta y con algo dentro elige los
 * dobles: una variable que nadie puso no puede acabar guardando los PDF en un mapa en memoria.
 */

/** El nombre vive UNICAMENTE aqui, como cadena literal en posicion de valor. */
const E2E_DOUBLES_ENV_VAR_NAME = 'DOCUMENTS_E2E_DOUBLES';

/** Vacia o solo-espacios cuenta como ausente, igual que en los demas lectores del modulo. */
export function documentsE2EDoublesEnabled(): boolean {
  const raw = process.env[E2E_DOUBLES_ENV_VAR_NAME];
  return raw !== undefined && raw.trim() !== '';
}
