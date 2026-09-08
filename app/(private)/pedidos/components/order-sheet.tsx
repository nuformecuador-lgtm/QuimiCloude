'use client';

import { PlusIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Sheet, SheetTrigger } from '@/components/ui/sheet';
import type { OrderSummary } from '@/lib/modules/pedidos';

import { CancelOrderDialog } from './cancel-order-dialog';
import { DeleteOrderDialog } from './delete-order-dialog';
import { OrderForm } from './order-form';
import { OrderRowActions } from './order-row-actions';
import type { RecipePickerPage } from './recipe-picker';

/**
 * Panel lateral de alta y edicion de pedido (R25, R35, R36, `design.md > 8`).
 *
 * **Panel lateral, y no dialogo modal centrado ni pagina aparte** (R25, decision humana del
 * 2026-09-06). Como no navega a ninguna URL, la lista de detras conserva **pagina, tamano, orden
 * y filtros** al cerrarse -la segunda mitad de R25- sin que haya que guardarlos en ningun sitio:
 * el estado de lista vive en la cadena de consulta (`design.md > 5`).
 *
 * **El contenido se monta solo cuando el panel esta abierto** (lo hace el portal del primitivo):
 * el formulario se crea de cero en cada apertura, asi que la edicion siempre precarga los valores
 * actuales del pedido (R28) y un intento fallido anterior no deja restos.
 *
 * **El panel lo pinta `OrderForm`, no este archivo.** Desde que el panel entero es un `<form>`
 * (`SheetContent isForm`), la cabecera, el cuerpo y el pie con el boton de guardar son partes del
 * mismo formulario, y quien tiene la `action` es `OrderForm`. Aqui quedan el disparador, el
 * estado de apertura y el cierre.
 *
 * **R35 y R36 viven aqui**: con exito se cierra, se avisa por toast -la region la monta el layout
 * privado y **no se monta otra**- y se llama a `router.refresh()`, que vuelve a ejecutar el Server
 * Component de la lista con la MISMA URL. **No hay `revalidatePath`**: exigiria abrir
 * `lib/modules/pedidos/adapters/driving/`, que R46 prohibe; las propias actions de QC-34 dejaron
 * escrito que «QC-35 decide que revalida», y lo decide aqui, en la pantalla.
 *
 * **Dos modos de apertura, un solo panel.** Sin `open`, el panel trae su propio disparador y su
 * propio estado -es el alta, y es lo que la seccion pone en la cabecera de la lista y en el slot
 * del estado vacio-. Con `open`/`onOpenChange`, el panel es CONTROLADO y no monta disparador: es
 * el enganche de la edicion desde la fila, donde quien dispara es `OrderRowActions`.
 */

export const ORDER_CREATE_OPEN_TESTID = 'order-create-open';
export const ORDER_SHEET_TESTID = 'order-sheet';

const TOUCH_TARGET = 'min-h-11 min-w-11';

const CREATE_LABEL = 'Nuevo pedido';
const CREATE_SUCCESS = 'Pedido creado.';
const UPDATE_SUCCESS = 'Pedido actualizado.';

export type OrderSheetProps = {
  /** Pedido que se edita. Ausente en el alta (R26). */
  readonly order?: OrderSummary;
  /** Primera pagina del catalogo de recetas, por props (R43). */
  readonly recipes: RecipePickerPage;
  /** Unidades existentes, por props (R43). */
  /** Apertura controlada desde fuera. Ausente = el panel trae su propio disparador de alta. */
  readonly open?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
};

export function OrderSheet({ order, recipes, open, onOpenChange }: OrderSheetProps) {
  const [selfOpen, setSelfOpen] = useState(false);
  const router = useRouter();
  const isEdit = order !== undefined;
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
    // asi que pagina, tamano, orden y filtros siguen siendo los de antes de abrir (R25).
    router.refresh();
  }, [changeOpen, isEdit, router]);

  return (
    <Sheet open={isOpen} onOpenChange={changeOpen}>
      {isControlled ? null : (
        <SheetTrigger
          render={
            <Button
              variant="default"
              className={TOUCH_TARGET}
              data-testid={ORDER_CREATE_OPEN_TESTID}
            />
          }
        >
          <PlusIcon aria-hidden="true" />
          {CREATE_LABEL}
        </SheetTrigger>
      )}
      <OrderForm order={order} recipes={recipes} onSaved={handleSaved} />
    </Sheet>
  );
}

export type OrderRowSheetActionsProps = {
  readonly order: OrderSummary;
  readonly recipes: RecipePickerPage;
};

/**
 * Las acciones de la fila con **las tres ya cableadas**: editar al panel lateral (R25), cancelar
 * al dialogo de motivo (R37) y borrar a la confirmacion (R38).
 *
 * Es la pieza que une lo que T8 dejo enganchado con lo que T10, T11 y T12 construyen:
 * `OrderRowActions` emite `onEdit`/`onCancel`/`onDelete` y aqui cada uno abre su panel o su
 * dialogo, CONTROLADO, con ese mismo pedido. Con el pedido en estado final `OrderRowActions` no
 * llega a emitir nada (R24), asi que **no se monta ninguno de los tres**.
 *
 * **Los dos dialogos se montan solo mientras estan abiertos.** No es un detalle de rendimiento:
 * asi cada apertura arranca con el estado de accion limpio -un `not_cancellable` de un intento
 * anterior no reaparece- y el arbol de una fila cerrada no contiene ningun formulario de
 * cancelacion ni de borrado, que es lo que R24 comprueba en negativo.
 *
 * Es lo que la celda de acciones de `buildOrderColumns` renderiza por fila: sin esta pieza, los
 * tres botones de `OrderRowActions` no abririan nada.
 */
export function OrderRowSheetActions({ order, recipes }: OrderRowSheetActionsProps) {
  const [editOpen, setEditOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <>
      <OrderRowActions
        order={order}
        onEdit={() => setEditOpen(true)}
        onCancel={() => setCancelOpen(true)}
        onDelete={() => setDeleteOpen(true)}
      />
      <OrderSheet
        order={order}
        recipes={recipes}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
      {cancelOpen ? (
        <CancelOrderDialog order={order} open onOpenChange={setCancelOpen} />
      ) : null}
      {deleteOpen ? (
        <DeleteOrderDialog order={order} open onOpenChange={setDeleteOpen} />
      ) : null}
    </>
  );
}
