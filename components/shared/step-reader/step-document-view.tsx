'use client';

import { Fragment, type ReactNode } from 'react';

import { Checkbox } from '@/components/ui/checkbox';
import type { RecipeStepDocument, RecipeStepSpan } from '@/lib/modules/recetas';

/**
 * Render de UN documento de paso del contrato de `recetas` (QC-62), en modo LECTURA
 * (`design.md > 5`, R14, R16).
 *
 * **Nada de `dangerouslySetInnerHTML`**: se recorre el documento tipado bloque a bloque. Es una
 * de las razones por las que QC-62 no guardo HTML — lo que no se puede representar recorriendo
 * la estructura, sencillamente no existe.
 *
 * El componente **no tiene estado**: quien sabe que hay marcado es `StepReader`, que lleva la
 * clave `${paso}:${bloque}:${item}` en memoria (R19). Aqui solo se pregunta y se avisa.
 */

/** Objetivo tactil minimo (R26). Misma clase que ya usa el resto del repo. */
const TOUCH_TARGET = 'min-h-11 min-w-11';

export type StepDocumentViewProps = {
  readonly document: RecipeStepDocument;
  readonly isItemChecked: (blockIndex: number, itemIndex: number) => boolean;
  readonly onToggleItem: (blockIndex: number, itemIndex: number, checked: boolean) => void;
  /** Prefijo estable para los `id` de las etiquetas de cada item (`aria-labelledby`). */
  readonly idPrefix: string;
};

/**
 * Un fragmento con sus marcas. Negrilla y cursiva son **combinables** sobre el mismo fragmento
 * (QC-62 R3), asi que se anidan en vez de elegir una.
 */
function renderSpan(span: RecipeStepSpan, index: number): ReactNode {
  let node: ReactNode = span.text;
  if (span.italic === true) {
    node = <em>{node}</em>;
  }
  if (span.bold === true) {
    node = <strong>{node}</strong>;
  }
  return <Fragment key={index}>{node}</Fragment>;
}

function renderSpans(spans: readonly RecipeStepSpan[]): ReactNode {
  return spans.map((span, index) => renderSpan(span, index));
}

export function StepDocumentView({
  document,
  isItemChecked,
  onToggleItem,
  idPrefix,
}: StepDocumentViewProps) {
  return (
    <div data-testid="step-reader-document" className="flex flex-col gap-3 text-base">
      {document.blocks.map((block, blockIndex) => {
        if (block.kind === 'paragraph') {
          return (
            <p
              key={blockIndex}
              data-testid={`step-reader-paragraph-${blockIndex}`}
              // `min-h-6`: el parrafo SIN fragmentos es la linea en blanco de QC-62 R2, y una
              // linea en blanco sin altura no se ve.
              className="min-h-6 text-base whitespace-pre-wrap"
            >
              {renderSpans(block.spans)}
            </p>
          );
        }

        return (
          <ul
            key={blockIndex}
            data-testid={`step-reader-checklist-${blockIndex}`}
            className="flex flex-col gap-1"
          >
            {block.items.map((item, itemIndex) => {
              const labelId = `${idPrefix}-item-${blockIndex}-${itemIndex}`;
              return (
                <li key={itemIndex}>
                  <label
                    data-testid={`step-reader-item-label-${blockIndex}-${itemIndex}`}
                    className={`flex ${TOUCH_TARGET} cursor-pointer items-center gap-3 text-base`}
                  >
                    <Checkbox
                      data-testid={`step-reader-item-${blockIndex}-${itemIndex}`}
                      className={`${TOUCH_TARGET} shrink-0`}
                      aria-labelledby={labelId}
                      checked={isItemChecked(blockIndex, itemIndex)}
                      onCheckedChange={(checked: boolean) => {
                        onToggleItem(blockIndex, itemIndex, checked);
                      }}
                    />
                    <span id={labelId}>{renderSpans(item.spans)}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        );
      })}
    </div>
  );
}
