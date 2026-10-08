// Las tres rutas de integraciones existen solo como constantes: sin pantalla, sin prefijo privado
// y sin enlace del menu. Cuando lleguen sus paginas, este archivo se enmienda junto con ellas.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { extname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import ts from 'typescript'
import { describe, expect, it } from 'vitest'

import { decideRouteAccess } from '@/lib/modules/identity'
import { PRIVATE_NAV_ITEMS, type NavLink } from '@/lib/shared/navigation/private-nav'
import {
  AI_PROVIDER_INTEGRATION_ROUTE,
  INVENTORY_INTEGRATION_ROUTE,
  INVENTORY_ROUTE,
  LOGIN_ROUTE,
  DASHBOARD_ROUTE,
  PRIVATE_ROUTE_PREFIXES,
  WHATSAPP_INTEGRATION_ROUTE,
} from '@/lib/shared/routes'

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url))

const URLS = [
  '/integraciones/proveedor-ia',
  '/integraciones/inventarios',
  '/integraciones/whatsapp',
] as const

const AVISO_DE_ENMIENDA =
  'Las rutas de integraciones son solo constantes hasta que exista su pantalla. La ficha que ' +
  'traiga las paginas (QC-222) enmienda este caso a la vez que anade el page.tsx, su fila en ' +
  'PRIVATE_ROUTE_PREFIXES y su enlace del menu.'

const PRODUCTION_DIRS = ['app', 'lib', 'components', 'hooks', 'db']
const CODE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'])
const TEXT_EXTENSIONS = new Set([...CODE_EXTENSIONS, '.sql', '.prisma', '.json'])

function toPosix(path: string): string {
  return path.split(sep).join('/')
}

function listFiles(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    return statSync(full).isDirectory() ? listFiles(full) : [full]
  })
}

function listProductionFiles(): string[] {
  return [
    ...PRODUCTION_DIRS.flatMap((dir) => listFiles(join(repoRoot, dir))),
    join(repoRoot, 'middleware.ts'),
  ].filter((file) => TEXT_EXTENSIONS.has(extname(file)))
}

/** Codigo sin comentarios: un comentario que nombre la URL no es un uso. */
export function withoutComments(source: string, extension: string): string {
  if (!CODE_EXTENSIONS.has(extension)) {
    return source
      .split('\n')
      .map((line) => line.replace(/(--|\/\/).*$/, ''))
      .join('\n')
  }
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, ts.LanguageVariant.JSX, source)
  const piezas: string[] = []
  let token = scanner.scan()
  while (token !== ts.SyntaxKind.EndOfFileToken) {
    const esComentario =
      token === ts.SyntaxKind.SingleLineCommentTrivia ||
      token === ts.SyntaxKind.MultiLineCommentTrivia
    piezas.push(esComentario ? ' ' : scanner.getTokenText())
    token = scanner.scan()
  }
  return piezas.join('')
}

/** Archivos de produccion (rutas relativas POSIX) cuyo codigo contiene el literal. */
function filesContaining(literal: string): string[] {
  return listProductionFiles()
    .filter((file) => withoutComments(readFileSync(file, 'utf8'), extname(file)).includes(literal))
    .map((file) => toPosix(relative(repoRoot, file)))
}

function flattenNavLinks(): NavLink[] {
  return PRIVATE_NAV_ITEMS.flatMap((item) => (item.kind === 'group' ? [...item.items] : [item]))
}

/** Segmentos de URL de una pagina de `app/`, sin los route groups `(x)`. */
function urlSegmentsOfPage(file: string): string[] {
  return toPosix(relative(join(repoRoot, 'app'), file))
    .split('/')
    .slice(0, -1)
    .filter((segment) => !/^\(.*\)$/.test(segment))
}

