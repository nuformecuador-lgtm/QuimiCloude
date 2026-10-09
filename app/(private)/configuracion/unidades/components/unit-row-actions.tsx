'use client';

import { PencilIcon, TrashIcon } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import type { UnitView } from '@/lib/modules/unidades';

import { DeleteUnitDialog } from './delete-unit-dialog';
import { UnitSheet } from './unit-sheet';

/**
 * Las DOS acciones de fila de una unidad: editar y borrar (R28, R29, R30, R48; `design.md > 8`).
 *
 * **Con una unidad DE SISTEMA devuelve `null`, o sea la celda queda VACIA** (R29): sin botones,
 * sin botones deshabilitados, sin etiqueta, sin insignia junto al nombre y sin ninguna
 * explicacion. Que una unidad sea de sistema es manejo interno (decision cerrada del 2026-09-08,
 * alternativa E descartada), y la ausencia de acciones es la unica senal.
 *
 * **Ocultarlas es comodidad, NO el control** (R30): quien rechaza editar o borrar una unidad de
 * sistema es el caso de uso de QC-38, con su test. Esta pantalla **no repite** la comprobacion
 * para decidir nada mas que que pinta, y si una escritura se rechazara por ese motivo el error
 * se presenta como cualquier otro, por su `code`.
 *
 * **Siempre visibles y siempre en el DOM** (R48): nada se descubre con `:hover` —que en tactil no
 * existe— ni vive dentro de un desplegable, y cada control mide al menos 44x44 px.
 *
 * **Cada boton NOMBRA la unidad sobre la que actua** (R28): con diez filas en pantalla, «Editar» a
 * secas no dice cual.
 *
 * **Todo llega por props** (R46): la unidad y las unidades base del selector las trajo la seccion
 * de la lista con sus dos lecturas. Aqui no se importa `lib/composition`, ni el cliente de base de
 * datos, ni se pide nada por cuenta propia.
 */

export const UNIT_ROW_ACTIONS_TESTID = 'unit-row-actions';
export const UNIT_ACTION_EDIT_TESTID = 'unit-action-edit';
export const UNIT_ACTION_DELETE_TESTID = 'unit-action-delete';

/**
 * Nombre accesible de cada accion, **compuesto con el nombre de la unidad** (R28). Se exportan
 * como funciones para que los tests localicen los botones por rol y nombre sin copiar el copy
 * (R49): quien decide el texto es este archivo, y sigue habiendo un solo sitio donde cambiarlo.
 */
export function editUnitLabel(name: string): string {
  return `Editar la unidad ${name}`;
}

export function deleteUnitLabel(name: string): string {
  return `Eliminar la unidad ${name}`;
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
  const [deleteOpen, setDeleteOpen] = useState(false);

  // R29: la celda de una unidad de sistema no emite NADA. Se comprueba antes que cualquier hook
  // de estado no, porque los hooks no pueden ir tras un `return` condicional; por eso los dos
  // `useState` estan arriba y esta salida va inmediatamente despues.
  if (unit.isSystem) return null;

  return (
    <div
      className="flex items-center justify-end gap-1"
      data-testid={UNIT_ROW_ACTIONS_TESTID}
      data-unit-id={unit.id}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        touch
        aria-label={editUnitLabel(unit.name)}
        data-testid={UNIT_ACTION_EDIT_TESTID}
        onClick={() => setEditOpen(true)}
      >
        <PencilIcon aria-hidden="true" />
      </Button>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        touch
        aria-label={deleteUnitLabel(unit.name)}
        data-testid={UNIT_ACTION_DELETE_TESTID}
        onClick={() => setDeleteOpen(true)}
      >
        <TrashIcon aria-hidden="true" />
      </Button>

      <UnitSheet unit={unit} baseUnits={baseUnits} open={editOpen} onOpenChange={setEditOpen} />
      {/* El dialogo se monta SOLO mientras esta abierto: asi cada apertura arranca sin el error
          del intento anterior —un `unit_in_use` no reaparece— y el arbol de una fila cerrada no
          contiene ningun formulario de borrado. */}
      {deleteOpen ? <DeleteUnitDialog unit={unit} open onOpenChange={setDeleteOpen} /> : null}
    </div>
  );
}
