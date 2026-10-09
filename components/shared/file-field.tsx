'use client';

// components/shared/file-field.tsx
//
// Campo de carga de archivos COMPARTIDO, con zona de arrastrar y soltar: el consumidor delimita
// los tipos admitidos pasando un array de `UploadableFileType` (`file-types.ts`) -una union de
// `type`, no `string`-, y el campo se encarga del `accept` del input, de la MINIATURA de lo
// cargado, del rechazo por tamano/formato y de la COMPRESION de las imagenes que se pasan del
// limite (`compress-image.ts`).
//
// **Compatible con el formulario controlado** (`recipe-form.tsx` y los que sigan ese patron):
// no envia nada por su cuenta ni depende de `FormData` -las Server Actions de este repo reciben
// objetos tipados, no `FormData`-. Entrega `onSelect({ file, bytes, type, compressed })` con los
// bytes YA comprimidos y validados, que es justo lo que el payload necesita; quien decide que
// hacer con ellos es el formulario.
//
// **El `<input type="file">` sigue siendo el control real**, solo que `sr-only`: la zona de
// arrastre es un `<div>` que reenvia el clic al input, no un control paralelo. Asi el teclado y
// los lectores de pantalla ven un campo de archivo normal con su `<Label>`, y el arrastre es una
// comodidad de raton encima -no la unica via, que dejaria fuera a quien no puede arrastrar-.
//
// **El arrastre NO se fia del navegador para el `accept`**: al soltar, el filtrado por tipo lo
// hace este componente (`isAcceptedType`), porque el atributo `accept` solo gobierna el dialogo
// de seleccion, nunca lo que cae en la zona.
//
// **La compresion es SOLO para imagenes**: un PDF o un CSV que se pasa del limite se rechaza,
// no se reencodea. Y una imagen que ya cabe no se toca (`compressed: false`), para no degradarla
// sin motivo.
//
// **La validacion de dominio no vive aqui**: `validateBytes` deja que el consumidor imponga lo
// suyo -la deteccion por FIRMA de `validateRecipeImage`, por ejemplo- sobre los bytes finales.

import { FileIcon, UploadCloudIcon } from 'lucide-react';
import { useEffect, useId, useRef, useState, type DragEvent } from 'react';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

import { compressImage } from './compress-image';
import {
  describeAcceptedTypes,
  formatFileSize,
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
  /**
   * Oculta la etiqueta A LA VISTA, no al lector de pantalla: sigue en el DOM con `sr-only` y con
   * su `htmlFor`, así que el input conserva su nombre accesible. Quitarla del todo dejaría un
   * campo de archivo anónimo.
   */
  readonly hideLabel?: boolean;
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
  /** Llamada a la accion de la zona vacia. */
  readonly placeholder?: string;
  /**
   * Imagen de marcador para la zona VACIA -sin vista previa y sin archivo elegido-. Sin ella, la
   * zona pinta el icono de subida de siempre. La usa el campo de imagen de la receta para
   * ensenar el mismo marcador que las tablas de inventario y de proveedores, en vez de un
   * marcador propio (2026-09-07, decision humana).
   */
  readonly emptyImageSrc?: string;
  /** Validacion de dominio sobre los bytes finales (firma, cabeceras...). */
  readonly validateBytes?: (bytes: Uint8Array, type: UploadableFileType) => FileFieldValidation;
  /** Prefijo de los `data-testid`: `<prefijo>-field`, `-input`, `-error`, `-preview`, `-clear`. */
  readonly testIdPrefix: string;
};

/** Estado visual de la zona: reposo, arrastre encima, trabajando y error. */
const DROPZONE_BASE =
  'relative flex min-h-36 cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors focus-within:ring-3 focus-within:ring-ring/50';
const DROPZONE_IDLE = 'border-input bg-transparent hover:border-ring hover:bg-accent/40';
const DROPZONE_DRAGGING = 'border-primary bg-primary/5';
const DROPZONE_INVALID = 'border-destructive bg-destructive/5';

