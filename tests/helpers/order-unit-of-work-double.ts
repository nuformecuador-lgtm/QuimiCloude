// Doble compartido de `OrderUnitOfWork` para los tests unitarios de `pedidos`.
//
// `run` invoca el trabajo DIRECTAMENTE con el `scope` que se le da, sin abrir ninguna
// transaccion real: eso es lo que corresponde a un test UNITARIO, que dobla los dos puertos de
// la transaccion (`OrderWriteRepository` de `pedidos`, `MaterialReservations` de `inventario`) y
// no habla con Postgres. La transaccion de verdad la prueba
// `tests/integration/pedidos/order-unit-of-work.int.test.ts`.
import { vi } from 'vitest';

import type {
  OrderTransactionScope,
  OrderUnitOfWork,
} from '@/lib/modules/pedidos/ports/order-unit-of-work';
import type { LockedOrderRow, OrderWriteRepository } from '@/lib/modules/pedidos/ports/order-write-repository';
import type {
  ConsumptionOutcome,
  FinishedGoodsIntake,
  FinishedGoodsOutcome,
  MaterialReservations,
  ProductRef,
  ReservationOutcome,
} from '@/lib/modules/inventario';
import type { MassVolumeBridge, UnitRef } from '@/lib/modules/unidades';

/** Un `OrderWriteRepository` que explota si se le llama un metodo que el test no espera: el
 *  patron de `explota()` que ya usan `create-order.test.ts` y compania, aplicado al puerto de
 *  escritura de la unidad de trabajo. */
export function fakeOrderWriteRepository(
  overrides: Partial<OrderWriteRepository> = {},
): OrderWriteRepository & Record<keyof OrderWriteRepository, ReturnType<typeof vi.fn>> {
  const explota = (nombre: string) =>
    vi.fn(() => {
      throw new Error(`OrderWriteRepository.${nombre} no deberia llamarse en este caso`);
    });
  return {
    lockAliveById: vi.fn(explota('lockAliveById')),
    create: vi.fn(explota('create')),
    updateAlive: vi.fn(explota('updateAlive')),
    cancelAlive: vi.fn(explota('cancelAlive')),
    softDeleteAlive: vi.fn(explota('softDeleteAlive')),
    setStatus: vi.fn(explota('setStatus')),
    setReservedAt: vi.fn(explota('setReservedAt')),
    setIngredientsCost: vi.fn(explota('setIngredientsCost')),
    finishPackingAlive: vi.fn(explota('finishPackingAlive')),
    findPresentationLinesForFinish: vi.fn(explota('findPresentationLinesForFinish')),
    ...overrides,
  } as unknown as OrderWriteRepository & Record<keyof OrderWriteRepository, ReturnType<typeof vi.fn>>;
}

/** Un `MaterialReservations` que por defecto aparta todo lo que se le pida y no falla nunca:
 *  quien necesite `insufficient` o `nothing_to_consume` lo pasa por `overrides`. */
export function fakeMaterialReservations(
  overrides: Partial<MaterialReservations> = {},
): MaterialReservations & Record<keyof MaterialReservations, ReturnType<typeof vi.fn>> {
  const syncForOrder = vi.fn(
    async (): Promise<ReservationOutcome> => ({ kind: 'reserved' }),
  );
  const releaseForOrder = vi.fn(async (): Promise<void> => undefined);
  const consumeForOrder = vi.fn(
    async (): Promise<ConsumptionOutcome> => ({ kind: 'consumed' }),
  );
  return {
    syncForOrder,
    releaseForOrder,
    consumeForOrder,
    ...overrides,
  } as unknown as MaterialReservations & Record<keyof MaterialReservations, ReturnType<typeof vi.fn>>;
}

/** El `OrderUnitOfWork` doble: `run` corre el trabajo con el `scope` dado, sin transaccion. */
export function fakeOrderUnitOfWork(scope: OrderTransactionScope): OrderUnitOfWork {
  return { run: (work) => work(scope) };
}

/** Un `FinishedGoodsIntake` que explota si se le llama: solo la transicion de Finalizar lo
 *  toca, y quien no espera esa llamada -crear, editar, cancelar, caducar- lo hereda sin
 *  personalizarlo.
 *  Quien SI la espera pasa su propio doble por `overrides`. */
export function fakeFinishedGoodsIntake(
  overrides: Partial<FinishedGoodsIntake> = {},
): FinishedGoodsIntake & Record<keyof FinishedGoodsIntake, ReturnType<typeof vi.fn>> {
  const receiveFromOrder = vi.fn(
    async (): Promise<FinishedGoodsOutcome> => {
      throw new Error('FinishedGoodsIntake.receiveFromOrder no deberia llamarse en este caso');
    },
  );
  return {
    receiveFromOrder,
    ...overrides,
  } as unknown as FinishedGoodsIntake & Record<keyof FinishedGoodsIntake, ReturnType<typeof vi.fn>>;
}

/** Lector de receta del `scope`, sobre el `tx`: por defecto una
 *  receta SIN lineas, para que quien no la personaliza obtenga una necesidad vacia y no un
 *  dato inventado. Quien necesite lineas concretas pasa su propio `RecipeCatalog` de dobles
 *  -el mismo que usa para `deps.recipes`- como `overrides`. */
