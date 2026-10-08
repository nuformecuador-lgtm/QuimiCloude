// lib/modules/pedidos/domain/order-conditioning.ts
//
// Comenzar y Terminar el acondicionamiento sobre `OrderConditioningRepository`: cada uno comprueba
// su unica transicion y delega en el puerto. Sin unidad de trabajo: no tocan inventario.

import { assertTransition } from './order-transitions';

import type { OrderConditioningRepository } from '../ports/order-conditioning-repository';

export type ConditioningDeps = {
  readonly conditioning: OrderConditioningRepository;
};

export type StartConditioningAliveById = (
  id: string,
  companyId: string,
  conditionerId: string,
  now: Date,
) => ReturnType<OrderConditioningRepository['startConditioningAlive']>;

export type FinishConditioningAliveById = (
  id: string,
  companyId: string,
  conditionerId: string,
  now: Date,
) => ReturnType<OrderConditioningRepository['finishConditioningAlive']>;

export function createStartConditioning(deps: ConditioningDeps): StartConditioningAliveById {
  return async function startConditioningAliveById(id, companyId, conditionerId, now) {
    // Falla rapido si algun dia la matriz dejara de admitir la unica transicion de este metodo.
    assertTransition('POR_ACONDICIONAR', 'EN_ACONDICIONAMIENTO');
    return deps.conditioning.startConditioningAlive(id, conditionerId, now, { companyId });
  };
}

export function createFinishConditioning(deps: ConditioningDeps): FinishConditioningAliveById {
  return async function finishConditioningAliveById(id, companyId, conditionerId, now) {
    assertTransition('EN_ACONDICIONAMIENTO', 'TERMINADO');
    return deps.conditioning.finishConditioningAlive(id, conditionerId, now, { companyId });
  };
}
