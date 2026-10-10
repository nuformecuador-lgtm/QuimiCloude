'use client';

import { PencilIcon, Trash2Icon } from 'lucide-react';
import { useState } from 'react';

import { RowActionsMenu, type RowActionMenuItem } from '@/components/shared/row-actions-menu';
import type { CatalogLineListItem } from '@/lib/modules/proveedores';
import type { UnitRef } from '@/lib/modules/unidades';

import { CatalogLineSheet } from './catalog-line-sheet';
import { DeleteCatalogLineDialog } from './delete-catalog-line-dialog';

/**
 * Las dos acciones de fila de una linea de catalogo, editar y dar de baja, en el menu de tres
 * puntos de la fila.
 *
 * El disparador nombra la linea en su nombre accesible; los items dicen solo el verbo.
 *
 * El panel de edicion y el dialogo de baja se abren por estado desde el menu. El dialogo, una vez
 * abierto por primera vez, queda montado y se cierra por estado: asi su salida anima. Antes de la
 * primera apertura no se monta, para no cargar cada fila.
 *
 * Todo llega por props: este componente no importa `lib/composition` ni pide nada por su cuenta.
 */

export const CATALOG_LINE_ROW_ACTIONS_TESTID = 'catalog-line-row-actions';
export const CATALOG_LINE_ACTION_EDIT_TESTID = 'catalog-line-edit-open';
export const CATALOG_LINE_ACTION_DELETE_TESTID = 'catalog-line-delete-open';

const EDIT_ACTION_LABEL = 'Editar';
const DELETE_ACTION_LABEL = 'Dar de baja';

/** Nombre accesible del disparador del menu de la fila. */
export function catalogLineRowActionsLabel(name: string): string {
  return `Acciones de ${name}`;
}

export type CatalogLineRowActionsProps = {
  /** Proveedor dueno del catalogo, el de la pagina de detalle. */
  readonly supplierId: string;
  readonly line: CatalogLineListItem;
  readonly units: readonly UnitRef[];
};

export function CatalogLineRowActions({ supplierId, line, units }: CatalogLineRowActionsProps) {
  const [editOpen, setEditOpen] = useState(false);
  // `null`: el dialogo aun no se abrio nunca y no se monta.
  const [deleteOpen, setDeleteOpen] = useState<boolean | null>(null);

  const items: RowActionMenuItem[] = [
    {
      key: 'edit',
      label: EDIT_ACTION_LABEL,
      icon: PencilIcon,
      onSelect: () => setEditOpen(true),
      testId: CATALOG_LINE_ACTION_EDIT_TESTID,
    },
    {
      key: 'delete',
      label: DELETE_ACTION_LABEL,
      icon: Trash2Icon,
      onSelect: () => setDeleteOpen(true),
      destructive: true,
      testId: CATALOG_LINE_ACTION_DELETE_TESTID,
    },
  ];

  return (
    <>
      <RowActionsMenu
        items={items}
        triggerLabel={catalogLineRowActionsLabel(line.name)}
        triggerTestId={CATALOG_LINE_ROW_ACTIONS_TESTID}
        triggerDataAttributes={{ 'data-catalog-line-id': line.id }}
      />

      <CatalogLineSheet
        supplierId={supplierId}
        units={units}
        line={line}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
      {deleteOpen === null ? null : (
        <DeleteCatalogLineDialog line={line} open={deleteOpen} onOpenChange={setDeleteOpen} />
      )}
    </>
  );
}
