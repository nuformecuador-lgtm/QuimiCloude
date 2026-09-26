import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  ROUTE_ORDER_STATUS_VALUES,
  STATUS_PARAM,
  VIEW_PARAM,
  assignmentViewHref,
  isExactlyDelivered,
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

  it('R41 - las siete palabras validas son exactamente las de `/pedidos`, en orden de flujo', () => {
    expect([...ROUTE_ORDER_STATUS_VALUES]).toEqual([
      'PENDIENTE',
      'EN_CURSO',
      'POR_EMPACAR',
      'EN_EMPAQUE',
      'ENTREGADO',
      'CANCELADO',
      'BLOQUEADO',
    ]);
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

describe('isExactlyDelivered (R31)', () => {
  it('solo ["ENTREGADO"] cuenta como exacto', () => {
    expect(isExactlyDelivered(['ENTREGADO'])).toBe(true);
    expect(isExactlyDelivered([])).toBe(false);
    expect(isExactlyDelivered(['ENTREGADO', 'CANCELADO'])).toBe(false);
    expect(isExactlyDelivered(['PENDIENTE'])).toBe(false);
  });
});

describe('R31 - page.tsx (Server Component) no invoca funciones de un modulo `\'use client\'`', () => {
  const componentsDir = join(process.cwd(), 'app', '(private)', 'asignacion', 'components');

  /**
   * `page.tsx` invoca `isExactlyDelivered(statuses)` como funcion, no la pinta como JSX: si
   * viviera en un archivo `'use client'` (como `company-orders-columns.tsx`), Next.js revienta en
   * runtime aunque `tsc` y el barrel no digan nada. Barato de comprobar aqui, sin levantar el
   * servidor: el modulo que la define no puede empezar con `'use client'`.
   */
  it('el modulo que define isExactlyDelivered no es `use client`', () => {
    const pageSource = readFileSync(
      join(process.cwd(), 'app', '(private)', 'asignacion', 'page.tsx'),
      'utf8',
    );
    expect(pageSource).toContain('isExactlyDelivered(statuses)');

    const ownerModule = readFileSync(join(componentsDir, 'assignment-view-params.ts'), 'utf8');
    expect(ownerModule).toContain('export function isExactlyDelivered');
    expect(ownerModule.trimStart().startsWith("'use client'")).toBe(false);
  });
});
