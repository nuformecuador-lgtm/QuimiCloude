import { describe, expect, it } from 'vitest';

import {
  buildExecutionTraceListQuery,
  createDefaultExecutionTraceListParams,
  executionTraceDetailHref,
  executionTraceListHref,
  fromDataTableParams,
  LAST_AT_COLUMN_ID,
  parseExecutionTraceListParams,
  PERSON_COLUMN_ID,
  toDataTableParams,
  toExecutionTraceListInput,
  withFiltersResetPage,
  type ExecutionTraceListParams,
} from '@/app/(private)/dashboard/components/execution-trace-list-params';
import { DASHBOARD_ROUTE, executionTraceRoute } from '@/lib/shared/routes';

const PERSONA = '3f2b8c1e-5d4a-4b7e-9c2f-1a2b3c4d5e6f';
const OTRA_PERSONA = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';

function params(overrides: Partial<ExecutionTraceListParams> = {}): ExecutionTraceListParams {
  return { ...createDefaultExecutionTraceListParams(), ...overrides };
}

function query(text: string) {
  return Object.fromEntries(new URLSearchParams(text));
}

describe('R5 - pagina y tamano acotados en la URL', () => {
  it('R5 - sin parametros devuelve la pagina 1 a 10 filas', () => {
    expect(parseExecutionTraceListParams(undefined)).toEqual(params());
    expect(parseExecutionTraceListParams({})).toEqual(params());
  });

  it('R5 - acepta 10 y 25 como tamano', () => {
    expect(parseExecutionTraceListParams({ pageSize: '25' }).pageSize).toBe(25);
    expect(parseExecutionTraceListParams({ pageSize: '10' }).pageSize).toBe(10);
  });

  it.each(['50', '0', '-10', 'abc', '1.5', '', ' 25'])(
    'R5 - tamano %j cae al defecto sin lanzar',
    (raw) => {
      expect(parseExecutionTraceListParams({ pageSize: raw }).pageSize).toBe(10);
    },
  );

  it.each(['0', '-1', 'dos', '1.5', '1e3', ''])('R5 - pagina %j cae a 1 sin lanzar', (raw) => {
    expect(parseExecutionTraceListParams({ page: raw }).page).toBe(1);
  });

  it('R5 - una pagina entera mayor que 1 se conserva', () => {
    expect(parseExecutionTraceListParams({ page: '3' }).page).toBe(3);
  });

  it('R5 - de un parametro repetido toma el primero', () => {
    expect(parseExecutionTraceListParams({ page: ['2', '5'] }).page).toBe(2);
  });

  it('R5 - la entrada del caso de uso lleva solo 10 o 25', () => {
    expect(toExecutionTraceListInput(params({ pageSize: 25 })).pageSize).toBe(25);
    expect(toExecutionTraceListInput(params()).pageSize).toBe(10);
  });
});

describe('R6 - el texto del pedido', () => {
  it('R6 - quita los espacios de los extremos', () => {
    expect(parseExecutionTraceListParams({ q: '  2026-0000042  ' }).orderNumber).toBe('2026-0000042');
  });

  it.each(['abc', '42a', '2026 42', '-', '--'])(
    'R6 - %j se conserva: el caso de uso deja la lista vacia, no se ignora',
    (raw) => {
      const parsed = parseExecutionTraceListParams({ q: raw });
      expect(parsed.orderNumber).toBe(raw);
      expect(toExecutionTraceListInput(parsed).orderNumber).toBe(raw);
    },
  );

  it('R6 - solo espacios se trata como filtro ausente', () => {
    const parsed = parseExecutionTraceListParams({ q: '   ' });
    expect(parsed.orderNumber).toBe('');
    expect(toExecutionTraceListInput(parsed)).not.toHaveProperty('orderNumber');
    expect(buildExecutionTraceListQuery(parsed)).not.toContain('q=');
  });

  it('R6 - se recorta a 20 caracteres, el tope del caso de uso', () => {
    expect(parseExecutionTraceListParams({ q: '1'.repeat(30) }).orderNumber).toHaveLength(20);
  });
});

describe('R7 - persona', () => {
  it('R7 - un uuid se conserva y viaja al caso de uso', () => {
    const parsed = parseExecutionTraceListParams({ persona: PERSONA });
    expect(parsed.userId).toBe(PERSONA);
    expect(toExecutionTraceListInput(parsed).userId).toBe(PERSONA);
  });

  it.each(['juan', '123', '', 'not-a-uuid-at-all'])('R7 - %j no es uuid y se descarta', (raw) => {
    expect(parseExecutionTraceListParams({ persona: raw }).userId).toBeNull();
  });
});

describe('R8 - rango de fechas', () => {
  it('R8 - fechas validas se conservan', () => {
    const parsed = parseExecutionTraceListParams({ desde: '2026-10-01', hasta: '2026-10-07' });
    expect(parsed.from).toBe('2026-10-01');
    expect(parsed.to).toBe('2026-10-07');
  });

  it('R8 - una fecha imposible o mal formada descarta solo ese extremo', () => {
    const parsed = parseExecutionTraceListParams({ desde: '2026-02-30', hasta: '2026-10-07' });
    expect(parsed.from).toBeNull();
    expect(parsed.to).toBe('2026-10-07');
    expect(parseExecutionTraceListParams({ hasta: '07/10/2026' }).to).toBeNull();
  });
});

