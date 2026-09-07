'use client';

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVerticalIcon } from 'lucide-react';
import { useId } from 'react';

import { Button } from '@/components/ui/button';
import type { RecipeStepDocument } from '@/lib/modules/recetas';

import { createLocalKey, type RecipeStepErrors, type RecipeStepFormValue } from './recipe-form-state';
import { RecipeStepEditor } from './recipe-step-editor';

/**
 * Campo de pasos, con arrastre y equivalente por teclado (T17, R32-R34; `design.md > 7`, `> 10`).
 *
 * **ÚNICO archivo de toda la feature que importa `@dnd-kit/*`** (excepción aprobada, R45): la
 * salida a `@atlaskit/pragmatic-drag-and-drop` -si el riesgo del check 2 se materializa- se
 * limita a reescribir este archivo. Una guardia de fuente confirma que ningún otro lo importa.
 *
 * **`KeyboardSensor` con `sortableKeyboardCoordinates`** (R34): con `Tab` se alcanza el asa, con
 * `Espacio` se toma el paso, con las flechas se mueve y con `Espacio` se suelta -MISMO
 * `onDragEnd` que el arrastre con ratón-. **`PointerSensor` con `activationConstraint: {distance:
 * 8}`** (R50) para que un toque que solo quiere hacer scroll no dispare el arrastre en móvil.
 *
 * **El asa es un `<button>` real** con nombre accesible que incluye la posición actual
 * (`Arrastrar el paso 2 de 4`), **≥ 44×44 px y SIEMPRE visible** -nada detrás de `:hover`, que en
 * táctil no existe (R50)-. Los `announcements` de `DndContext` anuncian el cambio de posición a
 * la tecnología de asistencia (R34).
 *
 * **QC-64 T7 (R1, R24)**: el campo de cada paso ya no es un `<Input>` de texto plano, es
 * `RecipeStepEditor` -el editor enriquecido de esquema cerrado-, y el estado del paso es EL
 * DOCUMENTO del contrato. Del arrastre no se ha tocado nada: ni el asa, ni `useSortable`, ni los
 * sensores, ni `handleDragEnd`, ni los `announcements`. Los dos teclados NO se pisan porque los
 * `listeners` del `KeyboardSensor` viven SOLO en el `<button>` del asa: escribir dentro del área
 * editable no llega al sensor y no inicia ningún arrastre (`design.md > 8`).
 *
 * Este archivo NO importa la librería del editor (`design.md > 7`): monta el componente que la
 * aísla y habla con él en documentos del contrato.
 */

const TOUCH_TARGET = 'min-h-11 min-w-11';

/**
 * Documento de un paso RECIEN AÑADIDO: un solo parrafo SIN fragmentos (QC-64 R4). No es `{blocks:
 * []}` -un documento sin bloques no tiene donde escribir- ni `text: ''`, que ya no existe.
 *
 * Es una FUNCION y no una constante compartida a proposito: cada paso nuevo se lleva su propio
 * objeto, asi que editar uno no puede tocar el documento de otro por alias.
 */
function emptyStepDocument(): RecipeStepDocument {
  return { blocks: [{ kind: 'paragraph', spans: [] }] };
}

export type RecipeStepsFieldProps = {
  readonly steps: readonly RecipeStepFormValue[];
  readonly onChange: (steps: readonly RecipeStepFormValue[]) => void;
  readonly errors?: RecipeStepErrors;
};

/**
 * Anuncios de `aria-live` del cambio de posición (R34). `dnd-kit` solo entrega el `id` del paso
 * activo/objetivo -nunca su texto-, así que el mensaje habla de POSICIONES, no de contenido.
 */
function buildAnnouncements(steps: readonly RecipeStepFormValue[]): Announcements {
  const positionOf = (id: string | number): number =>
    steps.findIndex((step) => step.key === id) + 1;

  return {
    onDragStart({ active }) {
      return `Se tomó el paso en la posición ${positionOf(active.id)} de ${steps.length}.`;
    },
    onDragOver({ over }) {
      if (over === null) return undefined;
      return `El paso se movería a la posición ${positionOf(over.id)} de ${steps.length}.`;
    },
    onDragEnd({ active, over }) {
      if (over === null) {
        return `El arrastre se canceló. El paso sigue en la posición ${positionOf(active.id)}.`;
      }
      return `El paso se soltó en la posición ${positionOf(over.id)} de ${steps.length}.`;
    },
    onDragCancel({ active }) {
      return `Se canceló el arrastre. El paso sigue en la posición ${positionOf(active.id)}.`;
    },
  };
}

