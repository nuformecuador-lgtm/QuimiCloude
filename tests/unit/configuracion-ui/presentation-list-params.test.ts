// QC-45 T3 — Parser y serializador de los parametros de lista de presentaciones: R2, R10, R11,
// R12, R13 y R14.
//
// `presentation-list-params.ts` es PURO a proposito (`design.md > 5.2`): sin DOM, sin React y sin
// `next/*`. Por eso este archivo no monta nada y puede ejercitar entrada basura, fuera de rango,
// por encima del tope y campo de orden no declarado en unas pocas lineas.
//
// **Los asserts van contra los conjuntos IMPORTADOS del contrato de `inventario` y de la tabla
// compartida**, nunca contra literales escritos aqui: si manana el catalogo declara otro campo
// ordenable, este test lo acepta sin tocarse, y si alguien reescribiera la lista a mano en la
// pantalla, dejaria de casar.

import { describe, expect, it } from 'vitest';

import {
  PAGE_PARAM,
  PAGE_SIZE_PARAM,
  SEARCH_PARAM,
  SORT_PARAM,
  buildPresentationListQuery,
  parsePresentationListParams,
  presentationListHref,
} from '@/app/(private)/configuracion/presentaciones/components';
import { PAGE_SIZE_OPTIONS, type DataTableParams } from '@/components/shared/data-table';
import { PRESENTATION_QUERYABLE } from '@/lib/modules/inventario';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@/lib/shared/pagination';
import { PRESENTATIONS_ROUTE } from '@/lib/shared/routes';

const PRIMERA_PAGINA = 1;

/** Un campo que el contrato NO declara ordenable, sea cual sea la lista blanca de hoy. */
const CAMPO_NO_ORDENABLE = 'nameNormalized';

/** Entradas basura que T3 exige que no rompan nada. */
const BASURA_NUMERICA = ['abc', '0', '-3', '1.5', '1e3', '0x2', ' 2 ', '', 'NaN'] as const;

describe('parsePresentationListParams acota, nunca falla (R14)', () => {
  it('sin ningun parametro entrega la forma canonica: primera pagina, tamano por defecto, sin orden, sin filtros y sin busqueda', () => {
    expect(parsePresentationListParams(undefined)).toEqual({
      page: PRIMERA_PAGINA,
      pageSize: DEFAULT_PAGE_SIZE,
      sort: null,
      filters: {},
      search: '',
    });
    expect(parsePresentationListParams({})).toEqual(parsePresentationListParams(undefined));
  });

  it('una pagina invalida, negativa, decimal o exponencial cae a la primera y NO lanza', () => {
    for (const crudo of BASURA_NUMERICA) {
      expect(
        () => parsePresentationListParams({ [PAGE_PARAM]: crudo }),
        `«${crudo}» no puede hacer fallar el parser`,
      ).not.toThrow();
      expect(parsePresentationListParams({ [PAGE_PARAM]: crudo }).page).toBe(PRIMERA_PAGINA);
    }

    expect(parsePresentationListParams({ [PAGE_PARAM]: '7' }).page).toBe(7);
  });

  it('un tamano de pagina fuera de las dos opciones —incluido POR ENCIMA del tope— cae al defecto (R12)', () => {
    for (const crudo of [...BASURA_NUMERICA, '1', '11', '24', '26', '1000']) {
      expect(
        () => parsePresentationListParams({ [PAGE_SIZE_PARAM]: crudo }),
        `«${crudo}» no puede hacer fallar el parser`,
      ).not.toThrow();
      expect(parsePresentationListParams({ [PAGE_SIZE_PARAM]: crudo }).pageSize).toBe(
        DEFAULT_PAGE_SIZE,
      );
    }

    for (const opcion of PAGE_SIZE_OPTIONS) {
      expect(parsePresentationListParams({ [PAGE_SIZE_PARAM]: String(opcion) }).pageSize).toBe(
        opcion,
      );
    }
    // Las dos opciones son las importadas, no una lista escrita a mano en la pantalla (R12).
    expect([...PAGE_SIZE_OPTIONS]).toEqual([DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE]);
  });

  it('un campo de orden NO declarado en PRESENTATION_QUERYABLE.sortable se descarta: queda sin orden (R11)', () => {
    expect(PRESENTATION_QUERYABLE.sortable).not.toContain(CAMPO_NO_ORDENABLE);

    for (const crudo of [`${CAMPO_NO_ORDENABLE}:asc`, 'creado:asc', 'id:desc']) {
      expect(() => parsePresentationListParams({ [SORT_PARAM]: crudo })).not.toThrow();
      expect(parsePresentationListParams({ [SORT_PARAM]: crudo }).sort).toBeNull();
    }
  });

  it('una direccion de orden desconocida, o una forma sin separador, se descarta', () => {
    const [ordenable] = PRESENTATION_QUERYABLE.sortable;

    for (const crudo of [`${ordenable}:arriba`, `${ordenable}:ASC`, ordenable, ':asc', '']) {
      expect(parsePresentationListParams({ [SORT_PARAM]: crudo }).sort).toBeNull();
    }

    for (const campo of PRESENTATION_QUERYABLE.sortable) {
      expect(parsePresentationListParams({ [SORT_PARAM]: `${campo}:desc` }).sort).toEqual({
        columnId: campo,
        direction: 'desc',
      });
    }
  });

  it('de un parametro repetido (array) se toma el primer valor y no se rompe', () => {
    expect(parsePresentationListParams({ [PAGE_PARAM]: ['3', '9'] }).page).toBe(3);
    expect(parsePresentationListParams({ [PAGE_SIZE_PARAM]: ['1000', '25'] }).pageSize).toBe(
      DEFAULT_PAGE_SIZE,
    );
    expect(parsePresentationListParams({ [SEARCH_PARAM]: ['acido', 'otro'] }).search).toBe('acido');
    expect(parsePresentationListParams({ [SORT_PARAM]: [] }).sort).toBeNull();
  });

  it('ninguna combinacion de basura lanza, y todas producen parametros validos', () => {
    const entradas: ReadonlyArray<Record<string, string | readonly string[] | undefined>> = [
      { [PAGE_PARAM]: 'abc', [PAGE_SIZE_PARAM]: '1000', [SORT_PARAM]: 'creado:asc' },
      { [PAGE_PARAM]: '-3', [SORT_PARAM]: 'name:arriba', [SEARCH_PARAM]: undefined },
      { [PAGE_PARAM]: ['1.5'], [PAGE_SIZE_PARAM]: ['1e3'], [SORT_PARAM]: ['::'] },
      { desconocido: 'sobra', [SEARCH_PARAM]: '   ' },
    ];

    for (const entrada of entradas) {
      expect(() => parsePresentationListParams(entrada)).not.toThrow();

      const params = parsePresentationListParams(entrada);

      expect(Number.isSafeInteger(params.page)).toBe(true);
      expect(params.page).toBeGreaterThanOrEqual(PRIMERA_PAGINA);
      expect(PAGE_SIZE_OPTIONS).toContain(params.pageSize);
      expect(params.filters).toEqual({});
      expect(typeof params.search).toBe('string');
      if (params.sort !== null) {
        expect(PRESENTATION_QUERYABLE.sortable).toContain(params.sort.columnId);
      }
      // No se inventa ninguna clave de mas: `createListQuerySchema()` es `z.strictObject`.
      expect(Object.keys(params).sort()).toEqual(['filters', 'page', 'pageSize', 'search', 'sort']);
    }
  });
});

