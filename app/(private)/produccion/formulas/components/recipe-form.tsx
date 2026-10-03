'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { StepReader } from '@/components/shared/step-reader';
import { UnexpectedErrorNotice } from '@/components/shared/unexpected-error-notice';
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
import { UNEXPECTED_ERROR_CODE, type ErrorCode, type ErrorState } from '@/lib/modules/errores';
import {
  createRecipeSchema,
  sumPercentages,
  updateRecipeSchema,
  type CreateRecipeInput,
  type RecipeDetail,
  type RecipeVersionSummary,
  type UpdateRecipeInput,
} from '@/lib/modules/recetas';
import {
  createRecipeAction,
  updateRecipeAction,
} from '@/lib/modules/recetas/adapters/driving/recipe-actions';
import type { UnitRef } from '@/lib/modules/unidades';
import { FORMULAS_ROUTE, recipeVersionRoute } from '@/lib/shared/routes';
import { cn } from '@/lib/utils';

import type { ProductPickerOption } from './product-picker';
import { PropagateVersionsDialog } from './propagate-versions-dialog';
import { RecipeImageField } from './recipe-image-field';
import { RECIPE_TOOL_ERROR_MESSAGES, RecipeLinesField } from './recipe-lines-field';
import { RecipeStepsField } from './recipe-steps-field';
import {
  buildRecipePayload,
  createLocalKey,
  extractFieldError,
  extractGeneralLinesError,
  extractGeneralToolsError,
  extractLineErrors,
  extractStepErrors,
  extractToolErrors,
  toLineFormValues,
  toToolFormValues,
  type RecipeFormState,
  type RecipeLineErrors,
  type RecipeStepErrors,
  type RecipeStepFormValue,
  type RecipeToolErrors,
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
 * **Errores de la operación (R23)**: `recipe_duplicate_name` va junto al campo nombre;
 * `recipe_not_found` se presenta con un enlace a la lista; cualquier otro código (`invalid_input`,
 * `unauthorized`, …) va en la región `role="alert"` del formulario. Ninguno navega fuera del
 * formulario ni pierde lo que el usuario había escrito.
 *
 * QC-70 (R20, R21, R32): los dos códigos que se comparan son los ABIERTOS por caso -los genéricos
 * `duplicate_name` y `not_found` ya no existen en el catálogo-, el código está tipado con
 * `ErrorCode` -un literal mal escrito no compila- y el texto que se pinta cuando el error viene de
 * la operación es SIEMPRE su `message`. Lo que el formulario valida por su cuenta no se toca
 * (R31): `INVALID_INPUT_MESSAGE` sigue siendo suyo; del catálogo sale solo el código.
 *
 * **Éxito (R24)**: navega a la lista, `toast.success(...)` -con el `<Toaster/>` que el layout
 * privado YA monta, nunca uno propio (R25)- y `router.refresh()` para que la lista salga puesta al
 * día sin que el usuario tenga que recargar.
 *
 * Si al propagar alguna versión queda por revisar, NO navega: se queda en la ficha y las nombra.
 */

const TOUCH_TARGET = 'min-h-11 min-w-11';
const FIELD_TEXT = 'text-base';

const PREVIEW_OPEN_LABEL = 'Vista previa';
const PREVIEW_TITLE = 'Vista previa';
const PREVIEW_DESCRIPTION =
  'Asi se leera esta receta, paso a paso. Nada de lo que hagas aqui se guarda.';

const SAVE_SUCCESS_CREATE = 'Receta creada.';
const SAVE_SUCCESS_EDIT = 'Receta actualizada.';
/**
 * QC-70 (R21): el código que el formulario FABRICA para su propio rechazo sale del catálogo
 * -`satisfies` conserva el literal y a la vez obliga a que siga estando en la lista cerrada-. El
 * mensaje NO: es la frase que el formulario escribe para su propia validación y R31 la congela.
 */
const INVALID_INPUT_CODE = 'invalid_input' satisfies ErrorCode;
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
      readonly initialMachinePage: RecipeFormProductPage;
    }
  | {
      readonly mode: 'edit';
      readonly recipe: RecipeDetail;
      readonly versions: readonly RecipeVersionSummary[];
      readonly units: readonly UnitRef[];
      readonly initialProductPage: RecipeFormProductPage;
      readonly initialMachinePage: RecipeFormProductPage;
    };

