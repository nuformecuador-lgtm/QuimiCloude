/**
 * Igualdad del nombre de producto EN LA CELDA de la tabla de inventario, que puede llevar la
 * unidad anadida detras (`productDisplayName`, en la `cell` de la columna del nombre de
 * `app/(private)/inventario/components/product-columns.tsx > buildProductColumns`): «nombre · simbolo».
 * Se exige el nombre completo y exacto al principio -no puede casar con el prefijo de otro-, con
 * un sufijo de unidad opcional, nunca un sufijo cualquiera.
 */
export function exactProductNameCellText(value: string): RegExp {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^\\s*${escaped}(?:\\s*·\\s*\\S.*)?\\s*$`);
}
