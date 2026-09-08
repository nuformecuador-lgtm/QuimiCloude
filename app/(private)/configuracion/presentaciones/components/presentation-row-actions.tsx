'use client';

import { PencilIcon, TrashIcon } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import type { PresentationView } from '@/lib/modules/inventario';

import { DeletePresentationDialog } from './delete-presentation-dialog';
import { PresentationSheet } from './presentation-sheet';

/**
 * Las DOS acciones de fila de una presentacion: editar y borrar (R19, R21, R27, R34,
 * `design.md > 6` y `> 7`).
 *
 * **Siempre visibles y siempre en el DOM.** Nada se descubre con `:hover` -que en tactil no
 * existe- y nada vive dentro de un desplegable que los esconda (R19, R34): los dos controles
 * estan pintados desde el primer render y cada uno mide al menos 44x44 px (`TOUCH_TARGET`).
 *
 * **Cada boton NOMBRA la presentacion sobre la que actua** en su `aria-label` (R19). Con varias
 * filas en pantalla, «Editar» a secas no dice cual: quien navega con lector de pantalla oiria
 * dos botones identicos por fila y ninguna forma de distinguirlos.
 *
 * **La presentacion llega por props** (R32). Este componente no importa `lib/composition`, ni el
 * cliente de base de datos, ni pide nada por su cuenta: lo que muestra ya lo trajo la consulta de
 * la lista, hecha una sola vez por el Server Component de la seccion.
 *
 * **Los dos destinos se montan CONTROLADOS desde aqui**: el panel lateral en modo edicion
 * -precargado con el nombre actual (R23)- y el dialogo de confirmacion del borrado (R27). El
 * dialogo solo se monta mientras esta abierto, para que cada apertura arranque con el estado de
 * accion limpio: un `presentation_in_use` de un intento anterior no reaparece, y el arbol de una
 * fila cerrada no contiene ningun formulario de borrado.
 */

/** Objetivo tactil minimo (44x44 px) de R34. Los primitivos miden 32 px de alto por defecto. */
const TOUCH_TARGET = 'min-h-11 min-w-11';

export const PRESENTATION_ROW_ACTIONS_TESTID = 'presentation-row-actions';
export const PRESENTATION_ACTION_EDIT_TESTID = 'presentation-action-edit';
export const PRESENTATION_ACTION_DELETE_TESTID = 'presentation-action-delete';

/**
 * Nombre accesible de cada accion, **compuesto con el nombre de la presentacion** (R19). Se
 * exportan como funciones para que los tests localicen los botones por su rol y su nombre sin
 * copiar el copy: quien decide el texto es este archivo, y sigue habiendo un solo sitio donde
 * cambiarlo el dia que la interfaz se traduzca.
 */
export function editPresentationLabel(name: string): string {
  return `Editar la presentación ${name}`;
}

export function deletePresentationLabel(name: string): string {
  return `Eliminar la presentación ${name}`;
}

export type PresentationRowActionsProps = {
  readonly presentation: PresentationView;
};

export function PresentationRowActions({ presentation }: PresentationRowActionsProps) {
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <div
      className="flex items-center justify-end gap-1"
      data-testid={PRESENTATION_ROW_ACTIONS_TESTID}
      data-presentation-id={presentation.id}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={TOUCH_TARGET}
        aria-label={editPresentationLabel(presentation.name)}
        data-testid={PRESENTATION_ACTION_EDIT_TESTID}
        onClick={() => setEditOpen(true)}
      >
        <PencilIcon aria-hidden="true" />
      </Button>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={TOUCH_TARGET}
        aria-label={deletePresentationLabel(presentation.name)}
        data-testid={PRESENTATION_ACTION_DELETE_TESTID}
        onClick={() => setDeleteOpen(true)}
      >
        <TrashIcon aria-hidden="true" />
      </Button>

      <PresentationSheet
        presentation={{ id: presentation.id, name: presentation.name }}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
      {deleteOpen ? (
        <DeletePresentationDialog presentation={presentation} open onOpenChange={setDeleteOpen} />
      ) : null}
    </div>
  );
}
