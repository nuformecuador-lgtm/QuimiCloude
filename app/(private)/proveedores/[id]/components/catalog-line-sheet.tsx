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
  /** Apertura controlada desde fuera. Ausente = el panel trae su propio disparador. */
  readonly open?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
};

/**
 * Panel lateral de alta y edicion de una linea de catalogo. Sin `open`, trae su propio disparador
 * y su propio estado: es el alta. Con `open`/`onOpenChange` es controlado y no monta disparador:
 * es el enganche de la edicion desde el menu de la fila.
 */
export function CatalogLineSheet({
  supplierId,
  line,
  units,
  open,
  onOpenChange,
}: CatalogLineSheetProps) {
  const isEdit = line !== undefined;
  const { isOpen, isControlled, changeOpen, handleSaved } = useEntitySheet({
    open,
    onOpenChange,
    successMessage: isEdit ? UPDATE_SUCCESS : CREATE_SUCCESS,
  });

  return (
    <Sheet open={isOpen} onOpenChange={(next) => changeOpen(next)}>
      {isControlled ? null : (
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
      )}
      <CatalogLineForm
        supplierId={supplierId}
        line={line}
        units={units}
        onSaved={handleSaved}
      />
    </Sheet>
  );
}
