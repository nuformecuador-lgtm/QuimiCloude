// QC-85 T4 — Las columnas de la lista de grupos: R12 (y R15 en la cabecera).
//
// **La columna de miembros se sumo despues, por decision del humano fuera del proceso SDD
// completo**: la tabla ahora muestra ademas QUE USUARIOS pertenecen a cada grupo. Esta suite
// afirma que hay **dos columnas de datos y una de acciones** y que **ninguna celda pinta un
// numero** —ni el conteo de miembros visibles, ni el total, que siguen siendo de QC-100—.
//
// **Ningun assert sobre copy** (R41): los controles se localizan por `data-testid` y por
// constantes exportadas, y las etiquetas de columna se comparan contra las constantes de
// `work-group-labels.ts`, nunca contra un literal escrito aqui.

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  WORK_GROUP_ACTIONS_COLUMN_ID,
  WORK_GROUP_ACTIONS_COLUMN_LABEL,
  WORK_GROUP_ACTION_DELETE_LABEL,
  WORK_GROUP_ACTION_DELETE_TESTID,
  WORK_GROUP_ACTION_EDIT_LABEL,
  WORK_GROUP_ACTION_EDIT_TESTID,
  WORK_GROUP_COLUMNS,
  WORK_GROUP_COLUMN_COUNT,
  WORK_GROUP_MEMBERS_COLUMN_ID,
  WORK_GROUP_MEMBERS_COLUMN_LABEL,
  WORK_GROUP_NAME_COLUMN_ID,
  WORK_GROUP_NAME_COLUMN_LABEL,
  WORK_GROUP_ROW_ACTIONS_TESTID,
  WORK_GROUP_SKELETON_COLUMN_COUNT,
  WorkGroupRowActions,
  createWorkGroupColumns,
  workGroupRowActionsLabel,
} from '@/app/(private)/configuracion/usuarios/components';
import {
  RESPONSIBLE_AVATARS_LIMIT,
  RESPONSIBLE_AVATAR_TESTID,
  RESPONSIBLE_MISSING_TESTID,
  RESPONSIBLE_OVERFLOW_TESTID,
} from '@/components/shared/responsible-avatars';
import { WORK_GROUP_QUERYABLE, type WorkGroupRow } from '@/lib/modules/identity';
import { clickRowAction, openRowActionsMenu } from '../../../helpers/row-actions-menu';
import { setupUser } from '../../../helpers/user-event';

/**
 * La fila del listado, con **las tres claves que el contrato devuelve**. El tipo es el del modulo:
 * si `WorkGroupRow` ganara o perdiera una clave, este archivo dejaria de compilar.
 */
const GRUPO: WorkGroupRow = {
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Laboratorio',
  members: [],
};

/** Las claves EXACTAS de la fila. Lista CERRADA: el conteo de miembros es QC-100, no un olvido. */
const CLAVES_DE_LA_FILA = ['id', 'name', 'members'] as const;

afterEach(() => {
  cleanup();
});

describe('la fila de grupo tiene EXACTAMENTE tres claves, `id`, `name` y `members` (R12)', () => {
  it('el objeto que la consulta devuelve no trae ninguna otra', () => {
    expect(Object.keys(GRUPO).sort()).toEqual([...CLAVES_DE_LA_FILA].sort());
  });

  it('ninguna de ellas es un conteo: `members` es la lista completa, no un numero', () => {
    expect(typeof GRUPO.id).toBe('string');
    expect(typeof GRUPO.name).toBe('string');
    expect(Array.isArray(GRUPO.members)).toBe(true);
  });
});

