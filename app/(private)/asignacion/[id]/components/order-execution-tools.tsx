import type { ExecutionToolView } from '@/lib/modules/asignaciones';

export const ORDER_EXECUTION_TOOLS_TESTID = 'order-execution-tools';
export const ORDER_EXECUTION_TOOL_TESTID = 'order-execution-tool';
export const ORDER_EXECUTION_TOOL_QUANTITY_TESTID = 'order-execution-tool-quantity';
export const TOOL_NAME_FALLBACK = 'Herramienta no disponible';

const TOOLS_HEADING = 'Herramientas';

export type OrderExecutionToolsProps = {
  readonly tools: readonly ExecutionToolView[];
};

/**
 * Herramientas de la receta, solo lectura. La cantidad es la de la receta: no se escala con la
 * del pedido. Sin herramientas no se monta nada, ni siquiera el título.
 */
export function OrderExecutionTools({ tools }: OrderExecutionToolsProps) {
  if (tools.length === 0) return null;

  return (
    <section
      aria-labelledby={`${ORDER_EXECUTION_TOOLS_TESTID}-heading`}
      data-testid={ORDER_EXECUTION_TOOLS_TESTID}
      className="flex flex-col gap-2"
    >
      <h2 id={`${ORDER_EXECUTION_TOOLS_TESTID}-heading`} className="text-lg font-medium">
        {TOOLS_HEADING}
      </h2>
      <ul className="flex flex-col divide-y">
        {tools.map((tool, index) => (
          <li
            key={index}
            data-testid={`${ORDER_EXECUTION_TOOL_TESTID}-${index}`}
            className="flex flex-wrap items-center gap-3 py-2"
          >
            <span className="min-w-0 flex-1 text-base">{tool.productName ?? TOOL_NAME_FALLBACK}</span>
            <span aria-hidden="true" className="text-base text-muted-foreground">
              {' · '}
            </span>
            <span
              data-testid={`${ORDER_EXECUTION_TOOL_QUANTITY_TESTID}-${index}`}
              className="text-base font-medium"
            >
              {tool.quantity}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
