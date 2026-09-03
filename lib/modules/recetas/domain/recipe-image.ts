/**
 * Deteccion de formato y limites de la imagen de una receta (D7, R23; `design.md > 9.2`).
 * Funcion PURA, sin I/O: no toca red, disco ni el almacenamiento. El caso de uso llama a
 * esta funcion ANTES de subir nada.
 *
 * Por que a mano y no con una libreria (`docs/architecture.md > Dependencias de terceros`
 * obliga a justificarlo): la alternativa natural es `file-type`, que detecta ~150
 * formatos de los que aqui solo interesan TRES con firmas fijas y publicas. Tres
 * comparaciones de prefijo son ~15 lineas que no envejecen (`design.md > 9.2`).
 */

/** Limite de tamano de la imagen: 5 MB (R23). */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export type RecipeImageFormat = {
  readonly contentType: 'image/jpeg' | 'image/png' | 'image/webp';
  readonly extension: 'jpg' | 'png' | 'webp';
};

/** Resultado de validar el archivo recibido (R23). */
export type RecipeImageValidation =
  | ({ readonly ok: true } & RecipeImageFormat)
  | { readonly ok: false; readonly reason: 'too_large' | 'unsupported_format' };

const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const RIFF_SIGNATURE = [0x52, 0x49, 0x46, 0x46]; // 'RIFF', bytes 0-3
const WEBP_SIGNATURE = [0x57, 0x45, 0x42, 0x50]; // 'WEBP', bytes 8-11

/** Compara los primeros bytes de `bytes` contra `signature`, empezando en `offset`. */
function matchesSignature(
  bytes: Uint8Array,
  signature: readonly number[],
  offset = 0,
): boolean {
  if (bytes.byteLength < offset + signature.length) return false;
  return signature.every((byte, index) => bytes[offset + index] === byte);
}

/**
 * Detecta el formato de `bytes` a partir de su CONTENIDO -nunca de una extension ni de un
 * `Content-Type` declarado por el cliente-. Devuelve `null` si no corresponde a JPEG, PNG
 * ni WebP: un PDF (`%PDF`), un SVG (`<?xml`/`<svg`) o un HEIC (`ftypheic` en el box) caen
 * aqui aunque el archivo se llame `.jpg`.
 */
function detectFormat(bytes: Uint8Array): RecipeImageFormat | null {
  if (matchesSignature(bytes, JPEG_SIGNATURE)) {
    return { contentType: 'image/jpeg', extension: 'jpg' };
  }
  if (matchesSignature(bytes, PNG_SIGNATURE)) {
    return { contentType: 'image/png', extension: 'png' };
  }
  if (matchesSignature(bytes, RIFF_SIGNATURE) && matchesSignature(bytes, WEBP_SIGNATURE, 8)) {
    return { contentType: 'image/webp', extension: 'webp' };
  }
  return null;
}

/**
 * Valida el archivo de imagen recibido (R23): rechaza por tamano (> 5 MB) y por formato
 * -detectado por el contenido-. El `contentType` y la `extension` devueltos SIEMPRE salen
 * de la firma detectada, nunca del dato que declaro el cliente.
 */
export function validateRecipeImage(bytes: Uint8Array): RecipeImageValidation {
  if (bytes.byteLength > MAX_IMAGE_BYTES) {
    return { ok: false, reason: 'too_large' };
  }

  const format = detectFormat(bytes);
  if (!format) {
    return { ok: false, reason: 'unsupported_format' };
  }

  return { ok: true, ...format };
}
