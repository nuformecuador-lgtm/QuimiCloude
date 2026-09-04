import {
  CATALOG_PAGE_PARAM,
  CATALOG_PAGE_SIZE_OPTIONS,
  CATALOG_PAGE_SIZE_PARAM,
  buildCatalogListQuery,
  parseCatalogListParams,
} from '@/app/(private)/proveedores/[id]/components';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@/lib/shared/pagination';

/**
 * Parser de parametros del catalogo de un proveedor: R8 (dos opciones y defecto) y R10 (acotar
 * en vez de fallar) — `specs/QC-44-pantalla-de-proveedores/tasks.md > T10`.
 *
 * **Sin DOM a proposito.** El parser es puro -no importa `react` ni `next/*`- justamente para que
 * R10 se pueda probar sin montar la pantalla: acotar un parametro roto no depende de que nada se
 * renderice.
 *
 * Los asserts van sobre las **constantes exportadas** (`DEFAULT_PAGE_SIZE`, `MAX_PAGE_SIZE`,
 * `CATALOG_PAGE_SIZE_OPTIONS`), nunca sobre numeros escritos a mano: si el backend moviera el
 * defecto o el tope, este archivo se mueve con el en vez de mentir.
 */

/** La primera pagina es el destino seguro de cualquier parametro que no sirva. */
const PRIMERA_PAGINA = 1;

describe('parametros de lista del catalogo del proveedor', () => {
  it('sin parametros usa la primera pagina y el tamano por defecto', () => {
    // R8 (defecto 10) y R10.
    expect(parseCatalogListParams({})).toEqual({
      page: PRIMERA_PAGINA,
      pageSize: DEFAULT_PAGE_SIZE,
    });
    expect(parseCatalogListParams(undefined)).toEqual({
      page: PRIMERA_PAGINA,
      pageSize: DEFAULT_PAGE_SIZE,
    });
  });

  it('las dos unicas opciones de tamano son el defecto y el tope del backend', () => {
    // R8 — «exactamente dos opciones, 10 y 25», y salen de las constantes compartidas.
    expect([...CATALOG_PAGE_SIZE_OPTIONS]).toEqual([DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE]);
    expect(CATALOG_PAGE_SIZE_OPTIONS).toHaveLength(2);
  });

  it('acepta una pagina y un tamano validos tal cual', () => {
    // R8 — lo que la barra de herramientas escribe en la URL es lo que el parser lee.
    for (const tamano of CATALOG_PAGE_SIZE_OPTIONS) {
      expect(
        parseCatalogListParams({
          [CATALOG_PAGE_PARAM]: '7',
          [CATALOG_PAGE_SIZE_PARAM]: String(tamano),
        }),
      ).toEqual({ page: 7, pageSize: tamano });
    }
  });

  it('los parametros invalidos o fuera de rango se acotan, nunca fallan', () => {
    // R10 — ninguna de estas entradas puede producir un error ni una consulta imposible.
    const paginasQueNoSirven = ['abc', '0', '-3', '1.5', ' 2 ', '1e3', '0x2', '', '  '];

    for (const crudo of paginasQueNoSirven) {
      const { page, pageSize } = parseCatalogListParams({ [CATALOG_PAGE_PARAM]: crudo });
      expect(page, `«${crudo}» deberia caer en la primera pagina`).toBe(PRIMERA_PAGINA);
      expect(pageSize).toBe(DEFAULT_PAGE_SIZE);
    }
  });

  it('un tamano que excede el tope soportado se acota al defecto en vez de pedirlo', () => {
    // R10 — «excede el tope soportado» incluye pedir 500 por pagina: no es una de las dos
    // opciones, asi que la pantalla usa el defecto y presenta la lista igual.
    for (const crudo of [String(MAX_PAGE_SIZE + 1), '500', '0', '-10', 'todas', '10.0']) {
      expect(
        parseCatalogListParams({ [CATALOG_PAGE_SIZE_PARAM]: crudo }).pageSize,
        `«${crudo}» deberia caer en el tamano por defecto`,
      ).toBe(DEFAULT_PAGE_SIZE);
    }
  });

  it('de un parametro repetido se toma el primer valor', () => {
    // R10 — `?page=3&page=9` llega como array; la convencion es la de `URLSearchParams.get`.
    expect(
      parseCatalogListParams({
        [CATALOG_PAGE_PARAM]: ['3', '9'],
        [CATALOG_PAGE_SIZE_PARAM]: [String(MAX_PAGE_SIZE), String(DEFAULT_PAGE_SIZE)],
      }),
    ).toEqual({ page: 3, pageSize: MAX_PAGE_SIZE });
  });

  it('la consulta que construye es la que el propio parser sabe leer', () => {
    // R8, R9 — ida y vuelta: la barra de herramientas y el parser no pueden divergir.
    for (const params of [
      { page: PRIMERA_PAGINA, pageSize: DEFAULT_PAGE_SIZE },
      { page: 4, pageSize: MAX_PAGE_SIZE },
    ] as const) {
      const consulta = buildCatalogListQuery(params);
      const leidos = Object.fromEntries(new URLSearchParams(consulta).entries());
      expect(parseCatalogListParams(leidos)).toEqual(params);
    }
  });
});
