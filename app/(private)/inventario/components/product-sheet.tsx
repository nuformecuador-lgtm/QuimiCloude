'use client';

import { PencilIcon, PlusIcon } from 'lucide-react';
import { useCallback } from 'react';

import { Button } from '@/components/ui/button';
import { Sheet, SheetTrigger } from '@/components/ui/sheet';
import { useEntitySheet } from '@/hooks/use-entity-sheet';
import type { ProductFormUnits, ProductView } from '@/lib/modules/inventario';
import type { UnitRef } from '@/lib/modules/unidades';

import { ProductForm } from './product-form';

const CREATE_SUCCESS = 'Producto creado.';
const UPDATE_SUCCESS = 'Producto actualizado.';

/**
 * Texto neutro a proposito: dice «Lote X», nunca «se asigno el lote X», porque el lote puede venir
 * tecleado a mano.
 */
function createSuccessMessage(lot: string): string {
  return `${CREATE_SUCCESS} Lote ${lot}.`;
}

/**
 * Panel lateral de alta y edicion de producto, con su propio disparador y su propio estado: la
 * tabla no coordina que fila esta abierta.
 *
 * El formulario solo se monta con el panel abierto: `productType`, `template` y el estado de
 * `useActionState` viven en `ProductForm`, y si se quedara montado conservaria el ultimo tipo
 * elegido entre aperturas mientras `SharedSelect`, dentro del portal, volveria al tipo por defecto.
 */
export function ProductSheet({
  product,
  units,
  formUnits,
}: {
  readonly product?: ProductView;
  /**
   * Catalogo de unidades: en el alta, para el alta rapida de presentacion del selector; en la
   * edicion, para nombrar la unidad de la alerta de cantidad.
   */
  readonly units?: readonly UnitRef[];
  /** Unidades del selector «Unidad» del alta de insumo. La edicion no las usa. */
  readonly formUnits?: ProductFormUnits;
}) {
  const isEdit = product !== undefined;
  const { isOpen, changeOpen, handleSaved } = useEntitySheet({
    successMessage: isEdit ? UPDATE_SUCCESS : CREATE_SUCCESS,
  });

  const handleProductSaved = useCallback(
    (lot?: string) => {
      handleSaved(isEdit || lot === undefined ? undefined : createSuccessMessage(lot));
    },
    [isEdit, handleSaved],
  );

  return (
    <Sheet open={isOpen} onOpenChange={changeOpen}>
      <SheetTrigger
        render={
          <Button
            variant={isEdit ? 'ghost' : 'default'}
            touch
            aria-label={isEdit ? `Editar ${product.name}` : undefined}
            data-testid={isEdit ? 'product-edit-open' : 'product-create-open'}
          />
        }
      >
        {isEdit ? <PencilIcon /> : <PlusIcon />}
        {isEdit ? null : 'Nuevo producto'}
      </SheetTrigger>
      {isOpen ? (
        <ProductForm
          product={product}
          units={units}
          formUnits={formUnits}
          onSaved={handleProductSaved}
        />
      ) : null}
    </Sheet>
  );
}
