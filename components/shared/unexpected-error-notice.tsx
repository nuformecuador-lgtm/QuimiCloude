import { UNEXPECTED_ERROR_CODE, type ErrorState } from '@/lib/modules/errores';

/**
 * QC-71 T8 (R17, R18) — la region de error del ERROR INESPERADO, en un solo sitio.
 *
 * **Por que compartido y no uno por ruta.** Las siete pantallas que ya pintan la region de error
 * generica lo necesitan igual (`design.md > 6`), asi que el umbral de dos features de
 * `docs/architecture.md > Regla: sin sobre-ingenieria` se supera con holgura. El copy de la
 * etiqueta vive aqui y solo aqui: si manana cambia, cambia en las siete a la vez.
 *
 * **Que pinta.** El mensaje NEUTRO del catalogo y, SOLO en la rama del codigo generico, debajo el
 * identificador de la peticion con una etiqueta que dice para que sirve. Un error del catalogo
 * entra por la misma puerta y sale SIN identificador (R18): no hay ninguno que ensenar y ensenar
 * uno inventado seria peor que no ensenar nada.
 *
 * **El estrechamiento es por `code`, y es la mitad de la prueba.** `ErrorState` es una union
 * cerrada (`lib/modules/errores/domain/error-state.ts`): `reference` solo EXISTE tras comprobar
 * `code === UNEXPECTED_ERROR_CODE`. Por eso aqui no hay ningun `as`, ningun `any` y ningun
 * `'reference' in state`: si alguien invierte la condicion, no compila. La otra mitad la prueba
 * `tests/unit/shared-ui/unexpected-error-notice.test.tsx`.
 *
 * **Multiplataforma** (`docs/architecture.md > Regla: multiplataforma`): texto estatico, sin
 * `:hover` como unica via, sin `100vh` y sin ninguna libreria nueva (R20). El identificador se
 * copia SELECCIONANDOLO -`select-all` lo selecciona entero al primer toque, en Safari/WebKit y
 * en Chrome Android igual que en escritorio-; `design.md > 6` deja el boton de copiar
 * explicitamente fuera. `break-all` para que el uuid no desborde en una pantalla estrecha.
 *
 * **No lleva `role="alert"`**: lo pone la region que lo envuelve en cada pantalla, y anidar dos
 * regiones vivas hace que el lector de pantalla anuncie el mismo error dos veces.
 */

export const UNEXPECTED_ERROR_NOTICE_TESTID = 'unexpected-error-notice';
export const UNEXPECTED_ERROR_NOTICE_MESSAGE_TESTID = 'unexpected-error-notice-message';
export const UNEXPECTED_ERROR_NOTICE_REFERENCE_TESTID = 'unexpected-error-notice-reference';

/** El copy de la etiqueta, en un solo sitio y exportado para que ningun test lo teclee a mano. */
export const UNEXPECTED_ERROR_NOTICE_REFERENCE_LABEL = 'Código para soporte:';

type UnexpectedErrorNoticeProps = {
  /** El estado de error TAL CUAL lo devolvio la operacion. Copiarlo campo a campo pierde `reference`. */
  readonly state: ErrorState;
};

export function UnexpectedErrorNotice({ state }: UnexpectedErrorNoticeProps) {
  return (
    <div
      className="flex flex-col gap-1"
      data-testid={UNEXPECTED_ERROR_NOTICE_TESTID}
      data-code={state.code}
    >
      <p data-testid={UNEXPECTED_ERROR_NOTICE_MESSAGE_TESTID}>{state.message}</p>
      {state.code === UNEXPECTED_ERROR_CODE ? (
        <p className="text-xs" data-testid={UNEXPECTED_ERROR_NOTICE_REFERENCE_TESTID}>
          {UNEXPECTED_ERROR_NOTICE_REFERENCE_LABEL}{' '}
          <span className="font-mono break-all select-all">{state.reference}</span>
        </p>
      ) : null}
    </div>
  );
}
