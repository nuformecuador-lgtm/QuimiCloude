// QC-45 T4 — Las DOS columnas de la lista de presentaciones y sus acciones de fila: R9, R11, R19,
// R20, R32.
//
// **Las columnas son DATOS**, asi que el test recorre la DECLARACION en vez de listar literales:
// anadir una columna es anadir una entrada a `PRESENTATION_COLUMNS`, y eso es justo lo que el test
// en negativo de R9 vigila.
//
// **Los asserts van sobre ids de columna, rol ARIA, `data-testid` y constantes exportadas** (R35),
// nunca sobre el copy de las etiquetas: `label` se reescribe sin avisar y un assert sobre el no
// dice nada sobre el comportamiento. Los nombres accesibles de los dos botones se comprueban con
// las funciones que los componen (`editPresentationLabel`, `deletePresentationLabel`), que son la
// unica fuente de ese texto.
//
// **`presentation-actions.ts` esta mockeada con dobles que FALLAN si se les llama**: una
// declaracion de columnas no puede pedir ni escribir datos por su cuenta (R32).

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ACTIONS_COLUMN_ID,
  NAME_COLUMN_ID,
  PRESENTATION_ACTION_DELETE_TESTID,
  PRESENTATION_ACTION_EDIT_TESTID,
  PRESENTATION_COLUMN_COUNT,
  PRESENTATION_ROW_ACTIONS_TESTID,
  PRESENTATION_SKELETON_COLUMN_COUNT,
  buildPresentationColumns,
  deletePresentationLabel,
  editPresentationLabel,
} from '@/app/(private)/configuracion/presentaciones/components';
import { PRESENTATION_QUERYABLE, type PresentationView } from '@/lib/modules/inventario';
import type { UnitRef } from '@/lib/modules/unidades';

// El panel de edicion y el dialogo de borrado que la celda de acciones monta usan `useRouter`
// para refrescar la lista tras una escritura (R25). En jsdom no hay App Router montado, asi que
// se sustituye por un doble; ningun caso de este archivo escribe nada.
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

vi.mock('@/lib/modules/inventario/adapters/driving/presentation-actions', () => {
  const noDebeInvocarse = (nombre: string) => () => {
    throw new Error(`${nombre} no debe invocarse desde la declaracion de columnas`);
  };
  return {
    listPresentationsAction: vi.fn(noDebeInvocarse('listPresentationsAction')),
    createPresentationAction: vi.fn(noDebeInvocarse('createPresentationAction')),
    updatePresentationAction: vi.fn(noDebeInvocarse('updatePresentationAction')),
    deletePresentationAction: vi.fn(noDebeInvocarse('deletePresentationAction')),
  };
});


/** Unidades del catalogo, tal cual bajarian desde `listUnitsAction()` (QC-80 R16). */
const UNIDADES: readonly UnitRef[] = [
  { id: 'unit-kg', name: 'Kilogramo', symbol: 'kg', baseUnitId: null, factor: null },
  { id: 'unit-l', name: 'Litro', symbol: 'L', baseUnitId: null, factor: null },
];
const UNIDAD_ACTUAL = UNIDADES[0]!.id;

/**
 * QC-80: las columnas pasan a construirse con `buildPresentationColumns(units)` porque la celda
 * de acciones monta el panel de edicion, que necesita el catalogo. Se arma UNA vez aqui y todos
 * los casos la recorren igual que antes: lo que vigila R9 -«exactamente dos columnas»- no cambia.
 */
const PRESENTATION_COLUMNS = buildPresentationColumns(UNIDADES);

const PRESENTATION_ID = '11111111-1111-4111-8111-111111111111';

function presentacion(overrides: Partial<PresentationView> = {}): PresentationView {
  return {
    id: PRESENTATION_ID,
    name: 'Bidón 20 L',
    nameNormalized: 'bidon 20 l',
    unitId: UNIDAD_ACTUAL,
    content: null,
    createdAt: new Date('2026-01-15T10:00:00.000Z'),
    updatedAt: new Date('2026-02-20T10:00:00.000Z'),
    ...overrides,
  };
}

/** Pinta la celda de una columna por su id. Las celdas devuelven `ReactNode`, no cadena. */
function pintarCelda(columnId: string, view: PresentationView) {
  const column = PRESENTATION_COLUMNS.find((candidate) => candidate.id === columnId);
  if (column === undefined) throw new Error(`No existe la columna ${columnId}`);
  return render(<>{column.cell(view)}</>);
}

afterEach(() => {
  cleanup();
});

describe('las columnas declaradas son exactamente DOS (R9)', () => {
  it('la unidad NO gana columna: solo se ve abriendo el panel (QC-80, `design.md > 5`)', () => {
    // En negativo y a proposito: pintarla abriria una pregunta que nadie hizo (¿el nombre?, ¿el
    // simbolo?, ¿resuelto contra que catalogo?). Coste aceptado y escrito en el diseno.
    const ids = buildPresentationColumns(UNIDADES).map((column) => column.id);

    expect(ids).not.toContain('unitId');
    expect(ids).not.toContain('unit');
  });

  it('en positivo: nombre y acciones, en el orden de `design.md > 6`', () => {
    expect(PRESENTATION_COLUMNS.map((column) => column.id)).toEqual([
      NAME_COLUMN_ID,
      ACTIONS_COLUMN_ID,
    ]);
    expect(PRESENTATION_COLUMNS).toHaveLength(2);
    expect(PRESENTATION_COLUMN_COUNT).toBe(PRESENTATION_COLUMNS.length);
  });

  it('en negativo: ninguna columna expone id, marcas de tiempo, normalizado ni autoria', () => {
    const ids = PRESENTATION_COLUMNS.map((column) => column.id);

    for (const prohibida of [
      'id',
      'createdAt',
      'updatedAt',
      'nameNormalized',
      'createdBy',
      'updatedBy',
    ]) {
      expect(ids, `la columna ${prohibida} no debe declararse`).not.toContain(prohibida);
    }
  });

  it('el esqueleto de carga pinta tantas celdas como columnas hay (R16)', () => {
    expect(PRESENTATION_SKELETON_COLUMN_COUNT).toBe(PRESENTATION_COLUMNS.length);
  });
});

