// QC-85 T4 — Las columnas de la lista de grupos: R12 (y R15 en la cabecera).
//
// **Lo que la tabla NO muestra es tan requisito como lo que muestra** (decision cerrada 5): esta
// suite afirma que las claves de `WorkGroupRow` que la pantalla usa son **exactamente `id` y
// `name`**, que hay **una sola columna de datos** y que **ninguna celda pinta un numero** —ni el
// conteo de miembros visibles, ni el total, que son de QC-100—.
//
// **Ningun assert sobre copy** (R41): los controles se localizan por `data-testid` y por
// constantes exportadas, y las etiquetas de columna se comparan contra las constantes de
// `work-group-labels.ts`, nunca contra un literal escrito aqui.

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  WORK_GROUP_ACTIONS_COLUMN_ID,
  WORK_GROUP_ACTIONS_COLUMN_LABEL,
  WORK_GROUP_ACTION_DELETE_TESTID,
  WORK_GROUP_ACTION_EDIT_TESTID,
  WORK_GROUP_COLUMNS,
  WORK_GROUP_COLUMN_COUNT,
  WORK_GROUP_NAME_COLUMN_ID,
  WORK_GROUP_NAME_COLUMN_LABEL,
  WORK_GROUP_ROW_ACTIONS_TESTID,
  WORK_GROUP_SKELETON_COLUMN_COUNT,
  WorkGroupRowActions,
  createWorkGroupColumns,
  deleteWorkGroupLabel,
  editWorkGroupLabel,
} from '@/app/(private)/configuracion/usuarios/components';
import { WORK_GROUP_QUERYABLE, type WorkGroupRow } from '@/lib/modules/identity';

/**
 * La fila del listado, con **las dos claves que el contrato devuelve**. El tipo es el del modulo:
 * si `WorkGroupRow` ganara o perdiera una clave, este archivo dejaria de compilar.
 */
const GRUPO: WorkGroupRow = {
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Laboratorio',
};

/** Las claves EXACTAS de la fila. Lista CERRADA: el conteo de miembros es QC-100, no un olvido. */
const CLAVES_DE_LA_FILA = ['id', 'name'] as const;

afterEach(() => {
  cleanup();
});

describe('la fila de grupo tiene EXACTAMENTE dos claves, `id` y `name` (R12)', () => {
  it('el objeto que la consulta devuelve no trae ninguna otra', () => {
    expect(Object.keys(GRUPO).sort()).toEqual([...CLAVES_DE_LA_FILA].sort());
  });

  it('y ninguna de ellas es un conteo: no hay «miembros visibles» ni «miembros totales»', () => {
    for (const clave of CLAVES_DE_LA_FILA) {
      expect(typeof GRUPO[clave]).toBe('string');
    }
  });
});

describe('hay UNA columna de datos y una de acciones, y ninguna mas (R12)', () => {
  it('los ids son exactamente esos dos, en ese orden', () => {
    expect(WORK_GROUP_COLUMNS.map((columna) => columna.id)).toEqual([
      WORK_GROUP_NAME_COLUMN_ID,
      WORK_GROUP_ACTIONS_COLUMN_ID,
    ]);
    expect(WORK_GROUP_COLUMNS).toHaveLength(WORK_GROUP_COLUMN_COUNT);
  });

  it('la columna de datos es la del nombre, que es la UNICA clave presentable de la fila', () => {
    expect(WORK_GROUP_NAME_COLUMN_ID).toBe('name');
    expect([...CLAVES_DE_LA_FILA]).toContain(WORK_GROUP_NAME_COLUMN_ID);
  });

  it('las etiquetas salen de las constantes de la capa de copy, no de un literal (R41)', () => {
    const [nombre, acciones] = WORK_GROUP_COLUMNS;

    expect(nombre!.label).toBe(WORK_GROUP_NAME_COLUMN_LABEL);
    expect(acciones!.label).toBe(WORK_GROUP_ACTIONS_COLUMN_LABEL);
  });

  it('el esqueleto de carga pinta tantas celdas como columnas declara la tabla', () => {
    // El esqueleto lo renderiza un Server Component y por eso no importa el modulo de cliente de
    // las columnas. Este ancla es lo que impide que el numero se quede atras en silencio.
    expect(WORK_GROUP_SKELETON_COLUMN_COUNT).toBe(WORK_GROUP_COLUMN_COUNT);
  });
});

