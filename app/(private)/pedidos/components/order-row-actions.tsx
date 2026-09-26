'use client';

import { PencilIcon, TrashIcon, UsersIcon, XCircleIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { type OrderStatus, type OrderSummary } from '@/lib/modules/pedidos';

/**
 * Las tres acciones de fila de un pedido: editar, cancelar y borrar (R23, R24,
 * `design.md > 8`).
 *
 * **Siempre visibles.** Nada se descubre con `:hover`, que en tactil no existe (R45): los tres
 * controles estan en el DOM y a la vista desde el primer render, y cada uno mide al menos
 * 44x44 px (`TOUCH_TARGET`).
 *
 * **La fila llega por props** (R43). Este componente no importa `lib/composition`, ni el cliente
 * de base de datos, ni pide nada por su cuenta: lo que muestra ya lo trajo la consulta de la
 * lista, hecha una sola vez por el Server Component de la seccion.
 *
 * **QC-102 T13 — la CUARTA accion, «Responsables», NO se deshabilita en estado final** (QC-102
 * R24, `design.md > 3.2`). Las otras tres cambian el pedido y por eso mueren con el; esta solo
 * ABRE el panel en su seccion para VER quien lo preparo, y eso QC-87 R13 lo permite en los cuatro
 * estados. Lo que desaparece dentro del panel son los controles de escritura (QC-102 R29), no la
 * puerta al dato. Por eso `FINAL_ORDER_REASON` sigue diciendo exactamente lo que sigue siendo
 * cierto: no se puede editar, cancelar ni eliminar —de responsables no dice nada—.
 *
 * **Un solo predicado para el estado final** (`isFinalOrderStatus`): con el pedido en
 * `ENTREGADO`, `CANCELADO`, `POR_EMPACAR` o `EN_EMPAQUE` los tres controles van `disabled` **con
 * el motivo VISIBLE** —no solo en `title`, que en tactil no aparece nunca— y **no se monta ningun
 * dialogo**. La pantalla anticipa la regla; el backend la impide igual (`invalid_transition`,
 * `not_cancellable`, `not_deletable`), asi que anticipar no es confiar.
 *
 * **Puntos de enganche de T10, T11 y T12.** Los tres disparadores emiten por callback opcional
 * (`onEdit`, `onCancel`, `onDelete`) con el pedido entero. Cuando existan `OrderSheet`,
 * `CancelOrderDialog` y `DeleteOrderDialog`, quien componga la fila decide si abre el panel/
 * dialogo desde esos callbacks o si sustituye cada boton por su disparador propio. Mientras
 * tanto **no se invoca ninguna operacion**: sin callback, pulsar no hace nada, y con el pedido
 * en estado final el callback no se llega a llamar.
 */

/** Objetivo tactil minimo (44x44 px) de R45. Los primitivos miden 32 px de alto por defecto. */
const TOUCH_TARGET = 'min-h-11 min-w-11';

/**
 * Que estados del contrato ya no admiten editar, cancelar ni borrar. Mapa exhaustivo y tipado
 * —no una comparacion suelta contra los literales— para que un estado nuevo rompa el
 * `typecheck` en vez de colarse como «editable» por defecto. `POR_EMPACAR` y `EN_EMPAQUE` ya
 * consumieron material y dieron de alta un lote: se cierran igual que `ENTREGADO`.
 *
 * `BLOQUEADO` NO es final: un pedido sin material se edita y se cancela como uno `PENDIENTE`, y
 * bajar su cantidad puede bastar para desbloquearlo. Lo que no admite es el trabajo, y eso lo
 * rechazan el backend y la lista del Operador, no estos tres controles.
 */
const ORDER_STATUS_IS_FINAL: Readonly<Record<OrderStatus, boolean>> = {
  PENDIENTE: false,
  EN_CURSO: false,
  POR_EMPACAR: true,
  EN_EMPAQUE: true,
  ENTREGADO: true,
  CANCELADO: true,
  BLOQUEADO: false,
};

/**
 * El unico predicado de estado final de la pantalla (`design.md > 8`). Se exporta para que
 * ningun otro archivo vuelva a escribir la comparacion: dos definiciones del mismo predicado es
 * como acaban divergiendo.
 */
export function isFinalOrderStatus(status: OrderStatus): boolean {
  return ORDER_STATUS_IS_FINAL[status];
}

/** Motivo, visible, de por que las acciones no estan disponibles. Constante: ningun test lo copia. */
export const FINAL_ORDER_REASON =
  'Este pedido ya está cerrado: no se puede editar, cancelar ni eliminar.';

export type OrderRowActionsProps = {
  readonly order: OrderSummary;
  /** Punto de enganche de T10 (panel lateral de edicion). */
  readonly onEdit?: (order: OrderSummary) => void;
  /** Punto de enganche de T11 (dialogo de cancelacion con motivo). */
  readonly onCancel?: (order: OrderSummary) => void;
  /** Punto de enganche de T12 (dialogo de confirmacion de borrado). */
  readonly onDelete?: (order: OrderSummary) => void;
  /**
   * QC-102 R24 — abre el panel que YA existe en su seccion de responsables. Es la unica de las
   * cuatro que sigue viva con el pedido cerrado.
   */
  readonly onResponsibles?: (order: OrderSummary) => void;
};

export function OrderRowActions({
  order,
  onEdit,
  onCancel,
  onDelete,
  onResponsibles,
}: OrderRowActionsProps) {
  const isFinal = isFinalOrderStatus(order.status);

  return (
    <div
      className="flex flex-col items-end gap-1"
      data-testid="order-row-actions"
      data-order-id={order.id}
      data-final={isFinal ? 'true' : 'false'}
    >
      <div className="flex items-center justify-end gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={TOUCH_TARGET}
          disabled={isFinal}
          aria-label={`Editar el pedido ${order.numberText}`}
          data-testid="order-action-edit"
          onClick={() => onEdit?.(order)}
        >
          <PencilIcon aria-hidden="true" />
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={TOUCH_TARGET}
          disabled={isFinal}
          aria-label={`Cancelar el pedido ${order.numberText}`}
          data-testid="order-action-cancel"
          onClick={() => onCancel?.(order)}
        >
          <XCircleIcon aria-hidden="true" />
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={TOUCH_TARGET}
          disabled={isFinal}
          aria-label={`Eliminar el pedido ${order.numberText}`}
          data-testid="order-action-delete"
          onClick={() => onDelete?.(order)}
        >
          <TrashIcon aria-hidden="true" />
        </Button>

        {/*
          QC-102 R24: la cuarta entrada, y **sin `disabled`**. Ver quien prepara un pedido no es
          modificarlo, asi que un pedido ENTREGADO o CANCELADO se sigue pudiendo consultar. No
          exige pasar por el formulario de edicion: abre el MISMO panel en su seccion.
        */}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={TOUCH_TARGET}
          aria-label={`Responsables del pedido ${order.numberText}`}
          data-testid="order-action-responsibles"
          onClick={() => onResponsibles?.(order)}
        >
          <UsersIcon aria-hidden="true" />
        </Button>
      </div>

      {/*
        El motivo se PINTA (R24): `title` no existe en tactil y `aria-disabled` no lo explica.
        Va debajo de los tres controles, no en un tooltip, para que se lea sin interaccion.
      */}
      {isFinal ? (
        <p
          className="max-w-56 text-right text-xs text-muted-foreground"
          data-testid="order-row-actions-reason"
        >
          {FINAL_ORDER_REASON}
        </p>
      ) : null}
    </div>
  );
}
