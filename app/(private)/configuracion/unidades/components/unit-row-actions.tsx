'use client';

import { PencilIcon, TrashIcon } from 'lucide-react';
import { useState } from 'react';

import { RowActionsMenu, type RowActionMenuItem } from '@/components/shared/row-actions-menu';
import type { UnitView } from '@/lib/modules/unidades';

import { DeleteUnitDialog } from './delete-unit-dialog';
import { UnitSheet } from './unit-sheet';

/**
 * Las DOS acciones de fila de una unidad: editar y borrar, en el menu de los tres puntos de la
 * fila (`RowActionsMenu`).
 *
 * **Con una unidad DE SISTEMA devuelve `null`, o sea la celda queda VACIA** (R29): sin disparador,
 * sin items deshabilitados, sin etiqueta, sin insignia junto al nombre y sin ninguna explicacion.
 * Que una unidad sea de sistema es manejo interno (decision cerrada del 2026-09-08, alternativa E
 * descartada), y la ausencia de acciones es la unica senal.
 *
 * **Ocultarlas es comodidad, NO el control** (R30): quien rechaza editar o borrar una unidad de
 * sistema es el caso de uso de QC-38, con su test. Esta pantalla **no repite** la comprobacion
 * para decidir nada mas que que pinta, y si una escritura se rechazara por ese motivo el error
 * se presenta como cualquier otro, por su `code`.
 *
 * **El disparador NOMBRA la unidad** («Acciones de Litro»): con diez filas en pantalla, el menu
 * necesita el contexto de la fila. Los items dicen solo el verbo.
 *
 * **Todo llega por props** (R46): la unidad y las unidades base del selector las trajo la seccion
 * de la lista con sus dos lecturas. Aqui no se importa `lib/composition`, ni el cliente de base de
 * datos, ni se pide nada por cuenta propia.
 */

export const UNIT_ROW_ACTIONS_TESTID = 'unit-row-actions';
export const UNIT_ACTION_EDIT_TESTID = 'unit-action-edit';
export const UNIT_ACTION_DELETE_TESTID = 'unit-action-delete';

/** Nombre accesible del disparador del menu, **compuesto con el nombre de la unidad**. */
function unitRowActionsLabel(name: string): string {
  return `Acciones de ${name}`;
}

/** Texto del item de edicion: solo el verbo; el nombre de la unidad lo lleva el disparador. */
export function editUnitLabel(): string {
  return 'Editar';
}

/** Texto del item de borrado: solo el verbo; el nombre de la unidad lo lleva el disparador. */
export function deleteUnitLabel(): string {
  return 'Eliminar';
}

export type UnitRowActionsProps = {
  /** La unidad de la fila. Llega por props (R46). */
  readonly unit: UnitView;
  /**
   * Unidades BASE del ambito visible, para el selector de «deriva de» del panel de edicion (R36).
   * Salen de la segunda lectura de la seccion (`design.md > 5.3`); si esa lectura fallo, llegan
   * vacias y el selector se queda sin opciones, que es el degradado declarado.
   */
  readonly baseUnits: readonly UnitView[];
};

export function UnitRowActions({ unit, baseUnits }: UnitRowActionsProps) {
  const [editOpen, setEditOpen] = useState(false);
  // `null` hasta la primera apertura: el arbol de una fila que nunca abrio el borrado no cambia.
  const [deleteOpen, setDeleteOpen] = useState<boolean | null>(null);
  // Cada apertura remonta el dialogo con una `key` nueva, asi que arranca sin el error del intento
  // anterior; al cerrarse sigue montado y su salida anima.
  const [deleteSession, setDeleteSession] = useState(0);

  // R29: la celda de una unidad de sistema no emite NADA. Los hooks de estado van arriba porque
  // no pueden ir tras un `return` condicional; esta salida va inmediatamente despues.
  if (unit.isSystem) return null;

  const items: RowActionMenuItem[] = [
    {
      key: 'edit',
      label: editUnitLabel(),
      icon: PencilIcon,
      onSelect: () => setEditOpen(true),
      testId: UNIT_ACTION_EDIT_TESTID,
    },
    {
      key: 'delete',
      label: deleteUnitLabel(),
      icon: TrashIcon,
      onSelect: () => {
        setDeleteSession((session) => session + 1);
        setDeleteOpen(true);
      },
      destructive: true,
      testId: UNIT_ACTION_DELETE_TESTID,
    },
  ];

  return (
    <>
      <RowActionsMenu
        items={items}
        triggerLabel={unitRowActionsLabel(unit.name)}
        triggerTestId={UNIT_ROW_ACTIONS_TESTID}
        triggerDataAttributes={{ 'data-unit-id': unit.id }}
      />

      <UnitSheet unit={unit} baseUnits={baseUnits} open={editOpen} onOpenChange={setEditOpen} />
      {deleteOpen === null ? null : (
        <DeleteUnitDialog
          key={deleteSession}
          unit={unit}
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
        />
      )}
    </>
  );
}
