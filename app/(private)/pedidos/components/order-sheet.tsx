'use client';

import { PlusIcon } from 'lucide-react';
import { useCallback, useState } from 'react';

import { ResponsibleAvatars } from '@/components/shared/responsible-avatars';
import { Button } from '@/components/ui/button';
import { Sheet, SheetTrigger } from '@/components/ui/sheet';
import { useEntitySheet } from '@/hooks/use-entity-sheet';
import type { OrderResponsible } from '@/lib/modules/asignaciones';
import type { OrderSummary } from '@/lib/modules/pedidos';
import type { MassVolumeBridge, UnitView } from '@/lib/modules/unidades';
// Solo el tipo: la arista pedidos -> inventario ya existe en el contrato del modulo.
import type { OrderCoverage } from '@/lib/modules/inventario';

import { CancelOrderDialog } from './cancel-order-dialog';
import { DeleteOrderDialog } from './delete-order-dialog';
import { OrderCustomerDialog } from './order-customer-dialog';
import { OrderDeliverySheet } from './order-delivery-sheet';
import { OrderDistributionDialog, type OrderDistributionDraft } from './order-distribution-dialog';
import { OrderForm, type OrderSheetSection } from './order-form';
import {
  EMPTY_RESPONSIBLES_CATALOG,
  type OrderResponsiblesCatalog,
} from './order-responsibles';
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
 * **La limpieza por apertura NO se deja al antojo del desmontaje** (2026-09-09): `OrderForm`
 * lleva una `key` que cambia en CADA apertura, de modo que aunque el cierre y la reapertura
 * ocurran dentro de la ventana de desmontaje del portal -su animacion de salida no habia acabado
 * cuando se vuelve a abrir- el formulario es una instancia nueva. Sin esto, el alta siguiente
 * podia heredar la receta y la cantidad del pedido anterior y se guardaba «crema 1» con el rótulo
 * del pedido viejo.
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
  /** Catalogo de unidades, por props (R43): resuelve la unidad de los ingredientes. */
  readonly units: readonly UnitView[];
  readonly bridge: MassVolumeBridge | null;
  /** Apertura controlada desde fuera. Ausente = el panel trae su propio disparador de alta. */
  readonly open?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  /** QC-102 R26 — los responsables que la fila ya trajo. Abrir el panel NO consulta nada. */
  readonly responsibles?: readonly OrderResponsible[];
  /** QC-102 R27, R28 — catalogos y `canWrite`, por props desde el servidor. */
  readonly responsiblesCatalog?: OrderResponsiblesCatalog;
  /**
   * La cobertura que la fila ya trajo. `undefined` cuando el lote fallo o el pedido es de alta
   * (no tiene id todavia): la hoja se degrada al marcador de ausencia, mismo criterio que
   * `responsibles`.
   */
  readonly coverage?: OrderCoverage;
  /**
   * QC-102 R23, R24 — EN QUE SECCION abre. **Es el mismo panel**: esta prop no crea otro, solo
   * decide a donde va el foco. Por defecto, el formulario de siempre.
   */
  readonly section?: OrderSheetSection;
};

export function OrderSheet({
  order,
  recipes,
  units,
  bridge,
  open,
  onOpenChange,
  responsibles = [],
  responsiblesCatalog = EMPTY_RESPONSIBLES_CATALOG,
  coverage,
  section = 'form',
}: OrderSheetProps) {
  /** Instancia del formulario: cambia en cada apertura para que arranque SIEMPRE vacio (2026-09-09). */
  const [openKey, setOpenKey] = useState(0);
  const isEdit = order !== undefined;

  // La `key` avanza solo al abrir: si dependiera de `isOpen`, `handleSaved` cambiaria de identidad
  // y el efecto de exito del formulario se dispararia dos veces.
  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (next) setOpenKey((key) => key + 1);
      onOpenChange?.(next);
    },
    [onOpenChange],
  );

  const { isOpen, isControlled, changeOpen, handleSaved } = useEntitySheet({
    open,
    onOpenChange: handleOpenChange,
    successMessage: isEdit ? UPDATE_SUCCESS : CREATE_SUCCESS,
  });

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
      <OrderForm
        key={openKey}
        order={order}
        recipes={recipes}
        units={units}
        bridge={bridge}
        onSaved={handleSaved}
        responsibles={responsibles}
        responsiblesCatalog={responsiblesCatalog}
        coverage={coverage}
        section={section}
      />
    </Sheet>
  );
}

