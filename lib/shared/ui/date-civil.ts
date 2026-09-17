/**
 * Fecha civil (`YYYY-MM-DD`) en hora LOCAL, para componentes que espejan un `Date` de
 * calendario en un valor de formulario o de filtro.
 *
 * **Nunca `toISOString()`**: desplaza por huso horario y puede devolver el dia anterior o
 * siguiente segun la zona del navegador. Estas dos funciones son inversas exactas entre si,
 * siempre construyendo/leyendo en hora local con `getFullYear`/`getMonth`/`getDate`.
 */

/** Formatea una fecha como `YYYY-MM-DD` en hora local. Determinista, sin dependencias. */
export function formatDateLocalISO(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Inverso de `formatDateLocalISO`: construye la fecha en hora local, nunca en UTC. */
export function parseDateLocalISO(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}