export function RecipeStepsField({ steps, onChange, errors }: RecipeStepsFieldProps) {
  const headingId = useId();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function addStep() {
    // El paso ya no tiene tipo (QC-62 R9) y tampoco es texto (QC-64 R1): un paso nuevo es un
    // DOCUMENTO VACIO VALIDO -un parrafo sin fragmentos-, que es lo que el editor monta como
    // documento en blanco y lo que `recipeStepSchema` acepta sin limpieza previa.
    onChange([...steps, { key: createLocalKey('step'), document: emptyStepDocument() }]);
  }

  function updateStep(index: number, patch: Partial<RecipeStepFormValue>) {
    onChange(steps.map((step, i) => (i === index ? { ...step, ...patch } : step)));
  }

  function removeStep(index: number) {
    onChange(steps.filter((_, i) => i !== index));
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over === null || active.id === over.id) return;
    const oldIndex = steps.findIndex((step) => step.key === active.id);
    const newIndex = steps.findIndex((step) => step.key === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    // MISMO `onDragEnd` para ratón y teclado (R34): dnd-kit dispara este manejador sea cual sea
    // el sensor que originó el arrastre.
    onChange(arrayMove([...steps], oldIndex, newIndex));
  }

  return (
    <section
      aria-labelledby={headingId}
      data-testid="recipe-steps-field"
      className="flex flex-col gap-3"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 id={headingId} className="text-lg font-medium">
          Pasos
        </h2>
        <Button type="button" className={TOUCH_TARGET} data-testid="recipe-step-add" onClick={addStep}>
          Añadir paso
        </Button>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        accessibility={{ announcements: buildAnnouncements(steps) }}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={steps.map((step) => step.key)} strategy={verticalListSortingStrategy}>
          <ol className="flex flex-col gap-2" data-testid="recipe-steps-list">
            {steps.map((step, index) => (
              <RecipeStepRow
                key={step.key}
                step={step}
                index={index}
                total={steps.length}
                error={errors?.[index]}
                onChangeDocument={(document) => updateStep(index, { document })}
                onRemove={() => removeStep(index)}
              />
            ))}
          </ol>
        </SortableContext>
      </DndContext>
    </section>
  );
}

type RecipeStepRowProps = {
  readonly step: RecipeStepFormValue;
  readonly index: number;
  readonly total: number;
  readonly error?: string;
  readonly onChangeDocument: (document: RecipeStepDocument) => void;
  readonly onRemove: () => void;
};

function RecipeStepRow({
  step,
  index,
  total,
  error,
  onChangeDocument,
  onRemove,
}: RecipeStepRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: step.key,
  });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const errorId = `recipe-step-error-${index}`;

  return (
    <li
      ref={setNodeRef}
      style={style}
      data-testid="recipe-step-row"
      className={`flex items-start gap-2 rounded-lg border p-2 ${isDragging ? 'opacity-70' : ''}`}
    >
      {/* Asa de arrastre: SIEMPRE visible, >= 44x44 px, y con nombre accesible que INCLUYE la posición (R34, R50). */}
      <button
        type="button"
        {...attributes}
        {...listeners}
        className={`${TOUCH_TARGET} flex shrink-0 touch-none items-center justify-center rounded-lg border bg-muted`}
        aria-label={`Arrastrar el paso en la posición ${index + 1} de ${total}`}
        data-testid={`recipe-step-handle-${index}`}
      >
        <GripVerticalIcon aria-hidden="true" />
      </button>

      <div className="flex flex-1 flex-col gap-1">
        {/* El NOMBRE ACCESIBLE del area editable sigue siendo «Paso N», el mismo que daba la
            etiqueta del campo de texto de QC-26. Ahora viaja por la prop `label` del editor, que
            lo pone como `aria-label` sobre el `contenteditable`, y no por una etiqueta con
            `htmlFor`: una etiqueta de formulario no puede asociarse a un `contenteditable` -que
            no es un control de formulario-, y renderizar las dos cosas daria DOS nombres
            accesibles para el mismo elemento.

            El `data-testid` del area editable se CONSERVA (`recipe-step-text-N`, R24): el E2E
            heredado de QC-26 escribe por ese testid y `fill()` funciona sobre `contenteditable`. */}
        <RecipeStepEditor
          document={step.document}
          onChange={onChangeDocument}
          label={`Paso ${index + 1}`}
          editableTestId={`recipe-step-text-${index}`}
          error={error}
          errorId={errorId}
        />
        {error === undefined ? null : (
          <p id={errorId} className="text-sm text-destructive" data-testid={`recipe-step-field-error-${index}`}>
            {error}
          </p>
        )}
      </div>

      <Button
        type="button"
        variant="ghost"
        className={TOUCH_TARGET}
        aria-label={`Quitar paso ${index + 1}`}
        data-testid={`recipe-step-remove-${index}`}
        onClick={onRemove}
      >
        Quitar
      </Button>
    </li>
  );
}
