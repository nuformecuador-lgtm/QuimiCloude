/**
 * Contratos de entrada y salida de la linea de catalogo (QC-52, `design.md > 6.2`, `> 7`).
 *
 * Este archivo NO importa nada de `@/lib/modules/inventario`, y ese es justo el cambio de
 * QC-52 (R9, R18, decision cerrada 3): la linea del catalogo ya no guarda ninguna
 * referencia a un articulo del inventario -ni columna, ni clave foranea, ni campo de
 * contrato-, asi que el tipo del identificador que este archivo importaba del barrel vecino
 * desaparecio, y con el la unica dependencia que este modulo tenia de `inventario`.
 *
 * Consecuencia aceptada y escrita para que no se lea como olvido (`design.md > 6.2`):
 * `CatalogLineView` devuelve `presentationId` y `unitId` EN CRUDO, sin nombre. Resolverlos
 * exigiria un contrato publico nuevo en `inventario` y en `unidades`, y eso es de la
 * pantalla del catalogo (QC-44), no de esta ficha.
 */

import type { CatalogLineMeasurements } from './catalog-line-input';

/**
 * Los NUEVE campos de negocio de la linea: lo que el alta escribe y lo que la edicion
 * REEMPLAZA ENTERO (R24, P6). El proveedor NO esta aqui a proposito -es lo unico que la
 * edicion no puede cambiar, y no porque se filtre sino porque el tipo no lo tiene-.
 *
 * `cost` y `minPurchase` son CADENA decimal, no `number` (R11, `design.md > 7`): el dominio
 * no importa `@prisma/client` y el binario de coma flotante esta prohibido para importes.
 * La conversion a `Prisma.Decimal` -y la vuelta con `.toFixed(4)`- vive SOLO en el
 * adaptador driven. `material` y `measurements` siguen la misma regla.
 *
 * `nameNormalized` NO forma parte de este tipo: se deriva de `name` con
 * `normalizeSupplierName`, que es la UNICA definicion de «mismo nombre» del modulo
 * (`design.md > 2.3`). Derivarlo en el adaptador, en toda escritura, es lo que impide que
 * las dos columnas puedan diverger.
 */
export type CatalogLineFields = {
  /** Recortado y no vacio al normalizar (R14). Lo garantiza el esquema del borde. */
  readonly name: string;
  /** uuid, OBLIGATORIO (R10, decision cerrada 4): forma parte de la identidad de la linea. */
  readonly presentationId: string;
  /** uuid, opcional (R10): una linea sin unidad es valida. */
  readonly unitId: string | null;
  readonly imagePath: string | null;
  readonly cost: string;
  readonly minPurchase: string | null;
  readonly deliveryTime: number | null;
  readonly material: string | null;
  readonly measurements: CatalogLineMeasurements | null;
};

/** Alta de una linea: sus campos de negocio mas el proveedor al que pertenece. */
export type NewCatalogLine = CatalogLineFields & { readonly supplierId: string };

/**
 * Salida de una consulta del catalogo. `deletedAt` NO sale: nunca es dato de salida, y
 * ninguna consulta devuelve lineas dadas de baja (R22).
 */
export type CatalogLineView = CatalogLineFields & {
  readonly id: string;
  readonly supplierId: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly createdBy: string | null;
  readonly updatedBy: string | null;
};

/**
 * Salida del listado del catalogo: la vista de siempre mas la URL publica del recorte.
 * `imagePath` se conserva -el formulario de edicion la reenvia en su campo oculto-, y
 * `imageUrl` es `null` cuando la linea no tiene imagen.
 */
export type CatalogLineListItem = CatalogLineView & { readonly imageUrl: string | null };
