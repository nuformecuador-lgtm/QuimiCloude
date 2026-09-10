// QC-39 T7 — Las CUATRO columnas de la lista de unidades y sus acciones de fila: R16, R17, R19,
// R20, R28, R29, R31, R48, R49.
//
// **Las columnas son DATOS**, asi que el test recorre la DECLARACION en vez de listar literales:
// anadir una columna es anadir una entrada a la fabrica, y eso es justo lo que el test en negativo
// de R16 vigila —una columna de ambito, el identificador tecnico o las marcas de tiempo obligarian
// a tocar este archivo—.
//
// **Los asserts van sobre ids de columna, rol ARIA, `data-testid` y constantes exportadas** (R49),
// nunca sobre el copy de las etiquetas: `label` se reescribe sin avisar y un assert sobre el no
// dice nada del comportamiento. Los nombres accesibles de los dos botones se comprueban con las
// funciones que los componen (`editUnitLabel`, `deleteUnitLabel`), unica fuente de ese texto.
//
// **`unit-actions.ts` esta mockeada con dobles que FALLAN si se les llama**: una declaracion de
// columnas no puede pedir ni escribir datos por su cuenta (R44, R46).

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ACTIONS_COLUMN_ID,
  EQUIVALENCE_COLUMN_ID,
  NAME_COLUMN_ID,
  NO_EQUIVALENCE_LABEL,
  SYMBOL_COLUMN_ID,
  UNIT_ACTION_DELETE_TESTID,
  UNIT_ACTION_EDIT_TESTID,
  UNIT_COLUMNS,
  UNIT_COLUMN_COUNT,
  UNIT_ROW_ACTIONS_TESTID,
  UNIT_SKELETON_COLUMN_COUNT,
  createUnitColumns,
  deleteUnitLabel,
  editUnitLabel,
  formatUnitEquivalence,
} from '@/app/(private)/configuracion/unidades/components';
import { UNIT_QUERYABLE, type UnitView } from '@/lib/modules/unidades';

// El panel de edicion y el dialogo de borrado que la celda de acciones monta usan `useRouter` para
// refrescar la lista tras una escritura (R38). En jsdom no hay App Router montado, asi que se
// sustituye por un doble; ningun caso de este archivo escribe nada.
const { routerMock } = vi.hoisted(() => ({
  routerMock: {
    push: vi.fn<(href: string) => void>(),
    replace: vi.fn<(href: string) => void>(),
    refresh: vi.fn<() => void>(),
    back: vi.fn<() => void>(),
    forward: vi.fn<() => void>(),
    prefetch: vi.fn<(href: string) => void>(),
  },
}));

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => routerMock,
}));

vi.mock('@/lib/modules/unidades/adapters/driving/unit-actions', () => {
  const noDebeInvocarse = (nombre: string) => () => {
    throw new Error(`${nombre} no debe invocarse desde la declaracion de columnas`);
  };
  return {
    listUnitsAction: vi.fn(noDebeInvocarse('listUnitsAction')),
    createUnitAction: vi.fn(noDebeInvocarse('createUnitAction')),
    updateUnitAction: vi.fn(noDebeInvocarse('updateUnitAction')),
    deleteUnitAction: vi.fn(noDebeInvocarse('deleteUnitAction')),
  };
});

const UNIT_ID = '11111111-1111-4111-8111-111111111111';
const BASE_ID = '22222222-2222-4222-8222-222222222222';

function unidad(overrides: Partial<UnitView> = {}): UnitView {
  return {
    id: UNIT_ID,
    name: 'Kilogramo',
    symbol: 'kg',
    baseUnitId: null,
    factor: null,
    isSystem: false,
    ...overrides,
  };
}

const GRAMO: UnitView = {
  id: BASE_ID,
  name: 'Gramo',
  symbol: 'gr',
  baseUnitId: null,
  factor: null,
  isSystem: true,
};

/** El indice `id -> unidad` que la seccion arma con su segunda lectura (`design.md > 5.3`). */
const INDICE = { [GRAMO.id]: { name: GRAMO.name, symbol: GRAMO.symbol } };

/** Pinta la celda de una columna por su id. Las celdas devuelven `ReactNode`, no cadena. */
function pintarCelda(
  columnId: string,
  view: UnitView,
  columns = createUnitColumns(INDICE, [GRAMO]),
) {
  const column = columns.find((candidate) => candidate.id === columnId);
  if (column === undefined) throw new Error(`No existe la columna ${columnId}`);
  return render(<>{column.cell(view)}</>);
}

afterEach(() => {
  cleanup();
});

