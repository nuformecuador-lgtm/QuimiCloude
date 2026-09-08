'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { StepReader } from '@/components/shared/step-reader';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { createRecipeSchema, updateRecipeSchema, type RecipeDetail } from '@/lib/modules/recetas';
import {
  createRecipeAction,
  updateRecipeAction,
} from '@/lib/modules/recetas/adapters/driving/recipe-actions';
import type { UnitRef } from '@/lib/modules/unidades';
import { FORMULAS_ROUTE } from '@/lib/shared/routes';
import { cn } from '@/lib/utils';

import type { ProductPickerOption } from './product-picker';
import { RecipeImageField } from './recipe-image-field';
import { RecipeLinesField } from './recipe-lines-field';
import { RecipeStepsField } from './recipe-steps-field';
import {
  buildRecipePayload,
  createLocalKey,
  extractFieldError,
  extractGeneralLinesError,
  extractLineErrors,
  extractStepErrors,
  type RecipeFormState,
  type RecipeLineErrors,
  type RecipeLineFormValue,
  type RecipeStepErrors,
  type RecipeStepFormValue,
} from './recipe-form-state';

/**
 * El formulario y sus dos modos (T19, R20-R26, R37, `design.md > 5`).
 *
 * **NO usa `useActionState`, y el motivo es del CONTRATO, no de gusto** (`design.md > 5`,
 * alternativa B descartada frente al patrón de `product-form.tsx` de `inventario`):
 * `createRecipeAction(input)` y `updateRecipeAction(id, input)` NO reciben `prevState` -así que no
 * encajan en la firma que `useActionState` exige- y reciben un OBJETO TIPADO con listas
 * anidadas, no `FormData` -así que no hay `<form action={fn}>` que las produzca-. Este componente
 * mantiene su propio estado controlado en React (`recipe-form-state.ts`) y envía dentro de
 * `useTransition`; `isPending` deshabilita el botón de envío mientras la operación está en curso
 * (R37).
 *
 * **Validación previa con los esquemas del CONTRATO** (`createRecipeSchema`/`updateRecipeSchema`
 * del barrel de `recetas`, R26): se ejecutan con `safeParse` ANTES de invocar la operación, sobre
 * el payload que arma `buildRecipePayload` -nunca sobre el estado crudo-, y sus mensajes -nunca
 * reescritos aquí- alimentan los errores por campo, por línea (R31) y por paso. El servidor
 * revalida igual: el cliente nunca es la frontera.
 *
 * **Errores de la operación (R23)**: `duplicate_name` va junto al campo nombre; `not_found` se
 * presenta con un enlace a la lista; cualquier otro código (`invalid_input`, `unauthorized`, …) va
 * en la región `role="alert"` del formulario. Ninguno navega fuera del formulario ni pierde lo que
 * el usuario había escrito.
 *
 * **Éxito (R24)**: navega a la lista, `toast.success(...)` -con el `<Toaster/>` que el layout
 * privado YA monta, nunca uno propio (R25)- y `router.refresh()` para que la lista salga puesta al
 * día sin que el usuario tenga que recargar.
 */

const TOUCH_TARGET = 'min-h-11 min-w-11';
const FIELD_TEXT = 'text-base';

const PREVIEW_OPEN_LABEL = 'Vista previa';
const PREVIEW_TITLE = 'Vista previa';
const PREVIEW_DESCRIPTION =
  'Asi se leera esta receta, paso a paso. Nada de lo que hagas aqui se guarda.';

const SAVE_SUCCESS_CREATE = 'Receta creada.';
const SAVE_SUCCESS_EDIT = 'Receta actualizada.';
const INVALID_INPUT_MESSAGE = 'Revisa los campos marcados.';

export type RecipeFormProductPage = {
  readonly items: readonly ProductPickerOption[];
  readonly totalPages: number;
};

export type RecipeFormProps =
  | {
      readonly mode: 'create';
      readonly units: readonly UnitRef[];
      readonly initialProductPage: RecipeFormProductPage;
    }
  | {
      readonly mode: 'edit';
      readonly recipe: RecipeDetail;
      readonly units: readonly UnitRef[];
      readonly initialProductPage: RecipeFormProductPage;
    };

type FieldErrors = {
  readonly name?: string;
  readonly description?: string;
  readonly lines?: RecipeLineErrors;
  readonly linesGeneral?: string;
  readonly steps?: RecipeStepErrors;
};

type SaveError = { readonly code: string; readonly message: string };

