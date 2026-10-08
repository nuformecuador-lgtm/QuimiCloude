// tests/unit/asignaciones/start-packing.test.ts
import { describe, expect, it, vi } from 'vitest';

import { createStartPacking, type StartPackingDeps } from '@/lib/modules/asignaciones/domain/start-packing';
import {
  AsignacionesError,
  OrderNotFoundError,
  OrderNotPackableError,
  OrderPackingTakenError,
  OrderWithoutDistributionError,
  UnauthorizedError,
  ValidationError,
} from '@/lib/modules/asignaciones/domain/errors';

import type { Actor } from '@/lib/modules/asignaciones/domain/actor';
import type { NewExecutionEntry } from '@/lib/modules/asignaciones/domain/execution-entry';
import type { ExecutionWriters } from '@/lib/modules/asignaciones/ports/execution-transaction';

function uuid(seed: string): string {
  return `${seed.repeat(8)}-${seed.repeat(4)}-4${seed.repeat(3)}-8${seed.repeat(3)}-${seed.repeat(12)}`;
}

const EMPRESA = uuid('3');
const ANA = uuid('1');
const PEDIDO = uuid('7');
const OTRA_EMPRESA = uuid('9');
const AHORA = new Date('2026-09-25T12:00:00.000Z');

const ACTOR: Actor = { id: ANA, companyId: EMPRESA, permissions: ['empaque.modificar'] };

type Resultado = 'ok' | 'already_mine' | 'taken' | 'not_packable' | 'not_found' | 'without_distribution';

type Estado = { dentroDeRun: boolean; appendDentroDeRun: boolean | null; confirmada: boolean | null };

// [2026-10-06] `startPacking` escribe dentro de `transaction.run` con el `packing` atado a la
// transaccion. Los dobles registran si `append` se llamo DENTRO de `run` y si `run` confirmo
// (resolvio) o deshizo (lanzo): solo lo confirmado llega a `filas`.
function montar(
  resultado: Resultado,
  options?: { readonly appendFalla?: Error },
): {
  readonly deps: StartPackingDeps;
  readonly startPackingAliveById: ReturnType<typeof vi.fn>;
  readonly globalStartPackingAliveById: ReturnType<typeof vi.fn>;
  readonly run: ReturnType<typeof vi.fn>;
  readonly append: ReturnType<typeof vi.fn>;
  readonly depsAppend: ReturnType<typeof vi.fn>;
  readonly filas: NewExecutionEntry[];
  readonly estado: Estado;
} {
  const estado: Estado = { dentroDeRun: false, appendDentroDeRun: null, confirmada: null };
  const pendientes: NewExecutionEntry[] = [];
  const filas: NewExecutionEntry[] = [];

  const startPackingAliveById = vi.fn(async () => resultado);
  const append = vi.fn(async (entry: NewExecutionEntry) => {
    estado.appendDentroDeRun = estado.dentroDeRun;
    if (options?.appendFalla) throw options.appendFalla;
    pendientes.push(entry);
  });
  const writers = {
    orders: {},
    packing: { startPackingAliveById, finishPackingAliveById: vi.fn() },
    log: { append, findLastStepPosition: vi.fn(async () => null) },
  } as unknown as ExecutionWriters;

  const run = vi.fn(async (work: (w: ExecutionWriters) => Promise<unknown>) => {
    estado.dentroDeRun = true;
    try {
      const salida = await work(writers);
      filas.push(...pendientes);
      estado.confirmada = true;
      return salida;
    } catch (error) {
      estado.confirmada = false;
      throw error;
    } finally {
      estado.dentroDeRun = false;
    }
  });

  const globalStartPackingAliveById = vi.fn(async () => resultado);
  const depsAppend = vi.fn(async () => undefined);
  const deps = {
    orders: { startPackingAliveById: globalStartPackingAliveById },
    log: { append: depsAppend, findLastStepPosition: vi.fn(async () => null) },
    transaction: { run },
    now: () => AHORA,
  } as unknown as StartPackingDeps;
  return { deps, startPackingAliveById, globalStartPackingAliveById, run, append, depsAppend, filas, estado };
}