describe('hay DOS columnas de datos y una de acciones, y ninguna mas (R12)', () => {
  it('los ids son exactamente esos tres, en ese orden', () => {
    expect(WORK_GROUP_COLUMNS.map((columna) => columna.id)).toEqual([
      WORK_GROUP_NAME_COLUMN_ID,
      WORK_GROUP_MEMBERS_COLUMN_ID,
      WORK_GROUP_ACTIONS_COLUMN_ID,
    ]);
    expect(WORK_GROUP_COLUMNS).toHaveLength(WORK_GROUP_COLUMN_COUNT);
  });

  it('las dos columnas de datos son nombre y miembros, las dos claves presentables de la fila', () => {
    expect(WORK_GROUP_NAME_COLUMN_ID).toBe('name');
    expect(WORK_GROUP_MEMBERS_COLUMN_ID).toBe('members');
    expect([...CLAVES_DE_LA_FILA]).toContain(WORK_GROUP_NAME_COLUMN_ID);
    expect([...CLAVES_DE_LA_FILA]).toContain(WORK_GROUP_MEMBERS_COLUMN_ID);
  });

  it('las etiquetas salen de las constantes de la capa de copy, no de un literal (R41)', () => {
    const [nombre, miembros, acciones] = WORK_GROUP_COLUMNS;

    expect(nombre!.label).toBe(WORK_GROUP_NAME_COLUMN_LABEL);
    expect(miembros!.label).toBe(WORK_GROUP_MEMBERS_COLUMN_LABEL);
    expect(acciones!.label).toBe(WORK_GROUP_ACTIONS_COLUMN_LABEL);
  });

  it('el esqueleto de carga pinta tantas celdas como columnas declara la tabla', () => {
    // Este ancla es lo que impide que el numero del esqueleto se quede atras en silencio.
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
    const grupo: WorkGroupRow = { id: GRUPO.id, name: 'Laboratorio de control', members: [] };
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

describe('la columna de miembros pinta el MISMO avatar-group que «Responsables» en /asignacion (R12, autorizado fuera de QC-100)', () => {
  const columna = WORK_GROUP_COLUMNS.find(
    (entrada) => entrada.id === WORK_GROUP_MEMBERS_COLUMN_ID,
  )!;

  it('con miembros, pinta un avatar por cada uno', () => {
    const grupo: WorkGroupRow = {
      id: GRUPO.id,
      name: GRUPO.name,
      members: [
        { id: 'm1', displayName: 'Ana Lopez' },
        { id: 'm2', displayName: 'Beto Ruiz' },
      ],
    };

    render(
      <table>
        <tbody>
          <tr>
            <td>{columna.cell(grupo)}</td>
          </tr>
        </tbody>
      </table>,
    );

    expect(screen.getAllByTestId(RESPONSIBLE_AVATAR_TESTID)).toHaveLength(grupo.members.length);
    expect(screen.queryByTestId(RESPONSIBLE_MISSING_TESTID)).toBeNull();
  });

  it('con mas miembros que el limite, el overflow dice "miembros", no "responsables" (texto propio de esta pantalla)', () => {
    const grupo: WorkGroupRow = {
      id: GRUPO.id,
      name: GRUPO.name,
      members: Array.from({ length: RESPONSIBLE_AVATARS_LIMIT + 2 }, (_valor, indice) => ({
        id: `m${indice}`,
        displayName: `Persona ${indice}`,
      })),
    };

    render(
      <table>
        <tbody>
          <tr>
            <td>{columna.cell(grupo)}</td>
          </tr>
        </tbody>
      </table>,
    );

    expect(screen.getByTestId(RESPONSIBLE_OVERFLOW_TESTID)).toHaveAttribute(
      'aria-label',
      'Ver los 2 miembros restantes',
    );
  });

  it('sin miembros, pinta el marcador de ausencia y ningun avatar', () => {
    render(
      <table>
        <tbody>
          <tr>
            <td>{columna.cell(GRUPO)}</td>
          </tr>
        </tbody>
      </table>,
    );

    expect(screen.getByTestId(RESPONSIBLE_MISSING_TESTID)).toBeInTheDocument();
    expect(screen.queryByTestId(RESPONSIBLE_AVATAR_TESTID)).toBeNull();
  });

  it('no ordena ni filtra: la lista blanca no la declara (R15, R16)', () => {
    expect(WORK_GROUP_QUERYABLE.sortable).not.toContain(WORK_GROUP_MEMBERS_COLUMN_ID);
    expect(columna.sortable ?? false).toBe(false);
    expect(columna.filter).toBeUndefined();
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
  it('con `canModify` las dos se emiten en el menu de la fila, cuyo disparador nombra al grupo', async () => {
    const user = setupUser();
    render(<WorkGroupRowActions group={GRUPO} canModify />);

    const disparador = screen.getByTestId(WORK_GROUP_ROW_ACTIONS_TESTID);
    expect(disparador).toHaveAttribute('data-work-group-id', GRUPO.id);
    // El grupo lo nombra el disparador del menu; cada item dice solo el verbo.
    expect(disparador).toHaveAccessibleName(workGroupRowActionsLabel(GRUPO.name));
    await openRowActionsMenu(user, disparador);
    expect(screen.getByTestId(WORK_GROUP_ACTION_EDIT_TESTID)).toHaveAccessibleName(
      WORK_GROUP_ACTION_EDIT_LABEL,
    );
    expect(screen.getByTestId(WORK_GROUP_ACTION_DELETE_TESTID)).toHaveAccessibleName(
      WORK_GROUP_ACTION_DELETE_LABEL,
    );
  });

  it('sin `canModify` la celda queda VACIA: ni un boton deshabilitado, ni un contenedor', () => {
    const { container } = render(<WorkGroupRowActions group={GRUPO} canModify={false} />);

    expect(container.innerHTML).toBe('');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('cada item del menu avisa sobre QUE grupo se pidio actuar, y no escribe nada por su cuenta', async () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    const user = setupUser();
    render(<WorkGroupRowActions group={GRUPO} canModify onEdit={onEdit} onDelete={onDelete} />);

    const disparador = screen.getByTestId(WORK_GROUP_ROW_ACTIONS_TESTID);
    await clickRowAction(user, disparador, WORK_GROUP_ACTION_EDIT_TESTID);
    await clickRowAction(user, disparador, WORK_GROUP_ACTION_DELETE_TESTID);

    expect(onEdit).toHaveBeenCalledWith(GRUPO);
    expect(onDelete).toHaveBeenCalledWith(GRUPO);
  });
});
