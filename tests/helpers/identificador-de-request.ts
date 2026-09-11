/**
 * QC-71 T9 — el utillaje de R17/R18, en un solo sitio.
 *
 * Las siete pantallas se prueban con la MISMA pareja de casos, asi que el error de ejemplo y la
 * asercion negativa viven aqui y no copiados siete veces: si manana cambia la forma del estado de
 * error, cambia en un sitio. El uuid es fijo y a proposito -un valor inconfundible se ve si
 * aparece a medias o dentro de un atributo-.
 */

import { screen } from '@testing-library/react';
import { expect } from 'vitest';

import {
  UNEXPECTED_ERROR_NOTICE_REFERENCE_LABEL,
  UNEXPECTED_ERROR_NOTICE_REFERENCE_TESTID,
  UNEXPECTED_ERROR_NOTICE_TESTID,
} from '@/components/shared/unexpected-error-notice';
import { UNEXPECTED_ERROR_CODE, errorMessage, type ErrorState } from '@/lib/modules/errores';

/** El identificador del caso de prueba. Inconfundible: no se parece a ningun otro dato de fixture. */
export const REFERENCIA_DEL_CASO = '7b1c9f2e-4d3a-4f5b-9c0d-1e2f3a4b5c6d';

/** Cualquier uuid, para la asercion negativa: no basta con que no salga EL del caso. */
const CUALQUIER_UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/**
 * El estado que devuelve una operacion cuando revienta algo fuera del catalogo (QC-71 R13). El
 * mensaje sale de `errorMessage`, o sea del catalogo: aqui no se teclea copy.
 */
export function errorInesperado(): ErrorState {
  return {
    status: 'error',
    code: UNEXPECTED_ERROR_CODE,
    message: errorMessage(UNEXPECTED_ERROR_CODE),
    reference: REFERENCIA_DEL_CASO,
  };
}

/**
 * R18 — que la pantalla NO ensene identificador ninguno.
 *
 * Se comprueba por las tres vias por las que podria colarse: el nodo del aviso, la etiqueta y el
 * uuid como texto. La ultima es sobre CUALQUIER uuid, no solo el del caso, para que un
 * identificador de respaldo generado por otro camino tampoco pase.
 */
export function esperarSinIdentificador(): void {
  expect(screen.queryByTestId(UNEXPECTED_ERROR_NOTICE_TESTID)).toBeNull();
  expect(screen.queryByTestId(UNEXPECTED_ERROR_NOTICE_REFERENCE_TESTID)).toBeNull();
  expect(screen.queryByText(REFERENCIA_DEL_CASO)).toBeNull();
  const texto = document.body.textContent ?? '';
  expect(texto).not.toContain(UNEXPECTED_ERROR_NOTICE_REFERENCE_LABEL);
  expect(texto).not.toMatch(CUALQUIER_UUID);
}