type FieldErrors = {
  readonly name?: string;
  readonly description?: string;
  readonly lines?: RecipeLineErrors;
  readonly linesGeneral?: string;
  readonly tools?: RecipeToolErrors;
  readonly toolsGeneral?: string;
  readonly steps?: RecipeStepErrors;
};

/**
 * El error general del formulario, ENTERO.
 *
 * **QC-71 (R17): era `{ code, message }` copiado a mano, y esa copia perdia el `reference` del
 * error inesperado.** Un `reference?: string` aqui reabriria el agujero por el otro lado -deja
 * construir un inesperado sin identificador-, asi que lo que se guarda es la union cerrada de
 * `lib/modules/errores` y el render estrecha por `code`.
 */
type SaveError = ErrorState;

type ValidatedPayload = CreateRecipeInput | UpdateRecipeInput;

type UnderReviewVersion = { readonly id: string; readonly name: string };

const UNDER_REVIEW_MESSAGE =
  'Estas versiones han quedado por revisar: sus líneas ya no suman 100 %.';

function buildInitialState(props: RecipeFormProps): RecipeFormState {
  if (props.mode === 'create') {
    return {
      name: '',
      description: '',
      lines: [],
      tools: [],
      steps: [],
      image: { kind: 'untouched' },
    };
  }

  const { recipe } = props;
  return {
    name: recipe.name,
    description: recipe.description ?? '',
    lines: toLineFormValues(recipe.lines),
    tools: toToolFormValues(recipe.tools),
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
  const [pendingPayload, setPendingPayload] = useState<ValidatedPayload | null>(null);
  const [underReview, setUnderReview] = useState<readonly UnderReviewVersion[]>([]);

  const isEdit = props.mode === 'edit';

  // Se recalcula en CADA render con la misma función que el indicador de suma y que el
  // esquema del contrato -nunca una copia local de la regla-, también con cero líneas. La
  // coma se sustituye por un punto igual que en `buildRecipePayload`: `sumPercentages` opera
  // sobre el formato del contrato.
  const isComplete = sumPercentages(
    state.lines.map((line) => line.percentage.replace(',', '.')),
  ).isComplete;

  // Cada línea necesita su ingrediente elegido: un 100 % sin producto no habilita el guardado.
  // El esquema del contrato lo rechazaría igual (`productId` uuid); esto es refuerzo de UX.
  const hasAllProducts =
    state.lines.length > 0 && state.lines.every((line) => line.productId !== '');
  const canSubmit = isComplete && hasAllProducts;

  function handleSubmit() {
    setSaveError(null);

    // Enter en un campo no se salta la comprobación -`disabled` en el botón no basta,
    // porque el formulario también se envía por teclado-. Se repite la MISMA función que ya
    // deshabilita el botón, no una regla nueva.
    if (!canSubmit) return;

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
        tools: extractToolErrors(issues, RECIPE_TOOL_ERROR_MESSAGES),
        toolsGeneral: extractGeneralToolsError(issues),
        steps: extractStepErrors(issues),
      });
      // R23: la validación previa rechazada tampoco invoca la operación, pero SÍ es un rechazo
      // que el usuario tiene que ver -no un silencio-, así que también alimenta la región de error
      // general con el código estable `invalid_input`, igual que si lo hubiera rechazado el
      // servidor.
      setSaveError({ status: 'error', code: INVALID_INPUT_CODE, message: INVALID_INPUT_MESSAGE });
      return;
    }

    setFieldErrors({});

    // Con versiones vivas no se guarda todavia: decide el aviso.
    if (props.mode === 'edit' && props.versions.length > 0) {
      setPendingPayload(parsed.data);
      return;
    }

    save(parsed.data, []);
  }

  function save(payload: ValidatedPayload, propagateToVersionIds: readonly string[]) {
    startTransition(async () => {
      const result =
        props.mode === 'edit'
          ? await updateRecipeAction(props.recipe.id, { ...payload, propagateToVersionIds })
          : await createRecipeAction(payload);

      if (result.status === 'error') {
        if (result.code === 'recipe_duplicate_name') {
          // `recipe_duplicate_name` SÍ identifica un campo (R23): junto al nombre, no en la región
          // general. Se pinta el `message` de la operación, nunca un texto propio (QC-70 R32).
          setFieldErrors((previous) => ({ ...previous, name: result.message }));
          return;
        }
        // El estado de la operacion, TAL CUAL: copiarlo campo a campo tiraba el identificador.
        setSaveError(result);
        return;
      }

      if (props.mode === 'edit' && 'propagated' in result) {
        const underReviewIds = new Set(
          result.propagated.filter((entry) => entry.isUnderReview).map((entry) => entry.versionId),
        );
        if (underReviewIds.size > 0) {
          // Se queda en la ficha: el usuario tiene que poder ir a revisar esas versiones.
          toast.success(SAVE_SUCCESS_EDIT);
          router.refresh();
          setUnderReview(
            props.versions
              .filter((version) => underReviewIds.has(version.id))
              .map((version) => ({ id: version.id, name: version.name })),
          );
          return;
        }
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
      {saveError === null ? null : saveError.code === 'recipe_not_found' ? (
        <div role="alert" data-testid="recipe-form-not-found" className="rounded-lg border p-3 text-sm">
          <p data-testid="recipe-form-not-found-message">{saveError.message}</p>
          <Link href={FORMULAS_ROUTE} className="underline" data-testid="recipe-form-not-found-link">
            Volver a la lista
          </Link>
        </div>
      ) : (
        // QC-71 (R17, R18): el error INESPERADO lo pinta el componente compartido, que anade el
        // identificador de la peticion. El CATALOGADO se pinta como siempre y sin identificador.
        <div
          role="alert"
          className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive"
          data-testid="recipe-form-error"
        >
          {saveError.code === UNEXPECTED_ERROR_CODE ? (
            <UnexpectedErrorNotice state={saveError} />
          ) : (
            <>
              <p data-testid="recipe-form-error-message">{saveError.message}</p>
              <p className="text-xs" data-testid="recipe-form-error-code">
                {saveError.code}
              </p>
            </>
          )}
        </div>
      )}

      {props.mode === 'edit' && underReview.length > 0 ? (
        <div
          role="status"
          className="flex flex-col gap-2 rounded-lg border p-3 text-sm"
          data-testid="recipe-form-under-review"
        >
          <p>{UNDER_REVIEW_MESSAGE}</p>
          <ul className="flex flex-col">
            {underReview.map((version) => (
              <li key={version.id}>
                <Link
                  href={recipeVersionRoute(props.recipe.id, version.id)}
                  className={cn('inline-flex items-center underline', TOUCH_TARGET)}
                  data-testid="recipe-form-under-review-link"
                >
                  {version.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

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
        tools={state.tools}
        onToolsChange={(tools) => setState((previous) => ({ ...previous, tools }))}
        units={props.units}
        initialProductPage={props.initialProductPage}
        initialMachinePage={props.initialMachinePage}
        errors={fieldErrors.lines}
        generalError={fieldErrors.linesGeneral}
        toolErrors={fieldErrors.tools}
        toolsGeneralError={fieldErrors.toolsGeneral}
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
          disabled={isPending || !canSubmit}
          aria-busy={isPending}
          data-testid="recipe-form-submit"
        >
          {isPending ? 'Guardando…' : 'Guardar'}
        </Button>
      </div>

      {props.mode === 'edit' && props.versions.length > 0 ? (
        <PropagateVersionsDialog
          open={pendingPayload !== null}
          versions={props.versions}
          onOpenChange={(open) => {
            if (!open) setPendingPayload(null);
          }}
          onSave={(propagateToVersionIds) => {
            if (pendingPayload === null) return;
            setPendingPayload(null);
            save(pendingPayload, propagateToVersionIds);
          }}
        />
      ) : null}
    </form>
  );
}
