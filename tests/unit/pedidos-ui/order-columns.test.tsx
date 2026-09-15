// QC-35 T7 — Las diez columnas de la lista de pedidos: R8, R9, R10, R11, R12, R14, R19, R39.
//
// **Las columnas son DATOS**, asi que el test las recorre en vez de listar literales: anadir una
// columna es anadir una fila a `ORDER_COLUMNS`, y eso es justo lo que el test en negativo de R8
// vigila.
//
// **Los asserts van sobre ids de columna, `data-testid` y constantes exportadas** (R44), nunca
// sobre el copy de las etiquetas: `label` se reescribe sin avisar y un assert sobre el no dice
// nada sobre el comportamiento.
//
// **`order-actions.ts` esta mockeada con dobles que FALLAN si se les llama**: el barrel de la
// ruta arrastra el Server Component de la seccion, y una declaracion de columnas no puede pedir
// datos por su cuenta (R43).

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ACTIONS_COLUMN_ID,
  CANCELLATION_REASON_COLUMN_ID,
  CREATED_AT_COLUMN_ID,
  MISSING_VALUE_MARK,
  ORDER_DEFAULT_PINNED_COLUMNS,
  ORDER_NUMBER_COLUMN_ID,
  ORDER_PRIORITY_LABELS,
  ORDER_SKELETON_COLUMN_COUNT,
  ORDER_STATUS_LABELS,
  PRIORITY_COLUMN_ID,
  QUANTITY_COLUMN_ID,
  RESPONSIBLES_COLUMN_ID,
  STATUS_COLUMN_ID,
  RECIPE_NAME_COLUMN_ID,
  buildOrderColumns,
} from '@/app/(private)/pedidos/components';
import {
  ORDER_PRIORITY_VALUES,
  ORDER_QUERYABLE,
  ORDER_STATUS_VALUES,
  formatOrderNumber,
  type OrderSummary,
} from '@/lib/modules/pedidos';

vi.mock('@/lib/modules/pedidos/adapters/driving/order-actions', () => {
  const noDebeInvocarse = (nombre: string) => () => {
    throw new Error(`${nombre} no debe invocarse desde la declaracion de columnas`);
  };
  return {
    listOrdersAction: vi.fn(noDebeInvocarse('listOrdersAction')),
    getOrderAction: vi.fn(noDebeInvocarse('getOrderAction')),
    createOrderAction: vi.fn(noDebeInvocarse('createOrderAction')),
    updateOrderAction: vi.fn(noDebeInvocarse('updateOrderAction')),
    cancelOrderAction: vi.fn(noDebeInvocarse('cancelOrderAction')),
    deleteOrderAction: vi.fn(noDebeInvocarse('deleteOrderAction')),
  };
});

/**
 * Las columnas se construyen con la FACTORIA (`buildOrderColumns`) porque la celda de acciones
 * necesita los dos catalogos del panel de edicion. Es el unico cambio respecto de la version que
 * las declaraba como array del modulo: **ningun assert de este archivo se relaja**.
 */
const ORDER_COLUMNS = buildOrderColumns({
  recipes: { items: [], totalPages: 1 },
  units: [],
});

const RECIPE_ID = '22222222-2222-4222-8222-222222222222';

function pedido(overrides: Partial<OrderSummary> = {}): OrderSummary {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    number: { year: 2026, sequence: 42 },
    numberText: formatOrderNumber({ year: 2026, sequence: 42 }),
    recipeId: RECIPE_ID,
    recipeName: 'Esmalte azul',
    quantity: '12.5000',
    priority: 'MEDIA',
    status: 'PENDIENTE',
    cancellationReason: null,
    createdAt: new Date('2026-01-15T10:00:00.000Z'),
    updatedAt: new Date('2026-01-15T10:00:00.000Z'),
    createdBy: null,
    updatedBy: null,
    ...overrides,
  };
}

/** Pinta la celda de una columna por su id. Las celdas devuelven `ReactNode`, no cadena. */
function pintarCelda(columnId: string, order: OrderSummary) {
  const column = ORDER_COLUMNS.find((candidate) => candidate.id === columnId);
  if (column === undefined) throw new Error(`No existe la columna ${columnId}`);
  return render(<>{column.cell(order)}</>);
}

