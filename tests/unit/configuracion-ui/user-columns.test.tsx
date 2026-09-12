// QC-67 T6 — Las SEIS columnas de la lista de usuarios: R10, R13, R14, R15, R20 y R35.
//
// **Las columnas son DATOS**, asi que el test recorre la DECLARACION en vez de listar literales:
// anadir una columna es anadir una entrada a la fabrica, y eso es justo lo que el test en negativo
// de R10/R35 vigila —el identificador tecnico, `companyId`, el autor del ultimo cambio de estado o
// cualquier campo de credencial obligarian a tocar este archivo—.
//
// **Los asserts van sobre ids de columna, `data-testid` y constantes exportadas** (R41), nunca
// sobre el copy de las etiquetas: `label` se reescribe sin avisar y un assert sobre el no dice nada
// del comportamiento.
//
// **Que ordena se compara contra `USER_QUERYABLE.sortable` IMPORTADO** (R14, R15): si alguien
// reescribiera la lista blanca a mano en la pantalla, dejaria de casar.

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import {
  ACCOUNT_STATUS_COLUMN_ID,
  ACTIONS_COLUMN_ID,
  DISPLAY_NAME_COLUMN_ID,
  EMAIL_COLUMN_ID,
  ROLE_NAME_COLUMN_ID,
  USERNAME_COLUMN_ID,
  USER_ACCOUNT_STATUS_LABELS,
  USER_COLUMNS,
  USER_COLUMN_COUNT,
  USER_ROW_ACTIONS_TESTID,
  USER_STATUS_BADGE_TESTID,
  USER_STATUS_FILTER_OPTIONS,
  createUserColumns,
} from '@/app/(private)/configuracion/usuarios/components';
import { USER_ACCOUNT_STATUSES, USER_QUERYABLE, type UserRow } from '@/lib/modules/identity';

const USER_ID = '33333333-3333-4333-8333-333333333333';

function fila(overrides: Partial<UserRow> = {}): UserRow {
  return {
    id: USER_ID,
    displayName: 'Lopez Rivera Ana Maria',
    username: 'ana.lopez',
    email: 'ana.lopez@ejemplo.test',
    roleName: 'Administrador',
    accountStatus: USER_ACCOUNT_STATUSES[0],
    ...overrides,
  };
}

/** Pinta la celda de una columna por su id. Las celdas devuelven `ReactNode`, no cadena. */
function pintarCelda(columnId: string, row: UserRow, columns = USER_COLUMNS) {
  const column = columns.find((candidate) => candidate.id === columnId);
  if (column === undefined) throw new Error(`No existe la columna ${columnId}`);
  return render(<>{column.cell(row)}</>);
}

afterEach(() => {
  cleanup();
});

describe('las columnas declaradas son exactamente SEIS (R10)', () => {
  it('en positivo: nombre, usuario, correo, rol, estado y acciones, en el orden del diseno', () => {
    expect(USER_COLUMNS.map((column) => column.id)).toEqual([
      DISPLAY_NAME_COLUMN_ID,
      USERNAME_COLUMN_ID,
      EMAIL_COLUMN_ID,
      ROLE_NAME_COLUMN_ID,
      ACCOUNT_STATUS_COLUMN_ID,
      ACTIONS_COLUMN_ID,
    ]);
    expect(USER_COLUMNS).toHaveLength(USER_COLUMN_COUNT);
  });

  it('en negativo: no hay columna del identificador, de empresa, de autoria ni de credencial', () => {
    const ids = USER_COLUMNS.map((column) => column.id);

    for (const prohibida of [
      'id',
      'companyId',
      'accountStatusChangedBy',
      'accountStatusChangedAt',
      'passwordHash',
      'mustChangeCredential',
      'failedLoginAttempts',
      'lockLevel',
      'lockedUntil',
      'deletedAt',
    ]) {
      expect(ids, `la tabla no debe declarar la columna ${prohibida}`).not.toContain(prohibida);
    }
  });

  it('las cinco columnas de datos se corresponden con claves REALES de la fila (R10, R35)', () => {
    const clavesDeLaFila = Object.keys(fila());
    const columnasDeDatos = USER_COLUMNS.filter((column) => column.id !== ACTIONS_COLUMN_ID);

    for (const column of columnasDeDatos) {
      expect(clavesDeLaFila, `${column.id} no es una clave de UserRow`).toContain(column.id);
    }
    // La fila trae seis claves; la tabla pinta cinco: el identificador tecnico se queda fuera.
    expect(columnasDeDatos).toHaveLength(clavesDeLaFila.length - 1);
  });

  it('el identificador de la fila existe pero NO se pinta: no es informacion, es ruido', () => {
    const { container } = pintarCelda(DISPLAY_NAME_COLUMN_ID, fila());

    expect(container.textContent).not.toContain(USER_ID);
  });
});

