import { describe, expect, it } from 'vitest';

import {
  ROUTE_ORDER_STATUS_VALUES,
  STATUS_PARAM,
  VIEW_PARAM,
  assignmentViewHref,
  parseAssignmentListParams,
  parseAssignmentViewParam,
  parseStatusFilter,
} from '@/app/(private)/asignacion/components';
import { PAGE_SIZE_OPTIONS } from '@/components/shared/data-table';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@/lib/shared/pagination';
import { ASSIGNED_ORDERS_ROUTE } from '@/lib/shared/routes';

describe('parseAssignmentViewParam resuelve la vista de la URL contra las permitidas (R11-R15)', () => {
  it('sin `vista` en la URL, cae a la primera permitida', () => {
    expect(parseAssignmentViewParam(undefined, ['asignados', 'terminados'])).toBe('asignados');
    expect(parseAssignmentViewParam({}, ['todos'])).toBe('todos');
  });

  it('con una `vista` permitida, se devuelve tal cual', () => {
    expect(parseAssignmentViewParam({ [VIEW_PARAM]: 'terminados' }, ['asignados', 'terminados'])).toBe(
      'terminados',
    );
  });

  it('con una `vista` que no existe o que el usuario no tiene (R15), cae a la primera sin lanzar', () => {
    expect(parseAssignmentViewParam({ [VIEW_PARAM]: 'inventada' }, ['asignados'])).toBe('asignados');
    expect(parseAssignmentViewParam({ [VIEW_PARAM]: 'todos' }, ['asignados', 'terminados'])).toBe(
      'asignados',
    );
  });

  it('de un parametro repetido se toma el primer valor', () => {
    expect(
      parseAssignmentViewParam({ [VIEW_PARAM]: ['terminados', 'todos'] }, ['asignados', 'terminados']),
    ).toBe('terminados');
  });
});

describe('parseAssignmentListParams acota page/pageSize sin lanzar nunca (R27)', () => {
  it('sin ningun parametro entrega la primera pagina y el tamano por defecto', () => {
    expect(parseAssignmentListParams(undefined)).toEqual({
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
      sort: null,
      filters: {},
      search: '',
    });
    expect(DEFAULT_PAGE_SIZE).toBe(10);
  });

  it('una pagina invalida, negativa o decimal cae a la primera y NO lanza', () => {
    for (const crudo of ['0', '-3', '1.5', 'abc', '', 'NaN']) {
      expect(() => parseAssignmentListParams({ page: crudo })).not.toThrow();
      expect(parseAssignmentListParams({ page: crudo }).page).toBe(1);
    }
    expect(parseAssignmentListParams({ page: '4' }).page).toBe(4);
  });

  it('un tamano de pagina fuera de las opciones -incluido por encima del tope de 25- cae al defecto', () => {
    for (const crudo of ['0', '11', '1000', 'muchos']) {
      expect(parseAssignmentListParams({ pageSize: crudo }).pageSize).toBe(DEFAULT_PAGE_SIZE);
    }
    for (const opcion of PAGE_SIZE_OPTIONS) {
      expect(parseAssignmentListParams({ pageSize: String(opcion) }).pageSize).toBe(opcion);
    }
    expect(MAX_PAGE_SIZE).toBe(25);
  });
});

describe('parseStatusFilter descarta lo que no es un estado conocido (R24)', () => {
  it('sin `status`, no hay filtro', () => {
    expect(parseStatusFilter(undefined)).toEqual([]);
    expect(parseStatusFilter({})).toEqual([]);
  });

  it('separa por comas, en el mismo formato que `/pedidos`', () => {
    expect(parseStatusFilter({ [STATUS_PARAM]: 'PENDIENTE,ENTREGADO' })).toEqual([
      'PENDIENTE',
      'ENTREGADO',
    ]);
  });

  it('descarta en silencio lo que no esta en ROUTE_ORDER_STATUS_VALUES', () => {
    expect(parseStatusFilter({ [STATUS_PARAM]: 'PENDIENTE,INVENTADO' })).toEqual(['PENDIENTE']);
    expect(parseStatusFilter({ [STATUS_PARAM]: 'inventado-total' })).toEqual([]);
  });

  it('deduplica los valores repetidos conservando el primer orden', () => {
    expect(parseStatusFilter({ [STATUS_PARAM]: 'ENTREGADO,PENDIENTE,ENTREGADO' })).toEqual([
      'ENTREGADO',
      'PENDIENTE',
    ]);
  });

  it('exactamente ENTREGADO se distingue de ENTREGADO mezclado con otro (D16)', () => {
    expect(parseStatusFilter({ [STATUS_PARAM]: 'ENTREGADO' })).toEqual(['ENTREGADO']);
    expect(parseStatusFilter({ [STATUS_PARAM]: 'ENTREGADO,PENDIENTE' })).not.toEqual(['ENTREGADO']);
  });

  it('las cuatro palabras validas son exactamente las de `/pedidos`', () => {
    expect([...ROUTE_ORDER_STATUS_VALUES]).toEqual(['PENDIENTE', 'EN_CURSO', 'ENTREGADO', 'CANCELADO']);
  });
});

describe('assignmentViewHref deriva SIEMPRE de ASSIGNED_ORDERS_ROUTE y lleva solo `vista`', () => {
  it('el destino se deriva de la constante, nunca de un literal', () => {
    expect(assignmentViewHref('terminados')).toBe(`${ASSIGNED_ORDERS_ROUTE}?${VIEW_PARAM}=terminados`);
    expect(assignmentViewHref('terminados').startsWith(ASSIGNED_ORDERS_ROUTE)).toBe(true);
  });

  it('no arrastra pagina ni filtro de la vista de origen', () => {
    const url = new URLSearchParams(assignmentViewHref('todos').split('?')[1]);
    expect([...url.keys()]).toEqual([VIEW_PARAM]);
  });
});
