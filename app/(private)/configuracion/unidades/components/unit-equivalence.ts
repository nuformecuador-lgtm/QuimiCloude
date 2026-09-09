import type { UnitRef, UnitView } from '@/lib/modules/unidades';

/**
 * La frase de equivalencia de una fila (R17; `design.md > 4`).
 *
 * **Funciones PURAS, sin DOM y sin React a proposito.** La columna de equivalencia no es un campo
 * del catalogo: es una frase compuesta por dos campos de la propia unidad y por el nombre de otra
 * unidad, resuelto en la pantalla porque el modelo `Unit` no declara relacion Prisma para
 * `baseUnitId` y la proyeccion no puede traerlo (`design.md > 2.3`). Al ser puras, R17 —incluido
 * su caso degradado— se prueba sin montar la pantalla.
 *
 * **El factor NUNCA se convierte a punto flotante en este camino** (R1). Viaja como texto decimal
 * desde el adaptador y se presenta como texto: `unidades` es el unico modulo del ERP que decidio
 * no tener coma flotante, y la capa que lo pinta no la reintroduce por comodidad. Quitar los ceros
 * de relleno de la derecha es manipulacion de cadena, no aritmetica.
 */

/**
 * Marcador de «aqui no hay equivalencia que mostrar». **Una sola constante para los DOS casos**
 * —unidad base y unidad derivada cuya base no se pudo resolver— porque el usuario no tiene por
 * que distinguirlos: en ambos la celda no dice nada, y en el segundo la fila se pinta igual en vez
 * de romperse (R17). Es constante exportada y no un literal suelto para que los tests puedan
 * afirmar sobre ella sin escribir copy (R49).
 */
export const NO_EQUIVALENCE_LABEL = '—';

/**
 * Quita los ceros de relleno a la derecha de un decimal en texto: `'1000.0000'` -> `'1000'`,
 * `'0.5000'` -> `'0.5'`, `'1.2340'` -> `'1.234'`.
 *
 * La columna `factor` es `Decimal(14,4)`, asi que la base de datos devuelve SIEMPRE cuatro
 * decimales y sin esto la lista diria «1 kg = 1000.0000 gr». Se canonicaliza aqui, y no confiando
 * en como serialice el decimal el adaptador, para que la presentacion no dependa del formato de
 * salida de una libreria (`design.md > 2.1`).
 *
 * Un texto sin parte decimal se devuelve tal cual, y un texto que sea todo ceros a la derecha del
 * punto pierde tambien el punto (`'2.0000'` -> `'2'`).
 */
export function formatFactor(factor: string): string {
  if (!factor.includes('.')) return factor;

  const sinCerosFinales = factor.replace(/0+$/, '');
  return sinCerosFinales.endsWith('.') ? sinCerosFinales.slice(0, -1) : sinCerosFinales;
}

/**
 * Como se nombra una unidad dentro de la frase: por su **simbolo**, o por su **nombre** si no
 * declara simbolo (R17). `symbol` es `null` cuando la unidad no lo tiene (`UnitRef`), y un simbolo
 * en blanco se trata como ausente: `'1  = 1000 gr'` seria una frase rota.
 */
export function unitLabel(unit: Pick<UnitRef, 'name' | 'symbol'>): string {
  const symbol = unit.symbol?.trim() ?? '';
  return symbol === '' ? unit.name : symbol;
}

/**
 * La celda de equivalencia de una unidad (R17):
 *
 * - unidad **base** (`baseUnitId === null`) -> el marcador neutro;
 * - unidad **derivada** con su base resuelta -> `1 kg = 1000 gr`;
 * - unidad **derivada sin base resuelta** —la base cayo fuera del catalogo acotado a `MAX_UNITS`,
 *   o la segunda lectura de la seccion fallo (`design.md > 5.3`)— -> el mismo marcador neutro.
 *   **No lanza y no deja la fila sin pintar**: es el caso degradado que R17 obliga a escribir en
 *   vez de suponer que no pasa.
 *
 * `base` llega como `undefined` justamente en ese ultimo caso, que es lo que devuelve un indice
 * `id -> unidad` cuando la clave no esta.
 */
export function formatUnitEquivalence(
  unit: Pick<UnitView, 'name' | 'symbol' | 'baseUnitId' | 'factor'>,
  base: Pick<UnitRef, 'name' | 'symbol'> | undefined,
): string {
  // Los dos campos de la equivalencia van juntos o ninguno (R1): si faltara cualquiera de ellos no
  // hay frase que armar. Se comprueban los dos y no solo `baseUnitId` porque esta capa presenta lo
  // que recibe y no da por hecho que el emisor cumpla la invariante.
  if (unit.baseUnitId === null || unit.factor === null) return NO_EQUIVALENCE_LABEL;
  if (base === undefined) return NO_EQUIVALENCE_LABEL;

  return `1 ${unitLabel(unit)} = ${formatFactor(unit.factor)} ${unitLabel(base)}`;
}
