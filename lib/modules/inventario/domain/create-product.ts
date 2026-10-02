import { requirePermission, type Actor } from './actor';
import { ActionNotAllowedError, ProductNotFoundError, ValidationError } from './errors';
import {
  createProductSchema,
  type CreateProductInput,
} from './product-input';
import { PRODUCT_TYPES } from './product-type';
import { deriveUnitCost } from './unit-cost';

import type { NewProductBatch } from './product-batch';
import type { NewProduct } from './product-view';
import type { StockIncreaseListener } from './stock-increase-listener';
import type { ProductRepository } from '../ports/product-repository';

export type CreateProductDeps = {
  readonly products: ProductRepository;
  /** Recibe el aviso despues de escribir el lote. Sin el, el alta no avisa a nadie. */
  readonly stockIncreases?: StockIncreaseListener;
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

    // PACKAGING no tiene expiryDate; PRODUCT y MACHINE si (la unión discriminada estrecha por `type`).
    const expiryDate = entrada.type === PRODUCT_TYPES.PACKAGING ? null : entrada.expiryDate ?? null;

    const batch: NewProductBatch = {
      presentationId: entrada.presentationId ?? null,
      stock: entrada.stock,
      unitCost: resolverCostoUnitario(entrada),
      lot: entrada.lot ?? null,
      expiryDate,
      purchaseDate,
      createdBy: actor.id,
    };

    // Normalizar el nombre, filtrar los borrados y resolver la unidad de la presentacion es
    // del adaptador: busca por nombre Y unidad, no por nombre solo. Sin presentacion (MACHINE),
    // busca solo por nombre entre los vivos.
    const existente = await deps.products.findAliveIdByNameInPresentationUnit(
      entrada.name,
      entrada.presentationId ?? null,
      scope,
    );

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
    // escrita solo la mitad. El producto no lleva unidad: la declara la presentacion del lote.
    // MACHINE no declara qtyAlert en el borde: la clave no viaja y el producto se queda en null.
    const producto: NewProduct =
      entrada.type === PRODUCT_TYPES.MACHINE
        ? { name: entrada.name, type: PRODUCT_TYPES.MACHINE }
        : { name: entrada.name, qtyAlert: entrada.qtyAlert, type: entrada.type };

    const creado = await deps.products.createWithFirstBatch(producto, batch, instante, scope);
    await deps.stockIncreases?.onStockIncreased({ companyId: scope.companyId, now: instante });
    return { id: creado.id, lot: creado.lot };
  };
}