describe('startPacking — autorizacion (R13)', () => {
  it('actor ausente rechaza sin tocar ningun puerto', async () => {
    const { deps, startPackingAliveById } = montar('ok');
    const startPacking = createStartPacking(deps);

    await expect(startPacking(null, { orderId: PEDIDO })).rejects.toBeInstanceOf(AsignacionesError);
    expect(startPackingAliveById).not.toHaveBeenCalled();
  });

  it('actor sin conjunto de permisos rechaza sin tocar ningun puerto', async () => {
    const { deps, startPackingAliveById } = montar('ok');
    const startPacking = createStartPacking(deps);

    await expect(
      startPacking({ id: ANA, companyId: EMPRESA } as unknown as Actor, { orderId: PEDIDO }),
    ).rejects.toBeInstanceOf(AsignacionesError);
    expect(startPackingAliveById).not.toHaveBeenCalled();
  });

  it('actor con el conjunto vacio rechaza sin tocar ningun puerto', async () => {
    const { deps, startPackingAliveById } = montar('ok');
    const startPacking = createStartPacking(deps);

    await expect(startPacking({ id: ANA, companyId: EMPRESA, permissions: [] }, { orderId: PEDIDO })).rejects.toThrow(
      UnauthorizedError,
    );
    expect(startPackingAliveById).not.toHaveBeenCalled();
  });

  it('actor sin `empaque.modificar` -otro permiso cualquiera- rechaza sin tocar ningun puerto', async () => {
    const { deps, startPackingAliveById } = montar('ok');
    const startPacking = createStartPacking(deps);
    const actor: Actor = { id: ANA, companyId: EMPRESA, permissions: ['asignaciones.consultar'] };

    await expect(startPacking(actor, { orderId: PEDIDO })).rejects.toThrow(UnauthorizedError);
    expect(startPackingAliveById).not.toHaveBeenCalled();
  });

  it('la autorizacion corre ANTES que zod: entrada invalida con actor sin permiso sigue dando `unauthorized`', async () => {
    const { deps, startPackingAliveById } = montar('ok');
    const startPacking = createStartPacking(deps);

    await expect(startPacking({ id: ANA, companyId: EMPRESA, permissions: [] }, { orderId: 'no-es-uuid' })).rejects.toThrow(
      UnauthorizedError,
    );
    expect(startPackingAliveById).not.toHaveBeenCalled();
  });
});

describe('startPacking — R18: `ok` deja al actor como quien empaca', () => {
  it('llama al puerto con el pedido, la empresa, el actor y `now`, y resuelve sin error', async () => {
    const { deps, startPackingAliveById } = montar('ok');
    const startPacking = createStartPacking(deps);

    await expect(startPacking(ACTOR, { orderId: PEDIDO })).resolves.toBeUndefined();
    expect(startPackingAliveById).toHaveBeenCalledWith(PEDIDO, EMPRESA, ANA, expect.any(Date));
  });
});

describe('startPacking — R20: repetir Comenzar sobre el propio EN_EMPAQUE es exito', () => {
  it('`already_mine` resuelve sin error', async () => {
    const { deps } = montar('already_mine');
    const startPacking = createStartPacking(deps);

    await expect(startPacking(ACTOR, { orderId: PEDIDO })).resolves.toBeUndefined();
  });
});

describe('startPacking — R19, R20: tomado por otro', () => {
  it('`taken` rechaza con `order_packing_taken`', async () => {
    const { deps } = montar('taken');
    const startPacking = createStartPacking(deps);

    await expect(startPacking(ACTOR, { orderId: PEDIDO })).rejects.toBeInstanceOf(OrderPackingTakenError);
  });
});

describe('startPacking — R23: estado que no admite Comenzar', () => {
  it('`not_packable` rechaza con `order_not_packable`', async () => {
    const { deps } = montar('not_packable');
    const startPacking = createStartPacking(deps);

    await expect(startPacking(ACTOR, { orderId: PEDIDO })).rejects.toBeInstanceOf(OrderNotPackableError);
  });
});

describe('startPacking — R10: POR_EMPACAR sin ninguna linea de reparto', () => {
  it('`without_distribution` rechaza con `order_without_distribution`', async () => {
    const { deps } = montar('without_distribution');
    const startPacking = createStartPacking(deps);

    await expect(startPacking(ACTOR, { orderId: PEDIDO })).rejects.toBeInstanceOf(
      OrderWithoutDistributionError,
    );
  });
});