function buildInitialState(props: RecipeFormProps): RecipeFormState {
  if (props.mode === 'create') {
    return { name: '', description: '', lines: [], steps: [], image: { kind: 'untouched' } };
  }

  const { recipe } = props;
  return {
    name: recipe.name,
    description: recipe.description ?? '',
    // R21: se conservan TAL CUAL, incluidas las líneas cuyo `productName` es `null` -producto
    // dado de baja-. `key` es una clave local de React, nunca el `id` de dominio de la línea.
    lines: recipe.lines.map(
      (line): RecipeLineFormValue => ({
        key: createLocalKey('line'),
        productId: line.productId,
        productName: line.productName,
        quantity: line.quantity,
        unitId: line.unitId,
        // El detalle de la receta trae la unidad de la LINEA, no la del producto: aqui no se
        // sabe de que grupo es el ingrediente, y `null` es exactamente eso -no un olvido-.
        // El selector de esa linea ofrece entonces el catalogo completo y no pisa `unitId`.
        productUnitId: null,
      }),
    ),
    // QC-64 R9: el paso guardado entra en el estado COMO DOCUMENTO, tal cual. Ya no se aplana a
    // texto -el puente de QC-62 R19 se retiro con T4-, asi que reabrir una receta conserva sus
    // marcas y sus listas de verificacion intactas. `key` es una clave local de React.
    steps: recipe.steps.map(
      (step): RecipeStepFormValue => ({ key: createLocalKey('step'), document: step }),
    ),
    image: { kind: 'untouched' },
  };
}

