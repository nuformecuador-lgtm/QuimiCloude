// QC-85 T3 — Parser y serializador de los parametros de lista de GRUPOS: R3, R13, R15, R16, R17.
//
// `work-group-list-params.ts` es PURO a proposito (`design.md > 4.2`): sin DOM, sin React y sin
// `next/*`. Por eso este archivo no monta nada y puede ejercitar entrada basura, fuera de rango y
// un campo de orden no declarado en unas pocas lineas.
//
// **Los asserts van contra los conjuntos IMPORTADOS del contrato de `identity` y de la tabla
// compartida**, nunca contra literales escritos aqui (R41): si manana el catalogo declara otro
// campo ordenable, este test lo acepta sin tocarse, y si alguien reescribiera la lista a mano en la
// pantalla, dejaria de casar.
//
// **El ancla de R16 esta arriba del todo y es una lista CERRADA**: afirma que `WORK_GROUP_QUERYABLE`
// sigue declarando exactamente esos dos ordenables, NINGUN filtrable y `searchable: true`. Esta
// feature NO amplia la lista blanca; ampliarla es de otra ficha, y esa ficha tendra que darse de
// alta aqui a proposito.

import { describe, expect, it } from 'vitest';

import {
  GROUPS_TAB,
  PAGE_PARAM,
  PAGE_SIZE_PARAM,
  SEARCH_PARAM,
  SORT_PARAM,
  TAB_PARAM,
  buildWorkGroupListQuery,
  parseUsuariosTab,
  parseWorkGroupListParams,
  workGroupListHref,
} from '@/app/(private)/configuracion/usuarios/components';
import { PAGE_SIZE_OPTIONS, type DataTableParams } from '@/components/shared/data-table';
import { WORK_GROUP_QUERYABLE } from '@/lib/modules/identity';
import { DEFAULT_PAGE_SIZE } from '@/lib/shared/pagination';
import { USERS_ROUTE } from '@/lib/shared/routes';

const PRIMERA_PAGINA = 1;

/** Un campo que el contrato de grupos NO declara ordenable. */
const CAMPO_NO_ORDENABLE = 'nameNormalized';

/** El campo que la pantalla pinta y que SI ordena, tomado de la lista blanca y no escrito aqui. */
const CAMPO_ORDENABLE = WORK_GROUP_QUERYABLE.sortable[0]!;

function params(overrides: Partial<DataTableParams> = {}): DataTableParams {
  return {
    page: PRIMERA_PAGINA,
    pageSize: DEFAULT_PAGE_SIZE,
    sort: null,
    filters: {},
    search: '',
    ...overrides,
  };
}

/** Lee una cadena de consulta como lo haria el App Router, para cerrar la ida y vuelta. */
function comoSearchParams(query: string): Record<string, string> {
  return Object.fromEntries(new URLSearchParams(query).entries());
}

describe('ancla de R16: las listas blancas de grupos NO se amplian aqui', () => {
  it('`WORK_GROUP_QUERYABLE` declara exactamente esos dos campos ordenables', () => {
    // Lista CERRADA. Si una ficha futura anade un campo, tiene que darse de alta AQUI: el ancla se
    // tensa nombrando la entrada nueva, nunca se relaja (R39).
    expect([...WORK_GROUP_QUERYABLE.sortable]).toEqual(['name', 'createdAt']);
  });

  it('NO declara ningun campo filtrable: por eso la pantalla no ofrece ningun filtro', () => {
    expect(WORK_GROUP_QUERYABLE.filterable).toEqual({});
  });

  it('el listado busca: `searchable` es true, asi que la caja de busqueda no miente (R14)', () => {
    expect(WORK_GROUP_QUERYABLE.searchable).toBe(true);
  });

  it('los dos tamanos de pagina son 10 y 25, y el de por defecto es el primero (R13)', () => {
    expect([...PAGE_SIZE_OPTIONS]).toEqual([10, 25]);
    expect(DEFAULT_PAGE_SIZE).toBe(PAGE_SIZE_OPTIONS[0]);
  });
});

describe('`filters` es SIEMPRE `{}`: la lista de grupos no filtra (R16)', () => {
  const entradas: readonly Record<string, string>[] = [
    {},
    { status: 'pending' },
    { filters: 'x' },
    { name: 'Laboratorio' },
  ];

  for (const [indice, entrada] of entradas.entries()) {
    it(`la entrada ${indice} no produce ningun filtro`, () => {
      expect(parseWorkGroupListParams(entrada).filters).toEqual({});
    });
  }

  it('y la cadena canonica no emite ningun parametro de filtro', () => {
    const query = comoSearchParams(buildWorkGroupListQuery(params()));

    expect(Object.keys(query).sort()).toEqual([PAGE_PARAM, PAGE_SIZE_PARAM, TAB_PARAM].sort());
  });
});

describe('ida y vuelta: `parse(build(p))` devuelve `p` (R17)', () => {
  const casos: readonly DataTableParams[] = [
    params(),
    params({ page: 3, pageSize: PAGE_SIZE_OPTIONS[1] }),
    params({ sort: { columnId: CAMPO_ORDENABLE, direction: 'desc' } }),
    // `createdAt` es ordenable en el contrato aunque no sea columna visible (`design.md > 10.3`).
    params({ sort: { columnId: WORK_GROUP_QUERYABLE.sortable[1]!, direction: 'asc' } }),
    params({ search: 'laboratorio' }),
    params({
      page: 2,
      pageSize: PAGE_SIZE_OPTIONS[1],
      sort: { columnId: CAMPO_ORDENABLE, direction: 'asc' },
      search: 'laboratorio',
    }),
  ];

  for (const [indice, caso] of casos.entries()) {
    it(`el caso ${indice} sobrevive a serializar y volver a leer`, () => {
      expect(parseWorkGroupListParams(comoSearchParams(buildWorkGroupListQuery(caso)))).toEqual(
        caso,
      );
    });
  }
});

