// lib/modules/pedidos/domain/order-catalog.ts
/**
 * QC-87 T2 (`design.md > 2.1`, R45). Servicio que `pedidos` ofrece a los demas modulos para
 * que puedan saber el ESTADO de un pedido sin tocar `prisma.order` ni importar nada de
 * `pedidos` por ruta profunda (`docs/architecture.md > Dominio` n.o 2: «se comparten
 * servicios via interfaz, nunca repositorios ni tablas»). Mismo patron que `RecipeCatalog`
 * de QC-33/QC-34, que es como `pedidos` aprendio a saber de una receta.
 *
 * NO se reutiliza `OrderRepository`: ese es el puerto INTERNO de `pedidos` -devuelve la fila
 * entera, sabe de paginacion y de altas- y sacarlo del modulo seria exactamente el
 * «repositorio compartido entre modulos» que la arquitectura prohibe.
 *
 * `pedidos` NO gana ningun caso de uso con esto: un tipo, una interfaz, un adaptador driven y
 * dos lineas de barril. Los seis casos de uso de QC-34 y `order-transitions.ts` quedan
 * intactos.
 */
import type { OrderPriority, OrderStatus } from './order-classification';
import type { FinishConditioningAliveById, StartConditioningAliveById } from './order-conditioning';
import type { OrderNumber } from './order-number';
import type { Page } from './page';

/** Lo que otro modulo puede saber de un pedido: su identidad y su ESTADO, y nada mas. Ni el
 *  numero, ni la receta, ni las cantidades (mismo criterio que `MemberCandidate` de QC-84):
 *  lo que no esta en el tipo no se puede filtrar por descuido.
 *
 *  `status` es el `OrderStatus` de QC-34, IMPORTADO y no copiado: una segunda lista de
 *  estados se desincronizaria en silencio de la tabla de transiciones. */
export type OrderAssignmentTarget = {
  readonly id: string;
  readonly status: OrderStatus;
};

/** El orden de un resumen paginado. `work_queue` es el de la lista de trabajo (prioridad,
 *  antiguedad, numero); `finished_recent_first` es el de «Terminados». */
export type OrderSummaryOrdering = 'work_queue' | 'finished_recent_first';

/** Lo que entro al inventario por UNA linea del reparto cuando Terminar el empaque dio de alta
 *  su lote: el nombre del producto terminado que lo recibio y cuantos envases enteros. */
export type FinishedGoodsReceipt = {
  readonly productName: string;
  readonly packages: string;
};

export interface OrderCatalog {
  /**
   * `null` = no existe, esta dado de baja, o NO ES DE ESA EMPRESA: para quien pregunta son el
   * mismo caso. Un pedido CANCELADO si vuelve -tiene estado propio precisamente para no
   * desaparecer-, y quien lo consulta decide que hacer con el.
   *
   * Esta consulta SI se filtra por empresa, como las de `OrderRepository`. La empresa llega como
   * `string` y no como `OrderScope` para no obligar a otros modulos a construir un tipo interno de
   * `pedidos`; el adaptador la convierte. Sin este filtro, asignar un pedido ajeno moriria contra
   * la FK compuesta de `order_assignments` con un `23503` sin traducir.
   */
  findAliveById(id: string, companyId: string): Promise<OrderAssignmentTarget | null>;

  /**
   * Devuelve la `Page` ya armada porque `lib/shared/pagination` no puede importarse desde
   * `domain/`: quien pagina es el adaptador. Con `ids` vacio no se llama, el caso de uso corta
   * antes.
   */
  listAliveSummariesByIds(
    companyId: string,
    ids: readonly string[],
    statuses: readonly OrderStatus[],
    page: number,
    pageSize?: number,
  ): Promise<Page<AssignedOrderSummary>>;

  /**
   * Como `listAliveSummariesByIds`, pero sin filtro de ids: toda la empresa. `asignaciones` la
   * usa para «Terminados» y «Todos», que no acotan por quien esta asignado. El `ordering`
   * decide el `ORDER BY`: `work_queue` es el mismo que `listAliveSummariesByIds`, extraido a
   * una constante compartida para que no diverjan; `finished_recent_first` ordena por fecha de
   * terminado, con los nulos al final y, entre ellos, por numero de pedido descendente.
   *
   * `filter.packedBy` deja solo los pedidos de ese empacador; un `packedBy` nulo no entra.
   */
  listAliveSummariesInCompany(
    companyId: string,
    statuses: readonly OrderStatus[],
    ordering: OrderSummaryOrdering,
    page: number,
    pageSize?: number,
    filter?: { readonly packedBy?: string },
  ): Promise<Page<AssignedOrderSummary>>;

