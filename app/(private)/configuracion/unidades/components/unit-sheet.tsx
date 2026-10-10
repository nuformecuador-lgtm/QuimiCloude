'use client';

import { PlusIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Sheet, SheetTrigger } from '@/components/ui/sheet';
import { useEntitySheet } from '@/hooks/use-entity-sheet';
import type { UnitView } from '@/lib/modules/unidades';
import { touchTarget } from '@/lib/shared/ui/touch-target';

import { UnitForm } from './unit-form';

/**
 * Panel lateral de alta y edicion de unidad (R32, R38, R39, R48; `design.md > 8`).
 *
 * **Panel lateral, y no dialogo modal centrado ni pagina aparte** (R32, decision humana del
 * 2026-09-08, heredada de QC-45 y QC-22; alternativa H descartada). Como no navega a ninguna URL,
 * la lista de detras conserva **pagina, tamano, orden y busqueda** al cerrarse —la segunda mitad
 * de R32— sin que haya que guardarlos en ningun sitio: el estado de lista vive en la cadena de
 * consulta (`design.md > 5.2`).
 *
 * **UN SOLO panel para los dos modos.** Sin `open`, trae su propio disparador y su propio estado:
 * es el alta, y es lo que la seccion pone sobre la lista. Con `open`/`onOpenChange` es CONTROLADO
 * y no monta disparador: es el enganche de la edicion desde la fila (R28).
 *
 * **El contenido se monta solo cuando el panel esta abierto** (lo hace el portal del primitivo):
 * el formulario se crea de cero en cada apertura, asi que la edicion siempre precarga los CUATRO
 * valores actuales (R35) y un intento fallido anterior no deja restos.
 *
 * **R38 vive aqui**: con exito se cierra, se avisa por toast —sobre el `<Toaster />` que el layout
 * privado ya monta; **no se monta otro** (R39)— y se llama a `router.refresh()`, que reejecuta el
 * Server Component de la lista con la MISMA URL. **No hay `revalidatePath`**: las actions de QC-38
 * no revalidan nada y esta ficha no las toca (`design.md > 5.5`).
 */

export const UNIT_CREATE_OPEN_TESTID = 'unit-create-open';

/**
 * Se reexporta desde `unit-form.tsx`, que es quien pinta el `SheetContent`: asi los consumidores
 * del panel —y sus tests— tienen un solo sitio del que importarlo.
 */
export { UNIT_SHEET_TESTID } from './unit-form';

const CREATE_LABEL = 'Nueva unidad';
const CREATE_SUCCESS = 'Unidad creada.';
const UPDATE_SUCCESS = 'Unidad actualizada.';

export type UnitSheetProps = {
  /** Unidad que se edita. Ausente en el alta (R32). */
  readonly unit?: UnitView;
  /** Unidades BASE del ambito visible, para el selector de «deriva de» (R36). */
  readonly baseUnits: readonly UnitView[];
  /** Apertura controlada desde fuera. Ausente = el panel trae su propio disparador de alta. */
  readonly open?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
};

export function UnitSheet({ unit, baseUnits, open, onOpenChange }: UnitSheetProps) {
  const isEdit = unit !== undefined;
  const { isOpen, isControlled, changeOpen, handleSaved } = useEntitySheet({
    open,
    onOpenChange,
    successMessage: isEdit ? UPDATE_SUCCESS : CREATE_SUCCESS,
  });

  return (
    <Sheet open={isOpen} onOpenChange={changeOpen}>
      {isControlled ? null : (
        <SheetTrigger
          render={
            <Button variant="default" className={touchTarget} data-testid={UNIT_CREATE_OPEN_TESTID} />
          }
        >
          <PlusIcon aria-hidden="true" />
          {CREATE_LABEL}
        </SheetTrigger>
      )}
      <UnitForm unit={unit} baseUnits={baseUnits} onSaved={handleSaved} />
    </Sheet>
  );
}