describe('ninguna entrada produce una excepcion, todas producen una lista (R17)', () => {
  const basura: readonly (Record<string, string | string[] | undefined> | undefined)[] = [
    undefined,
    {},
    { [PAGE_PARAM]: '0' },
    { [PAGE_PARAM]: '-4' },
    { [PAGE_PARAM]: 'muchas' },
    { [PAGE_PARAM]: '1.5' },
    { [PAGE_PARAM]: '1e3' },
    { [PAGE_PARAM]: '0x2' },
    { [PAGE_PARAM]: ' 2 ' },
    { [PAGE_PARAM]: '99999999999999999999' },
    { [PAGE_SIZE_PARAM]: '7' },
    { [PAGE_SIZE_PARAM]: '1000' },
    { [PAGE_SIZE_PARAM]: 'todas' },
    { [SORT_PARAM]: 'name' },
    { [SORT_PARAM]: ':asc' },
    { [SORT_PARAM]: `${CAMPO_ORDENABLE}:arriba` },
    { [SORT_PARAM]: `${CAMPO_NO_ORDENABLE}:asc` },
    { [SEARCH_PARAM]: '   ' },
    { [PAGE_PARAM]: ['3', '9'] },
    { [TAB_PARAM]: 'marciano' },
  ];

  for (const [indice, entrada] of basura.entries()) {
    it(`la entrada ${indice} se acota en vez de fallar`, () => {
      const leidos = parseWorkGroupListParams(entrada);

      expect(leidos.page).toBeGreaterThanOrEqual(PRIMERA_PAGINA);
      expect(PAGE_SIZE_OPTIONS).toContain(leidos.pageSize);
      expect(leidos.filters).toEqual({});
      if (leidos.sort !== null) {
        expect(WORK_GROUP_QUERYABLE.sortable).toContain(leidos.sort.columnId);
      }
    });
  }

  it('una pagina invalida cae a la primera y un tamano invalido al de por defecto', () => {
    const leidos = parseWorkGroupListParams({ [PAGE_PARAM]: 'x', [PAGE_SIZE_PARAM]: '7' });

    expect(leidos).toEqual(params());
  });

  it('de un parametro repetido se toma el PRIMER valor', () => {
    expect(parseWorkGroupListParams({ [PAGE_PARAM]: ['3', '9'] }).page).toBe(3);
  });

  it('el termino se recorta, y uno de solo espacios es no buscar', () => {
    expect(parseWorkGroupListParams({ [SEARCH_PARAM]: '  lab  ' }).search).toBe('lab');
    expect(parseWorkGroupListParams({ [SEARCH_PARAM]: '   ' }).search).toBe('');
    expect(buildWorkGroupListQuery(params({ search: '   ' }))).not.toContain(SEARCH_PARAM);
  });
});

describe('el orden se valida contra la lista blanca LEIDA del contrato (R15)', () => {
  for (const campo of WORK_GROUP_QUERYABLE.sortable) {
    for (const direccion of ['asc', 'desc'] as const) {
      it(`${campo}:${direccion} se acepta porque el contrato lo declara`, () => {
        expect(parseWorkGroupListParams({ [SORT_PARAM]: `${campo}:${direccion}` }).sort).toEqual({
          columnId: campo,
          direction: direccion,
        });
      });
    }
  }

  it('un campo que la lista blanca no declara es «sin orden», no un error', () => {
    expect(WORK_GROUP_QUERYABLE.sortable).not.toContain(CAMPO_NO_ORDENABLE);
    expect(parseWorkGroupListParams({ [SORT_PARAM]: `${CAMPO_NO_ORDENABLE}:asc` }).sort).toBeNull();
  });
});

describe('el destino conserva la pestana y sale de la constante de ruta (R3, R7)', () => {
  it('la cadena canonica emite `tab=grupos`, con el valor de la constante', () => {
    const query = comoSearchParams(buildWorkGroupListQuery(params({ page: 4 })));

    expect(query[TAB_PARAM]).toBe(GROUPS_TAB);
  });

  it('el `href` se deriva de `USERS_ROUTE` y no crea ninguna ruta nueva (R4)', () => {
    const href = workGroupListHref(params({ page: 2, search: 'lab' }));

    expect(href.startsWith(`${USERS_ROUTE}?`)).toBe(true);
    expect(href).toBe(`${USERS_ROUTE}?${buildWorkGroupListQuery(params({ page: 2, search: 'lab' }))}`);
  });

  it('y volver a leer ese destino sigue dando la pestana de GRUPOS: recargar no devuelve a personas', () => {
    const href = workGroupListHref(params({ page: 7, pageSize: PAGE_SIZE_OPTIONS[1] }));
    const leidos = comoSearchParams(href.slice(href.indexOf('?') + 1));

    expect(parseUsuariosTab(leidos)).toBe(GROUPS_TAB);
    expect(parseWorkGroupListParams(leidos)).toEqual(
      params({ page: 7, pageSize: PAGE_SIZE_OPTIONS[1] }),
    );
  });
});