afterEach(() => {
  cleanup();
});

// QC-35bis (2026-09-07): eran DIEZ. La unidad y el precio unitario salieron del pedido -de la
// tabla `orders` hacia arriba-, asi que sus dos columnas ya no tienen dato que pintar y la lista
// acordada baja a ocho. Sigue siendo cerrada y en el orden de `design.md > 7`.
describe('las columnas declaradas son exactamente las nueve acordadas (R8)', () => {
  it('en positivo: los nueve ids, en el orden de `design.md > 7`', () => {
    expect(ORDER_COLUMNS.map((column) => column.id)).toEqual([
      ORDER_NUMBER_COLUMN_ID,
      STATUS_COLUMN_ID,
      PRIORITY_COLUMN_ID,
      RECIPE_NAME_COLUMN_ID,
      QUANTITY_COLUMN_ID,
      CREATED_AT_COLUMN_ID,
      CANCELLATION_REASON_COLUMN_ID,
      RESPONSIBLES_COLUMN_ID,
      ACTIONS_COLUMN_ID,
    ]);
    expect(ORDER_COLUMNS).toHaveLength(9);
  });

  it('en negativo: ninguna columna es `total`, `createdBy`, `updatedBy`, unidad ni precio', () => {
    const ids = ORDER_COLUMNS.map((column) => column.id);

    expect(ids).not.toContain('total');
    expect(ids).not.toContain('createdBy');
    expect(ids).not.toContain('updatedBy');
    // Los dos que se fueron el 2026-09-07. En negativo para que devolverlos sin decidirlo
    // ponga el test rojo.
    expect(ids).not.toContain('unitName');
    expect(ids).not.toContain('unitPrice');
  });

  it('el esqueleto de carga pinta tantas celdas como columnas hay (R21)', () => {
    expect(ORDER_SKELETON_COLUMN_COUNT).toBe(ORDER_COLUMNS.length);
  });
});

describe('solo cuatro columnas ordenan, y son las de la lista blanca menos la no acordada (R12)', () => {
  it('en positivo: correlativo, estado, prioridad y fecha de solicitud', () => {
    const ordenables = ORDER_COLUMNS.filter((column) => column.sortable === true).map((c) => c.id);

    expect(ordenables).toEqual([
      ORDER_NUMBER_COLUMN_ID,
      STATUS_COLUMN_ID,
      PRIORITY_COLUMN_ID,
      CREATED_AT_COLUMN_ID,
    ]);
    // Ninguna cabecera ordena por un campo que la lista blanca no declare.
    for (const id of ordenables) {
      expect(ORDER_QUERYABLE.sortable).toContain(id);
    }
  });

  it('en negativo: ninguna otra columna es ordenable, ni siquiera la cantidad', () => {
    const noOrdenables = ORDER_COLUMNS.filter((column) => column.sortable !== true).map((c) => c.id);

    expect(noOrdenables).toEqual([
      RECIPE_NAME_COLUMN_ID,
      QUANTITY_COLUMN_ID,
      CANCELLATION_REASON_COLUMN_ID,
      RESPONSIBLES_COLUMN_ID,
      ACTIONS_COLUMN_ID,
    ]);
    // Esta en `ORDER_QUERYABLE.sortable` pero la decision cerrada NO pide su cabecera.
    expect(ORDER_QUERYABLE.sortable).toContain(QUANTITY_COLUMN_ID);
    // Y `unitPrice` ya no esta ni en la lista blanca: se fue con la columna (2026-09-07).
    expect(ORDER_QUERYABLE.sortable).not.toContain('unitPrice');
  });
});

