// QC-50 T25 — `update-order.test.ts` (R26): editar un pedido CAMBIANDO su receta a una que
// pertenece a OTRA empresa se rechaza con el MISMO codigo con el que ya se rechaza una receta
// inexistente, y no modifica ninguna fila.
//
// Igual que `create-order.test.ts`: archivo NUEVO y pequeno. `order-service.test.ts` ya cubre
// el resto de `updateOrder` (R20-R25, R33), incluida la excepcion de R25 -una receta YA en el
// pedido se acepta aunque este dada de baja, si no cambia-. Lo unico que anade QC-50 es que
// CAMBIAR la receta a una de otra empresa se rechaza igual que cambiarla a una inexistente o
// dada de baja: ningun codigo de error nuevo, ninguna firma publica distinta.

import { describe, expect, it, vi } from 'vitest';

import { RecipeNotFoundError, type PedidosError } from '@/lib/modules/pedidos/domain/errors';
import { createUpdateOrder } from '@/lib/modules/pedidos/domain/update-order';

import type { Actor } from '@/lib/modules/pedidos/domain/actor';
import type { OrderRow } from '@/lib/modules/pedidos/domain/order-view';
import type { OrderRepository } from '@/lib/modules/pedidos/ports/order-repository';
import type { RecipeCatalog, RecipeRef } from '@/lib/modules/recetas';

const EMPRESA_A = '33333333-3333-4333-8333-333333333333';
const EMPRESA_B = '44444444-4444-4444-8444-444444444444';

const ACTOR_A: Actor = {
  id: 'admin-a',
  companyId: EMPRESA_A,
  permissions: ['pedidos.consultar', 'pedidos.modificar'],
};

const ORDER_ID = '11111111-1111-4111-8111-111111111111';
const RECETA_DE_A = '22222222-2222-4222-8222-222222222222';
const RECETA_DE_B = '55555555-5555-4555-8555-555555555555';
const RECETA_INEXISTENTE = '99999999-9999-4999-8999-999999999999';

const AHORA = new Date('2026-09-16T10:00:00.000Z');

function filaExistente(): OrderRow {
  return {
    id: ORDER_ID,
    number: { year: 2026, sequence: 7 },
    recipeId: RECETA_DE_A,
    quantity: '10.0000',
    priority: 'BAJA',
    status: 'PENDIENTE',
    cancellationReason: null,
    ingredientsCost: null,
    createdAt: AHORA,
    updatedAt: AHORA,
    createdBy: 'admin-0',
    updatedBy: 'admin-0',
  };
}

/** Igual que en `create-order.test.ts`: una receta de otra empresa no vuelve, igual que una que
 *  no existe (contrato de `RecipeCatalog.findRefsIncludingDeleted`). */
function catalogoDeRecetas() {
  const recetas = new Map<string, { companyId: string; ref: RecipeRef }>([
    [RECETA_DE_A, { companyId: EMPRESA_A, ref: { id: RECETA_DE_A, name: 'Acido citrico 50%', isDeleted: false } }],
    [RECETA_DE_B, { companyId: EMPRESA_B, ref: { id: RECETA_DE_B, name: 'Formula de B', isDeleted: false } }],
  ]);
  const findRefsIncludingDeleted = vi.fn(async (ids: readonly string[], companyId: string) =>
    ids.flatMap((id) => {
      const guardado = recetas.get(id);
      return guardado !== undefined && guardado.companyId === companyId ? [guardado.ref] : [];
    }),
  );
  return { recipes: { findRefsIncludingDeleted } as unknown as RecipeCatalog, findRefsIncludingDeleted };
}

function repositorioDePedidos() {
  const findAliveById = vi.fn(async () => filaExistente());
  const updateAlive = vi.fn(async () => 'ok' as const);
  const explota = (nombre: string) =>
    vi.fn(() => {
      throw new Error(`${nombre} no deberia llamarse en este caso`);
    });
  const orders = {
    create: explota('create'),
    findAliveById,
    listAlive: explota('listAlive'),
    updateAlive,
    cancelAlive: explota('cancelAlive'),
    softDeleteAlive: explota('softDeleteAlive'),
  } as unknown as OrderRepository;
  return { orders, findAliveById, updateAlive };
}

