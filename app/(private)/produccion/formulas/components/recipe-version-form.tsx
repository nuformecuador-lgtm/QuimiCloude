'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

// El barrel de step-reader solo expone el asistente paso a paso, y esa carpeta no se puede tocar
// desde esta ficha; aqui hace falta la vista sin estado del documento.
import { StepDocumentView } from '@/components/shared/step-reader/step-document-view';
import { ErrorAlert } from '@/components/shared/error-alert';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ErrorCode, ErrorState } from '@/lib/modules/errores';
import {
  createRecipeVersionSchema,
  sumPercentages,
  updateRecipeVersionSchema,
  type RecipeDetail,
  type RecipeLineView,
  type RecipeToolView,
} from '@/lib/modules/recetas';
import {
  createRecipeVersionAction,
  updateRecipeVersionAction,
} from '@/lib/modules/recetas/adapters/driving/recipe-actions';
import type { UnitRef } from '@/lib/modules/unidades';
import { recipeEditRoute } from '@/lib/shared/routes';
import { touchTarget } from '@/lib/shared/ui/touch-target';
import { cn } from '@/lib/utils';

import type { RecipeFormProductPage } from './recipe-form';
import { RECIPE_TOOL_ERROR_MESSAGES, RecipeLinesField } from './recipe-lines-field';
import {
  buildRecipeVersionPayload,
  extractFieldError,
  extractGeneralLinesError,
  extractGeneralToolsError,
  extractLineErrors,
  extractToolErrors,
  toLineFormValues,
  toToolFormValues,
  type RecipeLineErrors,
  type RecipeToolErrors,
  type RecipeVersionFormState,
} from './recipe-form-state';

const FIELD_TEXT = 'text-base';

const SAVE_SUCCESS_CREATE = 'Versión creada.';
const SAVE_SUCCESS_EDIT = 'Versión actualizada.';
const INVALID_INPUT_CODE = 'invalid_input' satisfies ErrorCode;
const INVALID_INPUT_MESSAGE = 'Revisa los campos marcados.';

export type RecipeVersionFormOriginal = {
  readonly id: string;
  readonly name: string;
  readonly lines: readonly RecipeLineView[];
  readonly tools: readonly RecipeToolView[];
};

type CommonProps = {
  readonly original: RecipeVersionFormOriginal;
  readonly units: readonly UnitRef[];
  readonly initialProductPage: RecipeFormProductPage;
  readonly initialMachinePage: RecipeFormProductPage;
};

export type RecipeVersionFormProps =
  | (CommonProps & { readonly mode: 'create' })
  | (CommonProps & { readonly mode: 'edit'; readonly version: RecipeDetail });

type FieldErrors = {
  readonly name?: string;
  readonly lines?: RecipeLineErrors;
  readonly linesGeneral?: string;
  readonly tools?: RecipeToolErrors;
  readonly toolsGeneral?: string;
};

function buildInitialState(props: RecipeVersionFormProps): RecipeVersionFormState {
  if (props.mode === 'create') {
    return {
      name: '',
      lines: toLineFormValues(props.original.lines),
      tools: toToolFormValues(props.original.tools),
    };
  }
  return {
    name: props.version.name,
    lines: toLineFormValues(props.version.lines),
    tools: toToolFormValues(props.version.tools),
  };
}

function noop(): void {}