export type OrderRowSheetActionsProps = {
  readonly order: OrderSummary;
  readonly recipes: RecipePickerPage;
  readonly units: readonly UnitView[];
  readonly bridge: MassVolumeBridge | null;
  /** QC-102 R26 — los responsables de ESTA fila, ya traidos por el lote de la seccion. */
  readonly responsibles?: readonly OrderResponsible[];
  /** QC-102 R27, R28 — catalogos y `canWrite`, compuestos una vez en el servidor. */
  readonly responsiblesCatalog?: OrderResponsiblesCatalog;
  /** La cobertura de ESTA fila, ya traida por el lote de la seccion. */
  readonly coverage?: OrderCoverage;
  /** Si el actor puede modificar pedidos; lo resuelve el servidor. */
  readonly canEditDistribution?: boolean;
  /** Si el actor puede cambiar el cliente; lo resuelve el servidor. */
  readonly canEditCustomer?: boolean;
  /** Si el actor puede entregar pedidos; lo resuelve el servidor. */
  readonly canDeliver?: boolean;
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
 * **Los dialogos de cancelar y borrar se montan en su primera apertura y ya no se desmontan**, para
 * que el cierre anime su salida. Su contenido si se desmonta al cerrar: cada apertura arranca con
 * el estado de accion limpio -un `not_cancellable` de un intento anterior no reaparece- y el arbol
 * de una fila cerrada no contiene ningun formulario de cancelacion ni de borrado.
 *
 * Es lo que la celda de acciones de `buildOrderColumns` renderiza por fila: sin esta pieza, los
 * tres botones de `OrderRowActions` no abririan nada.
 */
export function OrderRowSheetActions({
  order,
  recipes,
  units,
  bridge,
  responsibles = [],
  responsiblesCatalog = EMPTY_RESPONSIBLES_CATALOG,
  coverage,
  canEditDistribution = false,
  canEditCustomer = false,
  canDeliver = false,
}: OrderRowSheetActionsProps) {
  const [editOpen, setEditOpen] = useState(false);
  // `null` mientras no se ha abierto nunca; despues el dialogo queda montado para animar su cierre.
  const [cancelOpen, setCancelOpen] = useState<boolean | null>(null);
  const [deleteOpen, setDeleteOpen] = useState<boolean | null>(null);
  const [distributionOpen, setDistributionOpen] = useState(false);
  const [customerOpen, setCustomerOpen] = useState(false);
  const [deliverOpen, setDeliverOpen] = useState(false);
  // Atado a la instancia de `order`: cuando llega el refresco trae otra y lo guardado se descarta.
  const [savedDistribution, setSavedDistribution] = useState<{
    readonly order: OrderSummary;
    readonly draft: OrderDistributionDraft;
  } | null>(null);
  const pendingDistribution =
    savedDistribution?.order === order ? savedDistribution.draft : undefined;
  /**
   * QC-102 R23 — EN QUE SECCION abre el UNICO panel de esta fila. No hay un segundo `OrderSheet`
   * para responsables: editar y responsables abren **el mismo**, y esto es lo que los distingue.
   */
  const [section, setSection] = useState<OrderSheetSection>('form');

  const openSection = (next: OrderSheetSection) => {
    setSection(next);
    setEditOpen(true);
  };

  return (
    <>
      <OrderRowActions
        order={order}
        onEdit={() => openSection('form')}
        onCancel={() => setCancelOpen(true)}
        onDelete={() => setDeleteOpen(true)}
        onResponsibles={() => openSection('responsibles')}
        canEditDistribution={canEditDistribution}
        onDistribution={() => setDistributionOpen(true)}
        canEditCustomer={canEditCustomer}
        onCustomer={() => setCustomerOpen(true)}
        canDeliver={canDeliver}
        onDeliver={() => setDeliverOpen(true)}
      />
      <OrderSheet
        order={order}
        recipes={recipes}
        units={units}
        bridge={bridge}
        open={editOpen}
        onOpenChange={setEditOpen}
        responsibles={responsibles}
        responsiblesCatalog={responsiblesCatalog}
        coverage={coverage}
        section={section}
      />
      {cancelOpen === null ? null : (
        <CancelOrderDialog order={order} open={cancelOpen} onOpenChange={setCancelOpen} />
      )}
      {deleteOpen === null ? null : (
        <DeleteOrderDialog order={order} open={deleteOpen} onOpenChange={setDeleteOpen} />
      )}
      {distributionOpen ? (
        <OrderDistributionDialog
          order={order}
          units={units}
          open
          onOpenChange={setDistributionOpen}
          saved={pendingDistribution}
          onSaved={(draft) => setSavedDistribution({ order, draft })}
        />
      ) : null}
      {customerOpen ? (
        <OrderCustomerDialog order={order} open onOpenChange={setCustomerOpen} />
      ) : null}
      {deliverOpen ? (
        <OrderDeliverySheet order={order} open onOpenChange={setDeliverOpen} />
      ) : null}
    </>
  );
}


export type OrderRowResponsiblesProps = {
  readonly order: OrderSummary;
  readonly recipes: RecipePickerPage;
  readonly units: readonly UnitView[];
  readonly bridge: MassVolumeBridge | null;
  /** Los responsables de ESTA fila, del lote que la seccion pidio una sola vez (R16, R26). */
  readonly responsibles: readonly OrderResponsible[];
  readonly responsiblesCatalog?: OrderResponsiblesCatalog;
  /** La cobertura de ESTA fila: el panel es el mismo, se abra por donde se abra. */
  readonly coverage?: OrderCoverage;
};

/**
 * QC-102 T12/T14 — La CELDA de la columna de responsables (R16, R17, R35).
 *
 * Pinta los avatares y, al pulsar el `+N`, abre **el panel que ya existe** en su seccion de
 * responsables: la segunda puerta al dato que R35 exige, la que no depende de `:hover` ni de que
 * el tooltip llegue a abrir en tactil (`design.md > 0` H5).
 *
 * **Vive en ESTE archivo, junto a `OrderRowSheetActions`, y no en `ResponsibleAvatars`** por
 * una razon concreta: `components/shared/responsible-avatars.tsx` es la pieza de presentacion
 * pura —no conoce
 * paneles y no debe conocerlos—, y quien sabe abrir el panel de un pedido es este modulo. Asi la
 * columna de avatares y la de acciones abren **el mismo** `OrderSheet` (R23), no dos.
 *
 * **El panel se monta SOLO mientras esta abierto** (`{open ? ... : null}`): con la celda cerrada
 * no hay ningun panel en el arbol de la fila, que es lo que el test de R23 comprueba contando
 * instancias.
 */
export function OrderRowResponsibles({
  order,
  recipes,
  units,
  bridge,
  responsibles,
  responsiblesCatalog = EMPTY_RESPONSIBLES_CATALOG,
  coverage,
}: OrderRowResponsiblesProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <ResponsibleAvatars responsibles={responsibles} onShowAll={() => setOpen(true)} />
      {open ? (
        <OrderSheet
          order={order}
          recipes={recipes}
          units={units}
          bridge={bridge}
          open
          onOpenChange={setOpen}
          responsibles={responsibles}
          responsiblesCatalog={responsiblesCatalog}
          coverage={coverage}
          section="responsibles"
        />
      ) : null}
    </>
  );
}
