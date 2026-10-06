import { convertQuantity, type UnitConversion } from './convert-quantity';
import { IncompatibleUnitsError } from './errors';
import type { UnitId } from './unit-catalog';

/** Las dos bases de sistema entre las que se admite cruzar masa y volumen a densidad 1. */
export type MassVolumeBridge = { readonly volumeBaseId: UnitId; readonly massBaseId: UnitId };

/** `approximate` es `true` cuando la cifra cruzo de masa a volumen o al reves. */
export type ConvertedQuantity = { readonly quantity: string; readonly approximate: boolean };

function baseOf(unit: UnitConversion): UnitId {
  return unit.baseUnitId ?? unit.id;
}

function baseRef(unit: UnitConversion): UnitConversion {
  return { id: baseOf(unit), baseUnitId: null, factor: null };
}

function crossesBridge(fromBase: UnitId, toBase: UnitId, bridge: MassVolumeBridge): boolean {
  return (
    (fromBase === bridge.volumeBaseId && toBase === bridge.massBaseId) ||
    (fromBase === bridge.massBaseId && toBase === bridge.volumeBaseId)
  );
}

/**
 * Convierte como `convertQuantity` y, si no comparten base pero una es la base de volumen y la
 * otra la de masa del puente, cruza tomando 1 ml por 1 g y marca el resultado como aproximado.
 *
 * @throws {IncompatibleUnitsError} si no comparten base ni las une el puente.
 */
export function convertWithApproximation(
  quantity: string,
  from: UnitConversion,
  to: UnitConversion,
  bridge: MassVolumeBridge | null,
): ConvertedQuantity {
  const fromBase = baseOf(from);
  const toBase = baseOf(to);

  if (fromBase === toBase) {
    return { quantity: convertQuantity(quantity, from, to), approximate: false };
  }

  if (bridge === null || !crossesBridge(fromBase, toBase, bridge)) {
    throw new IncompatibleUnitsError(`no se puede convertir ${from.id} a ${to.id}`);
  }

  const inFromBase = convertQuantity(quantity, from, baseRef(from));
  return { quantity: convertQuantity(inFromBase, baseRef(to), to), approximate: true };
}
