// T2 (QC-25) — deteccion de formato y limites de la imagen de una receta (R23).
//
// `validateRecipeImage` es pura: sin red, sin bucket, sin credenciales (R43). Se prueba
// con una tabla de firmas -los tres formatos aceptados y tres formatos rechazados
// renombrados a `.jpg`, aunque la extension no entre en la funcion- y el corte de 5 MB.

import { describe, expect, it } from 'vitest'

import { MAX_IMAGE_BYTES, validateRecipeImage } from '@/lib/modules/recetas/domain/recipe-image'

/** Construye un buffer que empieza con `signature` y se rellena con ceros hasta `length`. */
function bytesWithSignature(signature: readonly number[], length = signature.length): Uint8Array {
  const bytes = new Uint8Array(length)
  bytes.set(signature)
  return bytes
}

/** Firma WebP: RIFF en 0-3, tamano en 4-7 (irrelevante aqui), WEBP en 8-11. */
function webpBytes(): Uint8Array {
  const bytes = new Uint8Array(16)
  bytes.set([0x52, 0x49, 0x46, 0x46], 0) // RIFF
  bytes.set([0x00, 0x00, 0x00, 0x00], 4) // tamano, no se valida
  bytes.set([0x57, 0x45, 0x42, 0x50], 8) // WEBP
  return bytes
}

describe('validateRecipeImage (R23)', () => {
  it.each([
    { nombre: 'JPEG', bytes: bytesWithSignature([0xff, 0xd8, 0xff], 32), contentType: 'image/jpeg', extension: 'jpg' },
    {
      nombre: 'PNG',
      bytes: bytesWithSignature([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 32),
      contentType: 'image/png',
      extension: 'png',
    },
    { nombre: 'WebP', bytes: webpBytes(), contentType: 'image/webp', extension: 'webp' },
  ])('acepta $nombre por su contenido y deriva contentType y extension de la firma', ({ bytes, contentType, extension }) => {
    const result = validateRecipeImage(bytes)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.contentType).toBe(contentType)
      expect(result.extension).toBe(extension)
    }
  })

  it.each([
    { nombre: 'PDF renombrado a .jpg', bytes: bytesWithSignature([0x25, 0x50, 0x44, 0x46], 32) }, // %PDF
    {
      nombre: 'SVG renombrado a .jpg (con declaracion XML)',
      bytes: new TextEncoder().encode('<?xml version="1.0"?><svg></svg>'),
    },
    {
      nombre: 'SVG renombrado a .jpg (sin declaracion XML)',
      bytes: new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
    },
    {
      nombre: 'HEIC renombrado a .jpg',
      bytes: (() => {
        const bytes = new Uint8Array(32)
        bytes.set(new TextEncoder().encode('ftypheic'), 4) // box `ftyp` con marca `heic`
        return bytes
      })(),
    },
  ])('rechaza $nombre aunque el archivo se llame .jpg', ({ bytes }) => {
    const result = validateRecipeImage(bytes)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('unsupported_format')
    }
  })

  it('rechaza un archivo de mas de 5 MB aunque su contenido sea un JPEG valido', () => {
    const bytes = bytesWithSignature([0xff, 0xd8, 0xff], MAX_IMAGE_BYTES + 1)

    const result = validateRecipeImage(bytes)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('too_large')
    }
  })

  it('acepta un JPEG de exactamente 5 MB (el corte es estrictamente mayor que)', () => {
    const bytes = bytesWithSignature([0xff, 0xd8, 0xff], MAX_IMAGE_BYTES)

    const result = validateRecipeImage(bytes)

    expect(result.ok).toBe(true)
  })
})
