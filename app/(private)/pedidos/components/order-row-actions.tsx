'use client';

import { PackageIcon, PencilIcon, TrashIcon, UserIcon, UsersIcon, XCircleIcon } from 'lucide-react';

import { RowActionsMenu, type RowActionMenuItem } from '@/components/shared/row-actions-menu';
import { type OrderStatus, type OrderSummary } from '@/lib/modules/pedidos';

/**
 * Las acciones de fila de un pedido: editar, cancelar, borrar, responsables y, cuando aplica,
 * reparto y unidad (R23, R24, `design.md > 8`).
 *
 * **Decision humana puntual (pedida por chat, solo para esta pantalla):** las acciones ya no son
 * botones en linea, sino items de un menu "de los 3 puntos" (`RowActionsMenu`,
 * `components/shared/row-actions-menu.tsx`), mismo criterio que adopto `UserRowActions`. R45
 * sigue exigiendo que nada se descubra con `:hover` y que cada control mida 44x44 px, y eso se
 * sigue cumpliendo: el DISPARADOR del menu esta siempre visible y siempre en el DOM, con su
 * propio objetivo tactil. Lo que cambia es que las acciones individuales viven dentro del menu
 * que ese disparador abre con un clic, no como controles sueltos. No es una derogacion general de
 * R45 para el resto del repo: las demas pantallas con botones en linea siguen con ellos.
 *
 * **Decision humana puntual (2026-10-04):** los items del menu dicen solo el verbo, sin el numero
 * del pedido. El contexto de la fila lo conserva el nombre accesible del disparador.
 *
 * **La fila llega por props** (R43). Este componente no importa `lib/composition`, ni el cliente
 * de base de datos, ni pide nada por su cuenta: lo que muestra ya lo trajo la consulta de la
 * lista, hecha una sola vez por el Server Component de la seccion.
 *
 * **QC-102 T13 — la accion «Responsables», NO se deshabilita en estado final** (QC-102 R24,
 * `design.md > 3.2`). Las otras cambian el pedido y por eso mueren con el; esta solo ABRE el
 * panel en su seccion para VER quien lo preparo, y eso QC-87 R13 lo permite en los cuatro
 * estados. Lo que desaparece dentro del panel son los controles de escritura (QC-102 R29), no la
 * puerta al dato: de responsables no dice nada.
 *
 * **Un solo predicado para el estado final** (`isFinalOrderStatus`): con el pedido en
 * `ENTREGADO`, `CANCELADO`, `POR_EMPACAR` o `EN_EMPAQUE` los items de editar/cancelar/borrar van
 * `disabled` dentro del menu, sin ningun texto aparte que lo explique, y **no se monta ningun
 * dialogo**. La pantalla anticipa la regla; el backend la impide igual (`invalid_transition`,
 * `not_cancellable`, `not_deletable`), asi que anticipar no es confiar.
 *
 * **`BLOQUEADO` NO es final** (QC-138): un pedido sin material se edita y se cancela como uno
 * `PENDIENTE`, y bajar su cantidad puede bastar para desbloquearlo. Lo que no admite es el
 * trabajo, y eso lo rechazan el backend y la lista del Operador, no este menu.
 *
 * **Reparto y unidad (QC-170)**: item QUINTO, condicional. Solo aparece si `canEditDistribution`
 * -lo decide el servidor con el permiso de modificar pedidos- Y el estado admite esa edicion
 * acotada (`acceptsDistributionEdit`). Antes de `POR_EMPACAR` la edicion general ya cubre reparto
 * y unidad; desde `EN_EMPAQUE` el reparto queda fijado; en `BLOQUEADO` la edicion general sigue
 * abierta y ya los cubre.
 *
 * **Puntos de enganche de T10, T11 y T12.** Los tres primeros items emiten por callback opcional
 * (`onEdit`, `onCancel`, `onDelete`) con el pedido entero. Quien compone la fila decide si abre el
 * panel/dialogo desde esos callbacks. Con el pedido en estado final, el item va `disabled` y el
 * primitivo del menu no llega a invocar su `onSelect`.
 */

