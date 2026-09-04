'use client';

// components/shared/file-field.tsx
//
// Campo de carga de archivos COMPARTIDO: el consumidor delimita los tipos admitidos pasando un
// array de `UploadableFileType` (`file-types.ts`) -una union de `type`, no `string`-, y el campo
// se encarga del `accept` del input, de la vista previa, del rechazo por tamano/formato y de la
// COMPRESION de las imagenes que se pasan del limite (`compress-image.ts`).
//
// **Compatible con el formulario controlado** (`recipe-form.tsx` y los que sigan ese patron):
// no envia nada por su cuenta ni depende de `FormData` -las Server Actions de este repo reciben
// objetos tipados, no `FormData`-. Entrega `onSelect({ file, bytes, type, compressed })` con los
// bytes YA comprimidos y validados, que es justo lo que el payload necesita; quien decide que
// hacer con ellos es el formulario.
//
// **La compresion es SOLO para imagenes**: un PDF o un CSV que se pasa del limite se rechaza,
// no se reencodea. Y una imagen que ya cabe no se toca (`compressed: false`), para no degradarla
// sin motivo.
//
// **La validacion de dominio no vive aqui**: `validateBytes` deja que el consumidor imponga lo
// suyo -la deteccion por FIRMA de `validateRecipeImage`, por ejemplo- sobre los bytes finales.

import { useEffect, useId, useRef, useState, type ChangeEvent } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { compressImage } from './compress-image';
import {
  describeAcceptedTypes,
  formatMegabytes,
  isAcceptedType,
  isImageType,
  toAcceptAttribute,
  type UploadableFileType,
} from './file-types';

/** Lo que el campo entrega al formulario cuando el archivo pasa todos los filtros. */
export type FileFieldSelection = {
  readonly file: File;
  readonly bytes: Uint8Array;
  readonly type: UploadableFileType;
  /** `true` si hubo que reescalar/reencodear para bajar del limite. */
  readonly compressed: boolean;
};

/** Veredicto del consumidor sobre los bytes finales. */
export type FileFieldValidation =
  | { readonly ok: true }
  | { readonly ok: false; readonly message: string };

export type FileFieldProps = {
  readonly label: string;
  /** Tipos admitidos. Delimita el `accept` del input Y el formato de salida del compresor. */
  readonly accept: readonly UploadableFileType[];
  /** Limite duro en bytes. Las imagenes por encima se comprimen; el resto se rechaza. */
  readonly maxBytes: number;
  /** Lado mayor maximo tras el reescalado (solo imagenes). */
  readonly maxDimension?: number;
  readonly onSelect: (selection: FileFieldSelection) => void;
  /** Si se pasa, se ofrece el boton de quitar cuando hay algo que quitar y `clearable`. */
  readonly onClear?: () => void;
  readonly clearable?: boolean;
  readonly clearLabel?: string;
  /** Vista previa que aporta el consumidor (una URL ya existente). La local tiene prioridad. */
  readonly previewUrl?: string | null;
  readonly placeholder?: string;
  /** Validacion de dominio sobre los bytes finales (firma, cabeceras...). */
  readonly validateBytes?: (bytes: Uint8Array, type: UploadableFileType) => FileFieldValidation;
  /** Prefijo de los `data-testid`: `<prefijo>-field`, `-input`, `-error`, `-preview`, `-clear`. */
  readonly testIdPrefix: string;
};

const TOUCH_TARGET = 'min-h-11 min-w-11';

export function FileField({
  label,
  accept,
  maxBytes,
  maxDimension,
  onSelect,
  onClear,
  clearable = false,
  clearLabel = 'Quitar archivo',
  previewUrl = null,
  placeholder = 'Sin archivo',
  validateBytes,
  testIdPrefix,
}: FileFieldProps) {
  const inputId = useId();
  const errorId = `${inputId}-error`;
  const [error, setError] = useState<string | null>(null);
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  const tooLargeMessage = `El archivo supera el tamaño máximo (${formatMegabytes(maxBytes)} MB).`;
  const unsupportedMessage = `Formato no admitido: usa ${describeAcceptedTypes(accept)}.`;

  // Revoca el objeto URL vigente al desmontar: evita filtrar memoria.
  useEffect(() => {
    return () => {
      if (objectUrlRef.current !== null) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);

  function replaceObjectUrl(next: string | null) {
    if (objectUrlRef.current !== null) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = next;
    setLocalPreviewUrl(next);
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const chosen = event.target.files?.[0];
    // Permite volver a elegir el MISMO archivo dos veces seguidas (el navegador no dispara
    // `change` si el valor no cambia).
    event.target.value = '';
    if (chosen === undefined) return;

    if (!isAcceptedType(chosen.type, accept)) {
      setError(unsupportedMessage);
      return;
    }
    const chosenType = chosen.type;

    // Compresion: SOLO imagenes, y solo si hace falta (`compress-image.ts`).
    let file = chosen;
    let compressed = false;
    if (chosen.size > maxBytes) {
      if (!isImageType(chosenType)) {
        setError(tooLargeMessage);
        return;
      }
      const result = await compressImage(chosen, { maxBytes, maxDimension, accept });
      if (!result.ok) {
        setError(tooLargeMessage);
        return;
      }
      file = result.file;
      compressed = result.compressed;
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const outputType = isAcceptedType(file.type, accept) ? file.type : chosenType;

    const validation = validateBytes?.(bytes, outputType) ?? { ok: true };
    if (!validation.ok) {
      setError(validation.message);
      return;
    }

    setError(null);
    setFileName(file.name);
    replaceObjectUrl(isImageType(outputType) ? URL.createObjectURL(file) : null);
    onSelect({ file, bytes, type: outputType, compressed });
  }

  function handleClear() {
    replaceObjectUrl(null);
    setFileName(null);
    setError(null);
    onClear?.();
  }

  const displayUrl = localPreviewUrl ?? previewUrl;
  const canOfferClear = clearable && onClear !== undefined && (displayUrl !== null || fileName !== null);

  return (
    <div className="flex flex-col gap-2" data-testid={`${testIdPrefix}-field`}>
      <Label htmlFor={inputId}>{label}</Label>

      {displayUrl === null ? (
        fileName === null ? (
          <span
            data-testid={`${testIdPrefix}-preview-placeholder`}
            className="text-sm text-muted-foreground"
          >
            {placeholder}
          </span>
        ) : (
          <span data-testid={`${testIdPrefix}-file-name`} className="text-sm">
            {fileName}
          </span>
        )
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- vista previa local o URL ya compuesta por el backend, sin optimizacion propia
        <img
          src={displayUrl}
          alt=""
          className="h-24 w-24 rounded object-cover"
          data-testid={`${testIdPrefix}-preview`}
        />
      )}

      <Input
        id={inputId}
        type="file"
        accept={toAcceptAttribute(accept)}
        className="min-h-11 text-base"
        aria-invalid={error === null ? undefined : true}
        aria-describedby={error === null ? undefined : errorId}
        data-testid={`${testIdPrefix}-input`}
        onChange={(event) => void handleFileChange(event)}
      />

      {error === null ? null : (
        <p
          id={errorId}
          role="alert"
          className="text-sm text-destructive"
          data-testid={`${testIdPrefix}-error`}
        >
          {error}
        </p>
      )}

      {canOfferClear ? (
        <Button
          type="button"
          variant="outline"
          className={TOUCH_TARGET}
          data-testid={`${testIdPrefix}-clear`}
          onClick={handleClear}
        >
          {clearLabel}
        </Button>
      ) : null}
    </div>
  );
}