  /**
   * Mueve el estado de un pedido vivo de esa empresa, SOLO si `assertTransition(from, to)` lo
   * permite: la comprobacion la hace `pedidos` con su propia matriz, dentro del metodo.
   *
   * `from` viaja para que el `UPDATE` filtre tambien por el, ademas de por `id`, `companyId`
   * y `deletedAt: null`: dos lecturas simultaneas no pueden escribir dos veces sobre la misma
   * transicion. `'not_found'` es el mismo caso que en `findAliveById` -no existe, esta de
   * baja o es de otra empresa-; `'stale'` es un caso nuevo: el pedido sigue vivo y es de esa
   * empresa, pero su estado ya no es `from` porque alguien lo movio entre la lectura y esta
   * llamada.
   *
   * Si `to` es `'POR_EMPACAR'`, la misma llamada consume el material apartado:
   * `'insufficient_material'` si no alcanza y `'recipe_without_lines'` si la receta no
   * tiene lineas y el pedido no tiene nada apartado. Los dos deshacen la operacion entera.
   *
   * Yendo a `'POR_EMPACAR'` esta llamada YA NO da de alta ningun lote de
   * producto terminado -eso se traslada a Terminar el empaque, una vez por linea del reparto-,
   * asi que el `'ok'` es siempre el literal, sin `finishedGoods` ni los resultados que solo
   * existian para esa alta (`'presentation_without_content'`, `'no_whole_package'`,
   * `'recipe_not_found'`).
   *
   * `'EN_EMPAQUE'`, `'POR_ACONDICIONAR'`, `'EN_ACONDICIONAMIENTO'`, `'TERMINADO'` y `'ENTREGADO'`
   * no son destino valido de este metodo: se rechazan con `InvalidTransitionError`, aunque la
   * matriz de transiciones los admita, porque solo los alcanzan acciones propias que conocen a
   * quien empaca o acondiciona.
   */
  transitionAliveById(
    id: string,
    companyId: string,
    from: OrderStatus,
    to: OrderStatus,
    actorId: string,
    now: Date,
  ): Promise<'ok' | 'not_found' | 'stale' | 'insufficient_material' | 'recipe_without_lines'>;

  /**
   * Comenzar el empaque: `POR_EMPACAR -> EN_EMPAQUE` con `packerId` como quien empaca, en una
   * transaccion corta con ambito de empresa. `'ok'` mueve la fila; `'already_mine'` es el mismo
   * empacador repitiendo Comenzar sobre su propio `EN_EMPAQUE`, sin escribir nada;
   * `'taken'` es `EN_EMPAQUE` a nombre de otro; `'without_distribution'` es un `POR_EMPACAR` sin
   * ninguna linea de reparto; `'not_packable'` es cualquier otro estado; `'not_found'` es
   * el mismo caso que en `findAliveById` -no existe, esta de baja o es de otra empresa-.
   */
  startPackingAliveById(
    id: string,
    companyId: string,
    packerId: string,
    now: Date,
  ): Promise<'ok' | 'already_mine' | 'taken' | 'not_packable' | 'not_found' | 'without_distribution'>;

