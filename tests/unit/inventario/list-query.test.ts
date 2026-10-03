// QC-57 T1 — El contrato de consulta de lista en el dominio: esquema zod y `sanitize`.
//
// Cubre R1, R3, R5, R7, R8, R9, R12 y R20 (`tasks.md > T1`, `design.md > 12`). Se ejercita sobre
// la copia de `inventario`; que las otras cuatro digan exactamente lo mismo lo demuestra
// `tests/guards/guard-contrato-listados.test.ts` (R32), no este archivo.
//
// Los asertos van contra las listas blancas REALES del modulo (`PRODUCT_QUERYABLE`,
// `PRESENTATION_QUERYABLE`) siempre que el caso lo permite: una lista blanca inventada probaria
// el codigo contra si mismo. Solo se fabrica una a mano donde el caso lo exige -la defensa de
// `deletedAt`, que ninguna lista real puede declarar (R7)-.

import type { ListQuery, ListQueryable } from '@/lib/modules/inventario/domain/list-query';
import {
  createListQuerySchema,
  sanitizeListQuery,
} from '@/lib/modules/inventario/domain/list-query';
import { PRESENTATION_QUERYABLE } from '@/lib/modules/inventario/domain/presentation-queryable';
import { PRODUCT_QUERYABLE } from '@/lib/modules/inventario/domain/product-queryable';

const schema = createListQuerySchema();

/** Consulta minima ya parseada, para los casos que solo ejercitan `sanitize`. */
function query(partial: Partial<ListQuery> = {}): ListQuery {
  return { page: 1, sort: null, filters: {}, search: '', ...partial };
}

describe('esquema del contrato de lista', () => {
  it('acepta una consulta completa y devuelve la misma forma para cualquier listado', () => {
    // R1, R3 — pagina, tamano, orden objeto-o-nulo, filtros por nombre de campo y busqueda.
    const parsed = schema.parse({
      page: 2,
      pageSize: 25,
      sort: { columnId: 'name', direction: 'desc' },
      filters: { stock: { kind: 'numberRange', min: 0, max: 10 } },
      search: 'buffer',
    });

    expect(parsed).toEqual({
      page: 2,
      pageSize: 25,
      sort: { columnId: 'name', direction: 'desc' },
      filters: { stock: { kind: 'numberRange', min: 0, max: 10 } },
      search: 'buffer',
    });
  });

  it('sin nada aplica los defectos: pagina 1, sin orden, sin filtros y sin busqueda', () => {
    // R1 — `pageSize` NO tiene defecto aqui: el 10 y el tope de 25 los pone el adaptador (R29).
    expect(schema.parse({})).toEqual({ page: 1, sort: null, filters: {}, search: '' });
  });

  it('rechaza una LISTA de ordenes: se ordena por como mucho un campo', () => {
    // R9 — el contrato no admite orden multiple, y no es que lo ignore: lo rechaza.
    const veredicto = schema.safeParse({
      sort: [
        { columnId: 'name', direction: 'asc' },
        { columnId: 'stock', direction: 'desc' },
      ],
    });

    expect(veredicto.success).toBe(false);
  });

  it('rechaza una direccion de orden que no sea asc o desc', () => {
    // R9 — la direccion es un conjunto cerrado.
    expect(schema.safeParse({ sort: { columnId: 'name', direction: 'ASC' } }).success).toBe(false);
  });

  it('acepta las CUATRO formas de filtro y ninguna mas', () => {
    // R12 — las cuatro que QC-55 emite.
    const parsed = schema.parse({
      filters: {
        name: { kind: 'text', value: 'sosa' },
        stock: { kind: 'numberRange', min: null, max: 5 },
        unitId: { kind: 'select', values: ['u1', 'u2'] },
        createdAt: { kind: 'dateRange', from: '2026-01-01', to: null },
      },
    });

    expect(Object.keys(parsed.filters)).toEqual(['name', 'stock', 'unitId', 'createdAt']);
  });

  it('rechaza un QUINTO kind de filtro', () => {
    // R12 — lo que no discrimina muere en el parse; no se cuela como filtro desconocido.
    const veredicto = schema.safeParse({
      filters: { name: { kind: 'regex', pattern: 'sosa' } },
    });

    expect(veredicto.success).toBe(false);
  });

  it('trata una busqueda de solo espacios como ausencia de busqueda', () => {
    // R20 — tras el `trim` queda '', que es exactamente lo mismo que no buscar.
    expect(schema.parse({ search: '   ' }).search).toBe('');
    expect(schema.parse({ search: '  buffer  ' }).search).toBe('buffer');
  });

  it('corta una busqueda absurdamente larga antes de llegar a la base', () => {
    // R20 (borde) — 120 caracteres es el tope que ya tenia la busqueda de productos.
    expect(schema.safeParse({ search: 'a'.repeat(120) }).success).toBe(true);
    expect(schema.safeParse({ search: 'a'.repeat(121) }).success).toBe(false);
  });

  it('rechaza una pagina que no sea un entero mayor o igual que 1', () => {
    // R1 — mismo minimo que `pageQuerySchema`.
    expect(schema.safeParse({ page: 0 }).success).toBe(false);
    expect(schema.safeParse({ page: 1.5 }).success).toBe(false);
  });
});

