import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ErrorAlert } from '@/components/shared/error-alert';
import {
  UNEXPECTED_ERROR_NOTICE_REFERENCE_TESTID,
  UNEXPECTED_ERROR_NOTICE_TESTID,
} from '@/components/shared/unexpected-error-notice';
import { UNEXPECTED_ERROR_CODE, errorMessage, type ErrorState } from '@/lib/modules/errores';

const REFERENCIA = '7b1c9f2e-4d3a-4f5b-9c0d-1e2f3a4b5c6d';

const INESPERADO: ErrorState = {
  status: 'error',
  code: UNEXPECTED_ERROR_CODE,
  message: errorMessage(UNEXPECTED_ERROR_CODE),
  reference: REFERENCIA,
};

const CATALOGADO: ErrorState = {
  status: 'error',
  code: 'invalid_input',
  message: errorMessage('invalid_input'),
};

afterEach(cleanup);

describe('ErrorAlert — las dos ramas', () => {
  it('R9 R10 — con el error inesperado pinta unexpected-error-notice con su referencia', () => {
    render(<ErrorAlert error={INESPERADO} testId="alerta" />);

    const alerta = screen.getByTestId('alerta');
    expect(alerta).toContainElement(screen.getByTestId(UNEXPECTED_ERROR_NOTICE_TESTID));
    expect(screen.getByTestId(UNEXPECTED_ERROR_NOTICE_REFERENCE_TESTID)).toHaveTextContent(
      REFERENCIA,
    );
  });

  it('R10 — con el error inesperado no llama a renderCatalogued', () => {
    render(
      <ErrorAlert
        error={INESPERADO}
        testId="alerta"
        renderCatalogued={() => <span data-testid="rama-catalogo" />}
      />,
    );

    expect(screen.queryByTestId('rama-catalogo')).toBeNull();
  });

  it('R9 R10 — con un error de catalogo pinta el mensaje por defecto y ninguna referencia', () => {
    render(<ErrorAlert error={CATALOGADO} testId="alerta" />);

    const alerta = screen.getByTestId('alerta');
    expect(alerta.children).toHaveLength(1);
    expect(alerta.firstElementChild?.tagName).toBe('P');
    expect(alerta).toHaveTextContent(CATALOGADO.message);
    expect(screen.queryByTestId(UNEXPECTED_ERROR_NOTICE_TESTID)).toBeNull();
    expect(screen.queryByTestId(UNEXPECTED_ERROR_NOTICE_REFERENCE_TESTID)).toBeNull();
    expect(alerta).not.toHaveTextContent(REFERENCIA);
  });

  it('R10 R11 — con un error de catalogo pinta la rama que pide el consumidor', () => {
    render(
      <ErrorAlert
        error={CATALOGADO}
        testId="alerta"
        renderCatalogued={(error) => (
          <>
            <p data-testid="alerta-mensaje">{error.message}</p>
            <p className="text-xs" data-testid="alerta-codigo">
              {error.code}
            </p>
          </>
        )}
      />,
    );

    expect(screen.getByTestId('alerta-mensaje')).toHaveTextContent(CATALOGADO.message);
    expect(screen.getByTestId('alerta-codigo')).toHaveTextContent(CATALOGADO.code);
    expect(screen.queryByTestId(UNEXPECTED_ERROR_NOTICE_TESTID)).toBeNull();
  });
});

describe('ErrorAlert — el contenedor conserva el marcado de cada sitio', () => {
  it('R11 — por defecto es una region role="alert" sin data-code', () => {
    render(<ErrorAlert error={CATALOGADO} testId="alerta" />);

    const alerta = screen.getByRole('alert');
    expect(alerta).toHaveAttribute('data-testid', 'alerta');
    expect(alerta).not.toHaveAttribute('data-code');
  });

  it('R11 — respeta testId, id, className y data-code', () => {
    render(
      <ErrorAlert
        error={CATALOGADO}
        testId="work-group-form-error"
        id="form-error-1"
        className="flex flex-col gap-2 rounded-lg border border-destructive/40 p-3"
        withDataCode
      />,
    );

    const alerta = screen.getByTestId('work-group-form-error');
    expect(alerta).toHaveAttribute('role', 'alert');
    expect(alerta).toHaveAttribute('id', 'form-error-1');
    expect(alerta).toHaveAttribute(
      'class',
      'flex flex-col gap-2 rounded-lg border border-destructive/40 p-3',
    );
    expect(alerta).toHaveAttribute('data-code', CATALOGADO.code);
  });

  it('R11 — data-code lleva el codigo tambien en la rama inesperada', () => {
    render(<ErrorAlert error={INESPERADO} testId="alerta" withDataCode />);

    expect(screen.getByTestId('alerta')).toHaveAttribute('data-code', UNEXPECTED_ERROR_CODE);
  });

  it('R11 — role={null} pinta el contenedor sin rol', () => {
    render(
      <ErrorAlert
        error={CATALOGADO}
        testId="order-cost-quote-error"
        className="text-destructive"
        role={null}
        renderCatalogued={(error) => <span>{`Error: ${error.message}`}</span>}
      />,
    );

    const alerta = screen.getByTestId('order-cost-quote-error');
    expect(alerta).not.toHaveAttribute('role');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(alerta.firstElementChild?.tagName).toBe('SPAN');
  });

  it('R11 — before y after van dentro del contenedor, alrededor de la rama', () => {
    render(
      <ErrorAlert
        error={INESPERADO}
        testId="alerta"
        before={<p data-testid="titulo">No se pudo cargar.</p>}
        after={<button type="button">Reintentar</button>}
      />,
    );

    const hijos = Array.from(screen.getByTestId('alerta').children);
    expect(hijos).toHaveLength(3);
    expect(hijos[0]).toBe(screen.getByTestId('titulo'));
    expect(hijos[1]).toBe(screen.getByTestId(UNEXPECTED_ERROR_NOTICE_TESTID));
    expect(hijos[2]).toBe(screen.getByRole('button', { name: 'Reintentar' }));
  });
});