async function codigoDelFallo(operacion: () => Promise<unknown>): Promise<string> {
  const error = await operacion().then(
    () => null,
    (e: unknown) => e,
  );
  expect(error, 'la operacion tenia que fallar').not.toBeNull();
  return (error as PedidosError).code;
}

const EDICION_HACIA_B = {
  recipeId: RECETA_DE_B,
  quantity: '10.0000',
  status: 'PENDIENTE' as const,
};

describe('QC-50 R26 — editar un pedido CAMBIANDO su receta a una de OTRA empresa se rechaza como inexistente', () => {
  it('receta de OTRA empresa -> `recipe_not_found`, el MISMO codigo que una receta inexistente, y no modifica ninguna fila', async () => {
    const cat = catalogoDeRecetas();
    const repo = repositorioDePedidos();
    const updateOrder = createUpdateOrder({ orders: repo.orders, recipes: cat.recipes, now: () => AHORA });

    const codigoAjena = await codigoDelFallo(() => updateOrder(ORDER_ID, EDICION_HACIA_B, ACTOR_A));

    expect(codigoAjena).toBe('recipe_not_found');
    expect(repo.updateAlive).not.toHaveBeenCalled();

    // NUNCA nace un codigo de error nuevo: es exactamente el mismo `RecipeNotFoundError` que ya
    // exigia una receta inexistente o dada de baja al cambiarla en la edicion (R25).
    const repo2 = repositorioDePedidos();
    await expect(
      createUpdateOrder({ orders: repo2.orders, recipes: cat.recipes, now: () => AHORA })(
        ORDER_ID,
        EDICION_HACIA_B,
        ACTOR_A,
      ),
    ).rejects.toBeInstanceOf(RecipeNotFoundError);

    // Indistinguible de una receta que no existe en absoluto: mismo `code`.
    const cat2 = catalogoDeRecetas();
    const repo3 = repositorioDePedidos();
    const errorInexistente = await createUpdateOrder({
      orders: repo3.orders,
      recipes: cat2.recipes,
      now: () => AHORA,
    })(ORDER_ID, { ...EDICION_HACIA_B, recipeId: RECETA_INEXISTENTE }, ACTOR_A).catch((e: unknown) => e);

    expect((errorInexistente as PedidosError).code).toBe(codigoAjena);
    expect((errorInexistente as Error).constructor.name).toBe(RecipeNotFoundError.name);
    expect(repo3.updateAlive).not.toHaveBeenCalled();
  });

  it('el catalogo recibe la empresa DEL ACTOR, nunca una empresa distinta', async () => {
    const cat = catalogoDeRecetas();
    const repo = repositorioDePedidos();
    const updateOrder = createUpdateOrder({ orders: repo.orders, recipes: cat.recipes, now: () => AHORA });

    await codigoDelFallo(() => updateOrder(ORDER_ID, EDICION_HACIA_B, ACTOR_A));

    expect(cat.findRefsIncludingDeleted).toHaveBeenCalledWith([RECETA_DE_B], EMPRESA_A);
  });

  it('CONTROL POSITIVO: cambiar a una receta de la PROPIA empresa se acepta y modifica la fila', async () => {
    const cat = catalogoDeRecetas();
    const repo = repositorioDePedidos();
    const updateOrder = createUpdateOrder({ orders: repo.orders, recipes: cat.recipes, now: () => AHORA });

    await updateOrder(ORDER_ID, { ...EDICION_HACIA_B, recipeId: RECETA_DE_A }, ACTOR_A);

    expect(repo.updateAlive).toHaveBeenCalledTimes(1);
  });

  it('CONTROL POSITIVO: no cambiar la receta ni siquiera pregunta al catalogo (R25, intacto)', async () => {
    const cat = catalogoDeRecetas();
    const repo = repositorioDePedidos();
    const updateOrder = createUpdateOrder({ orders: repo.orders, recipes: cat.recipes, now: () => AHORA });

    await updateOrder(ORDER_ID, { ...EDICION_HACIA_B, recipeId: RECETA_DE_A }, ACTOR_A);

    expect(cat.findRefsIncludingDeleted).not.toHaveBeenCalled();
    expect(repo.updateAlive).toHaveBeenCalledTimes(1);
  });
});
