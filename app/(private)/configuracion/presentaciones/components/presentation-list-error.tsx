'use client';

import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';

/**
 * Estado de error de la lista de presentaciones (R17, R7, `design.md > 5.3`).
 *
 * **No se pinta una tabla vacia cuando la consulta falla**: confundir «fallo» con «no hay nada» es
 * exactamente lo que R17 existe para impedir. Aqui se dice que fallo, con que codigo, y se ofrece
 * reintentar. Se pinta FUERA de `<DataTable>` porque lleva accion propia.
 *
 * **El mensaje es el que devolvio la operacion y no se reescribe**: quien sabe que paso es el
 * modulo. El `code` se pinta aparte porque es el dato **estable** —el que sirve para soporte y
 * para los tests—, mientras que el texto puede cambiar sin avisar (R35).
 *
 * Tambien es donde aterriza R7: si la operacion responde `unauthorized`, la pantalla **no** decide
 * nada por su cuenta —no oculta columnas, no lee la sesion, no repite ninguna comprobacion de
 * permiso—, presenta el error y **no muestra ni un dato** del catalogo.
 *
 * El reintento es `router.refresh()` y no un enlace a la misma URL: navegar al sitio donde ya
 * estas no vuelve a pedir los datos, y «reintentar» tiene que reintentar de verdad.
 */

export const PRESENTATION_LIST_ERROR_TESTID = 'presentation-list-error';
export const PRESENTATION_LIST_ERROR_MESSAGE_TESTID = 'presentation-list-error-message';
export const PRESENTATION_LIST_ERROR_CODE_TESTID = 'presentation-list-error-code';
export const PRESENTATION_LIST_RETRY_TESTID = 'presentation-list-retry';

export type PresentationListErrorProps = {
  /** Mensaje que devolvio la operacion. No se reescribe: el que sabe que paso es el backend. */
  readonly message: string;
  /** Codigo ESTABLE del error (`unauthorized`, `invalid_input`...), util para soporte y tests. */
  readonly code: string;
};

export function PresentationListError({ message, code }: PresentationListErrorProps) {
  const router = useRouter();

  return (
    <div
      role="alert"
      data-testid={PRESENTATION_LIST_ERROR_TESTID}
      className="flex flex-col items-start gap-3 rounded-lg border border-destructive/40 p-4"
    >
      <p className="text-sm font-medium">No se pudo cargar la lista de presentaciones.</p>
      <p
        className="text-sm text-muted-foreground"
        data-testid={PRESENTATION_LIST_ERROR_MESSAGE_TESTID}
      >
        {message}
      </p>
      <p className="text-xs text-muted-foreground" data-testid={PRESENTATION_LIST_ERROR_CODE_TESTID}>
        {code}
      </p>
      <Button
        variant="outline"
        className="min-h-11 min-w-11"
        data-testid={PRESENTATION_LIST_RETRY_TESTID}
        onClick={() => router.refresh()}
      >
        Reintentar
      </Button>
    </div>
  );
}
