import type { PackageUnitSource, UnitCatalog } from '@/lib/modules/unidades';

import { requirePermission, type Actor } from './actor';
import { ActionNotAllowedError, ProductNotFoundError, ValidationError } from './errors';
import {
  createProductSchema,
  type CreateProductInput,
} from './product-input';
import { PRODUCT_TYPES, type ProductType } from './product-type';
import { deriveUnitCost } from './unit-cost';

import type { NewProductBatch } from './product-batch';
import type { NewProduct } from './product-view';
import type { StockIncreaseListener } from './stock-increase-listener';
import type { ProductRepository } from '../ports/product-repository';

export type CreateProductDeps = {
  readonly products: ProductRepository;
  /** Recibe el aviso despues de escribir el lote. Sin el, el alta no avisa a nadie. */
  readonly stockIncreases?: StockIncreaseListener;
  /** De donde sale la unidad en que se cuentan los envases. Sin ella, el alta de un envase falla. */
  readonly packageUnit?: PackageUnitSource;
  /** Comprueba la unidad del alta de insumo. Sin el, el alta de un insumo falla. */
  readonly units?: Pick<UnitCatalog, 'findRefs'>;
  /** Inyectable para que los tests fijen el instante sin tocar el reloj global. */
  readonly now?: () => Date;
};

type EntradaConLote = Extract<CreateProductInput, { type: (typeof PRODUCT_TYPES)[keyof typeof PRODUCT_TYPES] }>;

/**
 * El unitario recibido prevalece y no se compara con el total: `total / existencia` redondea a 4
 * decimales, y una discrepancia de un centimo seria un rechazo que nadie puede corregir.
 * MACHINE puede omitir ambos costos: entonces devuelve `null` (la columna es anulable).
 */
function resolverCostoUnitario(entrada: EntradaConLote): string | null {
  if (entrada.unitCost != null) return entrada.unitCost;
  if (entrada.totalCost == null) {
    if (entrada.type === PRODUCT_TYPES.MACHINE) return null;
    throw new ValidationError();
  }

  const derivado = deriveUnitCost(entrada.totalCost, entrada.stock);
  if (derivado === null) throw new ValidationError();

  return derivado;
}

/**
 * En UTC y no en la zona del servidor: el adaptador escribe la fecha a medianoche UTC y la
 * migracion la rellena con `created_at AT TIME ZONE 'UTC'`. Con la zona local, la misma alta daria
 * dos «hoy» distintos segun la maquina.
 */
function fechaCivilUtc(instante: Date): string {
  return instante.toISOString().slice(0, 10);
}

/**
 * La comparacion es entre cadenas `YYYY-MM-DD`: con ancho fijo el orden lexicografico es el del
 * calendario y no se convierte ninguna fecha a instante, que es por donde entra el corrimiento de
 * dia. La no-futuridad se comprueba aqui y no en el esquema porque el esquema no tiene el reloj.
 */
function rechazarFechaFutura(purchaseDate: string, instante: Date): void {
  const hoy = fechaCivilUtc(instante);
  if (purchaseDate > hoy) {
    throw new ValidationError(`purchaseDate: fecha de compra futura (${purchaseDate} > ${hoy})`);
  }
}

function resolverFechaDeCompra(entrada: EntradaConLote, instante: Date): string {
  if (entrada.purchaseDate == null) return fechaCivilUtc(instante);
  rechazarFechaFutura(entrada.purchaseDate, instante);
  return entrada.purchaseDate;
}

/**
 * Es la unica alta de producto.
 *
 * Los tres tipos (PRODUCT / MACHINE / PACKAGING) crean producto + primer lote (o agrega lote
 * a producto existente). `purchaseDate` vive solo en el lote.
 *
 * El permiso va antes de zod, del reloj y del puerto: un actor sin permiso no dispara nada.
 * La fecha de compra se resuelve antes de tocar el puerto, asi una fecha futura se rechaza sin
 * consultar el nombre ni escribir.
 */
export function createCreateProduct(
  deps: CreateProductDeps,
): (input: unknown, actor: Actor | null | undefined) => Promise<{ id: string; lot?: string }> {
  const now = deps.now ?? (() => new Date());

  return async function createProduct(
    input: unknown,
    actor: Actor | null | undefined,
  ): Promise<{ id: string; lot?: string }> {
    requirePermission(actor, 'inventario.modificar');

    // La empresa sale del actor y nunca de la entrada, para que nadie pueda escribir en otra.
    const scope = { companyId: actor.companyId };

    const parsed = createProductSchema.safeParse(input);
    if (!parsed.success) throw new ValidationError();
    const entrada = parsed.data;

    // Un solo reloj para la fecha de compra y `created_at`.
    const instante = now();

    const purchaseDate = resolverFechaDeCompra(entrada, instante);

    if (entrada.type === PRODUCT_TYPES.PACKAGING) {
      return createPackaging(deps, entrada, actor, instante, purchaseDate, scope);
    }

    if (entrada.type === PRODUCT_TYPES.PRODUCT) {
      return createSupply(deps, entrada, actor, instante, purchaseDate, scope);
    }

    const batch: NewProductBatch = {
      presentationId: entrada.presentationId ?? null,
      stock: entrada.stock,
      unitCost: resolverCostoUnitario(entrada),
      lot: entrada.lot ?? null,
      expiryDate: entrada.expiryDate ?? null,
      purchaseDate,
      createdBy: actor.id,
    };

    // Normalizar el nombre, filtrar los borrados y resolver la unidad de la presentacion es
    // del adaptador. Sin presentacion, busca solo por nombre entre los vivos.
    const existente = await deps.products.findAliveIdByNameInPresentationUnit(
      entrada.name,
      entrada.presentationId ?? null,
      scope,
    );

    // El instrumento no declara qtyAlert: el producto se queda en null.
    return addOrCreate(deps, existente, { name: entrada.name, type: PRODUCT_TYPES.MACHINE }, batch, instante, scope);
  };
}