describe('solo ordena lo que declara la lista blanca, LEIDA de ella (R14, R15)', () => {
  it('las columnas ordenables son exactamente las que estan en `USER_QUERYABLE.sortable`', () => {
    const ordenables = USER_COLUMNS.filter((column) => column.sortable === true).map(
      (column) => column.id,
    );

    expect(ordenables).toEqual(
      USER_COLUMNS.map((column) => column.id).filter((id) =>
        USER_QUERYABLE.sortable.includes(id),
      ),
    );
  });

  it('con la lista de hoy eso es usuario, correo y estado, y nada mas', () => {
    expect(USER_COLUMNS.filter((column) => column.sortable === true).map((column) => column.id))
      .toEqual([USERNAME_COLUMN_ID, EMAIL_COLUMN_ID, ACCOUNT_STATUS_COLUMN_ID]);
  });

  it('el nombre mostrable NO ordena: es una composicion, no un campo del catalogo', () => {
    const columna = USER_COLUMNS.find((c) => c.id === DISPLAY_NAME_COLUMN_ID);

    expect(USER_QUERYABLE.sortable).not.toContain(DISPLAY_NAME_COLUMN_ID);
    expect(columna?.sortable).not.toBe(true);
  });

  it('el rol tampoco ordena: no esta en la lista blanca', () => {
    const columna = USER_COLUMNS.find((c) => c.id === ROLE_NAME_COLUMN_ID);

    expect(USER_QUERYABLE.sortable).not.toContain(ROLE_NAME_COLUMN_ID);
    expect(columna?.sortable).not.toBe(true);
  });

  it('la columna de acciones no ordena: ordenar por unos botones no significa nada', () => {
    expect(USER_COLUMNS.find((c) => c.id === ACTIONS_COLUMN_ID)?.sortable).not.toBe(true);
  });
});

describe('el UNICO filtro es el del estado de cuenta (R13, R15)', () => {
  it('solo una columna declara `filter`, y es la del estado', () => {
    const conFiltro = USER_COLUMNS.filter((column) => column.filter !== undefined);

    expect(conFiltro.map((column) => column.id)).toEqual([ACCOUNT_STATUS_COLUMN_ID]);
  });

  it('es de seleccion y sus opciones son las derivadas del conjunto cerrado', () => {
    expect(USER_COLUMNS.find((c) => c.id === ACCOUNT_STATUS_COLUMN_ID)?.filter).toEqual({
      kind: 'select',
      options: USER_STATUS_FILTER_OPTIONS,
    });
  });

  it('NO hay filtro por rol, y la clave del filtro coincide con la del contrato', () => {
    expect(USER_COLUMNS.find((c) => c.id === ROLE_NAME_COLUMN_ID)?.filter).toBeUndefined();
    expect(Object.keys(USER_QUERYABLE.filterable)).toEqual([ACCOUNT_STATUS_COLUMN_ID]);
  });
});

describe('la columna de estado pinta el estado ALMACENADO tal cual (R20)', () => {
  for (const estado of USER_ACCOUNT_STATUSES) {
    it(`\`${estado}\` se pinta con su etiqueta y lleva el valor crudo como dato`, () => {
      pintarCelda(ACCOUNT_STATUS_COLUMN_ID, fila({ accountStatus: estado }));

      const insignia = screen.getByTestId(USER_STATUS_BADGE_TESTID);

      expect(insignia).toHaveAttribute('data-status', estado);
      expect(insignia).toHaveTextContent(USER_ACCOUNT_STATUS_LABELS[estado]);
    });
  }

  it('la celda no consulta nada derivado de bloqueos ni de contadores: solo tiene la fila', () => {
    // `UserRow` no trae `lockedUntil` ni ningun contador (R35), asi que no hay estado efectivo que
    // calcular: el desfase conocido de `design.md > 9` es deliberado.
    const claves = Object.keys(fila());

    for (const prohibida of ['lockedUntil', 'lockLevel', 'failedLoginAttempts']) {
      expect(claves).not.toContain(prohibida);
    }
  });
});

describe('la columna de acciones es una columna normal y no se fija (R10)', () => {
  it('declara `pinnable: false` para que no tape las columnas de datos', () => {
    expect(USER_COLUMNS.find((c) => c.id === ACTIONS_COLUMN_ID)?.pinnable).toBe(false);
  });

  it('sin `canModify` la celda no emite NADA (R6)', () => {
    const { container } = pintarCelda(ACTIONS_COLUMN_ID, fila());

    expect(screen.queryByTestId(USER_ROW_ACTIONS_TESTID)).toBeNull();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(container.textContent).toBe('');
  });

  it('con `canModify` la celda monta las acciones de la fila', () => {
    pintarCelda(ACTIONS_COLUMN_ID, fila(), createUserColumns({ canModify: true }));

    expect(screen.getByTestId(USER_ROW_ACTIONS_TESTID)).toBeInTheDocument();
  });

  it('`canModify` no cambia ni el numero de columnas ni sus capacidades', () => {
    const conPermiso = createUserColumns({ canModify: true });

    expect(conPermiso.map((c) => c.id)).toEqual(USER_COLUMNS.map((c) => c.id));
    expect(conPermiso.map((c) => c.sortable)).toEqual(USER_COLUMNS.map((c) => c.sortable));
  });
});
