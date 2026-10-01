/**
 * Puerto de composicion de la URL publica de un recorte. Solo compone: no sube, no borra, no
 * lista, y no recibe la empresa -la ruta ya la lleva-. Quien decide de
 * que bucket sale la URL es `lib/composition`, no este modulo.
 */
export interface CatalogImageUrl {
  publicUrl(path: string): string;
}