describe('las columnas declaradas son exactamente CUATRO (R16)', () => {
  it('en positivo: nombre, simbolo, equivalencia y acciones, en el orden de `design.md > 9`', () => {
    expect(UNIT_COLUMNS.map((column) => column.id)).toEqual([
      NAME_COLUMN_ID,
      SYMBOL_COLUMN_ID,
      EQUIVALENCE_COLUMN_ID,
      ACTIONS_COLUMN_ID,
    ]);
    expect(UNIT_COLUMNS).toHaveLength(4);
    expect(UNIT_COLUMN_COUNT).toBe(UNIT_COLUMNS.length);
  });

  it('la fabrica y la declaracion suelta describen la MISMA tabla: mismos ids y mismo numero', () => {
    const conDatos = createUnitColumns(INDICE, [GRAMO]);

    expect(conDatos.map((column) => column.id)).toEqual(UNIT_COLUMNS.map((column) => column.id));
  });

  it('en negativo: ninguna columna expone id, ambito, la pareja suelta, normalizado ni autoria', () => {
    const ids = UNIT_COLUMNS.map((column) => column.id);

    for (const prohibida of [
      'id',
      'companyId',
      'scope',
      'ambito',
      'isSystem',
      'baseUnitId',
      'factor',
      'nameNormalized',
      'createdAt',
      'updatedAt',
      'createdBy',
      'updatedBy',
    ]) {
      expect(ids, `la columna ${prohibida} no debe declararse`).not.toContain(prohibida);
    }
  });

  it('el esqueleto de carga pinta tantas celdas como columnas hay (R25)', () => {
    expect(UNIT_SKELETON_COLUMN_COUNT).toBe(UNIT_COLUMNS.length);
  });
});

describe('solo nombre y simbolo ordenan, y solo porque el contrato lo permite (R19)', () => {
  it('en positivo: `name` y `symbol` son ordenables y estan en la lista blanca del catalogo', () => {
    const ordenables = UNIT_COLUMNS.filter((column) => column.sortable === true).map(
      (column) => column.id,
    );

    expect(ordenables).toEqual([NAME_COLUMN_ID, SYMBOL_COLUMN_ID]);
    for (const id of ordenables) {
      expect(UNIT_QUERYABLE.sortable).toContain(id);
    }
  });

  it('en negativo: la equivalencia NO ordena y NO filtra: no es una columna real', () => {
    const equivalencia = UNIT_COLUMNS.find((column) => column.id === EQUIVALENCE_COLUMN_ID);

    expect(equivalencia?.sortable).toBeUndefined();
    expect(equivalencia?.filter).toBeUndefined();
    expect(UNIT_QUERYABLE.sortable).not.toContain(EQUIVALENCE_COLUMN_ID);
  });

  it('en negativo: la columna de acciones NO ordena, NO filtra y NO se puede fijar (R31)', () => {
    const acciones = UNIT_COLUMNS.find((column) => column.id === ACTIONS_COLUMN_ID);

    expect(acciones?.sortable).toBeUndefined();
    expect(acciones?.filter).toBeUndefined();
    expect(acciones?.pinnable).toBe(false);
  });

  it('ninguna columna declara filtro: esta pantalla no ofrece ninguno (R20)', () => {
    expect(UNIT_COLUMNS.filter((column) => column.filter !== undefined)).toEqual([]);
    expect(Object.keys(UNIT_QUERYABLE.filterable)).toEqual([]);
  });
});

describe('las celdas de datos pintan lo que se les pide y nada tecnico (R16, R17)', () => {
  it('el nombre se pinta TAL CUAL, sin el uuid ni ningun dato de ambito', () => {
    const view = unidad();

    const { container } = pintarCelda(NAME_COLUMN_ID, view);

    expect(container.textContent).toBe(view.name);
    expect(container.textContent).not.toContain(view.id);
  });

  it('el simbolo se pinta, y sin simbolo cae al mismo marcador neutro que la equivalencia', () => {
    const { container } = pintarCelda(SYMBOL_COLUMN_ID, unidad({ symbol: 'kg' }));
    expect(container.textContent).toBe('kg');

    cleanup();

    const sinSimbolo = pintarCelda(SYMBOL_COLUMN_ID, unidad({ symbol: null }));
    expect(sinSimbolo.container.textContent).toBe(NO_EQUIVALENCE_LABEL);
  });

  it('la equivalencia de una unidad DERIVADA es la frase armada por la funcion pura (R17)', () => {
    const derivada = unidad({ baseUnitId: BASE_ID, factor: '1000.0000' });

    const { container } = pintarCelda(EQUIVALENCE_COLUMN_ID, derivada);

    expect(container.textContent).toBe(formatUnitEquivalence(derivada, GRAMO));
  });

  it('la de una unidad BASE, y la de una derivada sin base resuelta, es el marcador neutro (R17)', () => {
    const base = pintarCelda(EQUIVALENCE_COLUMN_ID, unidad());
    expect(base.container.textContent).toBe(NO_EQUIVALENCE_LABEL);

    cleanup();

    // El caso degradado: el indice llega VACIO -la segunda lectura de la seccion fallo- y la fila
    // se pinta igual en vez de romperse (`design.md > 5.3`).
    const huerfana = pintarCelda(
      EQUIVALENCE_COLUMN_ID,
      unidad({ baseUnitId: BASE_ID, factor: '1000.0000' }),
      createUnitColumns({}, []),
    );
    expect(huerfana.container.textContent).toBe(NO_EQUIVALENCE_LABEL);
  });
});

