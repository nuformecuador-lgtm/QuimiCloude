// QC-141 T14 — La cobertura de VARIOS pedidos a la vez (`design.md > 5.1`, `> 10`; R35).
//
// Con un doble de `ReservationQueries` que CUENTA invocaciones: «una consulta por pagina, sin
// N+1» no se puede demostrar mirando el resultado -un resultado correcto sale igual con una
// consulta que con veinte-, asi que se afirma cuantas veces se llamo al puerto.

import { describe, expect, it, vi } from 'vitest';

import type { Actor } from '@/lib/modules/pedidos/domain/actor';
import { UnauthorizedError, ValidationError } from '@/lib/modules/pedidos/domain/errors';
import { createFindCoverage, type FindCoverageDeps } from '@/lib/modules/pedidos/domain/find-coverage';

import type { OrderCoverage, ReservationQueries } from '@/lib/modules/inventario';

const EMPRESA = '33333333-3333-4333-8333-333333333333';
const PEDIDO_A = '44444444-4444-4444-8444-444444444444';
const PEDIDO_B = '55555555-5555-4555-8555-555555555555';

const ADMIN: Actor = { id: 'admin-1', companyId: EMPRESA, permissions: ['pedidos.consultar'] };
const SIN_PERMISO: Actor = { id: 'sin-permiso-1', companyId: EMPRESA, permissions: [] };

type Dobles = {
  readonly deps: FindCoverageDeps;
  readonly findCoverageByOrderIds: ReturnType<typeof vi.fn>;
};

function montar(resultado: ReadonlyMap<string, OrderCoverage> = new Map()): Dobles {
  const findCoverageByOrderIds = vi.fn(async () => resultado);
  const reservations: ReservationQueries = { findCoverageByOrderIds };
  return { deps: { reservations }, findCoverageByOrderIds };
}

describe('R35 — permiso antes de tocar el puerto', () => {
  it('rechaza al actor sin permiso sin llamar a findCoverageByOrderIds', async () => {
    const { deps, findCoverageByOrderIds } = montar();
    const findCoverage = createFindCoverage(deps);

    await expect(findCoverage([PEDIDO_A], SIN_PERMISO)).rejects.toBeInstanceOf(UnauthorizedError);
    expect(findCoverageByOrderIds).not.toHaveBeenCalled();
  });

  it('rechaza al actor ausente sin llamar a findCoverageByOrderIds', async () => {
    const { deps, findCoverageByOrderIds } = montar();
    const findCoverage = createFindCoverage(deps);

    await expect(findCoverage([PEDIDO_A], null)).rejects.toBeInstanceOf(UnauthorizedError);
    expect(findCoverageByOrderIds).not.toHaveBeenCalled();
  });

  it('el permiso se mira ANTES de zod, incluso con entrada invalida', async () => {
    const { deps, findCoverageByOrderIds } = montar();
    const findCoverage = createFindCoverage(deps);

    await expect(findCoverage(['no-es-un-uuid'], SIN_PERMISO)).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
    expect(findCoverageByOrderIds).not.toHaveBeenCalled();
  });
});

describe('R35 — una sola consulta por pagina, sin N+1', () => {
  it('una pagina de varios pedidos cuesta UNA sola llamada al puerto', async () => {
    const respuesta = new Map<string, OrderCoverage>([
      [PEDIDO_A, 'full'],
      [PEDIDO_B, 'partial'],
    ]);
    const { deps, findCoverageByOrderIds } = montar(respuesta);
    const findCoverage = createFindCoverage(deps);

    const resultado = await findCoverage([PEDIDO_A, PEDIDO_B], ADMIN);

    expect(findCoverageByOrderIds).toHaveBeenCalledTimes(1);
    expect(resultado).toBe(respuesta);
  });

  it('los identificadores repetidos se deduplican antes de llegar al puerto', async () => {
    const { deps, findCoverageByOrderIds } = montar();
    const findCoverage = createFindCoverage(deps);

    await findCoverage([PEDIDO_A, PEDIDO_A, PEDIDO_A], ADMIN);

    expect(findCoverageByOrderIds).toHaveBeenCalledTimes(1);
    expect(findCoverageByOrderIds).toHaveBeenCalledWith(EMPRESA, [PEDIDO_A]);
  });

  it('la empresa sale del ACTOR y no de la entrada', async () => {
    const { deps, findCoverageByOrderIds } = montar();
    const findCoverage = createFindCoverage(deps);
    const otraEmpresa: Actor = { ...ADMIN, companyId: 'company-b' };

    await findCoverage([PEDIDO_A], otraEmpresa);

    expect(findCoverageByOrderIds).toHaveBeenCalledWith('company-b', [PEDIDO_A]);
  });
});

describe('R35 — lista vacia es exito, no error, y no toca el puerto', () => {
  it('una lista vacia devuelve un mapa vacio sin llamar a findCoverageByOrderIds', async () => {
    const { deps, findCoverageByOrderIds } = montar();
    const findCoverage = createFindCoverage(deps);

    const resultado = await findCoverage([], ADMIN);

    expect(resultado).toEqual(new Map());
    expect(findCoverageByOrderIds).not.toHaveBeenCalled();
  });
});

describe('R35 — la entrada que no cumple la forma se rechaza antes del puerto', () => {
  it('un identificador que no es uuid se rechaza con invalid_input', async () => {
    const { deps, findCoverageByOrderIds } = montar();
    const findCoverage = createFindCoverage(deps);

    await expect(findCoverage(['no-es-un-uuid'], ADMIN)).rejects.toBeInstanceOf(ValidationError);
    expect(findCoverageByOrderIds).not.toHaveBeenCalled();
  });

  it('una entrada que no es un array se rechaza con invalid_input', async () => {
    const { deps, findCoverageByOrderIds } = montar();
    const findCoverage = createFindCoverage(deps);

    await expect(findCoverage('no-es-un-array', ADMIN)).rejects.toBeInstanceOf(ValidationError);
    expect(findCoverageByOrderIds).not.toHaveBeenCalled();
  });
});
