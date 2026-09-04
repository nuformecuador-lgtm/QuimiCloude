// components/shared/compress-image.ts
//
// Compresor de IMAGENES para el campo de carga (`file-field.tsx`). Solo imagenes: un PDF o un
// CSV no se reencodean, se aceptan o se rechazan por tamano.
//
// Sin dependencias nuevas (`docs/architecture.md > Dependencias de terceros`): la alternativa
// natural es `browser-image-compression`, pero lo que hace falta aqui -reescalar y reencodear
// hasta caber bajo un limite- son `createImageBitmap` + `<canvas>.toBlob`, dos APIs de
// navegador que ya estan en el entorno. Nada de esto entra en el bundle del servidor.
//
// DEGRADA A "no se pudo": donde no hay `createImageBitmap` ni `canvas.toBlob` -jsdom, por
// ejemplo- el compresor devuelve `{ ok: false, reason: 'not_compressible' }` y el campo cae en
// el rechazo por tamano de siempre. Nunca finge haber comprimido.

import { ENCODABLE_IMAGE_TYPES, isImageType, type UploadableFileType, type UploadableImageType } from './file-types';

export type CompressImageOptions = {
  /** Limite duro: por debajo de esto el archivo pasa tal cual, sin tocarlo. */
  readonly maxBytes: number;
  /** Lado mayor maximo tras el reescalado. Por defecto 2048 px. */
  readonly maxDimension?: number;
  /** Tipos que el consumidor admite: la salida SIEMPRE es uno de ellos. */
  readonly accept: readonly UploadableFileType[];
};

export type CompressImageResult =
  | { readonly ok: true; readonly file: File; readonly compressed: boolean }
  /** No hay forma de bajarlo del limite: ni es imagen, ni hay canvas, ni la calidad alcanza. */
  | { readonly ok: false; readonly reason: 'not_compressible' };

/** Calidades y escalas que se prueban, de menos a mas agresivo. */
const QUALITY_STEPS = [0.82, 0.7, 0.6, 0.5, 0.4] as const;
const SCALE_STEPS = [1, 0.75, 0.5, 0.35] as const;
const DEFAULT_MAX_DIMENSION = 2048;

/** `canvas.toBlob` como promesa; `null` si el navegador no sabe escribir ese tipo. */
function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

/**
 * Primer tipo que el consumidor acepta Y un canvas sabe escribir. Se prefiere WebP (mejor
 * relacion tamano/calidad) y se conserva PNG solo si es lo unico admitido -reencodear un PNG
 * con transparencia a JPEG la perderia sobre negro-.
 */
function pickOutputType(accept: readonly UploadableFileType[]): UploadableImageType | null {
  const acceptedImages = accept.filter(isImageType);
  return ENCODABLE_IMAGE_TYPES.find((type) => acceptedImages.includes(type)) ?? null;
}

/** `true` si el entorno tiene las dos APIs que el reencodeado necesita. */
function canEncodeInThisEnvironment(): boolean {
  return (
    typeof createImageBitmap === 'function' &&
    typeof document !== 'undefined' &&
    typeof document.createElement('canvas').toBlob === 'function'
  );
}

/**
 * Deja `file` por debajo de `maxBytes` reescalando y reencodeando; si ya cabe, lo devuelve
 * INTACTO (`compressed: false`) para no degradar una imagen que no lo necesita.
 *
 * El resultado es un `File` real -mismo nombre base, extension del tipo de salida-, asi que el
 * consumidor lo trata igual que al que eligio el usuario.
 */
export async function compressImage(
  file: File,
  options: CompressImageOptions,
): Promise<CompressImageResult> {
  if (file.size <= options.maxBytes) return { ok: true, file, compressed: false };

  const outputType = pickOutputType(options.accept);
  if (outputType === null || !file.type.startsWith('image/') || !canEncodeInThisEnvironment()) {
    return { ok: false, reason: 'not_compressible' };
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    // Bytes que no son una imagen decodificable (un texto con extension .png, por ejemplo).
    return { ok: false, reason: 'not_compressible' };
  }

  try {
    const maxDimension = options.maxDimension ?? DEFAULT_MAX_DIMENSION;
    const fit = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));

    for (const scale of SCALE_STEPS) {
      const factor = fit * scale;
      const width = Math.max(1, Math.round(bitmap.width * factor));
      const height = Math.max(1, Math.round(bitmap.height * factor));

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (context === null) return { ok: false, reason: 'not_compressible' };
      context.drawImage(bitmap, 0, 0, width, height);

      for (const quality of QUALITY_STEPS) {
        const blob = await canvasToBlob(canvas, outputType, quality);
        // El navegador no sabe escribir este tipo: probar mas calidades es inutil.
        if (blob === null || blob.type !== outputType) return { ok: false, reason: 'not_compressible' };
        if (blob.size <= options.maxBytes) {
          return { ok: true, file: renameForType(file, blob, outputType), compressed: true };
        }
      }
    }

    return { ok: false, reason: 'not_compressible' };
  } finally {
    bitmap.close();
  }
}

const EXTENSIONS: Readonly<Record<UploadableImageType, string>> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/gif': 'gif',
};

/** `foto.heic` + salida WebP -> `foto.webp`: el nombre no puede mentir sobre el contenido. */
function renameForType(original: File, blob: Blob, type: UploadableImageType): File {
  const base = original.name.replace(/\.[^.]+$/, '');
  return new File([blob], `${base}.${EXTENSIONS[type]}`, { type, lastModified: Date.now() });
}
