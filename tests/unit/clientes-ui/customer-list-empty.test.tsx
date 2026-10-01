// El estado vacio de la lista de clientes.
//
// El componente se monta SOLO —sin la seccion— porque lo que aqui se mide es su forma: que
// disparador ofrece y bajo que condicion. El despacho real (cuando se pinta cada caso) lo cubre
// `customer-list-section.test.ts` (T6).

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import {
  CUSTOMER_LIST_EMPTY_MESSAGE_TESTID,
  CUSTOMER_LIST_EMPTY_TESTID,
  CUSTOMER_LIST_FIRST_PAGE_TESTID,
  CustomerListEmpty,
} from '@/app/(private)/clientes/components';

afterEach(() => {
  cleanup();
});

describe('el vacio es identificable y no finge que haya lista (R19)', () => {
  it('se pinta su region y su mensaje, y ninguna tabla', () => {
    render(<CustomerListEmpty canModify={false} />);

    expect(screen.getByTestId(CUSTOMER_LIST_EMPTY_TESTID)).toBeInTheDocument();
    expect(screen.getByTestId(CUSTOMER_LIST_EMPTY_MESSAGE_TESTID)).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
  });
});

describe('el disparador de alta solo se monta con `canModify` (R5, R19)', () => {
  it('con `canModify=false` no se monta, aunque se le pasen hijos', () => {
    render(
      <CustomerListEmpty canModify={false}>
        <button type="button" data-testid="customer-create-open">
          Nuevo cliente
        </button>
      </CustomerListEmpty>,
    );

    expect(screen.queryByTestId('customer-create-open')).toBeNull();
  });

  it('con `canModify=true` se monta el disparador recibido', () => {
    render(
      <CustomerListEmpty canModify={true}>
        <button type="button" data-testid="customer-create-open">
          Nuevo cliente
        </button>
      </CustomerListEmpty>,
    );

    expect(screen.getByTestId('customer-create-open')).toBeInTheDocument();
  });

  it('con `firstPageHref` presente, el disparador no se monta aunque `canModify` sea true (R20)', () => {
    render(
      <CustomerListEmpty canModify={true} firstPageHref="/clientes?page=1">
        <button type="button" data-testid="customer-create-open">
          Nuevo cliente
        </button>
      </CustomerListEmpty>,
    );

    expect(screen.queryByTestId('customer-create-open')).toBeNull();
    expect(screen.getByTestId(CUSTOMER_LIST_FIRST_PAGE_TESTID)).toBeInTheDocument();
  });
});

describe('la vuelta a la primera pagina es un enlace real y alcanzable con el dedo (R20, R39, R40)', () => {
  it('es un `<a>` con destino, no un boton disfrazado, y mide al menos 44x44', () => {
    render(<CustomerListEmpty canModify={false} firstPageHref="/clientes?page=1" />);

    const enlace = screen.getByTestId(CUSTOMER_LIST_FIRST_PAGE_TESTID);
    expect(enlace.tagName).toBe('A');
    expect(enlace).toHaveAttribute('href', '/clientes?page=1');
    expect(enlace).not.toHaveAttribute('role', 'button');
    expect(enlace.className).toContain('min-h-11');
    expect(enlace.className).toContain('min-w-11');
  });

  it('sin `firstPageHref` no se ofrece esa salida', () => {
    render(<CustomerListEmpty canModify={false} />);

    expect(screen.queryByTestId(CUSTOMER_LIST_FIRST_PAGE_TESTID)).toBeNull();
  });
});