describe('los filtros son los tres de la decision cerrada y ninguno mas (R14)', () => {
  it('estado y prioridad como seleccion de los conjuntos cerrados, fecha como rango', () => {
    const porId = new Map(ORDER_COLUMNS.map((column) => [column.id, column]));

    const estado = porId.get(STATUS_COLUMN_ID)?.filter;
    expect(estado?.kind).toBe('select');
    expect(estado?.kind === 'select' ? estado.options.map((o) => o.value) : []).toEqual([
      ...ORDER_STATUS_VALUES,
    ]);

    const prioridad = porId.get(PRIORITY_COLUMN_ID)?.filter;
    expect(prioridad?.kind).toBe('select');
    expect(prioridad?.kind === 'select' ? prioridad.options.map((o) => o.value) : []).toEqual([
      ...ORDER_PRIORITY_VALUES,
    ]);

    expect(porId.get(CREATED_AT_COLUMN_ID)?.filter).toEqual({ kind: 'dateRange' });
  });

  it('ninguna otra columna declara filtro', () => {
    const conFiltro = ORDER_COLUMNS.filter((column) => column.filter !== undefined).map((c) => c.id);

    expect(conFiltro).toEqual([STATUS_COLUMN_ID, PRIORITY_COLUMN_ID, CREATED_AT_COLUMN_ID]);
  });
});

describe('el fijado por defecto y la columna de acciones (R19, `design.md > 6.1`)', () => {
  it('el correlativo es la unica columna fijada por defecto', () => {
    expect(ORDER_DEFAULT_PINNED_COLUMNS).toEqual([ORDER_NUMBER_COLUMN_ID]);
  });

  it('la columna de acciones no se puede fijar, para que no tape la del correlativo', () => {
    const acciones = ORDER_COLUMNS.find((column) => column.id === ACTIONS_COLUMN_ID);

    expect(acciones?.pinnable).toBe(false);
    expect(acciones?.sortable).toBeUndefined();
    expect(acciones?.filter).toBeUndefined();
  });

  it('todas las demas columnas se pueden fijar', () => {
    const noFijables = ORDER_COLUMNS.filter((column) => column.pinnable === false).map((c) => c.id);

    expect(noFijables).toEqual([ACTIONS_COLUMN_ID]);
  });
});

describe('el correlativo se compone SIEMPRE con la funcion del contrato (R10)', () => {
  it('la celda es exactamente `formatOrderNumber(order.number)` y no el identificador tecnico', () => {
    const order = pedido({ number: { year: 2025, sequence: 7 } });

    const { container } = pintarCelda(ORDER_NUMBER_COLUMN_ID, order);

    expect(container.textContent).toBe(formatOrderNumber({ year: 2025, sequence: 7 }));
    expect(container.textContent).not.toContain(order.id);
  });
});

describe('receta y unidad se presentan por su NOMBRE, tomado de la propia fila (R9)', () => {
  it('con nombre informado se pinta el nombre y no el identificador', () => {
    const order = pedido();

    const { container } = pintarCelda(RECIPE_NAME_COLUMN_ID, order);

    expect(container.textContent).toBe('Esmalte azul');
    expect(container.textContent).not.toContain(RECIPE_ID);
  });

  it('sin nombre de receta se pinta un marcador identificable y NUNCA el uuid', () => {
    const { container } = pintarCelda(RECIPE_NAME_COLUMN_ID, pedido({ recipeName: null }));

    expect(screen.getByTestId(`order-missing-${RECIPE_NAME_COLUMN_ID}`)).toHaveTextContent(
      MISSING_VALUE_MARK,
    );
    expect(container.textContent).not.toContain(RECIPE_ID);
  });

});

describe('el motivo de cancelacion (R11)', () => {
  it('con el pedido cancelado se presenta su motivo', () => {
    const order = pedido({ status: 'CANCELADO', cancellationReason: 'Cliente anuló el encargo' });

    const { container } = pintarCelda(CANCELLATION_REASON_COLUMN_ID, order);

    expect(container.textContent).toBe('Cliente anuló el encargo');
    expect(screen.queryByTestId(`order-missing-${CANCELLATION_REASON_COLUMN_ID}`)).toBeNull();
  });

  it('sin cancelar se presenta un marcador de ausencia y ningun motivo', () => {
    pintarCelda(CANCELLATION_REASON_COLUMN_ID, pedido({ status: 'PENDIENTE' }));

    expect(screen.getByTestId(`order-missing-${CANCELLATION_REASON_COLUMN_ID}`)).toHaveTextContent(
      MISSING_VALUE_MARK,
    );
  });
});

