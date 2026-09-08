'use client';

import { MISSING_IMAGE_SRC } from '@/components/shared/entity-image';
import { FileField } from '@/components/shared/file-field';
import type { UploadableFileType } from '@/components/shared/file-types';
import { MAX_IMAGE_BYTES, validateRecipeImage } from '@/lib/modules/recetas';

import type { ImageFieldState, RecipeFormMode } from './recipe-form-state';

/**
 * Campo de imagen de la receta con sus tres estados (T18, R35-R38; `design.md > 8`).
 *
 * **La mecanica generica vive en `components/shared/file-field.tsx`** -`accept` tipado, vista
 * previa con `createObjectURL`/`revokeObjectURL`, rechazo por tamano/formato y COMPRESION de la
 * imagen que se pasa del limite-. Aqui queda solo lo que es de la receta: los tres estados de
 * `ImageFieldState`, la regla de R36 y la validacion del CONTRATO.
 *
 * **El control de quitar NO se ofrece en el alta** (R36): con `mode === 'create'`, `clearable`
 * es `false`, asi que el estado `cleared` no se puede alcanzar desde este componente cuando el
 * formulario esta en modo alta -es imposible por interfaz, no solo por validacion-.
 *
 * **Rechazo previo con `validateRecipeImage` y `MAX_IMAGE_BYTES` del BARREL de `recetas`** (R38):
 * ambos son funciones/constantes puras del contrato publico, y se aplican sobre los bytes
 * FINALES -los comprimidos, si hubo compresion-, asi que el archivo demasiado grande o con firma
 * que no es JPEG/PNG/WebP se rechaza ANTES de invocar cualquier operacion, con el mensaje junto
 * al campo.
 *
 * **Los bytes viajan como `Uint8Array`** (`design.md > 8`): si al cablear el formulario resultara
 * que un `Uint8Array` no cruza la frontera de la Server Action, el problema es de alcance -no se
 * toca el esquema de QC-25- y se para y se avisa al leader.
 */

const MAX_IMAGE_MB = MAX_IMAGE_BYTES / (1024 * 1024);
const TOO_LARGE_MESSAGE = `El archivo supera el tamaño máximo (${MAX_IMAGE_MB} MB).`;
const UNSUPPORTED_FORMAT_MESSAGE = 'Formato no admitido: usa JPEG, PNG o WebP.';
const ACCEPTED_TYPES: readonly UploadableFileType[] = ['image/jpeg', 'image/png', 'image/webp'];

export type RecipeImageFieldProps = {
  readonly mode: RecipeFormMode;
  /** `imageUrl` del detalle (R18). Solo tiene sentido en edición; ausente en el alta. */
  readonly initialImageUrl: string | null;
  readonly value: ImageFieldState;
  readonly onChange: (next: ImageFieldState) => void;
};

export function RecipeImageField({ mode, initialImageUrl, value, onChange }: RecipeImageFieldProps) {
  return (
    <FileField
      label="Imagen"
      // La zona de arrastre ya se explica sola; la etiqueta se queda solo para el lector de pantalla.
      hideLabel
      accept={ACCEPTED_TYPES}
      maxBytes={MAX_IMAGE_BYTES}
      testIdPrefix="recipe-image"
      placeholder="Arrastra la imagen aquí o haz clic para elegirla"
      /*
        El mismo marcador que las tablas de inventario y del catalogo de un proveedor
        (`MISSING_IMAGE_SRC`, 2026-09-07): mientras la receta no tenga imagen, el campo ensena esa
        imagen en vez del icono de subida, y la aplicacion entera dice «aqui no hay imagen» de una
        sola manera.
      */
      emptyImageSrc={MISSING_IMAGE_SRC}
      clearLabel="Quitar imagen"
      // R36: en el alta no hay nada que quitar; y ya vaciada, tampoco.
      clearable={mode === 'edit' && value.kind !== 'cleared'}
      onClear={() => onChange({ kind: 'cleared' })}
      // Mientras el estado siga siendo `untouched`, la vista previa es la que entrega el detalle
      // (R18): no se crea ningún objeto URL para eso.
      previewUrl={value.kind === 'untouched' ? initialImageUrl : null}
      validateBytes={(bytes) => {
        const validation = validateRecipeImage(bytes);
        if (validation.ok) return { ok: true };
        return {
          ok: false,
          message:
            validation.reason === 'too_large' ? TOO_LARGE_MESSAGE : UNSUPPORTED_FORMAT_MESSAGE,
        };
      }}
      onSelect={({ bytes }) => onChange({ kind: 'replaced', bytes })}
    />
  );
}