  /**
   * Terminar el empaque: `EN_EMPAQUE -> POR_ACONDICIONAR`, sin `finishedAt` -el pedido aun no esta
   * terminado-, solo si `packerId` es quien tiene el pedido en empaque. `'not_packer'`
   * es un pedido `EN_EMPAQUE` de otro empacador; `'not_packable'` es cualquier otro estado;
   * `'not_found'` es el mismo caso que en `findAliveById`.
   *
   * Da de alta, por cada linea del reparto, un lote de producto terminado -mismo
   * coste unitario para todas-, en la MISMA transaccion que el cambio de estado: si
   * cualquier linea falla, se deshace TODO. `'recipe_not_found'` es la receta del pedido,
   * ausente o de otra empresa (mismo caso que antes emitia Finalizar); `'presentation_without_content'`
   * identifica -por `diagnostic`, nunca en el resultado- la primera linea sin contenido ni
   * copiado ni vigente (defensa en profundidad).
   *
   * `'incompatible_units'` y `'order_without_unit'` son defensa en profundidad: el coste se
   * reparte en la unidad del pedido, y una linea que no se puede pasar a ella -o un pedido sin
   * unidad- solo llega aqui con una fila escrita fuera de la aplicacion. Tambien deshacen todo.
   *
   * Consume los envases del reparto en la misma transaccion; `'insufficient_material'` es que el
   * disponible no alcanza para consumirlos todos, y tambien deshace todo.
   */
  finishPackingAliveById(
    id: string,
    companyId: string,
    packerId: string,
    now: Date,
  ): Promise<
    | { readonly kind: 'ok'; readonly finishedGoods: readonly FinishedGoodsReceipt[] }
    | 'not_packer'
    | 'not_packable'
    | 'not_found'
    | 'recipe_not_found'
    | 'presentation_without_content'
    | 'incompatible_units'
    | 'order_without_unit'
    | 'insufficient_material'
  >;

  /**
   * Comenzar el acondicionamiento: `POR_ACONDICIONAR -> EN_ACONDICIONAMIENTO` con `conditionerId`
   * como quien acondiciona, en un solo `UPDATE` condicional. `'already_mine'` es el mismo
   * acondicionador sobre su propio `EN_ACONDICIONAMIENTO`, sin escribir; `'taken'`, ese estado a
   * nombre de otro; `'not_conditionable'`, cualquier otro estado; `'not_found'`, el mismo caso que
   * en `findAliveById`.
   */
  startConditioningAliveById(
    id: string,
    companyId: string,
    conditionerId: string,
    now: Date,
  ): ReturnType<StartConditioningAliveById>;

  /**
   * Terminar el acondicionamiento: `EN_ACONDICIONAMIENTO -> TERMINADO` con `finishedAt = now` en la
   * misma escritura, solo si `conditionerId` es quien lo acondiciona. `'not_conditioner'` es ese
   * estado a nombre de otro; `'not_conditionable'`, cualquier otro estado; `'not_found'`, igual que
   * arriba.
   */
  finishConditioningAliveById(
    id: string,
    companyId: string,
    conditionerId: string,
    now: Date,
  ): ReturnType<FinishConditioningAliveById>;
}

/**
 * Una linea del reparto tal como `pedidos` la publica: la presentacion elegida y sus envases,
 * en el orden de alta (`created_at`, desempate `id`). Solo LECTURA: `OrderCatalog` no gana
 * ningun metodo que escriba el reparto, asi que este tipo no lleva el contenido
 * copiado ni nada mas que quien reparte no necesite para pintarlo.
 */
export type AssignedOrderPresentationLine = {
  readonly presentationId: string;
  readonly packages: number;
  /** `null` = linea guardada antes de que el reparto nombrara envases, o envase que ya no vuelve
   *  del catalogo. */
  readonly packagingName: string | null;
};

/**
 * Sin autoria, sin motivo de cancelacion y sin marcas de tiempo: lo que no esta en el tipo no se
 * filtra por descuido. `quantity` es cadena decimal, nunca `number`
 * (`docs/architecture.md > Anti-patrones`).
 */
export type AssignedOrderSummary = {
  readonly id: string;
  readonly number: OrderNumber;
  readonly recipeId: string;
  readonly quantity: string;
  readonly priority: OrderPriority;
  readonly status: OrderStatus;
  /** `[]` = sin reparto todavia: el contrato que `asignaciones` usa para pintarlo. */
  readonly presentationLines: readonly AssignedOrderPresentationLine[];
  /** La unidad en que se expresa `quantity`; `null` en los pedidos que no la tienen
   *  todavia. */
  readonly unitId: string | null;
  /** `null` = sin fecha de terminado: un pedido entregado antes de que la columna existiera, o
   *  uno que no esta ENTREGADO. */
  readonly finishedAt: Date | null;
  /** Quien tiene el pedido en empaque: obligatorio en `EN_EMPAQUE`, `null` en `PENDIENTE`,
   *  `EN_CURSO`, `POR_EMPACAR` y `CANCELADO`, y opcional en `ENTREGADO` (los entregados antiguos
   *  no lo tienen, los nuevos lo conservan). El identificador viaja en crudo, igual que
   *  `recipeId`; el nombre lo resuelve quien consulta con el directorio de personas. */
  readonly packedBy: string | null;
};
