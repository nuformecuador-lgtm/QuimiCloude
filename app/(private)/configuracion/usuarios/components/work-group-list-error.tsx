'use client';

import { useRouter } from 'next/navigation';

import { UnexpectedErrorNotice } from '@/components/shared/unexpected-error-notice';
import { Button } from '@/components/ui/button';
import { UNEXPECTED_ERROR_CODE, type ErrorState } from '@/lib/modules/errores';

/**
 * Estado de error de la lista de grupos (R11, R19; `design.md > 4.3` y `> 7`).
 *
 * **No se pinta una tabla vacia cuando la consulta falla**: confundir «fallo» con «no hay grupos»
 * es exactamente lo que R19 existe para impedir. Aqui se dice que fallo, con que codigo, y se
 * ofrece reintentar. Se pinta FUERA de `<DataTable>` porque lleva accion propia.
 *
 * **El mensaje es el que devolvio la operacion y no se reescribe**: quien sabe que paso es el
 * modulo. El `code` se pinta aparte porque es el dato **estable** —el que sirve para soporte y
 * para los tests—, mientras que el texto puede cambiar sin avisar (R41).
 *
 * Tambien es donde aterriza R11: si la operacion responde `unauthorized`, la pantalla **no** decide
 * nada por su cuenta —no oculta columnas, no lee la sesion, no repite ninguna comprobacion de
 * permiso—, presenta el error y **no muestra ni un dato** de grupos.
 *
 * El reintento es `router.refresh()` y no un enlace a la misma URL: navegar al sitio donde ya estas
 * no vuelve a pedir los datos, y «reintentar» tiene que reintentar de verdad.
 */

export const WORK_GROUP_LIST_ERROR_TESTID = 'work-group-list-error';
export const WORK_GROUP_LIST_ERROR_MESSAGE_TESTID = 'work-group-list-error-message';
export const WORK_GROUP_LIST_ERROR_CODE_TESTID = 'work-group-list-error-code';
export const WORK_GROUP_LIST_RETRY_TESTID = 'work-group-list-retry';

export type WorkGroupListErrorProps = {
  /**
   * El error de la consulta, ENTERO.
   *
   * **No `message` y `code` sueltos** (QC-71): esa pareja no puede llevar el `reference` del error
   * inesperado, y un `reference?: string` aqui lo dejaria opcional, que es justo el agujero que la
   * union cerrada de `lib/modules/errores` cierra.
   */
  readonly error: ErrorState;
};

export function WorkGroupListError({ error }: WorkGroupListErrorProps) {
  const router = useRouter();

  return (
    <div
      role="alert"
      data-testid={WORK_GROUP_LIST_ERROR_TESTID}
      className="flex flex-col items-start gap-3 rounded-lg border border-destructive/40 p-4"
    >
      <p className="text-sm font-medium">No se pudo cargar la lista de grupos de trabajo.</p>
      {/*
        QC-71: el error INESPERADO lo pinta el componente compartido, que anade el identificador de
        la peticion. El CATALOGADO se pinta con sus dos `data-testid` y sin identificador ninguno.
      */}
      {error.code === UNEXPECTED_ERROR_CODE ? (
        <UnexpectedErrorNotice state={error} />
      ) : (
        <>
          <p
            className="text-sm text-muted-foreground"
            data-testid={WORK_GROUP_LIST_ERROR_MESSAGE_TESTID}
          >
            {error.message}
          </p>
          <p
            className="text-xs text-muted-foreground"
            data-testid={WORK_GROUP_LIST_ERROR_CODE_TESTID}
          >
            {error.code}
          </p>
        </>
      )}
      <Button
        variant="outline"
        className="min-h-11 min-w-11"
        data-testid={WORK_GROUP_LIST_RETRY_TESTID}
        onClick={() => router.refresh()}
      >
        Reintentar
      </Button>
    </div>
  );
}
