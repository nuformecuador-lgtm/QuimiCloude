'use client';

import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';

type OrderListErrorProps = {
  /** Mensaje que devolvio la operacion. No se reescribe: el que sabe que paso es el backend. */
  readonly message: string;
  /** Codigo ESTABLE del error (`unauthorized`, `invalid_input`...), util para soporte y tests. */
  readonly code: string;
};

/**
 * Estado de error de la lista de pedidos (R21, R6, `design.md > 5`).
 *
 * **No se pinta una tabla vacia cuando la consulta falla**: confundir «fallo» con «no hay nada» es
 * exactamente lo que R21 existe para impedir. Aqui se dice que fallo, con que codigo, y se ofrece
 * reintentar. Se pinta FUERA de `<DataTable>` (alternativa Q, descartada) porque lleva accion
 * propia.
 *
 * Tambien es donde aterriza R6: si la operacion responde `unauthorized`, la pantalla **no** decide
 * nada por su cuenta —no oculta columnas, no lee la sesion, no repite `requireAdmin`—, presenta el
 * error y **no muestra ni un dato** de pedidos. Consecuencia deliberada de `design.md > 3`: si
 * alguien borrase la regla ruta->rol, la pantalla se veria pero seguiria sin ensenar nada.
 *
 * El reintento es `router.refresh()` y no un enlace a la misma URL: navegar al sitio donde ya
 * estas no vuelve a pedir los datos, y «reintentar» tiene que reintentar de verdad.
 */
export function OrderListError({ message, code }: OrderListErrorProps) {
  const router = useRouter();

  return (
    <div
      role="alert"
      data-testid="order-list-error"
      className="flex flex-col items-start gap-3 rounded-lg border border-destructive/40 p-4"
    >
      <p className="text-sm font-medium">No se pudo cargar la lista de pedidos.</p>
      <p className="text-sm text-muted-foreground" data-testid="order-list-error-message">
        {message}
      </p>
      <p className="text-xs text-muted-foreground" data-testid="order-list-error-code">
        {code}
      </p>
      <Button
        variant="outline"
        className="min-h-11 min-w-11"
        data-testid="order-list-retry"
        onClick={() => router.refresh()}
      >
        Reintentar
      </Button>
    </div>
  );
}