type Scope = { readonly companyId: string };

/** Homonimo vivo: se le agrega el lote. Sin el: producto y lote nacen juntos. */
async function addOrCreate(
  deps: CreateProductDeps,
  existente: { id: string; type: ProductType } | null,
  producto: NewProduct,
  batch: NewProductBatch,
  instante: Date,
  scope: Scope,
): Promise<{ id: string; lot?: string }> {
  if (existente !== null) {
    // El homonimo vivo es un producto terminado. Se rechaza aqui, antes de tocar el
    // puerto, y `addBatchToAlive` lo vuelve a comprobar bajo la fila bloqueada para cerrar la
    // carrera con un alta que naciera terminada entre esta lectura y esa escritura.
    if (existente.type === PRODUCT_TYPES.FINISHED_PRODUCT) throw new ActionNotAllowedError();

    // Solo viaja el lote: el nombre, la existencia y la alerta del panel se ignoran en este camino.
    const agregado = await deps.products.addBatchToAlive(existente.id, batch, instante, scope);

    if (agregado === 'finished_product') throw new ActionNotAllowedError();
    if (agregado === null) throw new ProductNotFoundError(existente.id);

    await deps.stockIncreases?.onStockIncreased({ companyId: scope.companyId, now: instante });
    return { id: existente.id, lot: agregado.lot };
  }

  // Una sola operacion del puerto para producto y lote, para que el dominio no pueda dejar
  // escrita solo la mitad.
  const creado = await deps.products.createWithFirstBatch(producto, batch, instante, scope);
  await deps.stockIncreases?.onStockIncreased({ companyId: scope.companyId, now: instante });
  return { id: creado.id, lot: creado.lot };
}

type EntradaInsumo = Extract<CreateProductInput, { type: typeof PRODUCT_TYPES.PRODUCT }>;

/**
 * El insumo se cuenta en la unidad que se elige al darlo de alta y sus lotes no llevan
 * presentacion. La unidad se comprueba antes de buscar el homonimo: una de otra empresa no
 * puede servir ni para encontrarlo.
 */
async function createSupply(
  deps: CreateProductDeps,
  entrada: EntradaInsumo,
  actor: Actor,
  instante: Date,
  purchaseDate: string,
  scope: Scope,
): Promise<{ id: string; lot?: string }> {
  if (deps.units === undefined) {
    throw new Error('alta de insumo sin el catalogo de unidades: falta el cableado');
  }

  const batch: NewProductBatch = {
    presentationId: null,
    stock: entrada.stock,
    unitCost: resolverCostoUnitario(entrada),
    lot: entrada.lot ?? null,
    expiryDate: entrada.expiryDate ?? null,
    purchaseDate,
    createdBy: actor.id,
  };

  const visibles = await deps.units.findRefs([entrada.unitId], scope.companyId);
  if (!visibles.some((unidad) => unidad.id === entrada.unitId)) {
    throw new ValidationError('unitId: la unidad no existe o no es visible para la empresa');
  }

  const existente = await deps.products.findAliveIdByNameInUnit(entrada.name, entrada.unitId, scope);

  return addOrCreate(
    deps,
    existente,
    { name: entrada.name, qtyAlert: entrada.qtyAlert, type: PRODUCT_TYPES.PRODUCT, unitId: entrada.unitId },
    batch,
    instante,
    scope,
  );
}
type EntradaEnvase = Extract<CreateProductInput, { type: typeof PRODUCT_TYPES.PACKAGING }>;

/**
 * El envase lleva su presentacion en el producto y cuenta su existencia en la unidad de envases;
 * sus lotes no llevan presentacion. Un homonimo vivo con otra presentacion se rechaza: la
 * presentacion de un envase no cambia.
 */
async function createPackaging(
  deps: CreateProductDeps,
  entrada: EntradaEnvase,
  actor: Actor,
  instante: Date,
  purchaseDate: string,
  scope: { readonly companyId: string },
): Promise<{ id: string; lot?: string }> {
  const batch: NewProductBatch = {
    presentationId: null,
    stock: entrada.stock,
    unitCost: resolverCostoUnitario(entrada),
    lot: entrada.lot ?? null,
    expiryDate: null,
    purchaseDate,
    createdBy: actor.id,
  };

  const existente = await deps.products.findAlivePackagingByName(entrada.name, scope);
  if (existente !== null) {
    if (existente.presentationId !== entrada.presentationId) throw new ActionNotAllowedError();

    const agregado = await deps.products.addBatchToAlive(existente.id, batch, instante, scope, {
      presentationId: entrada.presentationId,
    });
    if (agregado === 'finished_product') throw new ActionNotAllowedError();
    if (agregado === null) throw new ProductNotFoundError(existente.id);

    await deps.stockIncreases?.onStockIncreased({ companyId: scope.companyId, now: instante });
    return { id: existente.id, lot: agregado.lot };
  }

  const unitId = await deps.packageUnit?.findPackageUnitId();
  if (unitId === undefined || unitId === null) {
    throw new Error('alta de envase sin la unidad de sistema de envases: falta la siembra o el cableado');
  }

  const creado = await deps.products.createWithFirstBatch(
    { name: entrada.name, qtyAlert: entrada.qtyAlert, type: PRODUCT_TYPES.PACKAGING },
    batch,
    instante,
    scope,
    { presentationId: entrada.presentationId, unitId },
  );
  await deps.stockIncreases?.onStockIncreased({ companyId: scope.companyId, now: instante });
  return { id: creado.id, lot: creado.lot };
}