describe('sanitize contra la lista blanca', () => {
  it('deja intacta una consulta que solo pide campos declarados', () => {
    // R1, R3 — el nombre del campo de la base es el identificador, sin traduccion.
    const entrada = query({
      sort: { columnId: 'name', direction: 'asc' },
      filters: { qtyAlert: { kind: 'numberRange', min: 0, max: 10 } },
      search: 'sosa',
    });

    expect(sanitizeListQuery(entrada, PRODUCT_QUERYABLE)).toEqual({
      query: entrada,
      ignored: [],
    });
  });

  it('omite el orden por un campo no declarado y NO falla', () => {
    // R5 — la lista vuelve como si no se hubiera pedido el orden.
    const resultado = sanitizeListQuery(
      query({ sort: { columnId: 'nombre', direction: 'asc' } }),
      PRODUCT_QUERYABLE,
    );

    expect(resultado.query.sort).toBeNull();
    expect(resultado.ignored).toEqual(['nombre']);
  });

  it('omite un filtro por un campo no declarado y conserva los demas', () => {
    // R5 — omitir una parte no arrastra a las otras.
    const resultado = sanitizeListQuery(
      query({
        filters: {
          imagePath: { kind: 'text', value: '/x.png' },
          qtyAlert: { kind: 'numberRange', min: 0, max: 10 },
        },
      }),
      PRODUCT_QUERYABLE,
    );

    expect(resultado.query.filters).toEqual({ qtyAlert: { kind: 'numberRange', min: 0, max: 10 } });
    expect(resultado.ignored).toEqual(['imagePath']);
  });

  it('el listado de productos YA NO ofrece filtrar por unidad (QC-80, R21)', () => {
    // R21 — `PRODUCT_QUERYABLE` pierde su unica entrada `select`, y eso es un cambio de
    // CONTRATO del listado, no un detalle interno: `products.unit_id` no existe, asi que no
    // queda columna que mirar. Filtrar por la unidad DERIVADA -la de la presentacion del lote
    // mas reciente- seria un `where` anidado sobre ese lote: otra consulta, que nadie pidio.
    //
    // Y se comprueba ademas que pedirlo NO REVIENTA (R5): el filtro se omite y sale en
    // `ignored`, que es como este contrato trata siempre lo que no reconoce. Una URL vieja con
    // `?filters[unitId]=...` en un marcador tiene que seguir pintando la lista.
    expect(Object.keys(PRODUCT_QUERYABLE.filterable)).not.toContain('unitId');
    expect(PRODUCT_QUERYABLE.sortable).not.toContain('unitId');
    // QC-195 R8: `presentationUnitId` filtra por la unidad de la presentacion fija, no por la del producto.
    expect(Object.keys(PRODUCT_QUERYABLE.filterable)).toEqual(['stock', 'qtyAlert', 'createdAt', 'type', 'presentationUnitId']);

    const resultado = sanitizeListQuery(
      query({ filters: { unitId: { kind: 'select', values: ['u1'] } } }),
      PRODUCT_QUERYABLE,
    );

    expect(resultado.query.filters).toEqual({});
    expect(resultado.ignored).toEqual(['unitId']);
  });

  it('QC-195 R8, R9 — el listado de productos acepta el filtro presentationUnitId como select', () => {
    expect(PRODUCT_QUERYABLE.filterable.presentationUnitId).toBe('select');
    const resultado = sanitizeListQuery(
      query({ filters: { presentationUnitId: { kind: 'select', values: ['u-ml', 'u-l'] } } }),
      PRODUCT_QUERYABLE,
    );
    expect(resultado.query.filters).toEqual({ presentationUnitId: { kind: 'select', values: ['u-ml', 'u-l'] } });
    expect(resultado.ignored).toEqual([]);
  });

  it('el listado de productos vuelve a ordenar y filtrar por existencia (R15)', () => {
    expect(PRODUCT_QUERYABLE.sortable).toContain('stock');
    expect(Object.keys(PRODUCT_QUERYABLE.filterable)).toContain('stock');

    const porOrden = sanitizeListQuery(
      query({ sort: { columnId: 'stock', direction: 'desc' } }),
      PRODUCT_QUERYABLE,
    );
    expect(porOrden.query.sort).toEqual({ columnId: 'stock', direction: 'desc' });
    expect(porOrden.ignored).toEqual([]);

    const porFiltro = sanitizeListQuery(
      query({ filters: { stock: { kind: 'numberRange', min: 0, max: 10 } } }),
      PRODUCT_QUERYABLE,
    );
    expect(porFiltro.query.filters).toEqual({ stock: { kind: 'numberRange', min: 0, max: 10 } });
    expect(porFiltro.ignored).toEqual([]);
  });

  it('omite un filtro cuya FORMA no es la que el campo declara', () => {
    // R8 — `qtyAlert` es un rango numerico; un texto sobre `qtyAlert` se omite, no se traduce.
    const resultado = sanitizeListQuery(
      query({ filters: { qtyAlert: { kind: 'text', value: '5' } } }),
      PRODUCT_QUERYABLE,
    );

    expect(resultado.query.filters).toEqual({});
    expect(resultado.ignored).toEqual(['qtyAlert']);
  });

  it('un campo ordenable no se vuelve filtrable por estar en la otra lista', () => {
    // R8 — `updatedAt` es ordenable en productos, pero no declara ninguna forma de filtro.
    const resultado = sanitizeListQuery(
      query({ filters: { updatedAt: { kind: 'dateRange', from: null, to: null } } }),
      PRODUCT_QUERYABLE,
    );

    expect(resultado.query.filters).toEqual({});
    expect(resultado.ignored).toEqual(['updatedAt']);
  });

  it('omite deletedAt como orden y como filtro', () => {
    // R7 — ninguna lista blanca lo declara, asi que cae por R5.
    const resultado = sanitizeListQuery(
      query({
        sort: { columnId: 'deletedAt', direction: 'desc' },
        filters: { deletedAt: { kind: 'dateRange', from: '2026-01-01', to: null } },
      }),
      PRODUCT_QUERYABLE,
    );

    expect(resultado.query.sort).toBeNull();
    expect(resultado.query.filters).toEqual({});
    expect(resultado.ignored).toEqual(['deletedAt']);
  });

  it('omite deletedAt AUNQUE una lista blanca lo declarase', () => {
    // R7 — defensa explicita, no confianza en que las siete listas esten bien escritas. Esta
    // lista blanca no existe en el repo y no puede existir: se fabrica aqui justamente para
    // demostrar que `sanitize` no depende de que nadie se acuerde de la regla.
    const listaEnvenenada: ListQueryable = {
      sortable: ['name', 'deletedAt'],
      filterable: { deletedAt: 'dateRange' },
      searchable: true,
    };

    const resultado = sanitizeListQuery(
      query({
        sort: { columnId: 'deletedAt', direction: 'asc' },
        filters: { deletedAt: { kind: 'dateRange', from: '2026-01-01', to: '2026-02-01' } },
      }),
      listaEnvenenada,
    );

    expect(resultado.query.sort).toBeNull();
    expect(resultado.query.filters).toEqual({});
    expect(resultado.ignored).toEqual(['deletedAt']);
  });

  it('omite la busqueda donde el listado no busca, y solo entonces', () => {
    // R17 — el caso real es pedidos; aqui se ejercita la regla con una lista blanca sin busqueda.
    const sinBusqueda: ListQueryable = {
      sortable: ['createdAt'],
      filterable: {},
      searchable: false,
    };

    const omitida = sanitizeListQuery(query({ search: 'sosa' }), sinBusqueda);
    expect(omitida.query.search).toBe('');
    expect(omitida.ignored).toEqual(['search']);

    // R20 — una busqueda vacia no es una parte omitida: no habia nada que omitir.
    expect(sanitizeListQuery(query({ search: '' }), sinBusqueda).ignored).toEqual([]);
    // Y donde el listado si busca, la busqueda pasa intacta.
    expect(sanitizeListQuery(query({ search: 'sosa' }), PRESENTATION_QUERYABLE)).toEqual({
      query: query({ search: 'sosa' }),
      ignored: [],
    });
  });

  it('nunca pone en ignored el texto buscado ni el valor del filtro', () => {
    // R6 mas el anti-patron de PII (`design.md > 8`): solo NOMBRES de campo.
    const resultado = sanitizeListQuery(
      query({
        sort: { columnId: 'nombre', direction: 'asc' },
        filters: { telefono: { kind: 'text', value: '3001234567' } },
        search: 'juan perez',
      }),
      PRODUCT_QUERYABLE,
    );

    expect(resultado.ignored).toEqual(['nombre', 'telefono']);
    expect(resultado.ignored.join(' ')).not.toContain('3001234567');
    expect(resultado.ignored.join(' ')).not.toContain('juan');
  });

  it('es pura: no muta la consulta que recibe', () => {
    // R5 — la consulta sigue viva; la saneada es otra, no la de entrada modificada.
    const entrada = query({
      sort: { columnId: 'nombre', direction: 'asc' },
      filters: { imagePath: { kind: 'text', value: '/x.png' } },
    });

    sanitizeListQuery(entrada, PRODUCT_QUERYABLE);

    expect(entrada.sort).toEqual({ columnId: 'nombre', direction: 'asc' });
    expect(entrada.filters).toEqual({ imagePath: { kind: 'text', value: '/x.png' } });
  });

  it('conserva pagina y tamano de pagina sin tocarlos', () => {
    // R5 — sanear campos consultables no es sitio para acotar la paginacion (R29, del adaptador).
    const entrada = query({ page: 3, pageSize: 500 });

    expect(sanitizeListQuery(entrada, PRODUCT_QUERYABLE).query).toEqual(entrada);
  });

  it('anadir un campo consultable no cambia la forma de la consulta', () => {
    // R3 — la lista blanca crece; el contrato no. Misma entrada, misma forma de salida.
    const ampliada: ListQueryable = {
      ...PRESENTATION_QUERYABLE,
      sortable: [...PRESENTATION_QUERYABLE.sortable, 'symbol'],
    };
    const entrada = query({ sort: { columnId: 'symbol', direction: 'asc' } });

    const antes = sanitizeListQuery(entrada, PRESENTATION_QUERYABLE);
    const despues = sanitizeListQuery(entrada, ampliada);

    expect(Object.keys(antes.query).sort()).toEqual(Object.keys(despues.query).sort());
    expect(antes.query.sort).toBeNull();
    expect(despues.query.sort).toEqual({ columnId: 'symbol', direction: 'asc' });
  });
});
