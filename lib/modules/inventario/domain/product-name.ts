// lib/modules/inventario/domain/product-name.ts
/** Forma canonica para comparar nombres de producto: recorta, ignora mayusculas, quita acentos
 *  y quita todo lo que no sea [a-z0-9]. «Solución Buffer pH 7», «solucion buffer ph 7» y
 *  «SOLUCION-BUFFER-PH-7» producen la misma clave. Es la UNICA definicion de «mismo nombre»
 *  del modulo (R19): la columna `products.name_normalized` y la busqueda del listado usan
 *  esta, y no hay una segunda.
 *
 *  OJO — a diferencia de las otras cuatro (`normalizePresentationName`, `normalizeRecipeName`,
 *  `normalizeSupplierName`, `normalizeUnitName`), esta NO respalda ninguna unicidad: el nombre
 *  de un producto NO es unico (decision cerrada 6 de QC-14) y `products.name_normalized` no
 *  tiene indice unico. Sirve para BUSCAR, no para identificar. El cuerpo es identico a
 *  proposito: buscar y comparar no pueden discrepar (QC-57, decision cerrada 9). */
export function normalizeProductName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]/g, '');
}