describe('NINGUNA celda pinta un numero, y eso es el requisito (R12, QC-100)', () => {
  it('la celda del nombre devuelve el nombre TAL CUAL, sin nada al lado', () => {
    const columna = WORK_GROUP_COLUMNS.find((entrada) => entrada.id === WORK_GROUP_NAME_COLUMN_ID)!;

    expect(columna.cell(GRUPO)).toBe(GRUPO.name);
  });

  it('la fila entera, renderizada, no contiene ni un solo digito', () => {
    // Nombre SIN digitos a proposito: cualquier numero en el DOM vendria de la pantalla, no del
    // dato. Un conteo de miembros —«3», «3 de 5»— caeria aqui.
    const grupo: WorkGroupRow = { id: GRUPO.id, name: 'Laboratorio de control' };
    const columnas = createWorkGroupColumns({ canModify: true });

    const { container } = render(
      <table>
        <tbody>
          <tr>
            {columnas.map((columna) => (
              <td key={columna.id}>{columna.cell(grupo)}</td>
            ))}
          </tr>
        </tbody>
      </table>,
    );

    expect(container.textContent ?? '').not.toMatch(/\d/);
  });

  it('y el identificador tecnico no se pinta como texto en ninguna celda', () => {
    const columnas = createWorkGroupColumns({ canModify: true });

    const { container } = render(
      <table>
        <tbody>
          <tr>
            {columnas.map((columna) => (
              <td key={columna.id}>{columna.cell(GRUPO)}</td>
            ))}
          </tr>
        </tbody>
      </table>,
    );

    expect(container.textContent ?? '').not.toContain(GRUPO.id);
  });
});

describe('lo que ordena lo dice la lista blanca, y solo si es columna visible (R15)', () => {
  it('el nombre ordena porque el contrato lo declara', () => {
    const columna = WORK_GROUP_COLUMNS.find((entrada) => entrada.id === WORK_GROUP_NAME_COLUMN_ID)!;

    expect(WORK_GROUP_QUERYABLE.sortable).toContain(WORK_GROUP_NAME_COLUMN_ID);
    expect(columna.sortable).toBe(true);
  });

  it('la de acciones no ordena ni filtra: ordenar por unos botones no significa nada', () => {
    const columna = WORK_GROUP_COLUMNS.find(
      (entrada) => entrada.id === WORK_GROUP_ACTIONS_COLUMN_ID,
    )!;

    expect(columna.sortable ?? false).toBe(false);
    expect(columna.filter).toBeUndefined();
    expect(columna.pinnable).toBe(false);
  });

  it('`createdAt` es ordenable en el contrato pero NO es una columna (`design.md > 10.3`)', () => {
    expect(WORK_GROUP_QUERYABLE.sortable).toContain('createdAt');
    expect(WORK_GROUP_COLUMNS.map((columna) => columna.id)).not.toContain('createdAt');
  });

  it('NINGUNA columna declara filtro: la lista blanca no tiene filtrables (R16)', () => {
    expect(WORK_GROUP_QUERYABLE.filterable).toEqual({});
    for (const columna of WORK_GROUP_COLUMNS) {
      expect(columna.filter).toBeUndefined();
    }
  });
});

describe('las acciones de fila existen solo con permiso de escritura (R9)', () => {
  it('con `canModify` las dos se emiten, cada una nombrando al grupo', () => {
    render(<WorkGroupRowActions group={GRUPO} canModify />);

    expect(screen.getByTestId(WORK_GROUP_ROW_ACTIONS_TESTID)).toHaveAttribute(
      'data-work-group-id',
      GRUPO.id,
    );
    expect(screen.getByTestId(WORK_GROUP_ACTION_EDIT_TESTID)).toHaveAttribute(
      'aria-label',
      editWorkGroupLabel(GRUPO.name),
    );
    expect(screen.getByTestId(WORK_GROUP_ACTION_DELETE_TESTID)).toHaveAttribute(
      'aria-label',
      deleteWorkGroupLabel(GRUPO.name),
    );
  });

  it('sin `canModify` la celda queda VACIA: ni un boton deshabilitado, ni un contenedor', () => {
    const { container } = render(<WorkGroupRowActions group={GRUPO} canModify={false} />);

    expect(container.innerHTML).toBe('');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('cada disparador avisa sobre QUE grupo se pidio actuar, y no escribe nada por su cuenta', () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    render(<WorkGroupRowActions group={GRUPO} canModify onEdit={onEdit} onDelete={onDelete} />);

    screen.getByTestId(WORK_GROUP_ACTION_EDIT_TESTID).click();
    screen.getByTestId(WORK_GROUP_ACTION_DELETE_TESTID).click();

    expect(onEdit).toHaveBeenCalledWith(GRUPO);
    expect(onDelete).toHaveBeenCalledWith(GRUPO);
  });
});
