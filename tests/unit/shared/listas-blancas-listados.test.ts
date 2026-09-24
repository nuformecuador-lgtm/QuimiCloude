// QC-57 T3.1 — Las SIETE listas blancas de los siete listados (R2, R4, R7).
//
// Vive en `tests/unit/shared/` y no bajo un modulo porque su sujeto son **las siete a la vez**:
// ningun modulo es dueno de esta afirmacion. No importa dominio de un modulo desde otro -son
// tests, no codigo de aplicacion-, solo lee las siete declaraciones.
//
// **Se recorre la lista, no se repiten siete asertos.** Es el criterio de hecho literal de
// `tasks.md > T3.1`: siete bloques copiados invitan a que la octava lista blanca se quede sin
// comprobar, y esa es exactamente la que traeria `deletedAt` de vuelta.

import type { ListQueryable } from '@/lib/modules/inventario/domain/list-query';
import { PRESENTATION_QUERYABLE } from '@/lib/modules/inventario/domain/presentation-queryable';
import { PRODUCT_QUERYABLE } from '@/lib/modules/inventario/domain/product-queryable';
import { ORDER_QUERYABLE } from '@/lib/modules/pedidos/domain/order-queryable';
import { SUPPLIER_CATALOG_LINE_QUERYABLE } from '@/lib/modules/proveedores/domain/supplier-catalog-line-queryable';
import { SUPPLIER_QUERYABLE } from '@/lib/modules/proveedores/domain/supplier-queryable';
import { RECIPE_QUERYABLE } from '@/lib/modules/recetas/domain/recipe-queryable';
import { UNIT_QUERYABLE } from '@/lib/modules/unidades/domain/unit-queryable';

/** Las siete listas de R2, en el orden en que `design.md > 5` las tabula. */
const LISTAS: readonly { readonly listado: string; readonly queryable: ListQueryable }[] = [
  { listado: 'productos', queryable: PRODUCT_QUERYABLE },
  { listado: 'presentaciones', queryable: PRESENTATION_QUERYABLE },
  { listado: 'recetas', queryable: RECIPE_QUERYABLE },
  { listado: 'proveedores', queryable: SUPPLIER_QUERYABLE },
  { listado: 'catalogo de proveedor', queryable: SUPPLIER_CATALOG_LINE_QUERYABLE },
  { listado: 'unidades', queryable: UNIT_QUERYABLE },
  { listado: 'pedidos', queryable: ORDER_QUERYABLE },
];

/** Lo que NUNCA puede ser consultable: el borrado logico (R7) y el COMO de la busqueda. */
const PROHIBIDOS: readonly string[] = ['deletedAt', 'deleted_at', 'nameNormalized', 'name_normalized'];

function camposDeclarados(queryable: ListQueryable): readonly string[] {
  return [...queryable.sortable, ...Object.keys(queryable.filterable)];
}

describe('listas blancas de los siete listados', () => {
  it('son SIETE, una por listado de R2', () => {
    // R2, R4 — si aparece un listado nuevo sin lista blanca, este numero lo delata.
    expect(LISTAS).toHaveLength(7);
    expect(new Set(LISTAS.map((l) => l.listado)).size).toBe(7);
  });

  it('ninguna declara deletedAt ni nameNormalized, ni como orden ni como filtro', () => {
    // R7 — el hallazgo se acumula con el nombre del listado para que el fallo diga cual es.
    const hallazgos = LISTAS.flatMap(({ listado, queryable }) =>
      camposDeclarados(queryable)
        .filter((campo) => PROHIBIDOS.includes(campo))
        .map((campo) => `${listado}: ${campo}`),
    );

    expect(hallazgos).toEqual([]);
  });

  it('cada una declara al menos un campo ordenable y ninguno repetido', () => {
    // R4 — una lista blanca vacia de orden no es una declaracion, es un olvido.
    const hallazgos = LISTAS.filter(
      ({ queryable }) =>
        queryable.sortable.length === 0 ||
        new Set(queryable.sortable).size !== queryable.sortable.length,
    ).map(({ listado }) => listado);

    expect(hallazgos).toEqual([]);
  });

  it('todo campo filtrable declara una de las cuatro formas de filtro', () => {
    // R12 — una quinta forma no existe, tampoco del lado de quien declara.
    const formas = ['text', 'numberRange', 'select', 'dateRange'];
    const hallazgos = LISTAS.flatMap(({ listado, queryable }) =>
      Object.entries(queryable.filterable)
        .filter(([, kind]) => !formas.includes(kind))
        .map(([campo, kind]) => `${listado}: ${campo} -> ${kind}`),
    );

    expect(hallazgos).toEqual([]);
  });

  it('ninguna de las siete apaga la busqueda (R11)', () => {
    // Nota fechada 2026-09-18: hasta QC-68 `pedidos` era la unica sin `searchable` y el aserto
    // decia `['pedidos']`. Desde que `orders` busca por el nombre de su receta, la afirmacion
    // mas fuerte es la lista vacia: asi, si manana CUALQUIER lista -incluida pedidos- apagara
    // la busqueda, este caso lo dice. Se sigue recorriendo las siete, no solo pedidos.
    const sinBusqueda = LISTAS.filter(({ queryable }) => !queryable.searchable).map(
      ({ listado }) => listado,
    );

    expect(sinBusqueda).toEqual([]);
  });
});