export function FileField({
  label,
  hideLabel = false,
  accept,
  maxBytes,
  maxDimension,
  onSelect,
  onClear,
  clearable = false,
  clearLabel = 'Quitar archivo',
  previewUrl = null,
  placeholder = 'Arrastra un archivo aquí o haz clic para elegirlo',
  emptyImageSrc,
  validateBytes,
  testIdPrefix,
}: FileFieldProps) {
  const inputId = useId();
  const errorId = `${inputId}-error`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
  const [chosen, setChosen] = useState<{ name: string; size: number; compressed: boolean } | null>(
    null,
  );
  const [isDragging, setIsDragging] = useState(false);
  const [isWorking, setIsWorking] = useState(false);
  const objectUrlRef = useRef<string | null>(null);

  const tooLargeMessage = `El archivo supera el tamaño máximo (${formatMegabytes(maxBytes)} MB).`;
  const unsupportedMessage = `Formato no admitido: usa ${describeAcceptedTypes(accept)}.`;
  const hint = `${describeAcceptedTypes(accept)} · hasta ${formatMegabytes(maxBytes)} MB`;

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

  /** Camino unico: da igual si el archivo llega del diálogo o de un arrastre. */
  async function acceptFile(candidate: File) {
    if (!isAcceptedType(candidate.type, accept)) {
      setError(unsupportedMessage);
      return;
    }
    const candidateType = candidate.type;

    // Compresion: SOLO imagenes, y solo si hace falta (`compress-image.ts`).
    let file = candidate;
    let compressed = false;
    if (candidate.size > maxBytes) {
      if (!isImageType(candidateType)) {
        setError(tooLargeMessage);
        return;
      }
      setIsWorking(true);
      const result = await compressImage(candidate, { maxBytes, maxDimension, accept });
      setIsWorking(false);
      if (!result.ok) {
        setError(tooLargeMessage);
        return;
      }
      file = result.file;
      compressed = result.compressed;
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const outputType = isAcceptedType(file.type, accept) ? file.type : candidateType;

    const validation = validateBytes?.(bytes, outputType) ?? { ok: true };
    if (!validation.ok) {
      setError(validation.message);
      return;
    }

    setError(null);
    setChosen({ name: file.name, size: file.size, compressed });
    replaceObjectUrl(isImageType(outputType) ? URL.createObjectURL(file) : null);
    onSelect({ file, bytes, type: outputType, compressed });
  }

  function handleClear() {
    replaceObjectUrl(null);
    setChosen(null);
    setError(null);
    onClear?.();
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    // Pasar por encima de un hijo dispara `dragleave` en el contenedor: sin esta guarda el
    // resaltado parpadearía mientras el cursor recorre la miniatura o el texto.
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    setIsDragging(false);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    // Sin esto el navegador ABRE el archivo soltado y se lleva la página por delante.
    event.preventDefault();
    setIsDragging(false);
    const dropped = event.dataTransfer.files?.[0];
    if (dropped !== undefined) void acceptFile(dropped);
  }

  const displayUrl = localPreviewUrl ?? previewUrl;
  const canOfferClear = clearable && onClear !== undefined && (displayUrl !== null || chosen !== null);

  const dropzoneState = isDragging
    ? DROPZONE_DRAGGING
    : error !== null
      ? DROPZONE_INVALID
      : DROPZONE_IDLE;

  return (
    <div className="flex flex-col gap-1" data-testid={`${testIdPrefix}-field`}>
      <Label htmlFor={inputId} className={hideLabel ? 'sr-only' : undefined}>
        {label}
      </Label>

      <div
        className={`${DROPZONE_BASE} ${dropzoneState}`}
        data-testid={`${testIdPrefix}-dropzone`}
        data-dragging={isDragging ? '' : undefined}
        // La zona es una comodidad de ratón: reenvía el clic al input, que es el control real.
        onClick={() => inputRef.current?.click()}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {displayUrl !== null ? (
          // eslint-disable-next-line @next/next/no-img-element -- vista previa local o URL ya compuesta por el backend, sin optimizacion propia
          <img
            src={displayUrl}
            alt=""
            className="h-28 w-28 rounded-lg border border-border object-cover"
            data-testid={`${testIdPrefix}-preview`}
          />
        ) : chosen !== null ? (
          <FileIcon className="size-8 text-muted-foreground" aria-hidden />
        ) : emptyImageSrc !== undefined ? (
          /*
            Marcador de la zona vacia: una imagen, no el icono. Es DECORATIVA -`alt` vacio y
            `aria-hidden`-, porque lo que nombra al campo es su `<Label>` y lo que explica que
            hacer es el texto de debajo; anunciarla seria ruido. `testId` propio, nunca el de la
            vista previa: los tests afirman que `-preview` NO existe cuando no hay imagen.
          */
          // eslint-disable-next-line @next/next/no-img-element -- marcador local servido de `public/`, sin optimizacion propia
          <img
            src={emptyImageSrc}
            alt=""
            aria-hidden
            className="h-28 w-28 rounded-lg border border-border object-cover"
            data-testid={`${testIdPrefix}-empty-image`}
          />
        ) : (
          <UploadCloudIcon
            className={`size-8 ${isDragging ? 'text-primary' : 'text-muted-foreground'}`}
            aria-hidden
          />
        )}

        {isWorking ? (
          <p className="text-sm text-muted-foreground" data-testid={`${testIdPrefix}-working`}>
            Comprimiendo la imagen…
          </p>
        ) : chosen === null ? (
          <div className="flex flex-col gap-1">
            <p
              className="text-sm font-medium"
              data-testid={
                displayUrl === null ? `${testIdPrefix}-preview-placeholder` : `${testIdPrefix}-hint`
              }
            >
              {isDragging ? 'Suelta el archivo para cargarlo' : placeholder}
            </p>
            <p className="text-xs text-muted-foreground">{hint}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium" data-testid={`${testIdPrefix}-file-name`}>
              {chosen.name}
            </p>
            <p className="text-xs text-muted-foreground" data-testid={`${testIdPrefix}-file-meta`}>
              {formatFileSize(chosen.size)}
              {chosen.compressed ? ' · comprimida para caber en el límite' : ''}
            </p>
            <p className="text-xs text-muted-foreground">Haz clic o arrastra otro para cambiarla</p>
          </div>
        )}

        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept={toAcceptAttribute(accept)}
          className="sr-only"
          aria-invalid={error === null ? undefined : true}
          aria-describedby={error === null ? undefined : errorId}
          data-testid={`${testIdPrefix}-input`}
          onChange={(event) => {
            const picked = event.target.files?.[0];
            // Permite volver a elegir el MISMO archivo dos veces seguidas (el navegador no
            // dispara `change` si el valor no cambia).
            event.target.value = '';
            if (picked !== undefined) void acceptFile(picked);
          }}
          // El clic del input burbujearía hasta la zona, que volvería a abrir el diálogo.
          onClick={(event) => event.stopPropagation()}
        />
      </div>

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
          touch
          className="self-start"
          data-testid={`${testIdPrefix}-clear`}
          onClick={handleClear}
        >
          {clearLabel}
        </Button>
      ) : null}
    </div>
  );
}
