import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ErrorState } from '@/components/shared/error-state';
import {
  UNEXPECTED_ERROR_NOTICE_REFERENCE_TESTID,
  UNEXPECTED_ERROR_NOTICE_TESTID,
} from '@/components/shared/unexpected-error-notice';
import { UNEXPECTED_ERROR_CODE, errorMessage, type ErrorState as OperationError } from '@/lib/modules/errores';

import { setupUser } from '../../helpers/user-event';

const { refreshMock } = vi.hoisted(() => ({ refreshMock: vi.fn() }));

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: refreshMock,
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

const REFERENCIA = '7b1c9f2e-4d3a-4f5b-9c0d-1e2f3a4b5c6d';

const INESPERADO: OperationError = {
  status: 'error',
  code: UNEXPECTED_ERROR_CODE,
  message: errorMessage(UNEXPECTED_ERROR_CODE),
  reference: REFERENCIA,
};

const CATALOGADO: OperationError = {
  status: 'error',
  code: 'unauthorized',
  message: errorMessage('unauthorized'),
};

const BASE = {
  title: 'No se pudo cargar la lista.',
  testId: 'x-error',
  messageTestId: 'x-error-message',
  codeTestId: 'x-error-code',
} as const;

beforeEach(() => refreshMock.mockClear());
afterEach(cleanup);

describe('ErrorState', () => {
  it('R13: es una alerta con el titulo y, con error de catalogo, el mensaje y el codigo', () => {
    render(
      <ErrorState {...BASE} error={CATALOGADO} retry={{ kind: 'refresh' }} retryTestId="x-retry" />,
    );

    const alerta = screen.getByRole('alert');
    expect(alerta).toHaveAttribute('data-testid', 'x-error');
    expect(alerta.className).toBe(
      'flex flex-col items-start gap-3 rounded-lg border border-destructive/40 p-4',
    );
    expect(alerta).toHaveTextContent('No se pudo cargar la lista.');
    expect(screen.getByTestId('x-error-message')).toHaveTextContent(CATALOGADO.message);
    expect(screen.getByTestId('x-error-code')).toHaveTextContent('unauthorized');
    expect(screen.queryByTestId(UNEXPECTED_ERROR_NOTICE_TESTID)).toBeNull();
  });

  it('R13: con el error inesperado pinta el aviso con su referencia y no el codigo', () => {
    render(
      <ErrorState {...BASE} error={INESPERADO} retry={{ kind: 'refresh' }} retryTestId="x-retry" />,
    );

    expect(screen.getByTestId(UNEXPECTED_ERROR_NOTICE_TESTID)).toBeInTheDocument();
    expect(screen.getByTestId(UNEXPECTED_ERROR_NOTICE_REFERENCE_TESTID)).toHaveTextContent(
      REFERENCIA,
    );
    expect(screen.queryByTestId('x-error-message')).toBeNull();
    expect(screen.queryByTestId('x-error-code')).toBeNull();
  });

  it('R14: el reintento refresh es un boton que vuelve a pedir la pagina actual', async () => {
    const user = setupUser();
    render(
      <ErrorState {...BASE} error={CATALOGADO} retry={{ kind: 'refresh' }} retryTestId="x-retry" />,
    );

    const boton = screen.getByRole('button', { name: 'Reintentar' });
    expect(boton).toHaveAttribute('data-testid', 'x-retry');
    expect(boton.className.split(' ')).toEqual(expect.arrayContaining(['min-h-11', 'min-w-11']));

    await user.click(boton);
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it('R14: el reintento href es un enlace al destino indicado y no refresca', () => {
    render(
      <ErrorState
        {...BASE}
        error={CATALOGADO}
        retry={{ kind: 'href', href: '/clientes?page=2' }}
        retryTestId="x-retry"
      />,
    );

    const enlace = screen.getByRole('link', { name: 'Reintentar' });
    expect(enlace).toHaveAttribute('href', '/clientes?page=2');
    expect(enlace).toHaveAttribute('data-slot', 'button');
    expect(enlace).toHaveAttribute('data-testid', 'x-retry');
    expect(screen.queryByRole('button')).toBeNull();
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it('R13: respeta la etiqueta del reintento', () => {
    render(
      <ErrorState
        {...BASE}
        error={CATALOGADO}
        retry={{ kind: 'refresh' }}
        retryTestId="x-retry"
        retryLabel="Volver a intentar"
      />,
    );

    expect(screen.getByRole('button', { name: 'Volver a intentar' })).toBeInTheDocument();
  });

  it('R13: sin retry no pinta reintento, y withCode=false omite el codigo', () => {
    render(
      <ErrorState
        title="No se pudo cargar."
        testId="x-error"
        messageTestId="x-error-message"
        error={CATALOGADO}
        withCode={false}
        className="flex flex-col items-start gap-2 rounded-lg border border-destructive/40 p-4"
      />,
    );

    const alerta = screen.getByRole('alert');
    expect(alerta.className).toContain('gap-2');
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
    expect(alerta.querySelectorAll('p')).toHaveLength(2);
  });
});
