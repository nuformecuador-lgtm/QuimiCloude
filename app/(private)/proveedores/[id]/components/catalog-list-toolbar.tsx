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
  buildCatalogListQuery,
  CATALOG_PAGE_SIZE_OPTIONS,
  type CatalogListParams,
  type CatalogPageSize,
} from './catalog-list-params';

const PAGE_SIZE_LABEL_ID = 'catalog-page-size-label';

/** Clase de area tactil minima de R48 (44x44 px). Los primitivos miden 32 px de alto por defecto. */
const TOUCH_TARGET = 'min-h-11 min-w-11';

type CatalogListToolbarProps = {
  readonly page: number;
  readonly pageSize: CatalogPageSize;
  readonly totalPages: number;
};

/**
 * Barra de herramientas del catalogo: tamano de pagina y paginacion (R8, R9, R11, R48;
 * `design.md > 6.1`).
 *
 * **Ninguno de los dos controles guarda estado local.** Cambiarlos NAVEGA: reescriben la cadena de
 * consulta y el Server Component de la seccion vuelve a pedir los datos. Asi recargar, compartir
 * el enlace o volver con «atras» conserva la pagina -que es lo que R26 exige al cerrar el panel
 * lateral- y el esqueleto de R24 aparece solo, sin una linea de sincronizacion.
 *
 * **La URL no se escribe a mano**: el camino sale de `usePathname()` -que ya es la ruta del
 * detalle- y la consulta de `buildCatalogListQuery`, la misma funcion que el parser de la pagina
 * sabe leer. Ningun archivo de la ruta incrusta el literal de la URL (R2, R3).
 *
 * **R11**: aqui no hay buscador ni control de ordenacion, y no es un olvido: el backend solo acepta
 * `page` y `pageSize`, asi que filtrar en cliente solo miraria dentro de la pagina visible.
 */
export function CatalogListToolbar({ page, pageSize, totalPages }: CatalogListToolbarProps) {
  const router = useRouter();
  const pathname = usePathname();

  const navigate = (params: CatalogListParams) => {
    router.push(`${pathname}?${buildCatalogListQuery(params)}`);
  };

  const isFirstPage = page <= 1;
  const isLastPage = page >= totalPages;

  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3"
      data-testid="catalog-list-toolbar"
    >
      <div className="flex items-center gap-2">
        <span id={PAGE_SIZE_LABEL_ID} className="text-sm text-muted-foreground">
          Líneas por página
        </span>
        <Select
          value={pageSize}
          /*
            Cambiar el tamano vuelve a la PRIMERA pagina a proposito: con 25 por pagina, la
            «pagina 7» que se estaba viendo con 10 puede no existir, y el usuario acabaria en un
            vacio que no ha provocado.
          */
          onValueChange={(value) => {
            // El primitivo admite deseleccionar (`null`); este selector no ofrece esa opcion, asi
            // que un `null` no es un tamano y se ignora en vez de navegar a algo invalido.
            if (value === null) return;
            navigate({ page: 1, pageSize: value });
          }}
        >
          <SelectTrigger
            aria-labelledby={PAGE_SIZE_LABEL_ID}
            className={TOUCH_TARGET}
            data-testid="catalog-page-size"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CATALOG_PAGE_SIZE_OPTIONS.map((option) => (
              <SelectItem key={option} value={option} data-testid={`catalog-page-size-${option}`}>
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
          data-testid="catalog-page-previous"
          onClick={() => navigate({ page: page - 1, pageSize })}
        >
          <ChevronLeftIcon />
        </Button>
        {/*
          `role="status"`: al cambiar de pagina, quien usa lector de pantalla oye donde ha quedado
          sin tener que ir a buscarlo.
        */}
        <span role="status" className="text-sm" data-testid="catalog-page-status">
          Página {page} de {totalPages}
        </span>
        <Button
          variant="outline"
          size="icon"
          className={TOUCH_TARGET}
          disabled={isLastPage}
          aria-label="Página siguiente"
          data-testid="catalog-page-next"
          onClick={() => navigate({ page: page + 1, pageSize })}
        >
          <ChevronRightIcon />
        </Button>
      </div>
    </div>
  );
}
