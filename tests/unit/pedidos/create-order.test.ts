// QC-50 T25 — `create-order.test.ts` (R26): crear un pedido cuya receta pertenece a OTRA
// empresa se rechaza con el MISMO codigo con el que ya se rechaza una receta inexistente, y no
// crea ninguna fila.
//
// Este archivo es NUEVO y deliberadamente pequeno: `tests/unit/pedidos/order-service.test.ts`
// ya cubre el resto de `createOrder` (R6, R8, R9, R10, R15, R16) con una receta inexistente o
// dada de baja; lo unico que QC-50 anade es el TERCER caso -receta de otra empresa-, y lo cierra
// reutilizando exactamente el mismo `RecipeNotFoundError`/`recipe_not_found` que ya existia
// (decision cerrada 6 de `requirements.md`: "no nace ningun codigo de error nuevo"). No se
// cambia ninguna firma publica de `pedidos` ni se toca ningun otro caso.
//
// El catalogo de recetas es la UNICA pieza nueva del doble: `findRefsIncludingDeleted(ids,
// companyId)` simplemente no devuelve la referencia cuando la receta pedida es de otra empresa
// -tal y como promete `RecipeCatalog` (`lib/modules/recetas/domain/recipe-catalog.ts`)-, y el
// caso de uso no puede distinguir eso de que el id no exista en absoluto.

import { describe, expect, it, vi } from 'vitest';

import { createCreateOrder } from '@/lib/modules/pedidos/domain/create-order';
import { RecipeNotFoundError, type PedidosError } from '@/lib/modules/pedidos/domain/errors';

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

const RECETA_DE_A = '22222222-2222-4222-8222-222222222222';
const RECETA_DE_B = '55555555-5555-4555-8555-555555555555';
const RECETA_INEXISTENTE = '99999999-9999-4999-8999-999999999999';

const AHORA = new Date('2026-09-16T10:00:00.000Z');

function filaCreada(): OrderRow {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    number: { year: 2026, sequence: 1 },
    recipeId: RECETA_DE_A,
    quantity: '10.0000',
    priority: 'BAJA',
    status: 'PENDIENTE',
    cancellationReason: null,
    ingredientsCost: null,
    createdAt: AHORA,
    updatedAt: AHORA,
    createdBy: ACTOR_A.id,
    updatedBy: ACTOR_A.id,
  };
}

/**
 * Catalogo de recetas ACOTADO a la empresa preguntada: una receta de otra empresa simplemente
 * no vuelve en la respuesta, igual que una que no existe -es el contrato que
 * `RecipeCatalog.findRefsIncludingDeleted` promete (QC-50 R25)-.
 */
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
  const create = vi.fn(async () => filaCreada());
  const explota = (nombre: string) =>
    vi.fn(() => {
      throw new Error(`${nombre} no deberia llamarse en este caso`);
    });
  const orders = {
    create,
    findAliveById: explota('findAliveById'),
    listAlive: explota('listAlive'),
    updateAlive: explota('updateAlive'),
    cancelAlive: explota('cancelAlive'),
    softDeleteAlive: explota('softDeleteAlive'),
  } as unknown as OrderRepository;
  return { orders, create };
}

async function codigoDelFallo(operacion: () => Promise<unknown>): Promise<string> {
  const error = await operacion().then(
    () => null,
    (e: unknown) => e,
  );
  expect(error, 'la operacion tenia que fallar').not.toBeNull();
  return (error as PedidosError).code;
}

describe('QC-50 R26 — crear un pedido con una receta de OTRA empresa se rechaza como inexistente', () => {
  it('receta de OTRA empresa -> `recipe_not_found`, el MISMO codigo que una receta inexistente, y no crea ninguna fila', async () => {
    const cat = catalogoDeRecetas();
    const repo = repositorioDePedidos();
    const createOrder = createCreateOrder({ orders: repo.orders, recipes: cat.recipes, now: () => AHORA });

    const codigoAjena = await codigoDelFallo(() =>
      createOrder({ recipeId: RECETA_DE_B, quantity: '10.0000' }, ACTOR_A),
    );

    expect(codigoAjena).toBe('recipe_not_found');
    expect(repo.create).not.toHaveBeenCalled();

    // NUNCA nace un codigo de error nuevo: es exactamente el mismo `RecipeNotFoundError` que ya
    // exigia una receta inexistente o dada de baja.
    const repo2 = repositorioDePedidos();
    await expect(
      createCreateOrder({ orders: repo2.orders, recipes: cat.recipes, now: () => AHORA })(
        { recipeId: RECETA_DE_B, quantity: '10.0000' },
        ACTOR_A,
      ),
    ).rejects.toBeInstanceOf(RecipeNotFoundError);

    // Indistinguible de una receta que no existe en absoluto: mismo `code`, mismo mensaje.
    const cat2 = catalogoDeRecetas();
    const repo3 = repositorioDePedidos();
    const errorInexistente = await createCreateOrder({
      orders: repo3.orders,
      recipes: cat2.recipes,
      now: () => AHORA,
    })({ recipeId: RECETA_INEXISTENTE, quantity: '10.0000' }, ACTOR_A).catch((e: unknown) => e);

    expect((errorInexistente as PedidosError).code).toBe(codigoAjena);
    expect((errorInexistente as Error).constructor.name).toBe(RecipeNotFoundError.name);
  });

  it('el catalogo recibe la empresa DEL ACTOR, nunca una empresa distinta', async () => {
    const cat = catalogoDeRecetas();
    const repo = repositorioDePedidos();
    const createOrder = createCreateOrder({ orders: repo.orders, recipes: cat.recipes, now: () => AHORA });

    await codigoDelFallo(() => createOrder({ recipeId: RECETA_DE_B, quantity: '10.0000' }, ACTOR_A));

    expect(cat.findRefsIncludingDeleted).toHaveBeenCalledWith([RECETA_DE_B], EMPRESA_A);
  });

  it('CONTROL POSITIVO: una receta de la PROPIA empresa se acepta y crea la fila', async () => {
    const cat = catalogoDeRecetas();
    const repo = repositorioDePedidos();
    const createOrder = createCreateOrder({ orders: repo.orders, recipes: cat.recipes, now: () => AHORA });

    const creado = await createOrder({ recipeId: RECETA_DE_A, quantity: '10.0000' }, ACTOR_A);

    expect(creado.id).toBe(filaCreada().id);
    expect(repo.create).toHaveBeenCalledTimes(1);
  });
});
