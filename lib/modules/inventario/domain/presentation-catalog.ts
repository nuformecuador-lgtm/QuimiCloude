/** Identificador de una presentacion visto DESDE FUERA de `inventario`. */
export type PresentationId = string;

/** Lo que otro modulo puede saber de una presentacion: identidad, nombre y contenido. */
export type PresentationRef = {
  readonly id: PresentationId;
  readonly name: string;
  /** Lo que `pedidos` copia al crear o cambiar de presentacion. `null` = sin declarar. */
  readonly content: string | null;
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
}
