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
  COVERAGE_COLUMN_ID,
  CREATED_AT_COLUMN_ID,
  MISSING_VALUE_MARK,
  ORDER_COVERAGE_LABELS,
  ORDER_NUMBER_COLUMN_ID,
  ORDER_PRIORITY_LABELS,
  ORDER_SKELETON_COLUMN_COUNT,
  ORDER_STATUS_LABELS,
  PRESENTATION_NAME_COLUMN_ID,
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
  ORDER_STATUS_FLOW,
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
    ingredientsCost: null,
    createdAt: new Date('2026-01-15T10:00:00.000Z'),
    updatedAt: new Date('2026-01-15T10:00:00.000Z'),
    createdBy: null,
    updatedBy: null,
    presentationLines: [],
    unitId: null,
    unitLabel: null,
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
// acordada baja a ocho. Luego sube a diez con RESPONSABLES y a ONCE con COBERTURA.
// Sigue siendo cerrada y en un orden acordado.
describe('las columnas declaradas son exactamente las once acordadas (R8, R20, R35)', () => {
  it('en positivo: los once ids, en el orden acordado', () => {
    expect(ORDER_COLUMNS.map((column) => column.id)).toEqual([
      ORDER_NUMBER_COLUMN_ID,
      STATUS_COLUMN_ID,
      PRIORITY_COLUMN_ID,
      RECIPE_NAME_COLUMN_ID,
      QUANTITY_COLUMN_ID,
      PRESENTATION_NAME_COLUMN_ID,
      CREATED_AT_COLUMN_ID,
      CANCELLATION_REASON_COLUMN_ID,
      COVERAGE_COLUMN_ID,
      RESPONSIBLES_COLUMN_ID,
      ACTIONS_COLUMN_ID,
    ]);
    expect(ORDER_COLUMNS).toHaveLength(11);
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
      PRESENTATION_NAME_COLUMN_ID,
      CANCELLATION_REASON_COLUMN_ID,
      COVERAGE_COLUMN_ID,
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

    // R41: en orden de flujo (`ORDER_STATUS_FLOW`), no en el orden crudo del enum.
    const estado = porId.get(STATUS_COLUMN_ID)?.filter;
    expect(estado?.kind).toBe('select');
    expect(estado?.kind === 'select' ? estado.options.map((o) => o.value) : []).toEqual([
      ...ORDER_STATUS_FLOW,
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
  it('el correlativo es la unica columna fijada por defecto, al borde izquierdo', () => {
    const fijadas = ORDER_COLUMNS.filter((column) => column.defaultPinned !== undefined);

    expect(fijadas.map((column) => column.id)).toEqual([ORDER_NUMBER_COLUMN_ID]);
    expect(fijadas[0]?.defaultPinned).toBe('left');
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

describe('la cantidad se pinta REDONDEADA A DOS DECIMALES (enmienda del 2026-09-17 a R39)', () => {
  // Decision humana del 2026-09-17: la cadena decimal del contrato llega con la escala de la
  // columna -«12.5000»- y cuatro decimales de relleno no informan de nada. La celda la pasa por
  // `formatDecimalDisplay`. El precio unitario acompanaba a la cantidad en este caso hasta el
  // 2026-09-07; hoy la cantidad es el unico decimal que le queda al pedido.

  it('los ceros de relleno no se pintan: «12.5000» se lee «12.5» y «15.0000» se lee «15»', () => {
    expect(pintarCelda(QUANTITY_COLUMN_ID, pedido({ quantity: '12.5000' })).container.textContent)
      .toBe('12.5');
    expect(pintarCelda(QUANTITY_COLUMN_ID, pedido({ quantity: '15.0000' })).container.textContent)
      .toBe('15');
  });

  it('mas de dos decimales se redondean al mas cercano', () => {
    expect(pintarCelda(QUANTITY_COLUMN_ID, pedido({ quantity: '0.1255' })).container.textContent)
      .toBe('0.13');
  });

  it('el redondeo es EXACTO: no pasa por coma flotante', () => {
    // Lo que R39 protege de fondo sigue en pie. Con `number`, 1.005 no se representa exacto y
    // `toFixed(2)` da «1.00»; la celda tiene que dar «1.01».
    expect(pintarCelda(QUANTITY_COLUMN_ID, pedido({ quantity: '1.0050' })).container.textContent)
      .toBe('1.01');
  });

  it('QC-132 R1: expone el valor exacto en el title cuando difiere del pintado', () => {
    const { container } = pintarCelda(QUANTITY_COLUMN_ID, pedido({ quantity: '0.1255' }));

    expect(container.textContent).toBe('0.13');
    expect(container.firstElementChild).toHaveAttribute('title', '0.1255');
  });

  it('QC-132 R2: sin title cuando el valor pintado coincide con el exacto', () => {
    const { container } = pintarCelda(QUANTITY_COLUMN_ID, pedido({ quantity: '12.5000' }));

    expect(container.textContent).toBe('12.5');
    expect(container.querySelector('[title]')).toBeNull();
  });
});

describe('QC-170 R42: la cantidad lleva la unidad del pedido, o va sola si no la tiene', () => {
  it('con unidad pinta la cifra y su etiqueta', () => {
    const { container } = pintarCelda(
      QUANTITY_COLUMN_ID,
      pedido({ quantity: '12.5000', unitId: 'unit-l', unitLabel: 'L' }),
    );

    expect(container.textContent).toBe('12.5 L');
  });

  it('sin unidad pinta la cifra sola', () => {
    const { container } = pintarCelda(QUANTITY_COLUMN_ID, pedido({ quantity: '12.5000' }));

    expect(container.textContent).toBe('12.5');
  });
});

describe('R20: la columna Presentación pinta el reparto o Sin presentación', () => {
  it('QC-170 R26: con una linea pinta «envases × nombre» sin «+0»', () => {
    const { container } = pintarCelda(
      PRESENTATION_NAME_COLUMN_ID,
      pedido({
        presentationLines: [{ presentationId: 'p-1', presentationName: 'Bidón 20L', packages: 2 }],
      }),
    );

    expect(container.textContent).toBe('2 × Bidón 20L');
  });

  it('QC-170 R26: con varias lineas pinta la primera y «+N»', () => {
    const { container } = pintarCelda(
      PRESENTATION_NAME_COLUMN_ID,
      pedido({
        presentationLines: [
          { presentationId: 'p-1', presentationName: 'Botella 200 ml', packages: 5 },
          { presentationId: 'p-2', presentationName: 'Bidón 20L', packages: 1 },
        ],
      }),
    );

    expect(container.textContent).toBe('5 × Botella 200 ml +1');
  });

  it('QC-170 R27: sin reparto se pinta «Sin presentación»', () => {
    const { container } = pintarCelda(
      PRESENTATION_NAME_COLUMN_ID,
      pedido({ presentationLines: [] }),
    );

    expect(container.textContent).toBe('Sin presentación');
  });
});

describe('R21: Presentación no ordena ni filtra', () => {
  it('la columna no declara `sortable` ni `filter`', () => {
    const columna = ORDER_COLUMNS.find((c) => c.id === PRESENTATION_NAME_COLUMN_ID);

    expect(columna?.sortable).not.toBe(true);
    expect(columna?.filter).toBeUndefined();
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

// QC-123 T9 (R18) — el importe NO se pinta en esta ficha (lo pinta QC-122). En positivo, la
// lista blanca de ids sigue sin ninguna columna de importe; en negativo, las celdas que SI se
// pueden pintar sin montar el resto de la pantalla (router, dialogos) no dejan escapar el valor.
describe('la tabla de pedidos no pinta el importe (R18)', () => {
  it('la tabla de pedidos no pinta el importe (R18)', () => {
    const ids = ORDER_COLUMNS.map((column) => column.id);
    expect(ids).not.toContain('ingredientsCost');
    expect(ids).not.toContain('importe');
    expect(ids).toHaveLength(11);

    const VALOR_DELATOR = '999999.9999';
    const order = pedido({ ingredientsCost: VALOR_DELATOR });
    const idsRenderizablesSinContexto = [
      ORDER_NUMBER_COLUMN_ID,
      STATUS_COLUMN_ID,
      PRIORITY_COLUMN_ID,
      RECIPE_NAME_COLUMN_ID,
      QUANTITY_COLUMN_ID,
      PRESENTATION_NAME_COLUMN_ID,
      CREATED_AT_COLUMN_ID,
      CANCELLATION_REASON_COLUMN_ID,
    ];
    for (const id of idsRenderizablesSinContexto) {
      const { container } = pintarCelda(id, order);
      expect(container.textContent).not.toContain(VALOR_DELATOR);
    }
  });
});

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

describe('QC-141 T14 — la columna propia de cobertura del material (R35)', () => {
  it('existe una columna `coverage`, entre el motivo de cancelacion y responsables', () => {
    const ids = ORDER_COLUMNS.map((column) => column.id);

    expect(ids).toContain(COVERAGE_COLUMN_ID);
    expect(ids.indexOf(CANCELLATION_REASON_COLUMN_ID)).toBeLessThan(ids.indexOf(COVERAGE_COLUMN_ID));
    expect(ids.indexOf(COVERAGE_COLUMN_ID)).toBeLessThan(ids.indexOf(RESPONSIBLES_COLUMN_ID));
  });

  it('no ordena, no filtra y se puede fijar como cualquier otra columna de datos', () => {
    const cobertura = ORDER_COLUMNS.find((column) => column.id === COVERAGE_COLUMN_ID);

    expect(cobertura?.sortable).not.toBe(true);
    expect(cobertura?.filter).toBeUndefined();
    expect(cobertura?.pinnable).not.toBe(false);
  });

  it.each(['full', 'none', 'partial'] as const)(
    'pinta la etiqueta de N6 para la cobertura `%s` (R35)',
    (coverage) => {
      const order = pedido();
      const columnas = buildOrderColumns({
        recipes: { items: [], totalPages: 1 },
        units: [],
        coverageByOrder: { [order.id]: coverage },
      });
      const columna = columnas.find((candidate) => candidate.id === COVERAGE_COLUMN_ID);

      render(<>{columna?.cell(order)}</>);

      const etiqueta = screen.getByTestId('order-coverage');
      expect(etiqueta).toHaveAttribute('data-coverage', coverage);
      expect(etiqueta).toHaveTextContent(ORDER_COVERAGE_LABELS[coverage]);
      expect(screen.queryByTestId(`order-missing-${COVERAGE_COLUMN_ID}`)).toBeNull();
    },
  );

  it('los tres textos de N6 son exactamente «Apartado», «Sin apartar» y «Sin cobertura completa» (R35)', () => {
    expect(ORDER_COVERAGE_LABELS).toEqual({
      full: 'Apartado',
      none: 'Sin apartar',
      partial: 'Sin cobertura completa',
    });
  });

  it('sin entrada en el lote —fallo o carga en vuelo— pinta el marcador de ausencia (R20, R35)', () => {
    // `ORDER_COLUMNS` (arriba del archivo) se construye SIN `coverageByOrder`: es exactamente el
    // caso del lote caido, mismo criterio que ya usan las celdas de receta y motivo.
    pintarCelda(COVERAGE_COLUMN_ID, pedido());

    expect(screen.getByTestId(`order-missing-${COVERAGE_COLUMN_ID}`)).toHaveTextContent(
      MISSING_VALUE_MARK,
    );
    expect(screen.queryByTestId('order-coverage')).toBeNull();
  });
});
