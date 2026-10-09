'use client';

import { PencilIcon, PlusIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Sheet, SheetTrigger } from '@/components/ui/sheet';
import { useEntitySheet } from '@/hooks/use-entity-sheet';
import type { CatalogLineView } from '@/lib/modules/proveedores';
import type { UnitRef } from '@/lib/modules/unidades';
import { touchTarget } from '@/lib/shared/ui/touch-target';

import { CatalogLineForm } from './catalog-line-form';

const CREATE_LABEL = 'Nueva línea';
const CREATE_SUCCESS = 'Línea de catálogo creada.';
const UPDATE_SUCCESS = 'Línea de catálogo actualizada.';

type CatalogLineSheetProps = {
  /** Proveedor dueno del catalogo. Sale de la URL de la pagina de detalle, no de un formulario. */
  readonly supplierId: string;
  /** Linea que se edita. Ausente en el alta. */
  readonly line?: CatalogLineView;
  readonly units: readonly UnitRef[];
};

/**
 * Panel lateral de alta y edicion de una linea de catalogo, con su propio disparador y su propio
 * estado: asi la tabla del catalogo no coordina que fila esta abierta y lo recibe por el slot
 * `rowActions`.
 */
export function CatalogLineSheet({ supplierId, line, units }: CatalogLineSheetProps) {
  const isEdit = line !== undefined;
  const { isOpen, changeOpen, handleSaved } = useEntitySheet({
    successMessage: isEdit ? UPDATE_SUCCESS : CREATE_SUCCESS,
  });

  return (
    <Sheet open={isOpen} onOpenChange={(next) => changeOpen(next)}>
      <SheetTrigger
        render={
          <Button
            variant={isEdit ? 'ghost' : 'default'}
            className={touchTarget}
            aria-label={isEdit ? `Editar ${line.name}` : undefined}
            data-testid={isEdit ? 'catalog-line-edit-open' : 'catalog-line-create-open'}
          />
        }
      >
        {isEdit ? <PencilIcon /> : <PlusIcon />}
        {isEdit ? null : CREATE_LABEL}
      </SheetTrigger>
      <CatalogLineForm
        supplierId={supplierId}
        line={line}
        units={units}
        onSaved={handleSaved}
      />
    </Sheet>
  );
}
