// QC-71 T8 — R17 y R18 sobre el componente compartido.
//
// Nada se identifica por copy tecleado a mano (`docs/conventions.md`): los `data-testid` y la
// etiqueta se IMPORTAN del componente, y el uuid es un dato del caso de prueba.
//
// Las dos aserciones que importan son de signo contrario, y por eso estan las dos:
//   - R17: con el error inesperado, el uuid esta en el DOM **como texto** -no como atributo
//     escondido-, junto a una etiqueta que dice para que sirve.
//   - R18: con un error DEL CATALOGO no se pinta identificador NINGUNO. Se afirma en negativo
//     sobre el uuid, sobre la etiqueta y sobre el nodo entero: si el componente pinta el
//     identificador de mas, este caso se pone rojo (comprobado por mutacion).

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import {
  UNEXPECTED_ERROR_NOTICE_MESSAGE_TESTID,
  UNEXPECTED_ERROR_NOTICE_REFERENCE_LABEL,
  UNEXPECTED_ERROR_NOTICE_REFERENCE_TESTID,
  UNEXPECTED_ERROR_NOTICE_TESTID,
  UnexpectedErrorNotice,
} from '@/components/shared/unexpected-error-notice';
import { UNEXPECTED_ERROR_CODE, errorMessage, type ErrorState } from '@/lib/modules/errores';

/** Un uuid inconfundible: si aparece a medias o dentro de un atributo, se ve. */
const REFERENCIA = '7b1c9f2e-4d3a-4f5b-9c0d-1e2f3a4b5c6d';

/** Codigo del catalogo, NO el generico: es el que R18 usa como control. */
const CODIGO_CATALOGADO = 'unauthorized' as const;

const INESPERADO: ErrorState = {
  status: 'error',
  code: UNEXPECTED_ERROR_CODE,
  message: errorMessage(UNEXPECTED_ERROR_CODE),
  reference: REFERENCIA,
};

const CATALOGADO: ErrorState = {
  status: 'error',
  code: CODIGO_CATALOGADO,
  message: errorMessage(CODIGO_CATALOGADO),
};

afterEach(cleanup);

describe('UnexpectedErrorNotice — el error inesperado (R17)', () => {
  it('pinta el mensaje neutro del catalogo', () => {
    render(<UnexpectedErrorNotice state={INESPERADO} />);

    expect(screen.getByTestId(UNEXPECTED_ERROR_NOTICE_MESSAGE_TESTID)).toHaveTextContent(
      errorMessage(UNEXPECTED_ERROR_CODE),
    );
  });

  it('pinta el identificador como TEXTO, no como atributo', () => {
    const { container } = render(<UnexpectedErrorNotice state={INESPERADO} />);

    // `getByText` solo encuentra nodos de texto: si el uuid viviera en un `data-*` o en un
    // `title`, esto seria rojo.
    const texto = screen.getByText(REFERENCIA);
    expect(texto).toBeInTheDocument();
    expect(container.textContent).toContain(REFERENCIA);
  });

  it('acompana el identificador de una etiqueta que dice para que sirve', () => {
    render(<UnexpectedErrorNotice state={INESPERADO} />);

    const referencia = screen.getByTestId(UNEXPECTED_ERROR_NOTICE_REFERENCE_TESTID);
    expect(referencia).toHaveTextContent(UNEXPECTED_ERROR_NOTICE_REFERENCE_LABEL);
    expect(referencia).toHaveTextContent(REFERENCIA);
  });

  it('deja el identificador seleccionable de una pieza (multiplataforma, sin boton de copiar)', () => {
    render(<UnexpectedErrorNotice state={INESPERADO} />);

    const valor = screen.getByText(REFERENCIA);
    expect(valor.className).toContain('select-all');
    // El uuid no desborda en una pantalla estrecha.
    expect(valor.className).toContain('break-all');
  });
});

describe('UnexpectedErrorNotice — un error del catalogo (R18)', () => {
  it('pinta su mensaje, y NINGUN identificador', () => {
    const { container } = render(<UnexpectedErrorNotice state={CATALOGADO} />);

    expect(screen.getByTestId(UNEXPECTED_ERROR_NOTICE_MESSAGE_TESTID)).toHaveTextContent(
      errorMessage(CODIGO_CATALOGADO),
    );
    expect(screen.queryByTestId(UNEXPECTED_ERROR_NOTICE_REFERENCE_TESTID)).toBeNull();
    expect(screen.queryByText(REFERENCIA)).toBeNull();
    expect(container.textContent).not.toContain(UNEXPECTED_ERROR_NOTICE_REFERENCE_LABEL);
    // Ni siquiera un uuid distinto: no hay NINGUN identificador que pintar.
    expect(container.textContent).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
    );
  });

  it('marca el codigo en el nodo raiz, para que la pantalla pueda afirmarlo sin leer copy', () => {
    render(<UnexpectedErrorNotice state={CATALOGADO} />);

    expect(screen.getByTestId(UNEXPECTED_ERROR_NOTICE_TESTID)).toHaveAttribute(
      'data-code',
      CODIGO_CATALOGADO,
    );
  });
});