describe('ErrorAlert — la etiqueta del contenedor', () => {
  it('R11 — sin as el contenedor es un div', () => {
    render(<ErrorAlert error={CATALOGADO} testId="alerta" />);

    expect(screen.getByTestId('alerta').tagName).toBe('DIV');
  });

  it('R11 — as="p" pinta un p con los mismos atributos', () => {
    render(
      <ErrorAlert
        error={CATALOGADO}
        as="p"
        testId="packaging-select-load-error"
        className="p-2 text-sm text-destructive"
        renderCatalogued={(error) => error.message}
      />,
    );

    const alerta = screen.getByRole('alert');
    expect(alerta.tagName).toBe('P');
    expect(alerta).toHaveAttribute('data-testid', 'packaging-select-load-error');
    expect(alerta).toHaveAttribute('class', 'p-2 text-sm text-destructive');
    expect(alerta.children).toHaveLength(0);
    expect(alerta).toHaveTextContent(CATALOGADO.message);
  });

  it('R10 R11 — as="p" con el error inesperado pinta el aviso dentro del p', () => {
    render(<ErrorAlert error={INESPERADO} as="p" testId="alerta" />);

    const alerta = screen.getByTestId('alerta');
    expect(alerta.tagName).toBe('P');
    expect(alerta).toContainElement(screen.getByTestId(UNEXPECTED_ERROR_NOTICE_TESTID));
  });
});

describe('ErrorAlert — la etiqueta de la rama de catalogo', () => {
  it('R11 — sin cataloguedAs la rama de catalogo usa la etiqueta de as', () => {
    render(<ErrorAlert error={CATALOGADO} as="p" testId="alerta" />);

    const alerta = screen.getByTestId('alerta');
    expect(alerta.tagName).toBe('P');
    expect(alerta.children).toHaveLength(0);
    expect(alerta).toHaveTextContent(CATALOGADO.message);
  });

  it('R11 — cataloguedAs no cambia el default: sin as ni cataloguedAs, div con un p dentro', () => {
    const { container: conProp } = render(
      <ErrorAlert error={CATALOGADO} cataloguedAs="div" testId="alerta" />,
    );
    const html = conProp.innerHTML;
    cleanup();
    const { container: sinProp } = render(<ErrorAlert error={CATALOGADO} testId="alerta" />);

    expect(sinProp.innerHTML).toBe(html);
    expect(sinProp.innerHTML).toBe(
      `<div role="alert" data-testid="alerta"><p>${CATALOGADO.message}</p></div>`,
    );
  });

  it('R10 R11 — cataloguedAs="p" con un error de catalogo pinta el mensaje pelado en un p', () => {
    const { container } = render(
      <ErrorAlert
        error={CATALOGADO}
        cataloguedAs="p"
        className="text-sm text-destructive"
        testId="delete-product-error"
      />,
    );

    expect(container.innerHTML).toBe(
      `<p role="alert" class="text-sm text-destructive" data-testid="delete-product-error">${CATALOGADO.message}</p>`,
    );
  });

  it('R10 R11 — cataloguedAs="p" no toca la rama inesperada: sigue siendo un div con el aviso', () => {
    render(
      <ErrorAlert
        error={INESPERADO}
        cataloguedAs="p"
        className="text-sm text-destructive"
        testId="delete-product-error"
      />,
    );

    const alerta = screen.getByTestId('delete-product-error');
    expect(alerta.tagName).toBe('DIV');
    expect(alerta).toHaveAttribute('role', 'alert');
    expect(alerta).toHaveAttribute('class', 'text-sm text-destructive');
    expect(alerta.children).toHaveLength(1);
    expect(alerta.firstElementChild).toBe(screen.getByTestId(UNEXPECTED_ERROR_NOTICE_TESTID));
    expect(screen.getByTestId(UNEXPECTED_ERROR_NOTICE_REFERENCE_TESTID)).toHaveTextContent(
      REFERENCIA,
    );
  });

  it('R11 — cataloguedAs="p" sin testId ni className pinta un p con solo el rol', () => {
    const { container } = render(<ErrorAlert error={CATALOGADO} cataloguedAs="p" />);

    expect(container.innerHTML).toBe(`<p role="alert">${CATALOGADO.message}</p>`);
  });

  it('R11 — cataloguedAs="p" respeta un renderCatalogued explicito', () => {
    render(
      <ErrorAlert
        error={CATALOGADO}
        cataloguedAs="p"
        testId="alerta"
        renderCatalogued={(error) => <span data-testid="rama-catalogo">{error.code}</span>}
      />,
    );

    const alerta = screen.getByTestId('alerta');
    expect(alerta.tagName).toBe('P');
    expect(alerta.firstElementChild).toBe(screen.getByTestId('rama-catalogo'));
  });

  it('R11 — as="p" y cataloguedAs="div": cada rama usa su etiqueta', () => {
    render(<ErrorAlert error={CATALOGADO} as="p" cataloguedAs="div" testId="alerta" />);
    expect(screen.getByTestId('alerta').tagName).toBe('DIV');
    expect(screen.getByTestId('alerta').firstElementChild?.tagName).toBe('P');
    cleanup();

    render(<ErrorAlert error={INESPERADO} as="p" cataloguedAs="div" testId="alerta" />);
    expect(screen.getByTestId('alerta').tagName).toBe('P');
  });
});