describe('la columna de acciones es una columna NORMAL que devuelve elementos (R31)', () => {
  it('su celda devuelve `ReactNode`: no hace falta ninguna prop nueva en la tabla compartida', () => {
    pintarCelda(ACTIONS_COLUMN_ID, unidad());

    expect(screen.getByTestId(UNIT_ROW_ACTIONS_TESTID)).toHaveAttribute('data-unit-id', UNIT_ID);
  });
});

describe('la fila de una unidad DE EMPRESA ofrece editar y borrar (R28, R48)', () => {
  it('los dos botones estan en el DOM desde el primer render y son botones de verdad', () => {
    const view = unidad();

    pintarCelda(ACTIONS_COLUMN_ID, view);

    const editar = screen.getByRole('button', { name: editUnitLabel(view.name) });
    const borrar = screen.getByRole('button', { name: deleteUnitLabel(view.name) });

    expect(editar).toBe(screen.getByTestId(UNIT_ACTION_EDIT_TESTID));
    expect(borrar).toBe(screen.getByTestId(UNIT_ACTION_DELETE_TESTID));
    expect(editar).toBeEnabled();
    expect(borrar).toBeEnabled();
  });

  it('el nombre accesible IDENTIFICA la unidad sobre la que actua', () => {
    const view = unidad({ name: 'Mililitro' });

    pintarCelda(ACTIONS_COLUMN_ID, view);

    for (const boton of screen.getAllByRole('button')) {
      expect(boton.getAttribute('aria-label')).toContain(view.name);
    }
  });

  it('los dos objetivos tactiles miden al menos 44x44 px (R48)', () => {
    pintarCelda(ACTIONS_COLUMN_ID, unidad());

    for (const testId of [UNIT_ACTION_EDIT_TESTID, UNIT_ACTION_DELETE_TESTID]) {
      const boton = screen.getByTestId(testId);
      expect(boton).toHaveClass('min-h-11');
      expect(boton).toHaveClass('min-w-11');
    }
  });

  it('nada se descubre con `:hover` ni vive dentro de un desplegable (R48)', () => {
    const { container } = pintarCelda(ACTIONS_COLUMN_ID, unidad());

    expect(screen.queryByRole('menu')).toBeNull();
    expect(container.innerHTML).not.toContain('group-hover');
    expect(container.innerHTML).not.toContain('hover:opacity');
  });
});

describe('la fila de una unidad DE SISTEMA deja la celda VACIA (R29)', () => {
  it('en negativo: ni botones, ni deshabilitados, ni etiqueta, ni insignia, ni `data-testid`', () => {
    const { container } = pintarCelda(ACTIONS_COLUMN_ID, unidad({ isSystem: true }));

    // Ningun nodo: la celda no emite NADA. Ni siquiera un envoltorio vacio.
    expect(container.innerHTML).toBe('');
    expect(container.querySelectorAll('button')).toHaveLength(0);
    expect(container.querySelectorAll('[disabled]')).toHaveLength(0);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByTestId(UNIT_ROW_ACTIONS_TESTID)).toBeNull();
    expect(screen.queryByTestId(UNIT_ACTION_EDIT_TESTID)).toBeNull();
    expect(screen.queryByTestId(UNIT_ACTION_DELETE_TESTID)).toBeNull();
  });

  it('el detector muerde: la MISMA unidad sin `isSystem` si pinta las dos acciones', () => {
    pintarCelda(ACTIONS_COLUMN_ID, unidad({ isSystem: false }));

    expect(screen.getAllByRole('button')).toHaveLength(2);
  });

  it('la columna de nombre no gana ningun distintivo por ser la unidad de sistema (R29)', () => {
    const sistema = pintarCelda(NAME_COLUMN_ID, unidad({ isSystem: true })).container.textContent;
    cleanup();
    const empresa = pintarCelda(NAME_COLUMN_ID, unidad({ isSystem: false })).container.textContent;

    expect(sistema).toBe(empresa);
  });
});