describe('las tres constantes de ruta de integraciones', () => {
  it('R14: las tres constantes valen exactamente las tres URL, una por constante', () => {
    expect(AI_PROVIDER_INTEGRATION_ROUTE).toBe('/integraciones/proveedor-ia')
    expect(INVENTORY_INTEGRATION_ROUTE).toBe('/integraciones/inventarios')
    expect(WHATSAPP_INTEGRATION_ROUTE).toBe('/integraciones/whatsapp')
    expect(
      [AI_PROVIDER_INTEGRATION_ROUTE, INVENTORY_INTEGRATION_ROUTE, WHATSAPP_INTEGRATION_ROUTE].sort(),
    ).toEqual([...URLS].sort())
  })

  it('R14: routes.ts declara exactamente tres constantes con una URL bajo /integraciones', () => {
    const fuente = withoutComments(
      readFileSync(join(repoRoot, 'lib', 'shared', 'routes.ts'), 'utf8'),
      '.ts',
    )
    const declaradas = [
      ...fuente.matchAll(/export const ([A-Z_]+)\s*=\s*['"`]\/integraciones[/'"`]/g),
    ].map((match) => match[1])

    expect(declaradas).toEqual([
      'AI_PROVIDER_INTEGRATION_ROUTE',
      'INVENTORY_INTEGRATION_ROUTE',
      'WHATSAPP_INTEGRATION_ROUTE',
    ])
  })

  it('R14: ninguna de las tres URL aparece como literal en otro archivo de produccion, y el barrido la ve en routes.ts', () => {
    for (const url of URLS) {
      expect(filesContaining(url), url).toEqual(['lib/shared/routes.ts'])
    }
  })

  it('R14: el barrido ignora los comentarios y caza un literal en codigo', () => {
    const url = URLS[0]
    expect(withoutComments(`// ver ${url}\nconst a = 1`, '.ts')).not.toContain(url)
    expect(withoutComments(`/* ${url} */ const a = 1`, '.ts')).not.toContain(url)
    expect(withoutComments(`const a = '${url}'`, '.ts')).toContain(url)
  })

  it('R14: /integraciones/inventarios no cae bajo /inventario: el borde compara por segmentos', () => {
    expect(PRIVATE_ROUTE_PREFIXES).toContain(INVENTORY_ROUTE)
    const decidir = (pathname: string) =>
      decideRouteAccess({
        pathname,
        search: '',
        session: { kind: 'anonymous' },
        privatePrefixes: PRIVATE_ROUTE_PREFIXES,
        routes: { login: LOGIN_ROUTE, landing: DASHBOARD_ROUTE },
      })

    expect(decidir(INVENTORY_INTEGRATION_ROUTE)).toEqual({ kind: 'allow' })
    expect(decidir(INVENTORY_ROUTE).kind).toBe('redirect')
  })
})

describe('las rutas de integraciones aun no tienen pantalla', () => {
  it('R15: ninguna de las tres URL ni /integraciones esta en PRIVATE_ROUTE_PREFIXES', () => {
    const prefijos: readonly string[] = PRIVATE_ROUTE_PREFIXES
    const bajoIntegraciones = prefijos.filter(
      (prefijo) => prefijo === '/integraciones' || prefijo.startsWith('/integraciones/'),
    )
    expect(bajoIntegraciones, AVISO_DE_ENMIENDA).toEqual([])
  })

  it('R15: ningun enlace del menu privado apunta bajo /integraciones', () => {
    const enlaces = flattenNavLinks()
    expect(enlaces.length).toBeGreaterThan(0)
    expect(
      enlaces
        .map((enlace) => enlace.href)
        .filter((href) => href === '/integraciones' || href.startsWith('/integraciones/')),
      AVISO_DE_ENMIENDA,
    ).toEqual([])
  })

  it('R15: no existe ningun page.tsx bajo app/ que resuelva a una URL de /integraciones', () => {
    const paginas = listFiles(join(repoRoot, 'app')).filter((file) => /page\.tsx$/.test(file))
    expect(paginas.length).toBeGreaterThan(0)
    expect(
      paginas.some((file) => urlSegmentsOfPage(file).join('/') === 'inventario'),
      'el barrido deberia ver la pagina de /inventario',
    ).toBe(true)

    const deIntegraciones = paginas
      .filter((file) => urlSegmentsOfPage(file)[0] === 'integraciones')
      .map((file) => toPosix(relative(repoRoot, file)))
    expect(deIntegraciones, AVISO_DE_ENMIENDA).toEqual([])
  })
})
