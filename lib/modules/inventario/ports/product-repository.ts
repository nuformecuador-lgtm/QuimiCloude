import type { InventoryScope } from '../domain/inventory-scope';
import type { ListQuery } from '../domain/list-query';
import type { MovementReason } from '../domain/movement-reason';
import type { Page } from '../domain/page';
import type { NewProductBatch } from '../domain/product-batch';
import type { ProductBatchView } from '../domain/product-batch-view';
import type { NewProduct, ProductView } from '../domain/product-view';
import type { BatchHistoryEntry } from '../domain/reservation';

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
 *
 * QC-49 (R13): **las ocho firmas exigen `scope: InventoryScope`**, la empresa en cuyo nombre se
 * lee o se escribe. Que el ambito este EN LA FIRMA -y no resuelto dentro del adaptador, ni
 * inyectado por una extension global del cliente Prisma- es lo que hace que una LLAMADA que se
 * olvide de el NO COMPILE. Es el mismo argumento que escribio `UnitRepository` en QC-76.
 *
 * PRECISION DEL 2026-09-11 (correccion de la revision F2.2, no relajacion): el compilador cubre
 * la llamada, NO la implementacion. TypeScript admite asignar una funcion de MENOR aridad donde
 * se espera una de mayor, asi que una implementacion sin `scope` se cablea sin protestar
 * -verificado con `tsc`-. Lo que cierra esa mitad es mecanico igualmente, pero no es el
 * compilador: `tests/guards/guard-ambito-empresa-inventario.test.ts` comprueba METODO A METODO
 * que la implementacion declara el ambito y lo lleva hasta `./company-scope`, y los tests de
 * integracion prueban el rechazo cruzado de cada operacion contra la base.
 *
 * El ambito va **al final** de cada firma para que ninguna llamada existente cambie el orden
 * de sus argumentos. Y los resultados discriminados **no crecen**: «de otra empresa» se
 * devuelve por el MISMO camino que «no existe» -`null` o `false`-, porque el dominio no debe
 * poder distinguirlos (R15, R16). Distinguirlos seria un oraculo de existencia: quien sondea
 * identificadores aprenderia que filas tienen las demas empresas.
 *
 * La empresa tampoco viaja en `NewProduct` ni en `NewProductBatch` (R17): lo que no esta en el
 * tipo no se puede escribir por accidente ni elegir desde la entrada del llamante. Al crear,
 * la escribe el adaptador desde este `scope` y de ningun otro sitio.
 */
export interface ProductRepository {
  create(data: NewProduct, now: Date, scope: InventoryScope): Promise<{ id: string }>;
  findAliveById(id: string, scope: InventoryScope): Promise<ProductView | null>;
  updateAlive(id: string, data: NewProduct, now: Date, scope: InventoryScope): Promise<boolean>;
  softDeleteAlive(id: string, now: Date, scope: InventoryScope): Promise<boolean>;
  /** QC-57 (R24): recibe el CONTRATO GENERICO ya saneado por el caso de uso, no la
   *  consulta cruda del llamante. Traducir `columnId`/filtros a SQL es del adaptador. */
  listAlive(query: ListQuery, scope: InventoryScope): Promise<Page<ProductView>>;

  /**
   * ¿Hay ya un producto VIVO con este nombre EN LA UNIDAD de esta presentacion?
   *
   * Recibe el nombre TAL CUAL lo escribio quien da de alta, no normalizado: normalizar es
   * del adaptador, porque `normalizeProductName` es la unica definicion de «mismo nombre»
   * (QC-57 R19) y es la misma funcion que escribio la columna `name_normalized` con la que
   * se compara. Si el caso de uso normalizara aqui, habria dos sitios que decidir mantener
   * de acuerdo.
   *
   * La unidad no la elige quien llama: la RESUELVE el adaptador leyendo `presentationId`, con
   * el ambito de empresa de la presentacion. Si esa presentacion no existe o es de otra empresa,
   * devuelve `null` -el alta sigue por crear, y ese camino fallara con `invalid_input` al no
   * encontrar la presentacion, igual que si `presentationId` fuera invalido por cualquier otro
   * motivo-.
   *
   * QC-49 (R18): mira UNICAMENTE los productos vivos DE LA EMPRESA del ambito. Si el unico
   * homonimo vivo es de otra empresa, este metodo devuelve `null` y el alta crea un producto
   * nuevo en la empresa de quien pide, en vez de colgarle el lote al producto ajeno.
   *
   * El filtro de vivos (`deleted_at IS NULL`) es del adaptador, como en el resto del
   * puerto: por eso un nombre que solo coincide con productos BORRADOS devuelve `null` y el
   * alta acaba creando uno nuevo. Con varios homonimos vivos en la MISMA unidad, el
   * adaptador devuelve SIEMPRE el mismo -el mas antiguo, desempatando por identificador
   * ascendente-. Un homonimo vivo en OTRA unidad no cuenta como el mismo producto: nace
   * uno nuevo.
   */
  findAliveIdByNameInPresentationUnit(
    name: string,
    presentationId: string,
    scope: InventoryScope,
  ): Promise<string | null>;