describe('startPacking — R24: no existe, esta de baja o es de otra empresa', () => {
  it('`not_found` rechaza con `order_not_found`', async () => {
    const { deps } = montar('not_found');
    const startPacking = createStartPacking(deps);

    await expect(startPacking(ACTOR, { orderId: PEDIDO })).rejects.toBeInstanceOf(OrderNotFoundError);
  });
});

describe('startPacking — R25: ningun puerto de inventario', () => {
  // [2026-10-06] Ganan `log` y `transaction` y nada mas: la lista sigue siendo exacta.
  it('R25, R42: las dependencias declaradas son solo `orders`, `log` y `transaction`', async () => {
    const { deps } = montar('ok');
    expect(Object.keys(deps).sort()).toEqual(['log', 'now', 'orders', 'transaction']);
  });
});

describe('startPacking — entrada', () => {
  it('un `orderId` que no es uuid rechaza con `invalid_input` sin tocar el puerto', async () => {
    const { deps, startPackingAliveById } = montar('ok');
    const startPacking = createStartPacking(deps);

    await expect(startPacking(ACTOR, { orderId: 'no-es-uuid' })).rejects.toThrow(ValidationError);
    expect(startPackingAliveById).not.toHaveBeenCalled();
  });
});

// [2026-10-06] Comenzar empaque anota `pack_start` dentro de la transaccion de la ejecucion.
describe('startPacking — R42: autorizacion antes de abrir la transaccion', () => {
  it('R42: sin `empaque.modificar` rechaza sin llamar a ningun doble y sin abrir la transaccion', async () => {
    const { deps, startPackingAliveById, globalStartPackingAliveById, run, append, depsAppend } = montar('ok');
    const startPacking = createStartPacking(deps);

    await expect(startPacking({ id: ANA, companyId: EMPRESA, permissions: [] }, { orderId: PEDIDO })).rejects.toThrow(
      UnauthorizedError,
    );
    await expect(startPacking(null, { orderId: PEDIDO })).rejects.toBeInstanceOf(AsignacionesError);

    expect(run).not.toHaveBeenCalled();
    expect(startPackingAliveById).not.toHaveBeenCalled();
    expect(globalStartPackingAliveById).not.toHaveBeenCalled();
    expect(append).not.toHaveBeenCalled();
    expect(depsAppend).not.toHaveBeenCalled();
  });

  it.each([
    [['asignaciones.consultar']],
    [['asignaciones.ejecutar']],
    [['asignaciones.consultar', 'asignaciones.ejecutar']],
  ] as const)('R42: %j sin `empaque.modificar` no basta', async (permisos) => {
    const { deps, startPackingAliveById, run, append } = montar('ok');
    const startPacking = createStartPacking(deps);

    await expect(
      startPacking({ id: ANA, companyId: EMPRESA, permissions: [...permisos] }, { orderId: PEDIDO }),
    ).rejects.toThrow(UnauthorizedError);
    expect(run).not.toHaveBeenCalled();
    expect(startPackingAliveById).not.toHaveBeenCalled();
    expect(append).not.toHaveBeenCalled();
  });
});

describe('startPacking — R42: empresa del actor y sin comprobacion de responsable', () => {
  it('R42: otra empresa responde lo mismo que un pedido inexistente y no deja ninguna fila', async () => {
    const otra = montar('not_found');
    const inexistente = montar('not_found');
    const actorDeOtra: Actor = { id: ANA, companyId: OTRA_EMPRESA, permissions: ['empaque.modificar'] };

    const errorOtra: unknown = await createStartPacking(otra.deps)(actorDeOtra, { orderId: PEDIDO }).catch(
      (e: unknown) => e,
    );
    const errorInexistente: unknown = await createStartPacking(inexistente.deps)(ACTOR, { orderId: uuid('8') }).catch(
      (e: unknown) => e,
    );

    expect(errorOtra).toBeInstanceOf(OrderNotFoundError);
    expect(errorInexistente).toBeInstanceOf(OrderNotFoundError);
    expect((errorOtra as OrderNotFoundError).code).toBe((errorInexistente as OrderNotFoundError).code);
    expect((errorOtra as Error).message).toBe((errorInexistente as Error).message);
    expect(otra.startPackingAliveById).toHaveBeenCalledWith(PEDIDO, OTRA_EMPRESA, ANA, AHORA);
    expect(otra.append).not.toHaveBeenCalled();
    expect(otra.filas).toEqual([]);
  });

  it('R42: la empresa no se acepta en la entrada', async () => {
    const { deps, run } = montar('ok');

    await expect(createStartPacking(deps)(ACTOR, { orderId: PEDIDO, companyId: OTRA_EMPRESA })).rejects.toThrow(
      ValidationError,
    );
    expect(run).not.toHaveBeenCalled();
  });

  it('R42: un actor con `empaque.modificar` NO asignado al pedido empaca y anota', async () => {
    const { deps, startPackingAliveById, filas } = montar('ok');
    const listOrderIdsByUserInCompany = vi.fn(async () => [] as string[]);
    const conAsignaciones = {
      ...deps,
      assignments: { listOrderIdsByUserInCompany },
    } as unknown as StartPackingDeps;

    await expect(createStartPacking(conAsignaciones)(ACTOR, { orderId: PEDIDO })).resolves.toBeUndefined();

    expect(listOrderIdsByUserInCompany).not.toHaveBeenCalled();
    expect(startPackingAliveById).toHaveBeenCalledTimes(1);
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({ action: 'pack_start', userId: ANA });
  });
});

