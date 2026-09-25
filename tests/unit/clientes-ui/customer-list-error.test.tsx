// El estado de error de la lista de clientes.
//
// El reintento es un ENLACE a `customerListHref(params)`, no
// `router.refresh()`: pedir de nuevo la misma URL vuelve a ejecutar el Server Component que hizo
// la consulta.

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import {
  CUSTOMER_LIST_ERROR_CODE_TESTID,
  CUSTOMER_LIST_ERROR_MESSAGE_TESTID,
  CUSTOMER_LIST_ERROR_TESTID,
  CUSTOMER_LIST_RETRY_TESTID,
  CustomerListError,
} from '@/app/(private)/clientes/components';
import { UNEXPECTED_ERROR_NOTICE_REFERENCE_TESTID } from '@/components/shared/unexpected-error-notice';
import type { ErrorState } from '@/lib/modules/errores';

import { REFERENCIA_DEL_CASO, errorInesperado } from '../../helpers/identificador-de-request';

const RETRY_HREF = '/clientes?page=1';

/** Los codigos con los que la lectura de la lista puede rechazarse. */
const CODIGOS: readonly ErrorState[] = [
  { status: 'error', code: 'unauthorized', message: 'No tienes permiso.' },
  { status: 'error', code: 'invalid_input', message: 'La consulta no es válida.' },
];

afterEach(() => {
  cleanup();
});

describe('el error es identificable y dice QUE paso, con su codigo estable (R22, R40)', () => {
  for (const error of CODIGOS) {
    it(`el codigo ${error.code} se pinta aparte del mensaje devuelto`, () => {
      render(<CustomerListError error={error} retryHref={RETRY_HREF} />);

      expect(screen.getByTestId(CUSTOMER_LIST_ERROR_TESTID)).toHaveAttribute('role', 'alert');
      expect(screen.getByTestId(CUSTOMER_LIST_ERROR_MESSAGE_TESTID)).toHaveTextContent(error.message);
      expect(screen.getByTestId(CUSTOMER_LIST_ERROR_CODE_TESTID)).toHaveTextContent(error.code);
    });
  }

  it('NO pinta ninguna tabla: «fallo» no es «no hay clientes» (R7, R22)', () => {
    render(<CustomerListError error={CODIGOS[0]!} retryHref={RETRY_HREF} />);

    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryAllByRole('row')).toHaveLength(0);
  });
});

describe('el reintento es un enlace real a la propia lista, alcanzable con el dedo (R22, R39, R40)', () => {
  it('es un `<a>` con el destino de `customerListHref(params)`, no un boton', () => {
    render(<CustomerListError error={CODIGOS[0]!} retryHref={RETRY_HREF} />);

    const enlace = screen.getByTestId(CUSTOMER_LIST_RETRY_TESTID);
    expect(enlace.tagName).toBe('A');
    expect(enlace).toHaveAttribute('href', RETRY_HREF);
    expect(enlace).not.toHaveAttribute('role', 'button');
  });

  it('mide al menos 44x44 px y no depende de `:hover` para aparecer', () => {
    render(<CustomerListError error={CODIGOS[0]!} retryHref={RETRY_HREF} />);

    const enlace = screen.getByTestId(CUSTOMER_LIST_RETRY_TESTID);
    expect(enlace.className).toContain('min-h-11');
    expect(enlace.className).toContain('min-w-11');
    expect(enlace.className).not.toContain('hover:block');
    expect(enlace).toBeVisible();
  });

  it('se alcanza por su rol de enlace y con un nombre accesible', () => {
    render(<CustomerListError error={CODIGOS[0]!} retryHref={RETRY_HREF} />);

    const enlace = screen.getByRole('link', { name: 'Reintentar' });
    expect(enlace).toBe(screen.getByTestId(CUSTOMER_LIST_RETRY_TESTID));
  });

  it('no recorta el destino recibido: los parametros llegan intactos al `href`', () => {
    const destino = '/clientes?page=3&q=ana&pageSize=25&sort=createdAt%3Aasc';
    render(<CustomerListError error={CODIGOS[0]!} retryHref={destino} />);

    expect(screen.getByTestId(CUSTOMER_LIST_RETRY_TESTID)).toHaveAttribute('href', destino);
  });
});

describe('el error INESPERADO conserva el identificador de la peticion (QC-71)', () => {
  it('lo pinta el componente compartido, no una segunda region propia', () => {
    render(<CustomerListError error={errorInesperado()} retryHref={RETRY_HREF} />);

    expect(screen.getByTestId(UNEXPECTED_ERROR_NOTICE_REFERENCE_TESTID)).toHaveTextContent(
      REFERENCIA_DEL_CASO,
    );
    expect(screen.queryByTestId(CUSTOMER_LIST_ERROR_CODE_TESTID)).toBeNull();
    expect(screen.getByTestId(CUSTOMER_LIST_RETRY_TESTID)).toBeVisible();
  });
});
