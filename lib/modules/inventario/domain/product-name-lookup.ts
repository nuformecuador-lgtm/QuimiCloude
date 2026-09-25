// lib/modules/inventario/domain/product-name-lookup.ts
import type { ProductType } from './product-type';

/**
 * Servicio que `inventario` ofrece a los demas modulos para resolver ingredientes POR NOMBRE
 * (QC-159 `design.md > 5.3`): quien revisa una fórmula leída de un PDF trae nombres de texto,
 * no identificadores, y necesita saber que producto vivo -si alguno- coincide.
 *
 * Interfaz NUEVA y no un metodo mas de `ProductCatalog` a proposito: QC-168 anade un metodo a
 * `product-catalog.ts` en paralelo y asi los dos cambios no se pisan.
 *
 * Lo implementa un adaptador driven DE INVENTARIO -el unico autorizado a consultar
 * `prisma.product`- y lo cablea `lib/composition`.
 */
export interface ProductNameLookup {
  /** Productos VIVOS de esa empresa cuyo `name_normalized` esta entre los de `names`
   *  -normalizados aqui con `normalizeProductName`, la misma funcion que escribio la columna-.
   *  Incluye los terminados, con su `type`: filtrarlos es de quien llama. Una lista vacia no
   *  consulta la base y devuelve una lista vacia. */
  findAliveByNormalizedNames(
    names: readonly string[],
    companyId: string,
  ): Promise<readonly ProductNameMatch[]>;
}

/** Un producto vivo encontrado por nombre: lo justo para preseleccionarlo o descartarlo como
 *  ingrediente (`unitId` para saber si tiene lotes; `type` para rechazar un terminado). */
export type ProductNameMatch = {
  readonly id: string;
  readonly name: string;
  readonly nameNormalized: string;
  readonly type: ProductType;
  readonly unitId: string | null;
};
