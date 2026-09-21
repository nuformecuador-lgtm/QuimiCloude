import type { UnitRef } from '@/lib/modules/unidades';

/**
 * Agrupacion de unidades por su BASE EFECTIVA, para el selector de unidad de una linea de
 * receta (QC-26bis). Archivo PURO: sin React, sin DOM y sin peticiones -mismo criterio que
 * `recipe-form-state.ts`-, para que estas tres reglas se puedan probar sin montar nada.
 *
 * **El criterio de "mismo grupo" es el MISMO que el de convertibilidad** que ya define el
 * dominio de `unidades` en `domain/convert-quantity.ts`: dos unidades son del mismo grupo
 * cuando comparten base efectiva (`baseUnitId ?? id`). No se inventa aqui una segunda
 * definicion de "misma magnitud" -si manana la derivacion dejara de ser de un solo nivel, se
 * corrige en el dominio y esto lo hereda-.
 *
 * Este archivo NO llama a esa funcion y no la nombra a proposito: la guardia
 * `tests/guards/guard-conversion-sin-consumidores.test.ts` sostiene que la conversion sigue sin
 * consumidores (QC-76 R26), y agrupar por base efectiva no es convertir ninguna cantidad. Aqui
 * no se transforma ni un solo numero: se decide QUE unidades se ofrecen y CUAL queda elegida.
 *
 * **Los factores se comparan como TEXTO, digito a digito, nunca como `number`**: son
 * `decimal(14,4)` y pasarlos por coma flotante es justo lo que el resto de esta ruta evita.
 * Por eso aqui no hay `parseFloat(`, ni `Number(`, ni `toFixed(`.
 */

/** La base efectiva de una unidad: la que declara, o ella misma si no deriva de nadie. */
function effectiveBaseId(unit: UnitRef): string {
  return unit.baseUnitId ?? unit.id;
}

/** El factor efectivo de una unidad: el que declara, o `1` si es base. Siempre texto. */
function effectiveFactor(unit: UnitRef): string {
  return unit.factor ?? '1';
}

/**
 * Compara dos decimales POSITIVOS escritos como texto. Devuelve un negativo si `a < b`, un
 * positivo si `a > b` y cero si valen lo mismo.
 *
 * Se hace a mano y no con `Number(...)` a proposito: `0.0001` y `10000.0000` conviven en la
 * misma columna, y la comparacion tiene que ser exacta. La parte entera se compara primero por
 * LONGITUD -sin ceros a la izquierda, mas digitos es mayor- y luego lexicograficamente, que
 * para cadenas de digitos de igual longitud coincide con el orden numerico. La parte decimal se
 * rellena con ceros a la derecha hasta igualar longitudes y se compara igual.
 */
export function compareDecimalText(a: string, b: string): number {
  const [aInt = '', aFrac = ''] = a.split('.');
  const [bInt = '', bFrac = ''] = b.split('.');

  const aWhole = aInt.replace(/^0+(?=\d)/, '');
  const bWhole = bInt.replace(/^0+(?=\d)/, '');
  if (aWhole.length !== bWhole.length) return aWhole.length - bWhole.length;
  if (aWhole !== bWhole) return aWhole < bWhole ? -1 : 1;

  const width = Math.max(aFrac.length, bFrac.length);
  const aTail = aFrac.padEnd(width, '0');
  const bTail = bFrac.padEnd(width, '0');
  if (aTail === bTail) return 0;
  return aTail < bTail ? -1 : 1;
}

/**
 * Las unidades del grupo de `unitId`: las que comparten su base efectiva, incluida ella misma.
 *
 * **Cuando `unitId` es `null` o no esta en el catalogo, se devuelve el CATALOGO COMPLETO**
 * (decision del humano del 2026-09-08, reconfirmada el 2026-09-11 por QC-80 R23). Es el caso
 * del producto del que todavia no se sabe en que se mide y el de una linea precargada en
 * edicion, donde el detalle de la receta no trae la unidad del producto: en ninguno de los dos
 * se sabe de que magnitud se esta hablando, y recortar la lista a partir de un dato que no se
 * tiene esconderia unidades legitimas.
 *
 * **De donde viene ese `null`:** la unidad de un ingrediente sale de `ProductView.unitId`, la
 * unidad guardada y fija del producto. `null` quiere decir **«este producto todavia no tiene
 * unidad»**, y nunca «no se pudo leer». **Esta funcion no cambio ni una linea por eso**: lo que
 * ya hacia con `null` es exactamente lo que hace falta -catalogo entero, sin bloquear la linea
 * ni impedir guardar la receta-.
 */
export function unitsOfGroup(
  units: readonly UnitRef[],
  unitId: string | null,
): readonly UnitRef[] {
  if (unitId === null) return units;
  const anchor = units.find((unit) => unit.id === unitId);
  if (anchor === undefined) return units;

  const base = effectiveBaseId(anchor);
  return units.filter((unit) => effectiveBaseId(unit) === base);
}

/**
 * La unidad MAS PEQUENA de un grupo: la de menor factor efectivo -en `{g, kg}` es `g`, que es
 * la base y vale `1` frente a los `1000` de `kg`-. Desempate ESTABLE por `id` cuando dos
 * unidades declaran el mismo factor, para que el valor preseleccionado no dependa del orden en
 * que llego el catalogo. `null` si el grupo esta vacio.
 */
export function smallestUnit(group: readonly UnitRef[]): UnitRef | null {
  return group.reduce<UnitRef | null>((smallest, unit) => {
    if (smallest === null) return unit;
    const order = compareDecimalText(effectiveFactor(unit), effectiveFactor(smallest));
    if (order < 0) return unit;
    if (order > 0) return smallest;
    return unit.id < smallest.id ? unit : smallest;
  }, null);
}

/**
 * Que unidad debe quedar elegida cuando la linea pasa a tener el ingrediente cuya unidad es
 * `productUnitId`, partiendo de `currentUnitId` (cadena vacia si no habia ninguna).
 *
 * La regla, tal como la cerro el humano el 2026-09-08: **si la unidad ya elegida es del MISMO
 * grupo que la del ingrediente nuevo, SE MANTIENE**; si no, se cambia a la mas pequena del
 * grupo nuevo. Cambiar de "Acido citrico (kg)" a "Sosa (kg)" teniendo `g` puesto a mano no
 * pisa esa eleccion; cambiar a un ingrediente que se mide en litros si, porque `g` ya no
 * significa nada en esa linea.
 *
 * Devuelve cadena vacia solo si no hay ninguna unidad en el catalogo.
 */
export function resolveLineUnitId(
  units: readonly UnitRef[],
  productUnitId: string | null,
  currentUnitId: string,
): string {
  const group = unitsOfGroup(units, productUnitId);
  if (currentUnitId !== '' && group.some((unit) => unit.id === currentUnitId)) {
    return currentUnitId;
  }
  return smallestUnit(group)?.id ?? '';
}
