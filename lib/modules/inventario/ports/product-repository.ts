import type { ListQuery } from '../domain/list-query';
import type { Page } from '../domain/page';
import type { NewProductBatch } from '../domain/product-batch';
import type { NewProduct, ProductView } from '../domain/product-view';

/**
 * Puerto de acceso a datos de producto (`design.md > 7`). El sufijo `Alive` en los
 * nombres de metodo NO es adorno: el filtro `deleted_at IS NULL` es responsabilidad de
 * ESTE puerto/su adaptador, no del dominio (R16). No hay ninguna operacion de listar
 * borrados ni de restaurar (D5).
 *
 * Los resultados son booleanos/objetos discriminados, nunca excepciones de Prisma: el
 * dominio no ve ningun SQLSTATE. Traducirlos es responsabilidad del adaptador driven
 * (Grupo C).
 *
 * QC-90 (`design.md > 6`): entran TRES metodos para el alta con su primer lote. Los cinco
 * de arriba no cambian de firma -la edicion, el borrado, la ficha y el listado no saben
 * nada de lotes (R26, R30)-. El puerto sigue sin importar `@prisma/client`: habla en
 * `NewProduct`/`NewProductBatch`, con el importe como CADENA decimal y la expiracion como
 * fecha civil (R4, R13); convertir a `Prisma.Decimal`/`Date` es del adaptador driven.
 */
export interface ProductRepository {
  create(data: NewProduct, now: Date): Promise<{ id: string }>;
  findAliveById(id: string): Promise<ProductView | null>;
  updateAlive(id: string, data: NewProduct, now: Date): Promise<boolean>;
  softDeleteAlive(id: string, now: Date): Promise<boolean>;
  /** QC-57 (R24): recibe el CONTRATO GENERICO ya saneado por el caso de uso, no la
   *  consulta cruda del llamante. Traducir `columnId`/filtros a SQL es del adaptador. */
  listAlive(query: ListQuery): Promise<Page<ProductView>>;

  /**
   * QC-90 (R15, R19, R20): ¿hay ya un producto VIVO que se llame asi?
   *
   * Recibe el nombre TAL CUAL lo escribio quien da de alta, no normalizado: normalizar es
   * del adaptador, porque `normalizeProductName` es la unica definicion de «mismo nombre»
   * (QC-57 R19) y es la misma funcion que escribio la columna `name_normalized` con la que
   * se compara. Si el caso de uso normalizara aqui, habria dos sitios que decidir mantener
   * de acuerdo.
   *
   * El filtro de vivos (`deleted_at IS NULL`) es del adaptador, como en el resto del
   * puerto: por eso un nombre que solo coincide con productos BORRADOS devuelve `null` y el
   * alta acaba creando uno nuevo (R19). Con varios homonimos vivos, el adaptador devuelve
   * SIEMPRE el mismo -el mas antiguo, desempatando por identificador ascendente- (R20).
   */
  findAliveIdByName(name: string): Promise<string | null>;

  /**
   * QC-90 (R16, R21): alta de un producto NUEVO junto con su primer lote, en UNA sola
   * transaccion. Devuelve los dos identificadores porque las dos filas se escriben aqui: si
   * cualquiera de las dos falla, no queda ninguna, que es lo que hace imposible el producto
   * sin lote que R1 prohibe.
   *
   * La existencia viaja DOS veces -en `product.stock` y en `batch.stock`- y no es un
   * descuido: es la decision cerrada del 2026-09-10, transitoria hasta QC-91, cuando la
   * existencia del producto pase a ser la suma de sus lotes.
   */
  createWithFirstBatch(
    product: NewProduct,
    batch: NewProductBatch,
    now: Date,
  ): Promise<{ id: string; batchId: string }>;

  /**
   * QC-90 (R17, R18): agrega el lote a un producto que YA EXISTE.
   *
   * Escribe UNICAMENTE la fila de `product_batches`: no toca `name`, `stock`, `qty_alert`
   * ni `unit_id` del producto, ni siquiera su `updated_at` (`design.md > 2`). Por eso no
   * recibe ningun `NewProduct`: lo que no viaja no se puede escribir por accidente.
   *
   * Devuelve `null` cuando el producto ya NO esta vivo -se borro entre la consulta de
   * `findAliveIdByName` y esta escritura-. Es un resultado, no una excepcion, por la misma
   * razon que `updateAlive` devuelve `boolean`: el dominio no ve errores de Prisma.
   */
  addBatchToAlive(
    productId: string,
    batch: NewProductBatch,
    now: Date,
  ): Promise<{ batchId: string } | null>;
}
