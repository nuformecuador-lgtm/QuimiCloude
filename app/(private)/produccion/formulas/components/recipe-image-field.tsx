'use client';

import { useEffect, useId, useRef, useState, type ChangeEvent } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MAX_IMAGE_BYTES, validateRecipeImage } from '@/lib/modules/recetas';

import type { ImageFieldState, RecipeFormMode } from './recipe-form-state';

/**
 * Campo de imagen con sus tres estados (T18, R35-R38; `design.md > 8`).
 *
 * **El control de quitar NO se ofrece en el alta** (R36): `mode === 'create'` nunca renderiza el
 * botón de quitar, así que el estado `cleared` no se puede alcanzar desde este componente cuando
 * el formulario está en modo alta -es imposible por interfaz, no solo por validación-.
 *
 * **Vista previa con `createObjectURL`/`revokeObjectURL`** (R37): se revoca al elegir OTRO
 * archivo y al desmontarse el campo, para no filtrar memoria. En edición, mientras el estado siga
 * siendo `untouched`, la vista previa es `initialImageUrl` -la que entrega el detalle (R18)-, sin
 * crear ningún objeto URL para eso.
 *
 * **Rechazo previo con `validateRecipeImage` y `MAX_IMAGE_BYTES` del BARREL de `recetas`** (R38):
 * ambos son funciones/constantes puras del contrato público, así que el archivo demasiado grande o
 * con firma que no es JPEG/PNG/WebP se rechaza ANTES de invocar cualquier operación, con el
 * mensaje junto al campo.
 *
 * **Los bytes viajan como `new Uint8Array(await file.arrayBuffer())`** (`design.md > 8`): si al
 * cablear el formulario resultara que un `Uint8Array` no cruza la frontera de la Server Action,
 * el problema es de alcance -no se toca el esquema de QC-25- y se para y se avisa al leader.
 */

const TOUCH_TARGET = 'min-h-11 min-w-11';
const MAX_IMAGE_MB = MAX_IMAGE_BYTES / (1024 * 1024);
const TOO_LARGE_MESSAGE = `El archivo supera el tamaño máximo (${MAX_IMAGE_MB} MB).`;
const UNSUPPORTED_FORMAT_MESSAGE = 'Formato no admitido: usa JPEG, PNG o WebP.';
const ACCEPTED_TYPES = 'image/jpeg,image/png,image/webp';

export type RecipeImageFieldProps = {
  readonly mode: RecipeFormMode;
  /** `imageUrl` del detalle (R18). Solo tiene sentido en edición; ausente en el alta. */
  readonly initialImageUrl: string | null;
  readonly value: ImageFieldState;
  readonly onChange: (next: ImageFieldState) => void;
};

export function RecipeImageField({ mode, initialImageUrl, value, onChange }: RecipeImageFieldProps) {
  const inputId = useId();
  const errorId = `${inputId}-error`;
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  // Revoca el objeto URL vigente al desmontar el campo (R37): evita filtrar memoria.
  useEffect(() => {
    return () => {
      if (objectUrlRef.current !== null) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Permite volver a elegir el MISMO archivo dos veces seguidas (el navegador no dispara
    // `change` si el valor no cambia).
    event.target.value = '';
    if (file === undefined) return;

    const bytes = new Uint8Array(await file.arrayBuffer());
    const validation = validateRecipeImage(bytes);
    if (!validation.ok) {
      setError(validation.reason === 'too_large' ? TOO_LARGE_MESSAGE : UNSUPPORTED_FORMAT_MESSAGE);
      return;
    }
    setError(null);

    if (objectUrlRef.current !== null) URL.revokeObjectURL(objectUrlRef.current);
    const url = URL.createObjectURL(file);
    objectUrlRef.current = url;
    setPreviewUrl(url);

    onChange({ kind: 'replaced', bytes });
  }

  function handleClear() {
    if (objectUrlRef.current !== null) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setPreviewUrl(null);
    setError(null);
    onChange({ kind: 'cleared' });
  }

  const displayUrl =
    value.kind === 'replaced' ? previewUrl : value.kind === 'untouched' ? initialImageUrl : null;

  // El botón de quitar solo aparece en edición y solo si hay algo que quitar (R36).
  const canOfferClear = mode === 'edit' && value.kind !== 'cleared' && displayUrl !== null;

  return (
    <div className="flex flex-col gap-2" data-testid="recipe-image-field">
      <Label htmlFor={inputId}>Imagen</Label>

      {displayUrl === null ? (
        <span data-testid="recipe-image-preview-placeholder" className="text-sm text-muted-foreground">
          Sin imagen
        </span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- vista previa local o URL ya compuesta por el backend (R18), sin optimizacion propia
        <img
          src={displayUrl}
          alt=""
          className="h-24 w-24 rounded object-cover"
          data-testid="recipe-image-preview"
        />
      )}

      <Input
        id={inputId}
        type="file"
        accept={ACCEPTED_TYPES}
        className="min-h-11 text-base"
        aria-invalid={error === null ? undefined : true}
        aria-describedby={error === null ? undefined : errorId}
        data-testid="recipe-image-input"
        onChange={(event) => void handleFileChange(event)}
      />

      {error === null ? null : (
        <p id={errorId} role="alert" className="text-sm text-destructive" data-testid="recipe-image-error">
          {error}
        </p>
      )}

      {canOfferClear ? (
        <Button
          type="button"
          variant="outline"
          className={TOUCH_TARGET}
          data-testid="recipe-image-clear"
          onClick={handleClear}
        >
          Quitar imagen
        </Button>
      ) : null}
    </div>
  );
}
