'use client';

import { PencilIcon, TrashIcon } from 'lucide-react';
import { useState } from 'react';

import { RowActionsMenu, type RowActionMenuItem } from '@/components/shared/row-actions-menu';
import type { PresentationView } from '@/lib/modules/inventario';
import type { UnitRef } from '@/lib/modules/unidades';

import { DeletePresentationDialog } from './delete-presentation-dialog';
import { PresentationSheet } from './presentation-sheet';

/**
 * Las dos acciones de fila de una presentacion, editar y borrar, en el menu de tres puntos de la
 * fila (`RowActionsMenu`).
 *
 * **El disparador nombra la presentacion** («Acciones de …») y cada item dice solo el verbo: con
 * varias filas en pantalla, el contexto de la fila lo da el disparador. El disparador esta siempre
 * en el DOM, sin depender de `:hover`, con su objetivo tactil de 44x44 px.
 *
 * **Las unidades llegan por props.** La fila no consulta el catalogo -seria una consulta por fila-:
 * lo pidio una sola vez la seccion. Y el panel de edicion recibe `unitId` derivado del contrato
 * (`PresentationSheetTarget`), asi que la unidad actual queda precargada.
 *
 * **La presentacion llega por props.** Este componente no importa `lib/composition`, ni el cliente
 * de base de datos, ni pide nada por su cuenta.
 *
 * **Los dos destinos se montan controlados desde aqui**: el panel lateral en modo edicion y el
 * dialogo de confirmacion del borrado. El dialogo se monta en su primera apertura y desde ahi queda
 * montado, para que el cierre anime su salida; su contenido se crea con cada apertura, asi que un
 * rechazo anterior no reaparece. Antes de abrirlo por primera vez la fila no lleva ningun
 * formulario de borrado.
 */

export const PRESENTATION_ROW_ACTIONS_TESTID = 'presentation-row-actions';
export const PRESENTATION_ACTION_EDIT_TESTID = 'presentation-action-edit';
export const PRESENTATION_ACTION_DELETE_TESTID = 'presentation-action-delete';

/**
 * Nombre accesible de cada item del menu: solo el verbo. Se exportan como funciones para que los
 * tests localicen los items por su rol y su nombre sin copiar el copy; sigue habiendo un solo sitio
 * donde cambiarlo el dia que la interfaz se traduzca.
 */
export function editPresentationLabel(): string {
  return 'Editar';
}

export function deletePresentationLabel(): string {
  return 'Eliminar';
}

/** Nombre accesible del disparador: nombra la presentacion para dar el contexto de la fila. */
function presentationRowActionsLabel(name: string): string {
  return `Acciones de ${name}`;
}

export type PresentationRowActionsProps = {
  readonly presentation: PresentationView;
  /** Catalogo entero de unidades. Lo baja la tabla desde la seccion. */
  readonly units: readonly UnitRef[];
};

export function PresentationRowActions({ presentation, units }: PresentationRowActionsProps) {
  const [editOpen, setEditOpen] = useState(false);
  // `null` hasta la primera apertura: el arbol inicial de la fila no lleva el dialogo.
  const [deleteOpen, setDeleteOpen] = useState<boolean | null>(null);

  const items: RowActionMenuItem[] = [
    {
      key: 'edit',
      label: editPresentationLabel(),
      icon: PencilIcon,
      onSelect: () => setEditOpen(true),
      testId: PRESENTATION_ACTION_EDIT_TESTID,
    },
    {
      key: 'delete',
      label: deletePresentationLabel(),
      icon: TrashIcon,
      onSelect: () => setDeleteOpen(true),
      destructive: true,
      testId: PRESENTATION_ACTION_DELETE_TESTID,
    },
  ];

  return (
    <>
      <RowActionsMenu
        items={items}
        triggerLabel={presentationRowActionsLabel(presentation.name)}
        triggerTestId={PRESENTATION_ROW_ACTIONS_TESTID}
        triggerDataAttributes={{ 'data-presentation-id': presentation.id }}
      />

      <PresentationSheet
        presentation={{
          id: presentation.id,
          name: presentation.name,
          unitId: presentation.unitId,
          content: presentation.content,
        }}
        units={units}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
      {deleteOpen === null ? null : (
        <DeletePresentationDialog
          presentation={presentation}
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
        />
      )}
    </>
  );
}
