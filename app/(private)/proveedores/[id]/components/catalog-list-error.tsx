'use client';

import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';

type CatalogListErrorProps = {
  /** Mensaje que devolvio la operacion. No se reescribe: el que sabe que paso es el backend. */
  readonly message: string;
  /** Codigo ESTABLE del error (`unauthorized`, `invalid_input`...), util para soporte y para los tests. */
  readonly code: string;
};

/**
 * Estado de error de la pagina de detalle y de su catalogo (R7, R25, `design.md > 6.1`).
 *
 * **Es el estado de error de ESTA ruta**: no se importa el de la lista de proveedores. Importar un
 * componente interno de la otra ruta ataria las dos por sus tripas, que es justo lo que el barrel
 * por ruta existe para impedir (`design.md > 6.1`, mismo motivo que el parser propio).
 *
 * **No se pinta una tabla vacia cuando la consulta falla** (R25): confundir «fallo» con «no hay
 * nada» es exactamente lo que R25 existe para impedir. Aqui se dice que fallo, con que codigo, y
 * se ofrece reintentar.
 *
 * Tambien es donde aterriza R7: si la operacion responde `unauthorized`, la pantalla **no** decide
 * nada por su cuenta -no oculta columnas, no lee la sesion, no repite `requireAdmin`-, presenta el
 * error y **no muestra ni un dato** del proveedor ni de su catalogo.
 *
 * El reintento es `router.refresh()` y no un enlace a la misma URL: navegar al sitio donde ya
 * estas no vuelve a pedir los datos, y «reintentar» tiene que reintentar de verdad.
 */
export function CatalogListError({ message, code }: CatalogListErrorProps) {
  const router = useRouter();

  return (
    <div
      role="alert"
      data-testid="catalog-list-error"
      className="flex flex-col items-start gap-3 rounded-lg border border-destructive/40 p-4"
    >
      <p className="text-sm font-medium">No se pudo cargar la información del proveedor.</p>
      <p className="text-sm text-muted-foreground" data-testid="catalog-list-error-message">
        {message}
      </p>
      <p className="text-xs text-muted-foreground" data-testid="catalog-list-error-code">
        {code}
      </p>
      <Button
        variant="outline"
        className="min-h-11 min-w-11"
        data-testid="catalog-list-retry"
        onClick={() => router.refresh()}
      >
        Reintentar
      </Button>
    </div>
  );
}