describe('solo la columna de nombre ordena, y solo porque el contrato lo permite (R11)', () => {
  it('en positivo: `name` es ordenable y esta en la lista blanca del catalogo', () => {
    const ordenables = PRESENTATION_COLUMNS.filter((column) => column.sortable === true).map(
      (column) => column.id,
    );

    expect(ordenables).toEqual([NAME_COLUMN_ID]);
    for (const id of ordenables) {
      expect(PRESENTATION_QUERYABLE.sortable).toContain(id);
    }
  });

  it('en negativo: la columna de acciones NO ordena y NO filtra', () => {
    const acciones = PRESENTATION_COLUMNS.find((column) => column.id === ACTIONS_COLUMN_ID);

    expect(acciones?.sortable).toBeUndefined();
    expect(acciones?.filter).toBeUndefined();
    // No se puede fijar: con dos columnas, fijarla taparia la unica columna de datos.
    expect(acciones?.pinnable).toBe(false);
  });

  it('ninguna columna declara filtro: `createdAt` no se pinta, asi que no se filtra por el (R9)', () => {
    expect(PRESENTATION_COLUMNS.filter((column) => column.filter !== undefined)).toEqual([]);
    // El contrato SI declara ese filtro; la decision de no ofrecerlo es de la pantalla.
    expect(Object.keys(PRESENTATION_QUERYABLE.filterable)).toContain('createdAt');
  });
});

describe('la celda de nombre pinta el nombre TAL CUAL y ningun dato tecnico (R9)', () => {
  it('el nombre se pinta sin transformar, y no aparecen ni el uuid ni el normalizado', () => {
    const view = presentacion();

    const { container } = pintarCelda(NAME_COLUMN_ID, view);

    expect(container.textContent).toBe(view.name);
    expect(container.textContent).not.toContain(view.id);
    expect(container.textContent).not.toContain(view.nameNormalized);
  });
});

describe('la columna de acciones es una columna NORMAL que devuelve elementos (R20)', () => {
  it('su celda devuelve `ReactNode`: no hace falta ninguna prop nueva en la tabla compartida', () => {
    pintarCelda(ACTIONS_COLUMN_ID, presentacion());

    expect(screen.getByTestId(PRESENTATION_ROW_ACTIONS_TESTID)).toHaveAttribute(
      'data-presentation-id',
      PRESENTATION_ID,
    );
  });
});

describe('cada fila ofrece editar y borrar, alcanzables por rol ARIA (R19)', () => {
  it('los dos botones estan en el DOM desde el primer render y son botones de verdad', () => {
    const view = presentacion();

    pintarCelda(ACTIONS_COLUMN_ID, view);

    const editar = screen.getByRole('button', { name: editPresentationLabel(view.name) });
    const borrar = screen.getByRole('button', { name: deletePresentationLabel(view.name) });

    expect(editar).toBeInTheDocument();
    expect(borrar).toBeInTheDocument();
    // Los mismos controles que sus `data-testid`: no hay dos parejas de botones.
    expect(editar).toBe(screen.getByTestId(PRESENTATION_ACTION_EDIT_TESTID));
    expect(borrar).toBe(screen.getByTestId(PRESENTATION_ACTION_DELETE_TESTID));
    // Ninguno esta deshabilitado: una presentacion siempre se puede intentar editar o borrar.
    expect(editar).toBeEnabled();
    expect(borrar).toBeEnabled();
  });

  it('el nombre accesible IDENTIFICA la presentacion sobre la que actua', () => {
    const view = presentacion({ name: 'Tambor 200 L' });

    pintarCelda(ACTIONS_COLUMN_ID, view);

    for (const boton of screen.getAllByRole('button')) {
      expect(boton.getAttribute('aria-label')).toContain(view.name);
    }
  });

  it('los dos objetivos tactiles miden al menos 44x44 px (R34)', () => {
    pintarCelda(ACTIONS_COLUMN_ID, presentacion());

    for (const testId of [PRESENTATION_ACTION_EDIT_TESTID, PRESENTATION_ACTION_DELETE_TESTID]) {
      const boton = screen.getByTestId(testId);
      expect(boton).toHaveClass('min-h-11');
      expect(boton).toHaveClass('min-w-11');
    }
  });

  it('nada se descubre con `:hover` ni vive dentro de un desplegable (R19, R34)', () => {
    const { container } = pintarCelda(ACTIONS_COLUMN_ID, presentacion());

    // Ni un menu que esconda las acciones, ni una clase que las revele al pasar el raton.
    expect(screen.queryByRole('menu')).toBeNull();
    expect(container.innerHTML).not.toContain('group-hover');
    expect(container.innerHTML).not.toContain('hover:opacity');
  });
});
