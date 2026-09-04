'use client';

import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import {
  buildSupplierListQuery,
  PAGE_SIZE_OPTIONS,
  type SupplierListParams,
  type SupplierPageSize,
} from './supplier-list-params';

const PAGE_SIZE_LABEL_ID = 'supplier-page-size-label';

/** Clase de area tactil minima de R48 (44x44 px). Los primitivos miden 32 px de alto por defecto. */
const TOUCH_TARGET = 'min-h-11 min-w-11';

type SupplierListToolbarProps = {
  readonly page: number;
  readonly pageSize: SupplierPageSize;
  readonly totalPages: number;
};

/**
 * Barra de herramientas de la lista: tamano de pagina y paginacion (R8, R9, R48,
 * `design.md > 5.1`).
 *
 * **Ninguno de los dos controles guarda estado local.** Cambiarlos NAVEGA: reescriben la cadena
 * de consulta y el Server Component de la lista vuelve a pedir los datos. Asi recargar,
 * compartir el enlace o volver con "atras" conserva la pagina —que es justo lo que R26 exige al
 * cerrar el panel lateral— y el esqueleto de R17 aparece solo, sin una linea de sincronizacion.
 *
 * **La URL no se escribe a mano**: el camino sale de `usePathname()` y la consulta de
 * `buildSupplierListQuery`, la misma funcion que el parser de la pagina sabe leer (R2: ningun
 * archivo de la feature incrusta el literal de la ruta).
 *
 * `useSearchParams()` **no hace falta y por eso no se usa**: los dos unicos parametros de la
 * pantalla llegan ya parseados por props desde el servidor, y el hook obligaria a envolver la
 * barra en un `<Suspense>` propio solo para volver a leer lo que ya se tiene.
 *
 * **Ni busqueda ni control de orden** (R11): el unico control de seleccion es el tamano de
 * pagina, y esta barra sigue navegando solo con `page` y `pageSize`.
 *
 * **Desde QC-57 el motivo ya NO es que el dominio no sepa buscar ni ordenar** -si sabe: el
 * contrato de lista acepta `sort`, `filters` y `search`, y `SUPPLIER_QUERYABLE` declara ordenable
 * `name`, `createdAt` y `updatedAt`, filtrable `createdAt` y la busqueda activa-. El motivo es que
 * ESTA PANTALLA todavia no emite ese contrato: QC-44 dejo `buscar y ordenar` fuera por escrito y
 * QC-57 no toca ninguna pantalla
 * (`specs/QC-57-orden-y-filtro-en-listados/tasks.md > Lo que esta ficha NO hace`). Mientras siga
 * asi, anadir aqui un buscador de cliente seguiria siendo un error: solo miraria dentro de la
 * pagina visible y mentiria sobre el total.
 */
export function SupplierListToolbar({ page, pageSize, totalPages }: SupplierListToolbarProps) {
  const router = useRouter();
  const pathname = usePathname();

  const navigate = (params: SupplierListParams) => {
    router.push(`${pathname}?${buildSupplierListQuery(params)}`);
  };

  const isFirstPage = page <= 1;
  const isLastPage = page >= totalPages;

  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3"
      data-testid="supplier-list-toolbar"
    >
      <div className="flex items-center gap-2">
        <span id={PAGE_SIZE_LABEL_ID} className="text-sm text-muted-foreground">
          Proveedores por página
        </span>
        <Select
          value={pageSize}
          /*
            Cambiar el tamano vuelve a la PRIMERA pagina a proposito: con 25 por pagina, la
            "pagina 7" que se estaba viendo con 10 puede no existir, y el usuario acabaria en un
            vacio que no ha provocado.
          */
          onValueChange={(value) => {
            // El primitivo admite deseleccionar (`null`); este selector no ofrece esa opcion,
            // asi que un `null` no es un tamano y se ignora en vez de navegar a algo invalido.
            if (value === null) return;
            navigate({ page: 1, pageSize: value });
          }}
        >
          <SelectTrigger
            aria-labelledby={PAGE_SIZE_LABEL_ID}
            className={TOUCH_TARGET}
            data-testid="supplier-page-size"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZE_OPTIONS.map((option) => (
              <SelectItem key={option} value={option} data-testid={`supplier-page-size-${option}`}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          className={TOUCH_TARGET}
          disabled={isFirstPage}
          aria-label="Página anterior"
          data-testid="supplier-page-previous"
          onClick={() => navigate({ page: page - 1, pageSize })}
        >
          <ChevronLeftIcon />
        </Button>
        {/*
          `role="status"`: al cambiar de pagina, quien usa lector de pantalla oye donde ha
          quedado sin tener que ir a buscarlo.
        */}
        <span role="status" className="text-sm" data-testid="supplier-page-status">
          Página {page} de {totalPages}
        </span>
        <Button
          variant="outline"
          size="icon"
          className={TOUCH_TARGET}
          disabled={isLastPage}
          aria-label="Página siguiente"
          data-testid="supplier-page-next"
          onClick={() => navigate({ page: page + 1, pageSize })}
        >
          <ChevronRightIcon />
        </Button>
      </div>
    </div>
  );
}
