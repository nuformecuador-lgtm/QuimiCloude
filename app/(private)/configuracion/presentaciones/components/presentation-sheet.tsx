'use client';

import { PlusIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Sheet, SheetTrigger } from '@/components/ui/sheet';
import type { UnitRef } from '@/lib/modules/unidades';
import { touchTarget } from '@/lib/shared/ui/touch-target';

import { PresentationForm, type PresentationSheetTarget } from './presentation-form';

/**
 * Panel lateral de alta y edicion de presentacion (R21, R25, R26, R34, `design.md > 7`).
 *
 * **Panel lateral, y no dialogo modal centrado ni pagina aparte** (R21, decision humana del
 * 2026-09-07, heredada de QC-22). Como no navega a ninguna URL, la lista de detras conserva
 * **pagina, tamano, orden y busqueda** al cerrarse -la segunda mitad de R21- sin que haya que
 * guardarlos en ningun sitio: el estado de lista vive en la cadena de consulta
 * (`design.md > 5.2`).
 *
 * **El contenido se monta solo cuando el panel esta abierto** (lo hace el portal del primitivo):
 * el formulario se crea de cero en cada apertura, asi que la edicion siempre precarga el nombre
 * actual (R23) y un intento fallido anterior no deja restos.
 *
 * **El panel lo pinta `PresentationForm`, no este archivo.** Desde que el panel entero es un
 * `<form>` (`SheetContent isForm`), la cabecera, el cuerpo y el pie con el boton de guardar son
 * partes del mismo formulario, y quien tiene la `action` es el formulario. Aqui quedan el
 * disparador, el estado de apertura y el cierre.
 *
 * **R25 y R26 viven aqui**: con exito se cierra, se avisa por toast -la region la monta el layout
 * privado y **no se monta otra**- y se llama a `router.refresh()`, que vuelve a ejecutar el Server
 * Component de la lista con la MISMA URL. **No hay `revalidatePath`**: exigiria abrir
 * `lib/modules/inventario/adapters/driving/`, que R30 prohibe; quien decide que se revalida es la
 * pantalla (`design.md > 5.4`).
 *
 * **QC-80 (R16, R19): las unidades ATRAVIESAN el panel, no nacen aqui.** Este componente no las
 * consulta; las recibe de quien lo monta -la seccion de lista, que las pidio una sola vez- y se
 * las entrega al formulario. Si el catalogo fallo, la seccion **no monta este panel** en ninguno
 * de sus tres sitios (cabecera, «crear la primera» y fila), asi que no existe el camino de abrir
 * un formulario con el selector vacio.
 *
 * **Dos modos de apertura, un solo panel.** Sin `open`, el panel trae su propio disparador y su
 * propio estado -es el alta, y es lo que la seccion pone en la cabecera de la lista y lo que el
 * estado vacio recibe como `children` para «crear la primera»-. Con `open`/`onOpenChange`, el
 * panel es CONTROLADO y no monta disparador: es el enganche de la edicion desde la fila, donde
 * quien dispara es la columna de acciones.
 */

export const PRESENTATION_CREATE_OPEN_TESTID = 'presentation-create-open';

/**
 * Se reexporta desde `presentation-form.tsx`, que es quien pinta el `SheetContent`: asi los
 * consumidores del panel -y sus tests- tienen un solo sitio del que importarlo.
 */
export { PRESENTATION_SHEET_TESTID, type PresentationSheetTarget } from './presentation-form';

const CREATE_LABEL = 'Nueva presentación';
const CREATE_SUCCESS = 'Presentación creada.';
const UPDATE_SUCCESS = 'Presentación actualizada.';

export type PresentationSheetProps = {
  /** Presentacion que se edita. Ausente en el alta (R22). */
  readonly presentation?: PresentationSheetTarget;
  /** Catalogo entero de unidades (QC-80 R16). Llega por props y baja tal cual al formulario. */
  readonly units: readonly UnitRef[];
  /** Apertura controlada desde fuera. Ausente = el panel trae su propio disparador de alta. */
  readonly open?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
};

export function PresentationSheet({
  presentation,
  units,
  open,
  onOpenChange,
}: PresentationSheetProps) {
  const [selfOpen, setSelfOpen] = useState(false);
  const router = useRouter();
  const isEdit = presentation !== undefined;
  const isControlled = open !== undefined;
  const isOpen = open ?? selfOpen;

  const changeOpen = useCallback(
    (next: boolean) => {
      if (!isControlled) setSelfOpen(next);
      onOpenChange?.(next);
    },
    [isControlled, onOpenChange],
  );

  const handleSaved = useCallback(() => {
    changeOpen(false);
    toast.success(isEdit ? UPDATE_SUCCESS : CREATE_SUCCESS);
    // Vuelve a ejecutar el Server Component de la lista con la MISMA URL: ni `push` ni `replace`,
    // asi que pagina, tamano, orden y busqueda siguen siendo los de antes de abrir (R21, R25).
    router.refresh();
  }, [changeOpen, isEdit, router]);

  return (
    <Sheet open={isOpen} onOpenChange={changeOpen}>
      {isControlled ? null : (
        <SheetTrigger
          render={
            <Button
              variant="default"
              className={touchTarget}
              data-testid={PRESENTATION_CREATE_OPEN_TESTID}
            />
          }
        >
          <PlusIcon aria-hidden="true" />
          {CREATE_LABEL}
        </SheetTrigger>
      )}
      <PresentationForm presentation={presentation} units={units} onSaved={handleSaved} />
    </Sheet>
  );
}
