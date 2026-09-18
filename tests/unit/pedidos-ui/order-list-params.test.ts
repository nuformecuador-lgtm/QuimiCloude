// QC-35 T5 — Parser y serializador de los parametros de lista: R15, R16, R17, R18 y R20.
//
// `order-list-params.ts` es PURO a proposito (`design.md > 5`): sin DOM, sin React y sin `next/*`.
// Por eso este archivo no monta nada y puede ejercitar entrada basura, fuera de rango, por encima
// del tope, campo de orden no declarado y valor de filtro desconocido en unas pocas lineas.
//
// **Los asserts van contra los conjuntos IMPORTADOS del contrato de `pedidos`**, nunca contra
// literales escritos aqui: si manana aparece un quinto estado, este test lo acepta sin tocarse, y
// si alguien reescribiera el conjunto a mano en la pantalla, dejaria de casar.

import { describe, expect, it } from 'vitest';

import {
  CREATED_AT_COLUMN_ID,
  CREATED_FROM_PARAM,
  CREATED_TO_PARAM,
  PAGE_PARAM,
  PAGE_SIZE_PARAM,
  PRIORITY_COLUMN_ID,
  PRIORITY_PARAM,
  SORT_PARAM,
  STATUS_COLUMN_ID,
  STATUS_PARAM,
  buildOrderListQuery,
  orderListHref,
  parseOrderListParams,
} from '@/app/(private)/pedidos/components';
import { PAGE_SIZE_OPTIONS, type DataTableParams } from '@/components/shared/data-table';
import { ORDER_PRIORITY_VALUES, ORDER_QUERYABLE, ORDER_STATUS_VALUES } from '@/lib/modules/pedidos';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@/lib/shared/pagination';
import { ORDERS_ROUTE } from '@/lib/shared/routes';

const PRIMERA_PAGINA = 1;

/** Un campo que el contrato NO declara ordenable, sea cual sea la lista blanca de hoy. */
const CAMPO_NO_ORDENABLE = 'cancellationReason';

/** Un valor que no esta en ninguno de los dos conjuntos cerrados del contrato. */
const VALOR_DESCONOCIDO = 'VALOR-QUE-NO-EXISTE';

describe('parseOrderListParams acota, nunca falla (R18)', () => {
  it('sin ningun parametro entrega la forma canonica: primera pagina, tamano por defecto, sin orden ni filtros', () => {
    expect(parseOrderListParams(undefined)).toEqual({
      page: PRIMERA_PAGINA,
      pageSize: DEFAULT_PAGE_SIZE,
      sort: null,
      filters: {},
      search: '',
    });
    expect(parseOrderListParams({})).toEqual(parseOrderListParams(undefined));
  });

  it('una pagina invalida, negativa, decimal o fuera de rango cae a la primera y NO lanza', () => {
    for (const crudo of ['0', '-3', '1.5', '1e3', '0x2', ' 2 ', 'abc', '', 'NaN']) {
      expect(
        () => parseOrderListParams({ [PAGE_PARAM]: crudo }),
        `«${crudo}» no puede hacer fallar el parser`,
      ).not.toThrow();
      expect(parseOrderListParams({ [PAGE_PARAM]: crudo }).page).toBe(PRIMERA_PAGINA);
    }

    expect(parseOrderListParams({ [PAGE_PARAM]: '7' }).page).toBe(7);
  });

  it('un tamano de pagina fuera de las dos opciones —incluido POR ENCIMA del tope— cae al defecto', () => {
    for (const crudo of ['0', '1', '11', '24', '26', '1000', 'muchos', '']) {
      expect(parseOrderListParams({ [PAGE_SIZE_PARAM]: crudo }).pageSize).toBe(DEFAULT_PAGE_SIZE);
    }

    for (const opcion of PAGE_SIZE_OPTIONS) {
      expect(parseOrderListParams({ [PAGE_SIZE_PARAM]: String(opcion) }).pageSize).toBe(opcion);
    }
    // Las dos opciones son las del backend, no una lista escrita a mano en la pantalla.
    expect([...PAGE_SIZE_OPTIONS]).toEqual([DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE]);
  });

  it('un campo de orden NO declarado en ORDER_QUERYABLE.sortable se descarta: queda sin orden', () => {
    expect(ORDER_QUERYABLE.sortable).not.toContain(CAMPO_NO_ORDENABLE);
    expect(parseOrderListParams({ [SORT_PARAM]: `${CAMPO_NO_ORDENABLE}:asc` }).sort).toBeNull();
  });

  it('una direccion de orden desconocida, o una forma sin separador, se descarta', () => {
    const [ordenable] = ORDER_QUERYABLE.sortable;

    for (const crudo of [`${ordenable}:ASC`, `${ordenable}:arriba`, ordenable, `:asc`, '']) {
      expect(parseOrderListParams({ [SORT_PARAM]: crudo }).sort).toBeNull();
    }

    expect(parseOrderListParams({ [SORT_PARAM]: `${ordenable}:desc` }).sort).toEqual({
      columnId: ordenable,
      direction: 'desc',
    });
  });

  it('los valores de filtro que no estan en el conjunto cerrado se descartan UNO A UNO', () => {
    const [primerEstado] = ORDER_STATUS_VALUES;
    const params = parseOrderListParams({
      [STATUS_PARAM]: `${VALOR_DESCONOCIDO},${primerEstado}`,
    });

    expect(params.filters[STATUS_COLUMN_ID]).toEqual({ kind: 'select', values: [primerEstado] });
  });

  it('una lista de filtro que se queda vacia es «sin filtro», no un filtro que no case con nada', () => {
    expect(parseOrderListParams({ [STATUS_PARAM]: VALOR_DESCONOCIDO }).filters).toEqual({});
    expect(parseOrderListParams({ [STATUS_PARAM]: '' }).filters).toEqual({});
    expect(parseOrderListParams({ [PRIORITY_PARAM]: ',,,' }).filters).toEqual({});
  });

  it('acepta todos los estados y todas las prioridades que declara el contrato', () => {
    const params = parseOrderListParams({
      [STATUS_PARAM]: ORDER_STATUS_VALUES.join(','),
      [PRIORITY_PARAM]: ORDER_PRIORITY_VALUES.join(','),
    });

    expect(params.filters[STATUS_COLUMN_ID]).toEqual({
      kind: 'select',
      values: [...ORDER_STATUS_VALUES],
    });
    expect(params.filters[PRIORITY_COLUMN_ID]).toEqual({
      kind: 'select',
      values: [...ORDER_PRIORITY_VALUES],
    });
  });

  it('una fecha vacia o no parseable deja ESE extremo a null, y los dos nulos son «sin filtro»', () => {
    expect(
      parseOrderListParams({ [CREATED_FROM_PARAM]: '2026-01-15', [CREATED_TO_PARAM]: 'ayer' })
        .filters[CREATED_AT_COLUMN_ID],
    ).toEqual({ kind: 'dateRange', from: '2026-01-15', to: null });

    expect(
      parseOrderListParams({ [CREATED_FROM_PARAM]: '', [CREATED_TO_PARAM]: '2026-13-45' }).filters,
    ).toEqual({});
  });

  it('de un parametro repetido se toma el primer valor y no se rompe', () => {
    expect(parseOrderListParams({ [PAGE_PARAM]: ['3', '9'] }).page).toBe(3);
  });
});

