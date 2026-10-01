// Las nueve columnas de la lista de clientes.
//
// Las columnas son DATOS, asi que el test las recorre en vez de listar literales: anadir una
// columna es anadir una fila a `buildCustomerColumns`.
//
// Los asserts van sobre ids de columna, `data-testid` y constantes exportadas, nunca sobre
// el copy de las etiquetas.

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import {
  ACTIONS_COLUMN_ID,
  ADDRESS_COLUMN_ID,
  CITY_COLUMN_ID,
  CREATED_AT_COLUMN_ID,
  EMAIL_COLUMN_ID,
  FIRST_NAMES_COLUMN_ID,
  LAST_NAMES_COLUMN_ID,
  MISSING_VALUE_MARK,
  PHONE_COLUMN_ID,
  UPDATED_AT_COLUMN_ID,
  buildCustomerColumns,
} from '@/app/(private)/clientes/components';
import { CUSTOMER_QUERYABLE, type CustomerView } from '@/lib/modules/clientes';

const CUSTOMER_COLUMNS = buildCustomerColumns({ rowActions: () => <span data-testid="fila-accion" /> });

function cliente(overrides: Partial<CustomerView> = {}): CustomerView {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    firstNames: 'María',
    lastNames: 'Gómez',
    city: 'Bogotá',
    phone: '3001234567',
    email: 'maria@example.com',
    address: 'Calle 1 # 2-3',
    createdAt: new Date('2026-01-15T10:00:00.000Z'),
    updatedAt: new Date('2026-01-20T10:00:00.000Z'),
    createdBy: null,
    updatedBy: null,
    ...overrides,
  };
}

/** Pinta la celda de una columna por su id. Las celdas devuelven `ReactNode`, no cadena. */
function pintarCelda(columnId: string, customer: CustomerView) {
  const column = CUSTOMER_COLUMNS.find((candidate) => candidate.id === columnId);
  if (column === undefined) throw new Error(`No existe la columna ${columnId}`);
  return render(<>{column.cell(customer)}</>);
}

afterEach(() => {
  cleanup();
});

describe('las columnas declaradas son exactamente las nueve acordadas (R10)', () => {
  it('en positivo: los nueve ids, en el orden acordado', () => {
    expect(CUSTOMER_COLUMNS.map((column) => column.id)).toEqual([
      LAST_NAMES_COLUMN_ID,
      FIRST_NAMES_COLUMN_ID,
      CITY_COLUMN_ID,
      PHONE_COLUMN_ID,
      EMAIL_COLUMN_ID,
      ADDRESS_COLUMN_ID,
      CREATED_AT_COLUMN_ID,
      UPDATED_AT_COLUMN_ID,
      ACTIONS_COLUMN_ID,
    ]);
    expect(CUSTOMER_COLUMNS).toHaveLength(9);
  });

  it('en negativo: ninguna columna es id, empresa, autores, marca de baja, NIT, documento ni contacto', () => {
    const ids = CUSTOMER_COLUMNS.map((column) => column.id);

    for (const prohibida of [
      'id',
      'companyId',
      'deletedAt',
      'createdBy',
      'updatedBy',
      'nit',
      'document',
      'contactName',
    ]) {
      expect(ids).not.toContain(prohibida);
    }
  });
});

describe('las ordenables son exactamente la lista blanca del contrato (R14)', () => {
  it('en positivo: coinciden con `CUSTOMER_QUERYABLE.sortable`', () => {
    const ordenables = CUSTOMER_COLUMNS.filter((column) => column.sortable === true).map((c) => c.id);

    expect(new Set(ordenables)).toEqual(new Set(CUSTOMER_QUERYABLE.sortable));
  });

  it('en negativo: telefono, correo y direccion no ordenan', () => {
    const noOrdenables = CUSTOMER_COLUMNS.filter((column) => column.sortable !== true).map((c) => c.id);

    expect(noOrdenables).toContain(PHONE_COLUMN_ID);
    expect(noOrdenables).toContain(EMAIL_COLUMN_ID);
    expect(noOrdenables).toContain(ADDRESS_COLUMN_ID);
    expect(noOrdenables).toContain(ACTIONS_COLUMN_ID);
  });
});

