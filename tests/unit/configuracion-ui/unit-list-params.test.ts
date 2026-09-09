// QC-39 T5 — Parser y serializador de los parametros de lista de unidades: R8, R18, R19, R20,
// R21 y R23.
//
// `unit-list-params.ts` es PURO a proposito (`design.md > 5.2`): sin DOM, sin React y sin
// `next/*`. Por eso este archivo no monta nada y puede ejercitar entrada basura, fuera de rango,
// por encima del tope y campo de orden no declarado en unas pocas lineas.
//
// **Los asserts van contra los conjuntos IMPORTADOS del contrato de `unidades` y de la tabla
// compartida**, nunca contra literales escritos aqui (R49): si manana el catalogo declara otro
// campo ordenable, este test lo acepta sin tocarse, y si alguien reescribiera la lista a mano en
// la pantalla, dejaria de casar.

import { describe, expect, it } from 'vitest';

import {
  PAGE_PARAM,
  PAGE_SIZE_PARAM,
  SEARCH_PARAM,
  SORT_PARAM,
  buildUnitListQuery,
  parseUnitListParams,
  unitListHref,
} from '@/app/(private)/configuracion/unidades/components';
import { PAGE_SIZE_OPTIONS, type DataTableParams } from '@/components/shared/data-table';
import { UNIT_QUERYABLE } from '@/lib/modules/unidades';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@/lib/shared/pagination';
import { UNITS_ROUTE } from '@/lib/shared/routes';

const PRIMERA_PAGINA = 1;

/** Un campo que el contrato NO declara ordenable, sea cual sea la lista blanca de hoy. */
const CAMPO_NO_ORDENABLE = 'nameNormalized';

/**
 * La columna que la pantalla SI pinta pero que NO es un campo del catalogo: es una frase compuesta
 * (`design.md > 9`). Ordenar por ella exigiria ampliar la lista blanca, contra R6.
 */
const COLUMNA_DE_EQUIVALENCIA = 'equivalencia';

/** Entradas basura que T5 exige que no rompan nada. */
const BASURA_NUMERICA = ['abc', '0', '-3', '1.5', '1e3', '0x2', ' 2 ', '', 'NaN'] as const;