function InheritedFromOriginal({ version }: { readonly version: RecipeDetail }) {
  return (
    <section
      aria-labelledby="recipe-version-inherited-heading"
      data-testid="recipe-version-inherited"
      className="flex flex-col gap-3"
    >
      <h2 id="recipe-version-inherited-heading" className="text-base font-semibold">
        De la receta original
      </h2>

      {version.imageUrl === null ? null : (
        // Mismo motivo que `EntityImage`: el dominio del almacenamiento no esta en `next.config.ts`.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={version.imageUrl}
          alt={version.original?.name ?? version.name}
          loading="lazy"
          decoding="async"
          className="aspect-square w-full max-w-48 rounded-xl border object-cover"
          data-testid="recipe-version-inherited-image"
        />
      )}

      {version.description === null ? null : (
        <p className="text-base whitespace-pre-wrap" data-testid="recipe-version-inherited-description">
          {version.description}
        </p>
      )}

      {version.steps.length === 0 ? (
        <p className="text-sm text-muted-foreground" data-testid="recipe-version-steps-empty">
          La receta original no tiene pasos.
        </p>
      ) : (
        // `inert` deja las casillas fuera del foco y del puntero; la vista no guarda marcado.
        <div inert aria-readonly="true" data-testid="recipe-version-inherited-steps">
          <ol className="flex flex-col gap-4">
            {version.steps.map((step, index) => (
              <li key={index} className="flex flex-col gap-2">
                <span className="text-sm font-medium">Paso {index + 1}</span>
                <StepDocumentView
                  document={step}
                  isItemChecked={() => false}
                  onToggleItem={noop}
                  idPrefix={`recipe-version-step-${index}`}
                />
              </li>
            ))}
          </ol>
        </div>
      )}

      {version.packingSteps.length === 0 ? (
        <p className="text-sm text-muted-foreground" data-testid="recipe-version-packing-steps-empty">
          La receta original no tiene pasos de envasado.
        </p>
      ) : (
        <div
          inert
          aria-readonly="true"
          data-testid="recipe-version-inherited-packing-steps"
          className="flex flex-col gap-2"
        >
          <h3 className="text-sm font-semibold">Pasos de envasado</h3>
          <ol className="flex flex-col gap-4">
            {version.packingSteps.map((step, index) => (
              <li key={index} className="flex flex-col gap-2">
                <span className="text-sm font-medium">Paso {index + 1}</span>
                <StepDocumentView
                  document={step}
                  isItemChecked={() => false}
                  onToggleItem={noop}
                  idPrefix={`recipe-version-packing-step-${index}`}
                />
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}

export function RecipeVersionForm(props: RecipeVersionFormProps) {
  const router = useRouter();
  const [state, setState] = useState<RecipeVersionFormState>(() => buildInitialState(props));
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [saveError, setSaveError] = useState<ErrorState | null>(null);
  const [isPending, startTransition] = useTransition();

  const originalRoute = recipeEditRoute(props.original.id);

  const isComplete = sumPercentages(
    state.lines.map((line) => line.percentage.replace(',', '.')),
  ).isComplete;
  const hasAllProducts =
    state.lines.length > 0 && state.lines.every((line) => line.productId !== '');
  const canSubmit = isComplete && hasAllProducts;

  function handleSubmit() {
    setSaveError(null);

    // Enter tambien envia el formulario: `disabled` en el boton no basta.
    if (!canSubmit) return;

    const payload = buildRecipeVersionPayload(state);
    const schema = props.mode === 'edit' ? updateRecipeVersionSchema : createRecipeVersionSchema;
    const parsed = schema.safeParse(payload);

    if (!parsed.success) {
      const issues = parsed.error.issues;
      setFieldErrors({
        name: extractFieldError(issues, 'name'),
        lines: extractLineErrors(issues),
        linesGeneral: extractGeneralLinesError(issues),
        tools: extractToolErrors(issues, RECIPE_TOOL_ERROR_MESSAGES),
        toolsGeneral: extractGeneralToolsError(issues),
      });
      setSaveError({ status: 'error', code: INVALID_INPUT_CODE, message: INVALID_INPUT_MESSAGE });
      return;
    }

    setFieldErrors({});

    startTransition(async () => {
      const result =
        props.mode === 'edit'
          ? await updateRecipeVersionAction(props.version.id, payload)
          : await createRecipeVersionAction(props.original.id, payload);

      if (result.status === 'error') {
        if (result.code === 'recipe_duplicate_name') {
          setFieldErrors((previous) => ({ ...previous, name: result.message }));
          return;
        }
        setSaveError(result);
        return;
      }

      toast.success(props.mode === 'edit' ? SAVE_SUCCESS_EDIT : SAVE_SUCCESS_CREATE);
      router.push(originalRoute);
      router.refresh();
    });
  }

  return (
    <form
      data-testid="recipe-version-form"
      className="flex flex-col gap-6"
      onSubmit={(event) => {
        event.preventDefault();
        handleSubmit();
      }}
    >
      {props.mode === 'edit' && props.version.isUnderReview ? (
        <Badge variant="outline" className="self-start" data-testid="recipe-version-form-under-review">
          Por revisar
        </Badge>
      ) : null}

      {saveError === null ? null : (
        <ErrorAlert
          error={saveError}
          className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive"
          testId="recipe-version-form-error"
          renderCatalogued={(catalogued) => (
            <>
              <p data-testid="recipe-version-form-error-message">{catalogued.message}</p>
              <p className="text-xs" data-testid="recipe-version-form-error-code">
                {catalogued.code}
              </p>
            </>
          )}
        />
      )}

      <div className="flex flex-col gap-1">
        <Label htmlFor="recipe-version-field-name-input">Nombre</Label>
        <Input
          id="recipe-version-field-name-input"
          type="text"
          value={state.name}
          onChange={(event) => setState((previous) => ({ ...previous, name: event.target.value }))}
          className={`${touchTarget} ${FIELD_TEXT}`}
          aria-invalid={fieldErrors.name === undefined ? undefined : true}
          aria-describedby={fieldErrors.name === undefined ? undefined : 'recipe-version-error-name'}
          data-testid="recipe-version-field-name"
        />
        {fieldErrors.name === undefined ? null : (
          <p
            id="recipe-version-error-name"
            className="text-sm text-destructive"
            data-testid="recipe-version-error-name"
          >
            {fieldErrors.name}
          </p>
        )}
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
        baseline={props.original.lines}
      />

      {props.mode === 'edit' ? <InheritedFromOriginal version={props.version} /> : null}

      <div className="flex justify-end gap-2">
        <Link
          href={originalRoute}
          data-slot="button"
          data-testid="recipe-version-form-cancel"
          className={cn(buttonVariants({ variant: 'outline', touch: true }))}
        >
          Cancelar
        </Link>
        <Button
          type="submit"
          touch
          disabled={isPending || !canSubmit}
          aria-busy={isPending}
          data-testid="recipe-version-form-submit"
        >
          {isPending ? 'Guardando…' : 'Guardar'}
        </Button>
      </div>
    </form>
  );
}
