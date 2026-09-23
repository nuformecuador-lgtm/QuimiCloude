'use client';

import { Badge } from '@/components/ui/badge';
import {
  ORDER_PRIORITY_VALUES,
  ORDER_STATUS_VALUES,
  type OrderPriority,
  type OrderStatus,
} from '@/lib/modules/pedidos';
// Solo el TIPO, del contrato publico de `inventario`: la arista `pedidos -> inventario` ya
// existe (`design.md > 5.1`, mismo criterio que `order-actions.ts`).
import type { OrderCoverage } from '@/lib/modules/inventario';

/**
 * Estado y prioridad de un pedido como **etiqueta legible** (R8, `design.md > 7`).
 *
 * **Los mapas son exhaustivos y tipados** (`Record<OrderStatus, ...>` y
 * `Record<OrderPriority, ...>`): si manana el contrato publica un quinto estado, este archivo
 * deja de compilar en vez de pintar un hueco o el valor crudo del enum. Esa es la razon de que
 * sean mapas y no una funcion con `switch` y `default`, que taparia el caso nuevo en silencio.
 *
 * **Las claves salen del contrato, los textos son de esta capa.** El conjunto cerrado lo declara
 * `pedidos` (`ORDER_STATUS_VALUES`, `ORDER_PRIORITY_VALUES`); aqui solo se decide como se lee.
 * Por eso las opciones de los filtros (`order-columns.tsx`) se construyen recorriendo esos
 * valores y no una segunda lista escrita a mano.
 *
 * **Ningun test afirma sobre estos textos** (R44): las etiquetas se localizan por `data-testid`
 * y, cuando el test necesita el texto, lo toma **de estas constantes exportadas**, nunca de un
 * literal copiado.
 */

/** Como se lee cada estado del contrato. Exhaustivo por tipo: falta una clave -> no compila. */
export const ORDER_STATUS_LABELS: Readonly<Record<OrderStatus, string>> = {
  PENDIENTE: 'Pendiente',
  EN_CURSO: 'En curso',
  ENTREGADO: 'Entregado',
  CANCELADO: 'Cancelado',
};

/** Como se lee cada prioridad del contrato. Exhaustivo por tipo, mismo motivo. */
export const ORDER_PRIORITY_LABELS: Readonly<Record<OrderPriority, string>> = {
  BAJA: 'Baja',
  MEDIA: 'Media',
  ALTA: 'Alta',
  CRITICA: 'Crítica',
};

/**
 * Variante visual por estado y por prioridad. Tambien exhaustivas: el color acompana a la
 * etiqueta, **nunca la sustituye** —el estado se lee, no se adivina por el tono—.
 */
const STATUS_VARIANTS: Readonly<Record<OrderStatus, 'default' | 'secondary' | 'outline' | 'destructive'>> = {
  PENDIENTE: 'outline',
  EN_CURSO: 'default',
  ENTREGADO: 'secondary',
  CANCELADO: 'destructive',
};

const PRIORITY_VARIANTS: Readonly<Record<OrderPriority, 'default' | 'secondary' | 'outline' | 'destructive'>> = {
  BAJA: 'outline',
  MEDIA: 'secondary',
  ALTA: 'default',
  CRITICA: 'destructive',
};

/**
 * Opciones de un filtro de seleccion, derivadas del conjunto cerrado del contrato (R14). Se
 * exportan ya construidas para que la declaracion de columnas no vuelva a recorrer los valores
 * ni a decidir como se leen.
 */
export const ORDER_STATUS_FILTER_OPTIONS: readonly { value: string; label: string }[] =
  ORDER_STATUS_VALUES.map((value) => ({ value, label: ORDER_STATUS_LABELS[value] }));

export const ORDER_PRIORITY_FILTER_OPTIONS: readonly { value: string; label: string }[] =
  ORDER_PRIORITY_VALUES.map((value) => ({ value, label: ORDER_PRIORITY_LABELS[value] }));

export function OrderStatusBadge({ status }: { readonly status: OrderStatus }) {
  return (
    <Badge variant={STATUS_VARIANTS[status]} data-testid="order-status" data-status={status}>
      {ORDER_STATUS_LABELS[status]}
    </Badge>
  );
}

export function OrderPriorityBadge({ priority }: { readonly priority: OrderPriority }) {
  return (
    <Badge variant={PRIORITY_VARIANTS[priority]} data-testid="order-priority" data-priority={priority}>
      {ORDER_PRIORITY_LABELS[priority]}
    </Badge>
  );
}

/**
 * QC-141 T14 — Cobertura del material del pedido (R35, `design.md > 0.2` N6).
 *
 * Los tres textos de N6, exhaustivos por tipo igual que `ORDER_STATUS_LABELS`: si `inventario`
 * publica un cuarto valor, este archivo deja de compilar.
 *
 * `ENTREGADO` y `CANCELADO` llegan con `coverage: 'none'` (`design.md > 0.3`, T11): se pintan
 * con la MISMA etiqueta «Sin apartar» y no con un guion, el mismo criterio que `OrderResponsibles`
 * aplica a sus datos -el estado final apaga los controles de ESCRITURA (R29), nunca oculta lo que
 * ya es un hecho consultable-. Aqui no hay nada que escribir, asi que no hay nada que apagar.
 */
export const ORDER_COVERAGE_LABELS: Readonly<Record<OrderCoverage, string>> = {
  full: 'Apartado',
  none: 'Sin apartar',
  partial: 'Sin cobertura completa',
};

const COVERAGE_VARIANTS: Readonly<Record<OrderCoverage, 'default' | 'secondary' | 'outline' | 'destructive'>> = {
  full: 'secondary',
  none: 'outline',
  partial: 'destructive',
};

export function OrderCoverageBadge({ coverage }: { readonly coverage: OrderCoverage }) {
  return (
    <Badge variant={COVERAGE_VARIANTS[coverage]} data-testid="order-coverage" data-coverage={coverage}>
      {ORDER_COVERAGE_LABELS[coverage]}
    </Badge>
  );
}