/**
 * Que estados del contrato ya no admiten editar, cancelar ni borrar. Mapa exhaustivo y tipado
 * —no una comparacion suelta contra los literales— para que un estado nuevo rompa el
 * `typecheck` en vez de colarse como «editable» por defecto. `POR_EMPACAR` y `EN_EMPAQUE` ya
 * consumieron material y dieron de alta un lote: se cierran igual que `ENTREGADO`.
 *
 * `BLOQUEADO` NO es final: ver el comentario de cabecera.
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

/**
 * Estados en que solo cabe la edicion acotada de reparto y unidad (QC-170). Antes de
 * `POR_EMPACAR` la edicion general ya cubre los dos campos; desde `EN_EMPAQUE` el reparto queda
 * fijado.
 */
const ORDER_STATUS_ACCEPTS_DISTRIBUTION_EDIT: Readonly<Record<OrderStatus, boolean>> = {
  PENDIENTE: false,
  EN_CURSO: false,
  POR_EMPACAR: true,
  EN_EMPAQUE: false,
  ENTREGADO: false,
  CANCELADO: false,
  // La edicion general sigue abierta en BLOQUEADO y ya cubre reparto y unidad.
  BLOQUEADO: false,
};

export function acceptsDistributionEdit(status: OrderStatus): boolean {
  return ORDER_STATUS_ACCEPTS_DISTRIBUTION_EDIT[status];
}

export const ORDER_ACTION_DISTRIBUTION_TESTID = 'order-action-distribution';
export const ORDER_ACTION_CUSTOMER_TESTID = 'order-action-customer';

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
   * acciones que sigue viva con el pedido cerrado.
   */
  readonly onResponsibles?: (order: OrderSummary) => void;
  /** Lo decide el servidor con el permiso de modificar pedidos; sin el, la accion no se pinta. */
  readonly canEditDistribution?: boolean;
  readonly onDistribution?: (order: OrderSummary) => void;
  /** Lo decide el servidor con el permiso de modificar pedidos; sin el, la accion no se pinta. */
  readonly canEditCustomer?: boolean;
  readonly onCustomer?: (order: OrderSummary) => void;
};

export function OrderRowActions({
  order,
  onEdit,
  onCancel,
  onDelete,
  onResponsibles,
  canEditDistribution = false,
  onDistribution,
  canEditCustomer = false,
  onCustomer,
}: OrderRowActionsProps) {
  const isFinal = isFinalOrderStatus(order.status);
  const showDistribution = canEditDistribution && acceptsDistributionEdit(order.status);

  const items: RowActionMenuItem[] = [
    {
      key: 'edit',
      label: 'Editar',
      icon: PencilIcon,
      onSelect: () => onEdit?.(order),
      disabled: isFinal,
      testId: 'order-action-edit',
    },
    {
      key: 'cancel',
      label: 'Cancelar',
      icon: XCircleIcon,
      onSelect: () => onCancel?.(order),
      disabled: isFinal,
      testId: 'order-action-cancel',
    },
    {
      key: 'delete',
      label: 'Eliminar',
      icon: TrashIcon,
      onSelect: () => onDelete?.(order),
      disabled: isFinal,
      destructive: true,
      testId: 'order-action-delete',
    },
    // QC-102 R24: sin `disabled`. Ver quien prepara un pedido no es modificarlo, asi que un
    // pedido ENTREGADO o CANCELADO se sigue pudiendo consultar. No exige pasar por el formulario
    // de edicion: abre el MISMO panel en su seccion.
    {
      key: 'responsibles',
      label: 'Responsables',
      icon: UsersIcon,
      onSelect: () => onResponsibles?.(order),
      testId: 'order-action-responsibles',
    },
  ];

  // Sin `disabled`: el cliente se puede cambiar en cualquier estado.
  if (canEditCustomer) {
    items.push({
      key: 'customer',
      label: 'Cliente',
      icon: UserIcon,
      onSelect: () => onCustomer?.(order),
      testId: ORDER_ACTION_CUSTOMER_TESTID,
    });
  }

  if (showDistribution) {
    items.push({
      key: 'distribution',
      label: 'Reparto y unidad',
      icon: PackageIcon,
      onSelect: () => onDistribution?.(order),
      testId: ORDER_ACTION_DISTRIBUTION_TESTID,
    });
  }

  return (
    <RowActionsMenu
      items={items}
      triggerLabel={`Acciones del pedido ${order.numberText}`}
      triggerTestId="order-row-actions"
      triggerDataAttributes={{ 'data-order-id': order.id }}
    />
  );
}
