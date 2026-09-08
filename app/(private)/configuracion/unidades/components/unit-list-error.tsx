'use client';

import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';

/**
 * Estado de error de la lista de unidades (R26, R14; `design.md > 5.4`).
 *
 * **No se pinta una tabla vacia cuando la consulta falla**: confundir «fallo» con «no hay nada» es
 * exactamente lo que R26 existe para impedir. Aqui se dice que fallo, con que codigo, y se ofrece
 * reintentar. Se pinta FUERA de `<DataTable>` porque lleva accion propia.
 *
 * **El mensaje es el que devolvio la operacion y no se reescribe**: quien sabe que paso es el
 * modulo. El `code` se pinta aparte porque es el dato **estable** —el que sirve para soporte y
 * para los tests—, mientras que el texto puede cambiar sin avisar (R49).
 *
 * Tambien es donde aterriza R14: si la operacion responde `unauthorized`, la pantalla **no** decide
 * nada por su cuenta —no oculta columnas, no lee la sesion, no repite ninguna comprobacion de
 * permiso—, presenta el error y **no muestra ni un dato** del catalogo.
 *
 * El reintento es `router.refresh()` y no un enlace a la misma URL: navegar al sitio donde ya estas
 * no vuelve a pedir los datos, y «reintentar» tiene que reintentar de verdad.
 */

export const UNIT_LIST_ERROR_TESTID = 'unit-list-error';
export const UNIT_LIST_ERROR_MESSAGE_TESTID = 'unit-list-error-message';
export const UNIT_LIST_ERROR_CODE_TESTID = 'unit-list-error-code';
export const UNIT_LIST_RETRY_TESTID = 'unit-list-retry';

export type UnitListErrorProps = {
  /** Mensaje que devolvio la operacion. No se reescribe: el que sabe que paso es el backend. */
  readonly message: string;
  /** Codigo ESTABLE del error (`unauthorized`, `invalid_input`...), util para soporte y tests. */
  readonly code: string;
};

export function UnitListError({ message, code }: UnitListErrorProps) {
  const router = useRouter();

  return (
    <div
      role="alert"
      data-testid={UNIT_LIST_ERROR_TESTID}
      className="flex flex-col items-start gap-3 rounded-lg border border-destructive/40 p-4"
    >
      <p className="text-sm font-medium">No se pudo cargar la lista de unidades.</p>
      <p className="text-sm text-muted-foreground" data-testid={UNIT_LIST_ERROR_MESSAGE_TESTID}>
        {message}
      </p>
      <p className="text-xs text-muted-foreground" data-testid={UNIT_LIST_ERROR_CODE_TESTID}>
        {code}
      </p>
      <Button
        variant="outline"
        className="min-h-11 min-w-11"
        data-testid={UNIT_LIST_RETRY_TESTID}
        onClick={() => router.refresh()}
      >
        Reintentar
      </Button>
    </div>
  );
}
