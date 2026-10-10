// Guardia de QC-255 (R5, R6): ningun E2E crea usuarios fuera de `e2e/helpers/fixture-user.ts`.
//
// El helper pone a cada usuario de fixture un sello de sesiones en el pasado y la cuenta `active`.
// Sin el, un login en el mismo segundo de reloj en que se creo el usuario nacia revocado
// (`/login?sesion=fin`) y ~35 casos fallaban a ratos sin tener nada que ver con lo que probaban.
// Habia 54 `prisma.user.create` en 52 specs y ninguno fijaba el sello: el spec 53 volveria a nacer
// igual en silencio, como pasaron las copias de `login()` antes de QC-93 (`guard-e2e-landing`).
//
// Muerde, nombrando archivo y linea, ante `.user.create(`, `.user.createMany(` y `.user.upsert(`
// en cualquier `e2e/**/*.ts` salvo el propio helper. Vive en `tests/guards/` porque `init.sh` no
// corre Playwright.
//
// LIMITE HONESTO: mira la forma del texto. Un spec que creara usuarios con SQL crudo o a traves de
// otro cliente saldria verde.

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

/** Raiz del repo: dos niveles por encima de `tests/guards/`. */
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

const RAIZ_E2E = 'e2e'
const HELPER = 'e2e/helpers/fixture-user.ts'

/** Las tres formas de crear usuarios con Prisma. */
const CREACION_DE_USUARIO = /\.user\s*\.\s*(create|createMany|upsert)\s*\(/

type Hallazgo = { archivo: string; linea: number; metodo: string }

/** Analisis puro sobre (ruta, contenido): no lee disco. */
function creacionesFueraDelHelper(archivo: string, contenido: string): Hallazgo[] {
  if (archivo === HELPER) return []
  const hallazgos: Hallazgo[] = []
  contenido.split(/\r?\n/).forEach((linea, indice) => {
    const coincidencia = CREACION_DE_USUARIO.exec(linea)
    if (coincidencia) hallazgos.push({ archivo, linea: indice + 1, metodo: coincidencia[1] })
  })
  return hallazgos
}

function archivosTs(directorio: string): string[] {
  const absoluto = join(RAIZ, directorio)
  if (!existsSync(absoluto)) return []
  const salida: string[] = []
  for (const entrada of readdirSync(absoluto, { withFileTypes: true })) {
    const ruta = join(directorio, entrada.name)
    if (entrada.isDirectory()) salida.push(...archivosTs(ruta))
    else if (entrada.name.endsWith('.ts')) salida.push(relative(RAIZ, join(RAIZ, ruta)).replace(/\\/g, '/'))
  }
  return salida
}

describe('guardia de QC-255 — los usuarios de los E2E se crean con el helper de fixture', () => {
  it('el helper existe y es quien llama a prisma.user.create', () => {
    const contenido = readFileSync(join(RAIZ, HELPER), 'utf8')
    expect(contenido).toMatch(/prisma\.user\.create\s*[<(]/)
  })

  it('muerde ante un create, un createMany y un upsert fuera del helper, con archivo y linea', () => {
    const sintetico = [
      "import { prisma } from '@/lib/shared/db/prisma'",
      'await prisma.user.create({ data })',
      'await prisma.user.createMany({ data: [data] })',
      'await tx.user.upsert({ where, create, update })',
      'await prisma.company.create({ data })',
    ].join('\n')

    expect(creacionesFueraDelHelper('e2e/nuevo.spec.ts', sintetico)).toEqual([
      { archivo: 'e2e/nuevo.spec.ts', linea: 2, metodo: 'create' },
      { archivo: 'e2e/nuevo.spec.ts', linea: 3, metodo: 'createMany' },
      { archivo: 'e2e/nuevo.spec.ts', linea: 4, metodo: 'upsert' },
    ])
  })

  it('no muerde al propio helper', () => {
    expect(creacionesFueraDelHelper(HELPER, 'return prisma.user.create<T>(withDefaults)')).toEqual([])
  })

  it('ningun archivo de e2e/ crea usuarios fuera del helper', () => {
    const archivos = archivosTs(RAIZ_E2E)
    expect(archivos.length).toBeGreaterThan(0)

    const hallazgos = archivos.flatMap((archivo) =>
      creacionesFueraDelHelper(archivo, readFileSync(join(RAIZ, archivo), 'utf8')),
    )

    expect(
      hallazgos.map((h) => `${h.archivo}:${h.linea} usa .user.${h.metodo}( — usa createFixtureUser de ${HELPER}`),
    ).toEqual([])
  })
})