export function fakeRecipeExecutionReader(
  overrides: Partial<OrderTransactionScope['recipes']> = {},
): OrderTransactionScope['recipes'] & Record<'findExecutionContentById', ReturnType<typeof vi.fn>> {
  const findExecutionContentById = vi.fn(async (id: string) => ({
    id,
    name: 'Receta',
    isDeleted: false,
    steps: [],
    lines: [],
  }));
  return {
    findExecutionContentById,
    ...overrides,
  } as OrderTransactionScope['recipes'] & Record<'findExecutionContentById', ReturnType<typeof vi.fn>>;
}

/** Productos del `scope`: por defecto ninguno resuelve, asi que cada linea de receta se trata
 *  como un insumo sin unidad y su necesidad no se convierte. */
export function fakeScopeProducts(
  refs: readonly ProductRef[] = [],
): OrderTransactionScope['products'] & Record<'findRefs', ReturnType<typeof vi.fn>> {
  const findRefs = vi.fn(async (ids: readonly string[]) => refs.filter((ref) => ids.includes(ref.id)));
  return { findRefs } as OrderTransactionScope['products'] & Record<'findRefs', ReturnType<typeof vi.fn>>;
}

/** Unidades del `scope`: por defecto un catalogo vacio y sin puente masa-volumen. */
export function fakeScopeUnits(
  refs: readonly UnitRef[] = [],
  bridge: MassVolumeBridge | null = null,
): OrderTransactionScope['units'] & Record<'findRefs' | 'findMassVolumeBridge', ReturnType<typeof vi.fn>> {
  const findRefs = vi.fn(async (ids: readonly string[]) => refs.filter((ref) => ids.includes(ref.id)));
  const findMassVolumeBridge = vi.fn(async () => bridge);
  return { findRefs, findMassVolumeBridge } as OrderTransactionScope['units'] &
    Record<'findRefs' | 'findMassVolumeBridge', ReturnType<typeof vi.fn>>;
}

/** Combina los puertos del `scope` y la unidad de trabajo que los expone, lista para
 *  inyectar en `CreateOrderDeps.unitOfWork`, etc. */
export function fakeUnitOfWork(overrides: {
  readonly orders?: Partial<OrderWriteRepository>;
  readonly reservations?: Partial<MaterialReservations>;
  readonly recipes?: Partial<OrderTransactionScope['recipes']>;
  readonly finishedGoods?: Partial<FinishedGoodsIntake>;
  readonly products?: OrderTransactionScope['products'];
  readonly units?: OrderTransactionScope['units'];
} = {}): {
  readonly unitOfWork: OrderUnitOfWork;
  readonly orders: OrderWriteRepository & Record<keyof OrderWriteRepository, ReturnType<typeof vi.fn>>;
  readonly reservations: MaterialReservations &
    Record<keyof MaterialReservations, ReturnType<typeof vi.fn>>;
  readonly recipes: OrderTransactionScope['recipes'] & Record<'findExecutionContentById', ReturnType<typeof vi.fn>>;
  readonly finishedGoods: FinishedGoodsIntake & Record<keyof FinishedGoodsIntake, ReturnType<typeof vi.fn>>;
  readonly products: OrderTransactionScope['products'];
  readonly units: OrderTransactionScope['units'];
} {
  const orders = fakeOrderWriteRepository(overrides.orders);
  const reservations = fakeMaterialReservations(overrides.reservations);
  const recipes = fakeRecipeExecutionReader(overrides.recipes);
  const finishedGoods = fakeFinishedGoodsIntake(overrides.finishedGoods);
  const products = overrides.products ?? fakeScopeProducts();
  const units = overrides.units ?? fakeScopeUnits();
  return {
    unitOfWork: fakeOrderUnitOfWork({ orders, reservations, recipes, finishedGoods, products, units }),
    orders,
    reservations,
    recipes,
    finishedGoods,
    products,
    units,
  };
}

/** Fila minima de `OrderWriteRepository.lockAliveById`: los tests que no la personalizan usan
 *  esta, para no repetir los campos de `LockedOrderRow` en cada archivo. `reservedAt` por
 *  defecto queda DENTRO del plazo (anterior a `AHORA` de los tests), como un pedido con material
 *  apartado hace rato. */
export function fakeOrderRow(overrides: Partial<LockedOrderRow> = {}): LockedOrderRow {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    number: { year: 2026, sequence: 1 },
    recipeId: '22222222-2222-4222-8222-222222222222',
    quantity: '10.0000',
    priority: 'BAJA',
    status: 'PENDIENTE',
    cancellationReason: null,
    ingredientsCost: null,
    createdAt: new Date('2026-01-02T03:04:05.000Z'),
    updatedAt: new Date('2026-01-02T03:04:05.000Z'),
    createdBy: 'admin-0',
    updatedBy: 'admin-0',
    presentationLines: [],
    unitId: null,
    customerId: null,
    reservedAt: new Date('2026-01-02T03:04:05.000Z'),
    packagingCost: null,
    ...overrides,
  };
}