describe('startPacking — R41, R5bis, R8: el exito deja una fila `pack_start`', () => {
  it('R41, R5bis, R8: `ok` deja UNA fila sin posicion ni motivo, con instante, pedido, persona y empresa', async () => {
    const { deps, filas, estado, run } = montar('ok');

    await createStartPacking(deps)(ACTOR, { orderId: PEDIDO });

    expect(run).toHaveBeenCalledTimes(1);
    expect(estado.confirmada).toBe(true);
    expect(filas).toEqual([
      { companyId: EMPRESA, orderId: PEDIDO, userId: ANA, occurredAt: AHORA, action: 'pack_start', stepPosition: null },
    ]);
    expect(filas[0]).not.toHaveProperty('reason');
  });

  it('R42: escribe con el `packing` y el `log` de la transaccion, nunca con los globales', async () => {
    const { deps, startPackingAliveById, globalStartPackingAliveById, depsAppend, estado } = montar('ok');

    await createStartPacking(deps)(ACTOR, { orderId: PEDIDO });

    expect(startPackingAliveById).toHaveBeenCalledWith(PEDIDO, EMPRESA, ANA, AHORA);
    expect(globalStartPackingAliveById).not.toHaveBeenCalled();
    expect(depsAppend).not.toHaveBeenCalled();
    expect(estado.appendDentroDeRun).toBe(true);
  });
});

describe('startPacking — R41: `already_mine` no anota', () => {
  it('R41: `already_mine` resuelve, sale de `run` sin abortar y deja CERO filas', async () => {
    const { deps, append, filas, estado } = montar('already_mine');

    await expect(createStartPacking(deps)(ACTOR, { orderId: PEDIDO })).resolves.toBeUndefined();

    expect(estado.confirmada).toBe(true);
    expect(append).not.toHaveBeenCalled();
    expect(filas).toEqual([]);
  });
});

describe('startPacking — R24: cualquier otro desenlace aborta sin fila y con el error de siempre', () => {
  it.each([
    ['taken', OrderPackingTakenError],
    ['without_distribution', OrderWithoutDistributionError],
    ['not_packable', OrderNotPackableError],
    ['not_found', OrderNotFoundError],
  ] as const)('R24: `%s` deshace la transaccion, no anota y rechaza con su error', async (resultado, Esperado) => {
    const { deps, append, filas, estado } = montar(resultado);

    await expect(createStartPacking(deps)(ACTOR, { orderId: PEDIDO })).rejects.toBeInstanceOf(Esperado);

    expect(estado.confirmada).toBe(false);
    expect(append).not.toHaveBeenCalled();
    expect(filas).toEqual([]);
  });

  it('R24: si `append` lanza, el error sale desde dentro de `run` y no queda ninguna fila', async () => {
    const fallo = new Error('append fallo');
    const { deps, run, filas, estado } = montar('ok', { appendFalla: fallo });

    await expect(createStartPacking(deps)(ACTOR, { orderId: PEDIDO })).rejects.toBe(fallo);

    expect(estado.appendDentroDeRun).toBe(true);
    expect(estado.confirmada).toBe(false);
    await expect(run.mock.results[0]!.value).rejects.toBe(fallo);
    expect(filas).toEqual([]);
  });
});
