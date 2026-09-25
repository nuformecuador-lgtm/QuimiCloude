// lib/modules/pedidos/domain/order-packing.ts
//
// Implementa `OrderCatalog['startPackingAliveById']` y `['finishPackingAliveById']` sobre
// `OrderPackingRepository` (`ports/order-packing-repository.ts`): cada uno delega en UN `UPDATE`
// condicional del adaptador, sin abrir la unidad de trabajo compartida con `inventario`.
// `asignaciones` solo conoce la firma del puerto, nunca este archivo.

import { assertTransition } from './order-transitions';

import type { OrderCatalog } from './order-catalog';

import type { OrderPackingRepository } from '../ports/order-packing-repository';

export type OrderPackingDeps = {
  readonly packing: OrderPackingRepository;
};

/** Firma exacta de `OrderCatalog['startPackingAliveById']`. */
export function createStartPacking(deps: OrderPackingDeps): OrderCatalog['startPackingAliveById'] {
  return async function startPackingAliveById(id, companyId, packerId, now) {
    // La unica transicion que alcanza este metodo: falla rapido si algun dia dejara de ser legal.
    assertTransition('POR_EMPACAR', 'EN_EMPAQUE');
    return deps.packing.startPackingAlive(id, packerId, now, { companyId });
  };
}

/** Firma exacta de `OrderCatalog['finishPackingAliveById']`. */
export function createFinishPacking(deps: OrderPackingDeps): OrderCatalog['finishPackingAliveById'] {
  return async function finishPackingAliveById(id, companyId, packerId, now) {
    assertTransition('EN_EMPAQUE', 'ENTREGADO');
    return deps.packing.finishPackingAlive(id, packerId, now, { companyId });
  };
}
