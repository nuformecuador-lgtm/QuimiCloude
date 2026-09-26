import type { CatalogLineFields } from '../domain/catalog-line-view';
import type { SupplierScope } from '../domain/supplier-scope';

/**
 * Puerto de la importacion por identidad del catalogo del proveedor. Distinto del puerto de
 * siempre, `supplier-catalog-repository.ts`, que NO se toca: aquel prohibe a proposito
 * cualquier busqueda previa por identidad, porque su unica escritura -el alta- se apoya en
 * el indice unico para detectar el duplicado. Este puerto hace justo lo contrario a
 * proposito: busca para MOSTRAR (la vista previa necesita el costo actual de una linea que
 * va a «cambiar») y escribe con `ON CONFLICT` sobre esa misma identidad, que es una
 * operacion que el puerto viejo no puede expresar.
 *
 * La identidad de una linea sigue siendo `(supplier_id, name_normalized, presentation_id)`
 * sobre las vivas, la misma del indice unico parcial. Los dos metodos exigen `scope` al
 * FINAL de la firma, igual que el resto del modulo.
 */
export interface SupplierCatalogImportRepository {
  /**
   * Lectura para clasificar: trae las lineas VIVAS de un proveedor VIVO **de esa empresa**
   * cuya identidad coincide con alguna de las claves pedidas. Una clave sin ninguna linea
   * viva simplemente no aparece en el resultado: no es un error, es una fila que va a
   * clasificar como «nueva».
   *
   * `'supplier_not_found'` cubre los tres casos que el dominio trata igual: el proveedor no
   * existe, esta dado de baja, o es de otra empresa.
   */
  findAliveByIdentities(
    supplierId: string,
    keys: readonly { nameNormalized: string; presentationId: string }[],
    scope: SupplierScope,
  ): Promise<
    | {
        lines: readonly {
          id: string;
          nameNormalized: string;
          presentationId: string;
          cost: string;
        }[];
      }
    | 'supplier_not_found'
  >;

  /**
   * Escritura TODO O NADA de una confirmacion completa, en una sola transaccion. Por cada
   * linea: si ya hay una VIVA con su identidad, actualiza SOLO su costo -y el autor y la
   * fecha de la ultima modificacion-; si no la hay, la crea con todos sus campos revisados.
   * El indice unico parcial es el arbitro: dos confirmaciones simultaneas no duplican nada.
   *
   * `'supplier_not_found'` es el mismo caso que en `findAliveByIdentities`, comprobado DENTRO
   * de la misma transaccion con un bloqueo del proveedor -para que una baja concurrente
   * espere en vez de dejar una linea escrita bajo un proveedor que deja de estar vivo a
   * mitad de la escritura-.
   */
  upsertCostByIdentity(
    supplierId: string,
    lines: readonly CatalogLineFields[],
    actorId: string,
    now: Date,
    scope: SupplierScope,
  ): Promise<{ created: number; updated: number; unchanged: number } | 'supplier_not_found'>;
}