describe('R9 - solo cancelados', () => {
  it('R9 - `1` lo activa', () => {
    expect(parseExecutionTraceListParams({ cancelados: '1' }).cancelledOnly).toBe(true);
  });

  it.each(['0', 'true', 'si', ''])('R9 - %j lo deja desactivado', (raw) => {
    expect(parseExecutionTraceListParams({ cancelados: raw }).cancelledOnly).toBe(false);
  });
});

describe('R11 - todo vive en la URL', () => {
  it('R11 - parse(build(p)) devuelve p con todos los filtros', () => {
    const p = params({
      page: 3,
      pageSize: 25,
      orderNumber: '0000042',
      userId: PERSONA,
      from: '2026-10-01',
      to: '2026-10-07',
      cancelledOnly: true,
    });
    expect(parseExecutionTraceListParams(query(buildExecutionTraceListQuery(p)))).toEqual(p);
  });

  it('R11 - parse(build(p)) devuelve p sin filtros', () => {
    expect(parseExecutionTraceListParams(query(buildExecutionTraceListQuery(params())))).toEqual(params());
  });

  it('R11 - cambiar un filtro vuelve a la pagina 1', () => {
    const current = params({ page: 4 });
    expect(withFiltersResetPage(current, { ...current, cancelledOnly: true }).page).toBe(1);
    expect(withFiltersResetPage(current, { ...current, userId: PERSONA }).page).toBe(1);
    expect(withFiltersResetPage(current, { ...current, orderNumber: '42' }).page).toBe(1);
    expect(withFiltersResetPage(current, { ...current, from: '2026-10-01' }).page).toBe(1);
  });

  it('R11 - paginar conserva los filtros y la pagina pedida', () => {
    const current = params({ page: 1, userId: PERSONA, orderNumber: '42', cancelledOnly: true });
    const next = fromDataTableParams(current, { ...toDataTableParams(current), page: 2 });
    expect(next).toEqual({ ...current, page: 2 });
  });

  it('R11 - buscar desde la tabla vuelve a la pagina 1', () => {
    const current = params({ page: 3 });
    const next = fromDataTableParams(current, { ...toDataTableParams(current), search: ' 42 ' });
    expect(next).toEqual({ ...current, page: 1, orderNumber: '42' });
  });

  it('R11 - persona y fechas de la tabla se traducen a la URL; de varias personas manda la ultima', () => {
    const current = params({ page: 2 });
    const next = fromDataTableParams(current, {
      ...toDataTableParams(current),
      filters: {
        [PERSON_COLUMN_ID]: { kind: 'select', values: [PERSONA, OTRA_PERSONA] },
        [LAST_AT_COLUMN_ID]: { kind: 'dateRange', from: '2026-10-01', to: null },
      },
    });
    expect(next).toEqual({ ...current, page: 1, userId: OTRA_PERSONA, from: '2026-10-01' });
  });

  it('R11 - la tabla refleja los filtros de la URL', () => {
    const p = params({ userId: PERSONA, from: '2026-10-01', orderNumber: '42' });
    expect(toDataTableParams(p)).toEqual({
      page: 1,
      pageSize: 10,
      sort: null,
      search: '42',
      filters: {
        [PERSON_COLUMN_ID]: { kind: 'select', values: [PERSONA] },
        [LAST_AT_COLUMN_ID]: { kind: 'dateRange', from: '2026-10-01', to: null },
      },
    });
  });
});

describe('R17 - el detalle lleva la consulta de la lista', () => {
  it('R17 - el enlace al detalle es executionTraceRoute(id)?<consulta>', () => {
    const p = params({ page: 2, userId: PERSONA });
    expect(executionTraceDetailHref('order-1', p)).toBe(
      `${executionTraceRoute('order-1')}?${buildExecutionTraceListQuery(p)}`,
    );
  });

  it('R17 - volver con la consulta del detalle recupera la misma lista', () => {
    const p = params({ page: 2, pageSize: 25, orderNumber: '42', cancelledOnly: true });
    const detailQuery = query(executionTraceDetailHref('order-1', p).split('?')[1]);
    expect(executionTraceListHref(parseExecutionTraceListParams(detailQuery))).toBe(
      executionTraceListHref(p),
    );
  });

  it('R17 - sin parametros vuelve a la lista por defecto', () => {
    expect(executionTraceListHref(parseExecutionTraceListParams({}))).toBe(
      `${DASHBOARD_ROUTE}?page=1&pageSize=10`,
    );
  });
});

describe('R12 - la ruta del recorrido cuelga de /dashboard', () => {
  it('R12 - executionTraceRoute identifica el pedido bajo DASHBOARD_ROUTE', () => {
    expect(executionTraceRoute('abc')).toBe(`${DASHBOARD_ROUTE}/recorrido/abc`);
  });
});