export function RecipeForm(props: RecipeFormProps) {
  const router = useRouter();
  const [state, setState] = useState<RecipeFormState>(() => buildInitialState(props));
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [saveError, setSaveError] = useState<SaveError | null>(null);
  const [isPending, startTransition] = useTransition();
  // QC-64 R11-R13: la vista previa es SOLO estado de pantalla. Ni guarda, ni invoca ninguna
  // operacion del modulo, ni navega; abrirla y cerrarla no toca una sola letra del formulario.
  const [isPreviewOpen, setPreviewOpen] = useState(false);
  const previewTriggerRef = useRef<HTMLButtonElement>(null);

  const isEdit = props.mode === 'edit';

  function handleSubmit() {
    setSaveError(null);

    const payload = buildRecipePayload(props.mode, state);
    const schema = isEdit ? updateRecipeSchema : createRecipeSchema;
    const parsed = schema.safeParse(payload);

    if (!parsed.success) {
      const issues = parsed.error.issues;
      setFieldErrors({
        name: extractFieldError(issues, 'name'),
        description: extractFieldError(issues, 'description'),
        lines: extractLineErrors(issues),
        linesGeneral: extractGeneralLinesError(issues),
        steps: extractStepErrors(issues),
      });
      // R23: la validación previa rechazada tampoco invoca la operación, pero SÍ es un rechazo
      // que el usuario tiene que ver -no un silencio-, así que también alimenta la región de error
      // general con el código estable `invalid_input`, igual que si lo hubiera rechazado el
      // servidor.
      setSaveError({ code: 'invalid_input', message: INVALID_INPUT_MESSAGE });
      return;
    }

    setFieldErrors({});

    startTransition(async () => {
      const result =
        props.mode === 'edit'
          ? await updateRecipeAction(props.recipe.id, parsed.data)
          : await createRecipeAction(parsed.data);

      if (result.status === 'error') {
        if (result.code === 'duplicate_name') {
          // `duplicate_name` SÍ identifica un campo (R23): junto al nombre, no en la región general.
          setFieldErrors((previous) => ({ ...previous, name: result.message }));
          return;
        }
        setSaveError({ code: result.code, message: result.message });
        return;
      }

      toast.success(isEdit ? SAVE_SUCCESS_EDIT : SAVE_SUCCESS_CREATE);
      router.push(FORMULAS_ROUTE);
      router.refresh();
    });
  }

  return (
    <form
      data-testid="recipe-form"
      className="flex flex-col gap-6"
      onSubmit={(event) => {
        event.preventDefault();
        handleSubmit();
      }}
    >
      {saveError === null ? null : saveError.code === 'not_found' ? (
        <div role="alert" data-testid="recipe-form-not-found" className="rounded-lg border p-3 text-sm">
          <p data-testid="recipe-form-not-found-message">{saveError.message}</p>
          <Link href={FORMULAS_ROUTE} className="underline" data-testid="recipe-form-not-found-link">
            Volver a la lista
          </Link>
        </div>
      ) : (
        <div
          role="alert"
          className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive"
          data-testid="recipe-form-error"
        >
          <p data-testid="recipe-form-error-message">{saveError.message}</p>
          <p className="text-xs" data-testid="recipe-form-error-code">
            {saveError.code}
          </p>
        </div>
      )}

      {/* La imagen manda a la izquierda (3 de 12) y los datos de texto la acompanan (9). */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-12 sm:items-start">
        <div className="sm:col-span-3">
          <RecipeImageField
            mode={props.mode}
            initialImageUrl={props.mode === 'edit' ? props.recipe.imageUrl : null}
            value={state.image}
            onChange={(image) => setState((previous) => ({ ...previous, image }))}
          />
        </div>

        <div className="flex flex-col gap-4 sm:col-span-9">
          <div className="flex flex-col gap-1">
            <Label htmlFor="recipe-field-name-input">Nombre</Label>
            <Input
              id="recipe-field-name-input"
              type="text"
              value={state.name}
              onChange={(event) => setState((previous) => ({ ...previous, name: event.target.value }))}
              className={`${TOUCH_TARGET} ${FIELD_TEXT}`}
              aria-invalid={fieldErrors.name === undefined ? undefined : true}
              aria-describedby={fieldErrors.name === undefined ? undefined : 'recipe-error-name'}
              data-testid="recipe-field-name"
            />
            {fieldErrors.name === undefined ? null : (
              <p id="recipe-error-name" className="text-sm text-destructive" data-testid="recipe-error-name">
                {fieldErrors.name}
              </p>
            )}
        </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor="recipe-field-description-input">Descripción</Label>
            <Textarea
              id="recipe-field-description-input"
              rows={4}
              value={state.description}
              onChange={(event) =>
                setState((previous) => ({ ...previous, description: event.target.value }))
              }
              className={`${TOUCH_TARGET} ${FIELD_TEXT}`}
              aria-invalid={fieldErrors.description === undefined ? undefined : true}
              aria-describedby={fieldErrors.description === undefined ? undefined : 'recipe-error-description'}
              data-testid="recipe-field-description"
            />
            {fieldErrors.description === undefined ? null : (
              <p
                id="recipe-error-description"
                className="text-sm text-destructive"
                data-testid="recipe-error-description"
              >
                {fieldErrors.description}
              </p>
            )}
        </div>
        </div>
      </div>

      <RecipeLinesField
        lines={state.lines}
        onChange={(lines) => setState((previous) => ({ ...previous, lines }))}
        units={props.units}
        initialProductPage={props.initialProductPage}
        errors={fieldErrors.lines}
        generalError={fieldErrors.linesGeneral}
      />

      <RecipeStepsField
        steps={state.steps}
        onChange={(steps) => setState((previous) => ({ ...previous, steps }))}
        errors={fieldErrors.steps}
      />

      <div className="flex justify-end gap-2">
        {/* R11: se proyecta el estado ACTUAL del formulario -`state.steps.map(...)`-, no lo
            guardado; el asistente se monta solo mientras el modal esta abierto, asi que cerrarlo
            lo desmonta y se lleva su marcado con el (R13, R19, R22). */}
        <Dialog open={isPreviewOpen} onOpenChange={setPreviewOpen}>
          <DialogTrigger
            data-testid="recipe-form-preview-open"
            render={
              <Button
                type="button"
                variant="outline"
                ref={previewTriggerRef}
                className={TOUCH_TARGET}
              />
            }
          >
            {PREVIEW_OPEN_LABEL}
          </DialogTrigger>
          {/* R26: alto POR CONTENIDO con tope en `85dvh` y scroll interno; el alto de
              viewport completo esta prohibido -en movil la barra del navegador se come
              esa medida y el modal deja de caber-. */}
          <DialogContent
            data-testid="recipe-form-preview"
            className="flex max-h-[85dvh] flex-col gap-4 sm:max-w-lg"
            finalFocus={previewTriggerRef}
          >
            <DialogHeader>
              <DialogTitle>{PREVIEW_TITLE}</DialogTitle>
              <DialogDescription>{PREVIEW_DESCRIPTION}</DialogDescription>
            </DialogHeader>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {isPreviewOpen && (
                <StepReader
                  steps={state.steps.map((step) => step.document)}
                  onFinish={() => setPreviewOpen(false)}
                />
              )}
            </div>
          </DialogContent>
        </Dialog>
        <Link
          href={FORMULAS_ROUTE}
          data-slot="button"
          data-testid="recipe-form-cancel"
          className={cn(buttonVariants({ variant: 'outline' }), TOUCH_TARGET)}
        >
          Cancelar
        </Link>
        <Button
          type="submit"
          className={TOUCH_TARGET}
          disabled={isPending}
          aria-busy={isPending}
          data-testid="recipe-form-submit"
        >
          {isPending ? 'Guardando…' : 'Guardar'}
        </Button>
      </div>
    </form>
  );
}
