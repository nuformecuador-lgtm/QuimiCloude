/**
 * Fecha civil (`YYYY-MM-DD`).
 *
 * - `formatDateLocalISO` / `parseDateLocalISO`: hora LOCAL, para espejar un `Date` de calendario
 *   en un valor de formulario o de filtro. Ahí `toISOString()` desplazaría el día según el huso.
 * - `formatCivilDate`: hora UTC, para las celdas. Servidor y navegador tienen husos distintos y
 *   la hora local daría un desajuste de hidratación.
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

/** Fecha UTC del instante como `YYYY-MM-DD`. */
export function formatCivilDate(instant: Date): string {
  return instant.toISOString().slice(0, 10);
}
