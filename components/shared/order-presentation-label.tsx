/**
 * Marca compartida de la presentación de un pedido: pinta el nombre o «Sin presentación».
 *
 * **Vive en `components/shared/` porque la usan DOS rutas** (`/pedidos` y `/asignacion`) con la
 * misma API, que es la condición de `docs/architecture.md > Regla: sin sobre-ingeniería`.
 *
 * **No reutiliza el `MissingValue` de esas rutas**: ese marcador («—») dice «no se pudo cargar»;
 * aquí «Sin presentación» es un dato del pedido -un pedido puede legítimamente no tener una-, así
 * que necesita su propio texto.
 */

export type OrderPresentationLabelProps = {
  readonly name: string | null;
};

const MISSING_TEXT = 'Sin presentación';

export function OrderPresentationLabel({ name }: OrderPresentationLabelProps) {
  const isMissing = name === null;

  return (
    <span data-testid="order-presentation" data-missing={isMissing ? 'true' : undefined}>
      {isMissing ? MISSING_TEXT : name}
    </span>
  );
}
