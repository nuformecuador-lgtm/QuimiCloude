import {
  PAGE_PARAM,
  PAGE_SIZE_OPTIONS,
  PAGE_SIZE_PARAM,
  buildProductListQuery,
  parseProductListParams,
} from '@/app/(private)/inventario/components';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@/lib/shared/pagination';

/**
 * Parser de parametros de lista de la pantalla de productos: R10 (parte del defecto) y R12
 * (`specs/QC-22-pantalla-de-productos/tasks.md > T12`, `design.md > 4.2`).
 *
 * **Sin DOM a proposito.** El parser es puro -no importa `react` ni `next/*`- justamente para
 * que R12 se pueda probar sin montar la pantalla: acotar un parametro roto no depende de que
 * nada se renderice.
 *
 * Los asserts van sobre las **constantes exportadas** (`DEFAULT_PAGE_SIZE`, `MAX_PAGE_SIZE`,
 * `PAGE_SIZE_OPTIONS`), nunca sobre los numeros escritos a mano: si el backend moviera el
 * defecto o el tope, este archivo se mueve con el en vez de mentir.
 */

/** La primera pagina es el destino seguro de cualquier parametro que no sirva (R12). */
const PRIMERA_PAGINA = 1;

describe('parametros de lista de productos', () => {
  it('sin parametros usa la primera pagina y el tamano por defecto', () => {
    // R10 (defecto) y R12.
    expect(parseProductListParams({})).toEqual({
      page: PRIMERA_PAGINA,
      pageSize: DEFAULT_PAGE_SIZE,
    });
    expect(parseProductListParams(undefined)).toEqual({
      page: PRIMERA_PAGINA,
      pageSize: DEFAULT_PAGE_SIZE,
    });
  });

  it('acepta una pagina y un tamano validos tal cual', () => {
    // R10, R11 — lo que la barra de herramientas escribe en la URL es lo que el parser lee.
    for (const tamano of PAGE_SIZE_OPTIONS) {
      expect(
        parseProductListParams({ [PAGE_PARAM]: '7', [PAGE_SIZE_PARAM]: String(tamano) }),
      ).toEqual({ page: 7, pageSize: tamano });
    }
  });

  it('las dos unicas opciones de tamano son el defecto y el tope del backend', () => {
    // R10 — «exactamente dos opciones, 10 y 25», y salen de las constantes compartidas.
    expect([...PAGE_SIZE_OPTIONS]).toEqual([DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE]);
    expect(PAGE_SIZE_OPTIONS).toHaveLength(2);
  });

  it('los parametros invalidos o fuera de rango se acotan a valores validos', () => {
    // R12 — ninguna de estas entradas puede producir un error ni una consulta imposible.
    const paginasQueNoSirven = ['abc', '0', '-3', '1.5', ' 2 ', '1e3', '0x2', '', '  '];

    for (const crudo of paginasQueNoSirven) {
      const { page, pageSize } = parseProductListParams({ [PAGE_PARAM]: crudo });
      expect(page, `«${crudo}» deberia caer en la primera pagina`).toBe(PRIMERA_PAGINA);
      expect(pageSize).toBe(DEFAULT_PAGE_SIZE);
    }
  });

  it('un tamano de pagina fuera de la lista cae al defecto, tambien si excede el tope', () => {
    // R12 — el tope lo sigue acotando el backend; aqui solo existen las dos opciones ofrecidas.
    const tamanosQueNoSirven = ['0', '1', '11', '24', '26', '1000', 'muchos', '-10', '25.0'];

    for (const crudo of tamanosQueNoSirven) {
      const { pageSize } = parseProductListParams({ [PAGE_SIZE_PARAM]: crudo });
      expect(pageSize, `«${crudo}» deberia caer en el tamano por defecto`).toBe(DEFAULT_PAGE_SIZE);
    }
  });

  it('un parametro repetido toma el primer valor y sigue acotando', () => {
    // R12 — `?page=2&page=9` llega como array desde el App Router y no puede reventar.
    expect(
      parseProductListParams({
        [PAGE_PARAM]: ['2', '9'],
        [PAGE_SIZE_PARAM]: [String(MAX_PAGE_SIZE), '999'],
      }),
    ).toEqual({ page: 2, pageSize: MAX_PAGE_SIZE });

    expect(parseProductListParams({ [PAGE_PARAM]: [] })).toEqual({
      page: PRIMERA_PAGINA,
      pageSize: DEFAULT_PAGE_SIZE,
    });
  });

  it('una pagina enorme no se corrompe: sigue siendo un entero seguro', () => {
    // R12 — `Number('9'.repeat(30))` deja de ser entero seguro; eso no puede llegar al backend.
    expect(parseProductListParams({ [PAGE_PARAM]: '9'.repeat(30) }).page).toBe(PRIMERA_PAGINA);
    expect(parseProductListParams({ [PAGE_PARAM]: '999' }).page).toBe(999);
  });

  it('la consulta que construye la pantalla es la que el propio parser sabe leer', () => {
    // R10, R11, R17 — ida y vuelta: la URL que produce la barra de herramientas al navegar
    // devuelve exactamente los mismos parametros al volver a leerse. Sin esto, cerrar el panel
    // podria devolver al usuario a otra pagina de la que tenia.
    for (const tamano of PAGE_SIZE_OPTIONS) {
      const params = { page: 3, pageSize: tamano };
      const consulta = new URLSearchParams(buildProductListQuery(params));

      expect(parseProductListParams(Object.fromEntries(consulta))).toEqual(params);
    }
  });
});
