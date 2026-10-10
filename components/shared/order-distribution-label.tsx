/**
 * Resumen compartido del reparto de un pedido: la primera linea y «+N» con el resto.
 *
 * **Vive en `components/shared/` porque la usan DOS rutas** (`/pedidos` y `/asignacion`) con la
 * misma API, que es la condicion de `docs/architecture.md > Regla: sin sobre-ingenieria`.
 *
 * «Sin presentación» no reutiliza el `MissingValue` de esas rutas: un reparto vacio es un dato del
 * pedido, no un fallo de carga. El nombre `null` de una linea si es un fallo de carga y lleva «—».
 */

import { EMPTY_MARK } from '@/lib/shared/ui/empty-mark';

export type OrderDistributionLabelLine = {
  readonly presentationName: string | null;
  /** `null` en una linea antigua, que se pinta con el nombre de su presentacion. */
  readonly packagingName?: string | null;
  readonly packages: number;
};

export type OrderDistributionLabelProps = {
  /** En orden de alta: la primera es la que se pinta entera. */
  readonly lines: readonly OrderDistributionLabelLine[];
};

const EMPTY_TEXT = 'Sin presentación';

function lineText(line: OrderDistributionLabelLine): string {
  return `${line.packages} × ${line.packagingName ?? line.presentationName ?? EMPTY_MARK}`;
}

export function OrderDistributionLabel({ lines }: OrderDistributionLabelProps) {
  const [first, ...rest] = lines;

  if (first === undefined) {
    return (
      <span data-testid="order-distribution" data-empty="true">
        {EMPTY_TEXT}
      </span>
    );
  }

  return (
    <span data-testid="order-distribution" title={lines.map(lineText).join(', ')}>
      {lineText(first)}
      {rest.length > 0 ? ` +${rest.length}` : null}
    </span>
  );
}