describe('parseUnitListParams acota, nunca falla (R23)', () => {
  it('sin ningun parametro entrega la forma canonica: primera pagina, tamano por defecto, sin orden, sin filtros y sin busqueda', () => {
    expect(parseUnitListParams(undefined)).toEqual({
      page: PRIMERA_PAGINA,
      pageSize: DEFAULT_PAGE_SIZE,
      sort: null,
      filters: {},
      search: '',
    });
    expect(parseUnitListParams({})).toEqual(parseUnitListParams(undefined));
  });

  it('una pagina invalida, negativa, decimal o exponencial cae a la primera y NO lanza', () => {
    for (const crudo of BASURA_NUMERICA) {
      expect(
        () => parseUnitListParams({ [PAGE_PARAM]: crudo }),
        `«${crudo}» no puede hacer fallar el parser`,
      ).not.toThrow();
      expect(parseUnitListParams({ [PAGE_PARAM]: crudo }).page).toBe(PRIMERA_PAGINA);
    }

    expect(parseUnitListParams({ [PAGE_PARAM]: '7' }).page).toBe(7);
  });

  it('un tamano de pagina fuera de las dos opciones —incluido POR ENCIMA del tope— cae al defecto (R21)', () => {
    for (const crudo of [...BASURA_NUMERICA, '1', '11', '24', '26', '1000']) {
      expect(
        () => parseUnitListParams({ [PAGE_SIZE_PARAM]: crudo }),
        `«${crudo}» no puede hacer fallar el parser`,
      ).not.toThrow();
      expect(parseUnitListParams({ [PAGE_SIZE_PARAM]: crudo }).pageSize).toBe(DEFAULT_PAGE_SIZE);
    }

    for (const opcion of PAGE_SIZE_OPTIONS) {
      expect(parseUnitListParams({ [PAGE_SIZE_PARAM]: String(opcion) }).pageSize).toBe(opcion);
    }
    // Las dos opciones son las importadas, no una lista escrita a mano en la pantalla (R21).
    expect([...PAGE_SIZE_OPTIONS]).toEqual([DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE]);
  });

  it('un campo de orden NO declarado en UNIT_QUERYABLE.sortable se descarta: queda sin orden (R19)', () => {
    expect(UNIT_QUERYABLE.sortable).not.toContain(CAMPO_NO_ORDENABLE);
    expect(UNIT_QUERYABLE.sortable).not.toContain(COLUMNA_DE_EQUIVALENCIA);

    for (const crudo of [
      `${CAMPO_NO_ORDENABLE}:asc`,
      `${COLUMNA_DE_EQUIVALENCIA}:asc`,
      'acciones:desc',
      'id:desc',
      'companyId:asc',
    ]) {
      expect(() => parseUnitListParams({ [SORT_PARAM]: crudo })).not.toThrow();
      expect(parseUnitListParams({ [SORT_PARAM]: crudo }).sort).toBeNull();
    }
  });

  it('una direccion de orden desconocida, o una forma sin separador, se descarta', () => {
    const [ordenable] = UNIT_QUERYABLE.sortable;

    for (const crudo of [`${ordenable}:arriba`, `${ordenable}:ASC`, ordenable, ':asc', '', '::']) {
      expect(parseUnitListParams({ [SORT_PARAM]: crudo }).sort).toBeNull();
    }

    for (const campo of UNIT_QUERYABLE.sortable) {
      expect(parseUnitListParams({ [SORT_PARAM]: `${campo}:desc` }).sort).toEqual({
        columnId: campo,
        direction: 'desc',
      });
      expect(parseUnitListParams({ [SORT_PARAM]: `${campo}:asc` }).sort).toEqual({
        columnId: campo,
        direction: 'asc',
      });
    }
  });

  it('de un parametro repetido (array) se toma el primer valor y no se rompe', () => {
    expect(parseUnitListParams({ [PAGE_PARAM]: ['3', '9'] }).page).toBe(3);
    expect(parseUnitListParams({ [PAGE_SIZE_PARAM]: ['1000', '25'] }).pageSize).toBe(
      DEFAULT_PAGE_SIZE,
    );
    expect(parseUnitListParams({ [SEARCH_PARAM]: ['kilo', 'otro'] }).search).toBe('kilo');
    expect(parseUnitListParams({ [SORT_PARAM]: [] }).sort).toBeNull();
  });

  it('ninguna combinacion de basura lanza, y todas producen parametros validos', () => {
    const entradas: ReadonlyArray<Record<string, string | readonly string[] | undefined>> = [
      { [PAGE_PARAM]: 'abc', [PAGE_SIZE_PARAM]: '1000', [SORT_PARAM]: 'equivalencia:asc' },
      { [PAGE_PARAM]: '-3', [SORT_PARAM]: 'name:arriba', [SEARCH_PARAM]: undefined },
      { [PAGE_PARAM]: ['1.5'], [PAGE_SIZE_PARAM]: ['1e3'], [SORT_PARAM]: ['::'] },
      { desconocido: 'sobra', [SEARCH_PARAM]: '   ' },
    ];

    for (const entrada of entradas) {
      expect(() => parseUnitListParams(entrada)).not.toThrow();

      const params = parseUnitListParams(entrada);

      expect(Number.isSafeInteger(params.page)).toBe(true);
      expect(params.page).toBeGreaterThanOrEqual(PRIMERA_PAGINA);
      expect(PAGE_SIZE_OPTIONS).toContain(params.pageSize);
      expect(params.filters).toEqual({});
      expect(typeof params.search).toBe('string');
      if (params.sort !== null) {
        expect(UNIT_QUERYABLE.sortable).toContain(params.sort.columnId);
      }
      // No se inventa ninguna clave de mas: `createListQuerySchema()` es `z.strictObject`.
      expect(Object.keys(params).sort()).toEqual(['filters', 'page', 'pageSize', 'search', 'sort']);
    }
  });
});