describe('los filtros son exactamente los que declara la lista blanca (R13)', () => {
  it('ciudad como texto y fecha de alta como rango, y ninguna otra columna filtra', () => {
    const porId = new Map(CUSTOMER_COLUMNS.map((column) => [column.id, column]));

    expect(porId.get(CITY_COLUMN_ID)?.filter).toEqual({ kind: 'text' });
    expect(porId.get(CREATED_AT_COLUMN_ID)?.filter).toEqual({ kind: 'dateRange' });

    const conFiltro = CUSTOMER_COLUMNS.filter((column) => column.filter !== undefined).map((c) => c.id);
    expect(conFiltro).toEqual([CITY_COLUMN_ID, CREATED_AT_COLUMN_ID]);
  });
});

describe('la columna de acciones no se puede fijar y no ordena ni filtra', () => {
  it('pinnable es false y sortable/filter estan ausentes', () => {
    const acciones = CUSTOMER_COLUMNS.find((column) => column.id === ACTIONS_COLUMN_ID);

    expect(acciones?.pinnable).toBe(false);
    expect(acciones?.sortable).not.toBe(true);
    expect(acciones?.filter).toBeUndefined();
  });
});

describe('telefono, correo y direccion pintan un marcador identificable cuando faltan (R11)', () => {
  it.each([PHONE_COLUMN_ID, EMAIL_COLUMN_ID, ADDRESS_COLUMN_ID])(
    'sin valor, la columna %s pinta el marcador y nunca `null`/`undefined`',
    (columnId) => {
      const key = columnId as 'phone' | 'email' | 'address';
      const { container } = pintarCelda(columnId, cliente({ [key]: null }));

      expect(screen.getByTestId(`customer-missing-${columnId}`)).toHaveTextContent(MISSING_VALUE_MARK);
      expect(container.textContent).not.toContain('null');
      expect(container.textContent).not.toContain('undefined');
    },
  );

  it.each([PHONE_COLUMN_ID, EMAIL_COLUMN_ID, ADDRESS_COLUMN_ID])(
    'con valor informado, la columna %s pinta el dato y no el marcador',
    (columnId) => {
      pintarCelda(columnId, cliente());

      expect(screen.queryByTestId(`customer-missing-${columnId}`)).toBeNull();
    },
  );
});

describe('las fechas se pintan en UTC (`design.md > 5.4`)', () => {
  it('fecha de alta y de ultima modificacion en formato AAAA-MM-DD', () => {
    const cliente1 = cliente({
      createdAt: new Date('2026-03-01T23:30:00.000Z'),
      updatedAt: new Date('2026-03-02T00:15:00.000Z'),
    });

    expect(pintarCelda(CREATED_AT_COLUMN_ID, cliente1).container.textContent).toBe('2026-03-01');
    expect(pintarCelda(UPDATED_AT_COLUMN_ID, cliente1).container.textContent).toBe('2026-03-02');
  });
});

describe('la celda de acciones es la que entrega el slot `rowActions` (R5)', () => {
  it('pinta exactamente lo que devuelve el slot, con la fila como argumento', () => {
    const recibidos: CustomerView[] = [];
    const columnas = buildCustomerColumns({
      rowActions: (customer) => {
        recibidos.push(customer);
        return <span data-testid="marca-fila">{customer.id}</span>;
      },
    });
    const fila = cliente();
    const columna = columnas.find((c) => c.id === ACTIONS_COLUMN_ID);

    render(<>{columna?.cell(fila)}</>);

    expect(screen.getByTestId('marca-fila')).toHaveTextContent(fila.id);
    expect(recibidos).toEqual([fila]);
  });
});