  /**
   * Alta de un producto NUEVO junto con su primer lote, en UNA sola transaccion. Devuelve los
   * dos identificadores porque las dos filas se escriben aqui: si cualquiera de las dos falla,
   * no queda ninguna, que es lo que hace imposible un producto sin ningun lote.
   *
   * El producto nace con la unidad de la presentacion de este lote -la resuelve el adaptador,
   * no quien llama- y con la existencia recalculada a partir de sus lotes en la MISMA
   * transaccion: `stock` no lo escribe quien llama, es el adaptador el que suma tras crear el
   * lote.
   *
   * El `lot` devuelto es el TEXTO que quedo escrito en la fila -el que tecleo la persona o el
   * que genero el correlativo-, no el `batchId`. El adaptador ya lo calcula para escribir la
   * fila; aqui solo se propaga hacia arriba.
   */
  createWithFirstBatch(
    product: NewProduct,
    batch: NewProductBatch,
    now: Date,
    scope: InventoryScope,
  ): Promise<{ id: string; batchId: string; lot: string }>;

  /**
   * Agrega el lote a un producto que YA EXISTE.
   *
   * Escribe la fila de `product_batches` y RECALCULA `products.stock` en la misma transaccion;
   * no toca `name`, `qty_alert` ni `unit_id` del producto, ni siquiera su `updated_at` -la unica
   * columna del producto que cambia es `stock`-. Por eso no recibe ningun `NewProduct`: lo que
   * no viaja no se puede escribir por accidente.
   *
   * Devuelve `null` cuando el producto ya NO esta vivo -se borro entre la consulta de
   * `findAliveIdByNameInPresentationUnit` y esta escritura-. Es un resultado, no una excepcion,
   * por la misma razon que `updateAlive` devuelve `boolean`: el dominio no ve errores de Prisma.
   *
   * QC-49 (R16): tambien devuelve `null` cuando el producto es de OTRA empresa, por el mismo
   * camino y sin ningun resultado nuevo. El ambito va en el `where` de la lectura, no en un
   * `if` posterior sobre la fila leida.
   *
   * Con la misma vara de `createWithFirstBatch`, el `lot` devuelto es el texto que quedo
   * escrito en la fila.
   */
  addBatchToAlive(
    productId: string,
    batch: NewProductBatch,
    now: Date,
    scope: InventoryScope,
  ): Promise<{ batchId: string; lot: string } | null>;

  /**
   * Mueve la existencia de un lote por `delta` (con signo) y deja su asiento en el libro,
   * las dos cosas en la MISMA transaccion. El total nuevo no lo calcula quien llama: lo calcula la
   * base con un `UPDATE` relativo, para que dos ajustes concurrentes no se pisen el uno al otro.
   *
   * En esa misma transaccion, el ajuste tambien RECALCULA la existencia guardada del producto
   * -igual que hace el alta al escribir un lote-, sin tocar su nombre, su alerta, su unidad ni
   * su fecha de modificacion.
   *
   * Devuelve `null` cuando el lote no existe o es de OTRA empresa -las dos por el mismo camino,
   * igual que el resto del puerto-. Un `stock` que quedaria negativo se rechaza antes de
   * escribir nada; el adaptador decide como lo comunica.
   *
   * Tambien devuelve `reserved` -lo que los pedidos vivos tienen apartado en el lote tras el
   * ajuste- y `overReserved` -si ese apartado supera la existencia nueva-: un ajuste a la
   * baja se acepta igual, y esto es lo que permite avisar sin convertirlo en un error.
   *
   * La empresa no viaja en ningun tipo de entrada, igual que en `NewProduct` y `NewProductBatch`.
   */
  adjustBatchStock(
    batchId: string,
    delta: string,
    reason: MovementReason,
    actorId: string,
    now: Date,
    scope: InventoryScope,
  ): Promise<{ stock: string; reserved: string; overReserved: boolean } | null>;

  /**
   * Todos los lotes del producto, siempre que el producto siga VIVO -el filtro de vivos es
   * del adaptador, como en el resto del puerto-. Un `productId` que no existe, que esta borrado o
   * que es de otra empresa devuelve un array vacio, por el mismo camino que «no hay lotes».
   */
  findBatchesOfAliveProduct(
    productId: string,
    scope: InventoryScope,
  ): Promise<readonly ProductBatchView[]>;

  /**
   * El historial de asientos de un lote, del mas reciente al mas antiguo: une `inventory_movements`
   * y `reservation_movements` en un `BatchHistoryEntry` por asiento. `null` cuando el lote no
   * existe o es de otra empresa; un lote vivo sin ningun asiento -anterior al libro- devuelve un
   * array vacio, que no es lo mismo que `null`.
   *
   * `orderNumberText` y `authorName` llegan como el IDENTIFICADOR crudo de la fila -el pedido y
   * quien escribio el asiento-, igual que `authorName` en `InventoryMovementView`: resolverlos a
   * texto mostrable es del caso de uso (`list-batch-movements.ts`), que es quien conoce los
   * directorios de `pedidos` e `identity`.
   */
  findBatchMovements(
    batchId: string,
    scope: InventoryScope,
  ): Promise<readonly BatchHistoryEntry[] | null>;
}
