// T26 (QC-50) — Que las fotos no se movieron (`design.md > 12` punto 5, `> 10` alternativa I;
// `tasks.md > T26`). Cubre R27.
//
// La decision cerrada 5 dice que las fotos de receta NO se aislan por empresa: siguen siendo
// material de referencia servido por enlace PUBLICO, sin la empresa en la ruta, sin mover ni
// renombrar ningun archivo, y sin pasar a enlaces privados/firmados (alternativa I,
// descartada por el humano). Este archivo es el candado de regresion: si alguien "arregla" el
// aislamiento de las fotos de paso mientras implementa el resto de la ficha, cae aqui.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import type { RecipeImageStorage, RecipeImageUpload } from '@/lib/modules/recetas/ports/recipe-image-storage'

const repoRoot = join(fileURLToPath(import.meta.url), '..', '..', '..', '..')

describe('R27 — las fotos de receta no se aislan por empresa (decision cerrada 5)', () => {
  it('el puerto RecipeImageStorage no lleva companyId ni scope en ninguna de sus tres firmas', () => {
    // Se mira el TEXTO del puerto, no un doble: si alguien le agrega `companyId`/`scope` a
    // `upload`, `remove` o `publicUrl` para "aislar" la foto, esto cae sin necesidad de tocar
    // ningun caso de uso.
    const puertoPath = join(repoRoot, 'lib', 'modules', 'recetas', 'ports', 'recipe-image-storage.ts')
    const source = readFileSync(puertoPath, 'utf8')

    expect(source).not.toMatch(/companyId/i)
    expect(source).not.toMatch(/\bscope\b/i)
    expect(source).not.toMatch(/RecipeScope/)
  })

  it('un doble de RecipeImageStorage sin companyId satisface el puerto completo (compila y ejecuta)', async () => {
    // No hace falta reflexion en tiempo de ejecucion: si el puerto exigiera la empresa, este
    // doble -que la ignora por completo- no tipar-ia y el archivo fallaria a compilar/lintear.
    const upload = async (image: RecipeImageUpload): Promise<string> => `recetas/foto.${image.extension}`
    const remove = async (path: string): Promise<void> => void path
    const publicUrl = (path: string): string =>
      `https://bucket-publico.example.supabase.co/storage/v1/object/public/recetas-bucket/${path}`

    const storage: RecipeImageStorage = { upload, remove, publicUrl }

    const ruta = await storage.upload({ bytes: new Uint8Array([1, 2, 3]), contentType: 'image/jpeg', extension: 'jpg' })
    expect(ruta).not.toMatch(/empresa|company/i)

    const url = storage.publicUrl(ruta)
    expect(url).toContain('/storage/v1/object/public/')
    expect(url).not.toMatch(/empresa|company/i)

    await expect(remove(ruta)).resolves.toBeUndefined()
  })

  it('el adaptador real compone la ruta sin el identificador de empresa y lee con getPublicUrl, nunca con una URL firmada', () => {
    const adapterPath = join(
      repoRoot,
      'lib',
      'modules',
      'recetas',
      'adapters',
      'driven',
      'storage',
      'recipe-image-supabase.ts',
    )
    const source = readFileSync(adapterPath, 'utf8')

    // La ruta que sube el archivo es `recetas/<uuid>.<ext>`: ni companyId, ni scope, ni ningun
    // segmento de empresa entra en la plantilla de la ruta.
    expect(source).toMatch(/`recetas\/\$\{randomUUID\(\)\}\.\$\{image\.extension\}`/)
    expect(source).not.toMatch(/companyId/i)
    expect(source).not.toMatch(/\bscope\b/i)

    // La URL de lectura sale de `getPublicUrl`, la operacion publica sin firma ni caducidad -
    // nunca de `createSignedUrl` ni de ninguna variante firmada/privada.
    expect(source).toMatch(/\.getPublicUrl\(/)
    expect(source).not.toMatch(/createSignedUrl|signedUrl|SignedUrl/i)
  })

  it('la configuracion de Storage de recetas no declara ningun campo de empresa', () => {
    // D11/R28: las tres variables de entorno son url, bucket y key. Si alguien le agrega un
    // cuarto dato -companyId o un prefijo de empresa- para acotar el bucket, cae aqui.
    const configPath = join(repoRoot, 'lib', 'modules', 'recetas', 'adapters', 'driven', 'config', 'storage-config-env.ts')
    const source = readFileSync(configPath, 'utf8')

    expect(source).not.toMatch(/companyId/i)
    expect(source).not.toMatch(/company_id/i)
  })
})