describe('la URL es la unica verdad del estado de lista: ida y vuelta (R15)', () => {
  const [ordenable] = ORDER_QUERYABLE.sortable;
  const [primerEstado, segundoEstado] = ORDER_STATUS_VALUES;
  const [primeraPrioridad] = ORDER_PRIORITY_VALUES;

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
      'con los tres filtros a la vez',
      {
        page: 2,
        pageSize: DEFAULT_PAGE_SIZE,
        sort: { columnId: ordenable, direction: 'desc' },
        filters: {
          [STATUS_COLUMN_ID]: { kind: 'select', values: [primerEstado, segundoEstado] },
          [PRIORITY_COLUMN_ID]: { kind: 'select', values: [primeraPrioridad] },
          [CREATED_AT_COLUMN_ID]: { kind: 'dateRange', from: '2026-01-01', to: '2026-02-28' },
        },
        search: '',
      },
    ],
    [
      'con el rango abierto por un solo lado',
      {
        page: PRIMERA_PAGINA,
        pageSize: DEFAULT_PAGE_SIZE,
        sort: null,
        filters: { [CREATED_AT_COLUMN_ID]: { kind: 'dateRange', from: null, to: '2026-02-28' } },
        search: '',
      },
    ],
  ];

  it.each(casos)('parse(build(params)) devuelve params: %s', (_nombre, params) => {
    const url = new URLSearchParams(buildOrderListQuery(params));
    const entrada = Object.fromEntries(url.entries());

    expect(parseOrderListParams(entrada)).toEqual(params);
  });

  it('el destino de la lista se DERIVA de ORDERS_ROUTE, no de un literal (R2)', () => {
    const [, params] = casos[1];

    expect(orderListHref(params)).toBe(`${ORDERS_ROUTE}?${buildOrderListQuery(params)}`);
    expect(orderListHref(params).startsWith(ORDERS_ROUTE)).toBe(true);
  });
});

// Nota fechada 2026-09-18 (QC-68): `ORDER_QUERYABLE.searchable` paso a `true` (R11), asi que el
// primer caso de este bloque cambia de valor. Los otros dos NO se borran: siguen vigilando que
// esta pantalla, en concreto, no lea ni emita `search` -su motivo ya no es que el contrato lo
// prohiba, sino que la caja de busqueda todavia no esta construida aqui (R16)-.
describe('la pantalla todavia no busca, aunque el contrato ya lo permita (R16)', () => {
  it('el contrato de pedidos ya declara searchable: true (R11)', () => {
    expect(ORDER_QUERYABLE.searchable).toBe(true);
  });

  it('un `search` en la URL se IGNORA: la consulta sale siempre con busqueda vacia (R16)', () => {
    const params = parseOrderListParams({
      search: 'acido citrico',
      q: 'acido citrico',
      [PAGE_PARAM]: '2',
    });

    expect(params.search).toBe('');
    // Y no se cuela como filtro por la puerta de atras.
    expect(params.filters).toEqual({});
  });

  it('buildOrderListQuery NUNCA emite un parametro `search`, ni siquiera vacio (R16)', () => {
    const conBusqueda: DataTableParams = {
      page: PRIMERA_PAGINA,
      pageSize: DEFAULT_PAGE_SIZE,
      sort: null,
      filters: {},
      search: 'esto no debe viajar',
    };

    const url = new URLSearchParams(buildOrderListQuery(conBusqueda));

    expect(url.has('search')).toBe(false);
    expect(buildOrderListQuery(conBusqueda)).not.toContain('esto');
    // Y al volver a leerla, la busqueda se ha perdido: la URL es la unica verdad.
    expect(parseOrderListParams(Object.fromEntries(url.entries())).search).toBe('');
  });
});
