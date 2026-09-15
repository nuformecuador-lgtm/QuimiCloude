import { requirePermission, type Actor } from './actor';
import { ProductNotFoundError, ValidationError } from './errors';
import {
  createProductWithFirstBatchSchema,
  type CreateProductWithFirstBatchInput,
} from './product-batch-input';
import { deriveUnitCost } from './unit-cost';

import type { NewProductBatch } from './product-batch';
import type { NewProduct } from './product-view';
import type { ProductRepository } from '../ports/product-repository';

export type CreateProductDeps = {
  readonly products: ProductRepository;
  /** Inyectable para que los tests fijen el instante sin tocar el reloj global. */
  readonly now?: () => Date;
};

type EntradaValidada = CreateProductWithFirstBatchInput;

/**
 * El unitario recibido prevalece y no se compara con el total: `total / existencia` redondea a 4
 * decimales, y una discrepancia de un centimo seria un rechazo que nadie puede corregir.
 *
 * El esquema ya rechaza la derivacion nula; se repite aqui porque sin esta rama el `null` se
 * colaria en el lote.
 */
function resolverCostoUnitario(entrada: EntradaValidada): string {
  if (entrada.unitCost != null) return entrada.unitCost;

  if (entrada.totalCost == null) throw new ValidationError();

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
function resolverFechaDeCompra(entrada: EntradaValidada, instante: Date): string {
  const hoy = fechaCivilUtc(instante);

  if (entrada.purchaseDate == null) return hoy;

  if (entrada.purchaseDate > hoy) {
    throw new ValidationError(`purchaseDate: fecha de compra futura (${entrada.purchaseDate} > ${hoy})`);
  }

  return entrada.purchaseDate;
}

/**
 * Es la unica alta de producto: una segunda podria crear un producto sin lote.
 *
 * El permiso va antes de zod, del reloj y del puerto: un actor sin permiso no dispara nada. La
 * fecha de compra se resuelve antes de tocar el puerto, asi una fecha futura se rechaza sin
 * consultar el nombre ni escribir.
 */
export function createCreateProduct(
  deps: CreateProductDeps,
): (input: unknown, actor: Actor | null | undefined) => Promise<{ id: string }> {
  const now = deps.now ?? (() => new Date());

  return async function createProduct(
    input: unknown,
    actor: Actor | null | undefined,
  ): Promise<{ id: string }> {
    requirePermission(actor, 'inventario.modificar');

    // La empresa sale del actor y nunca de la entrada, para que nadie pueda escribir en otra.
    const scope = { companyId: actor.companyId };

    const parsed = createProductWithFirstBatchSchema.safeParse(input);
    if (!parsed.success) throw new ValidationError();
    const entrada = parsed.data;

    // Un solo reloj para la fecha de compra y `created_at`: con dos, un alta hecha en el cambio de
    // dia podria guardar la compra un dia y la creacion otro.
    const instante = now();
    const purchaseDate = resolverFechaDeCompra(entrada, instante);

    const batch: NewProductBatch = {
      presentationId: entrada.presentationId,
      stock: entrada.stock,
      unitCost: resolverCostoUnitario(entrada),
      // `null` significa «que lo genere el backend»: el adaptador calcula el correlativo dentro de
      // la transaccion que escribe.
      lot: entrada.lot ?? null,
      expiryDate: entrada.expiryDate ?? null,
      purchaseDate,
      createdBy: actor.id,
    };

    // Normalizar el nombre y filtrar los borrados es del adaptador.
    const existente = await deps.products.findAliveIdByName(entrada.name, scope);

    if (existente !== null) {
      // Solo viaja el lote: el nombre, la existencia y la alerta del panel se ignoran en este camino.
      const agregado = await deps.products.addBatchToAlive(existente, batch, instante, scope);

      // El producto dejo de estar vivo entre la consulta y la escritura. Se lanza en vez de crearlo
      // porque se escribirian en silencio los campos que este camino ignora; al reintentar, la
      // consulta dira `null` y el alta seguira el camino de creacion.
      if (agregado === null) throw new ProductNotFoundError(existente);

      return { id: existente };
    }

    // Una sola operacion del puerto para producto y lote, para que el dominio no pueda dejar
    // escrita solo la mitad. El producto no lleva unidad: la declara la presentacion del lote.
    const producto: NewProduct = {
      name: entrada.name,
      stock: entrada.stock,
      qtyAlert: entrada.qtyAlert,
    };

    const creado = await deps.products.createWithFirstBatch(producto, batch, instante, scope);
    return { id: creado.id };
  };
}
