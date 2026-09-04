import Link from 'next/link';

import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { SUPPLIERS_ROUTE } from '@/lib/shared/routes';

const NOT_FOUND_MESSAGE = 'Este proveedor no existe o fue dado de baja.';

/**
 * Estado «proveedor inexistente» de la pagina de detalle (R20, `design.md > 6.1`).
 *
 * Se pinta cuando `getSupplierAction` responde `not_found`, **en lugar del catalogo**: un
 * proveedor que no existe no tiene lineas que listar, y pedirlas seria una consulta que ya se
 * sabe fallida. La pagina no llama a `listCatalogLinesAction` en este camino.
 *
 * **La vuelta a la lista es un `<Link>` real pintado con `buttonVariants`**, no el primitivo
 * `Button` con `render`: lo que hace es navegar, y pasar un enlace por el boton de Base UI acaba
 * poniendole `role="button"` al `<a>`, que es mentir sobre lo que el control hace. El destino sale
 * de `SUPPLIERS_ROUTE` (R2): ningun archivo de la ruta incrusta la URL como literal.
 */
export function SupplierNotFound() {
  return (
    <div
      role="alert"
      data-testid="supplier-not-found"
      className="flex flex-col items-start gap-3 rounded-lg border border-destructive/40 p-4"
    >
      <p className="text-sm font-medium" data-testid="supplier-not-found-message">
        {NOT_FOUND_MESSAGE}
      </p>
      <Link
        href={SUPPLIERS_ROUTE}
        data-slot="button"
        data-testid="supplier-not-found-link"
        className={cn(buttonVariants({ variant: 'outline' }), 'min-h-11 min-w-11')}
      >
        Volver a la lista de proveedores
      </Link>
    </div>
  );
}