describe('la cantidad se pinta TAL CUAL llega (R39)', () => {
  it('la cadena decimal no se reformatea, ni se redondea, ni pierde ceros', () => {
    // El precio unitario acompanaba a la cantidad en este caso hasta el 2026-09-07. Lo que R39
    // protege -que una cadena decimal del contrato no pase por `Intl`, `toFixed` ni coma
    // flotante- sigue comprobandose sobre el unico decimal que le queda al pedido.
    const order = pedido({ quantity: '12.5000' });

    const cantidad = pintarCelda(QUANTITY_COLUMN_ID, order);
    expect(cantidad.container.textContent).toBe('12.5000');
  });
});

describe('estado y prioridad se leen como etiqueta, no como valor crudo del enum (R8)', () => {
  it('cada estado del contrato tiene su etiqueta legible', () => {
    pintarCelda(STATUS_COLUMN_ID, pedido({ status: 'EN_CURSO' }));

    const badge = screen.getByTestId('order-status');
    expect(badge).toHaveAttribute('data-status', 'EN_CURSO');
    expect(badge).toHaveTextContent(ORDER_STATUS_LABELS.EN_CURSO);
  });

  it('cada prioridad del contrato tiene su etiqueta legible', () => {
    pintarCelda(PRIORITY_COLUMN_ID, pedido({ priority: 'CRITICA' }));

    const badge = screen.getByTestId('order-priority');
    expect(badge).toHaveAttribute('data-priority', 'CRITICA');
    expect(badge).toHaveTextContent(ORDER_PRIORITY_LABELS.CRITICA);
  });
});

// ---------------------------------------------------------------------------------------------
// QC-102 T12 — La columna de RESPONSABLES: R16.
//
// Aqui se afirma solo sobre la DECLARACION —que es lo que este archivo hace con las demas—: el
// DOM de la celda vive en `order-sheet-responsibles.test.tsx`, que si monta el panel y por eso
// necesita el router. La declaracion no debe necesitar ninguno de los dos.
// ---------------------------------------------------------------------------------------------

describe('QC-102 — la columna propia de responsables (R16)', () => {
  it('existe una columna `responsibles`, y va antes de las acciones', () => {
    const ids = ORDER_COLUMNS.map((column) => column.id);

    expect(ids).toContain(RESPONSIBLES_COLUMN_ID);
    expect(ids.indexOf(RESPONSIBLES_COLUMN_ID)).toBeLessThan(ids.indexOf(ACTIONS_COLUMN_ID));
  });

  it('no ordena, no filtra y se puede fijar como cualquier otra columna de datos', () => {
    const responsables = ORDER_COLUMNS.find((column) => column.id === RESPONSIBLES_COLUMN_ID);

    // `sortable: false` se expresa NO declarandolo: el orden de la lista lo manda `pedidos`.
    expect(responsables?.sortable).not.toBe(true);
    expect(responsables?.filter).toBeUndefined();
    // `pinnable` por defecto: la unica columna que no se puede fijar sigue siendo la de acciones.
    expect(responsables?.pinnable).not.toBe(false);
  });

  it('la celda se pinta con lo que el lote ya trajo para ESA fila, sin pedir nada', () => {
    const RESPONSABLE = {
      userId: '0000000a-0000-4000-8000-00000000000a',
      displayName: 'Ana Torres',
      origin: { kind: 'direct' } as const,
    };
    const order = pedido();
    const columnas = buildOrderColumns({
      recipes: { items: [], totalPages: 1 },
      units: [],
      responsiblesByOrder: { [order.id]: [RESPONSABLE] },
    });
    const columna = columnas.find((candidate) => candidate.id === RESPONSIBLES_COLUMN_ID);

    // La celda es un elemento y recibe por props los responsables de SU fila: se comprueba sobre
    // el arbol declarado, sin renderizar —montar el panel exige el router, y esa es otra suite—.
    const celda = columna?.cell(order) as { props: { responsibles: readonly unknown[] } };
    expect(celda.props.responsibles).toEqual([RESPONSABLE]);

    // Y una fila sin entrada en el lote no rompe: recibe la lista vacia (R19, R20).
    const otra = columna?.cell(pedido({ id: '99999999-9999-4999-8999-999999999999' })) as {
      props: { responsibles: readonly unknown[] };
    };
    expect(otra.props.responsibles).toEqual([]);
  });
});
