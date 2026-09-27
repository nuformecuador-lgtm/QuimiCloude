/** Identificador de una presentacion visto DESDE FUERA de `inventario`. */
export type PresentationId = string;

/** Lo que otro modulo puede saber de una presentacion: identidad, nombre, contenido y unidad. */
export type PresentationRef = {
  readonly id: PresentationId;
  readonly name: string;
  /** Lo que `pedidos` copia al crear o cambiar de presentacion. `null` = sin declarar. */
  readonly content: string | null;
  /** La unidad en que se declara el contenido: `pedidos` la necesita para convertir el reparto
   *  a la unidad del pedido (`convertQuantity`). */
  readonly unitId: string;
};

/** Lo que otro modulo necesita para resolver una presentacion por su nombre: la unidad
 *  incluida, porque quien resuelve por nombre lo hace para decidir si hace falta crearla. */
export type PresentationByName = {
  readonly id: PresentationId;
  readonly name: string;
  readonly nameNormalized: string;
  readonly unitId: string;
};

/** Servicio que `inventario` ofrece a los demas modulos (`docs/architecture.md > Dominio`
 *  n.o 2: «se comparten servicios via interfaz, nunca repositorios ni tablas»).
 *  Lo implementa un adaptador driven DE INVENTARIO —el unico que puede tocar
 *  `prisma.presentation`— y lo cablea `lib/composition`. */
export interface PresentationCatalog {
  /** Las presentaciones de esa empresa entre los ids pedidos. Un id que no existe o que es de
   *  otra empresa simplemente no vuelve. Con `ids` vacio no consulta. */
  findRefs(
    ids: readonly PresentationId[],
    companyId: string,
  ): Promise<readonly PresentationRef[]>;

  /** Las presentaciones de esa empresa entre los nombres normalizados pedidos. Uno que no
   *  existe o que es de otra empresa simplemente no vuelve. Con `names` vacio no consulta. */
  findByNormalizedNames(
    names: readonly string[],
    companyId: string,
  ): Promise<readonly PresentationByName[]>;
}