describe('esta lista SI busca, y NUNCA filtra (R18, R20)', () => {
  it('el contrato de unidades declara searchable: true, que es de donde sale R18', () => {
    expect(UNIT_QUERYABLE.searchable).toBe(true);
  });

  it('el termino de busqueda se lee de la URL y se emite de vuelta', () => {
    const params = parseUnitListParams({ [SEARCH_PARAM]: 'kilo gramo' });

    expect(params.search).toBe('kilo gramo');
    expect(new URLSearchParams(buildUnitListQuery(params)).get(SEARCH_PARAM)).toBe('kilo gramo');
  });

  it('una busqueda en blanco es «sin busqueda» y no ensucia la URL', () => {
    expect(parseUnitListParams({ [SEARCH_PARAM]: '   ' }).search).toBe('');
    expect(
      new URLSearchParams(
        buildUnitListQuery(parseUnitListParams({ [SEARCH_PARAM]: '   ' })),
      ).has(SEARCH_PARAM),
    ).toBe(false);
  });

  it('los filtros son SIEMPRE {}: el contrato no declara ninguno, a proposito (R20)', () => {
    expect(Object.keys(UNIT_QUERYABLE.filterable)).toEqual([]);

    for (const entrada of [
      { createdFrom: '2026-01-01', createdTo: '2026-02-28' },
      { isSystem: 'true', baseUnitId: 'algo' },
      { filters: 'inventado', ambito: 'sistema' },
    ]) {
      expect(() => parseUnitListParams(entrada)).not.toThrow();
      expect(parseUnitListParams(entrada).filters).toEqual({});
    }

    const conFiltro: DataTableParams = {
      page: PRIMERA_PAGINA,
      pageSize: DEFAULT_PAGE_SIZE,
      sort: null,
      filters: { createdAt: { kind: 'dateRange', from: '2026-01-01', to: null } },
      search: '',
    };

    expect(buildUnitListQuery(conFiltro)).not.toContain('2026');
  });
});

describe('la URL es la unica verdad del estado de lista: ida y vuelta (R8, R23)', () => {
  const [ordenable] = UNIT_QUERYABLE.sortable;

  const casos: ReadonlyArray<readonly [string, DataTableParams]> = [
    [
      'canonico',
      { page: PRIMERA_PAGINA, pageSize: DEFAULT_PAGE_SIZE, sort: null, filters: {}, search: '' },
    ],
    [
      'con orden y tamano maximo',
      {
        page: 4,
        pageSize: MAX_PAGE_SIZE,
        sort: { columnId: ordenable, direction: 'asc' },
        filters: {},
        search: '',
      },
    ],
    [
      'con busqueda y orden descendente',
      {
        page: 2,
        pageSize: DEFAULT_PAGE_SIZE,
        sort: { columnId: ordenable, direction: 'desc' },
        filters: {},
        search: 'kilo gramo',
      },
    ],
  ];

  it.each(casos)('parse(build(params)) devuelve params: %s', (_nombre, params) => {
    const url = new URLSearchParams(buildUnitListQuery(params));
    const entrada = Object.fromEntries(url.entries());

    expect(parseUnitListParams(entrada)).toEqual(params);
  });

  it('el destino de la lista se DERIVA de UNITS_ROUTE, no de un literal (R8)', () => {
    for (const [, params] of casos) {
      expect(unitListHref(params)).toBe(`${UNITS_ROUTE}?${buildUnitListQuery(params)}`);
      expect(unitListHref(params).startsWith(UNITS_ROUTE)).toBe(true);
    }
  });
});
