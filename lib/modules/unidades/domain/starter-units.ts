// lib/modules/unidades/domain/starter-units.ts
export type StarterUnit = { readonly name: string; readonly symbol: string | null };

/** Conjunto arrancador (decision cerrada 9). Los nombres van en minuscula y «unidad» NO lleva
 *  simbolo: es el caso que estrena el simbolo opcional (R3). Posicion por defecto de
 *  `design.md > 6`, pendiente de confirmacion (requirements.md > pregunta abierta 4). */
export const STARTER_UNITS: readonly StarterUnit[] = [
  { name: 'kilogramo', symbol: 'kg' },
  { name: 'gramo', symbol: 'g' },
  { name: 'litro', symbol: 'L' },
  { name: 'mililitro', symbol: 'mL' },
  { name: 'unidad', symbol: null },
];