describe('esta lista SI busca, y NUNCA filtra (R9, R10)', () => {
  it('el contrato de presentaciones declara searchable: true, que es de donde sale R10', () => {
    expect(PRESENTATION_QUERYABLE.searchable).toBe(true);
  });

  it('el termino de busqueda se lee de la URL y se emite de vuelta', () => {
    const params = parsePresentationListParams({ [SEARCH_PARAM]: 'acido citrico' });

    expect(params.search).toBe('acido citrico');
    expect(new URLSearchParams(buildPresentationListQuery(params)).get(SEARCH_PARAM)).toBe(
      'acido citrico',
    );
  });

  it('una busqueda en blanco es «sin busqueda» y no ensucia la URL', () => {
    expect(parsePresentationListParams({ [SEARCH_PARAM]: '   ' }).search).toBe('');
    expect(
      new URLSearchParams(
        buildPresentationListQuery(parsePresentationListParams({ [SEARCH_PARAM]: '   ' })),
      ).has(SEARCH_PARAM),
    ).toBe(false);
  });

  it('los filtros son SIEMPRE {}: ninguna columna filtrable del contrato se pinta en esta pantalla', () => {
    expect(Object.keys(PRESENTATION_QUERYABLE.filterable)).toEqual(['createdAt', 'unitId']);

    for (const entrada of [
      { createdFrom: '2026-01-01', createdTo: '2026-02-28' },
      { createdAt: '2026-01-01', name: 'algo' },
      { unitId: '11111111-1111-4111-8111-111111111111' },
    ]) {
      expect(parsePresentationListParams(entrada).filters).toEqual({});
    }

    const conFiltro: DataTableParams = {
      page: PRIMERA_PAGINA,
      pageSize: DEFAULT_PAGE_SIZE,
      sort: null,
      filters: { createdAt: { kind: 'dateRange', from: '2026-01-01', to: null } },
      search: '',
    };

    expect(buildPresentationListQuery(conFiltro)).not.toContain('2026');
  });
});

describe('la URL es la unica verdad del estado de lista: ida y vuelta (R13, R14)', () => {
  const [ordenable] = PRESENTATION_QUERYABLE.sortable;

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
        search: 'acido citrico',
      },
    ],
  ];

  it.each(casos)('parse(build(params)) devuelve params: %s', (_nombre, params) => {
    const url = new URLSearchParams(buildPresentationListQuery(params));
    const entrada = Object.fromEntries(url.entries());

    expect(parsePresentationListParams(entrada)).toEqual(params);
  });

  it('el destino de la lista se DERIVA de PRESENTATIONS_ROUTE, no de un literal (R2)', () => {
    for (const [, params] of casos) {
      expect(presentationListHref(params)).toBe(
        `${PRESENTATIONS_ROUTE}?${buildPresentationListQuery(params)}`,
      );
      expect(presentationListHref(params).startsWith(PRESENTATIONS_ROUTE)).toBe(true);
    }
  });
});
