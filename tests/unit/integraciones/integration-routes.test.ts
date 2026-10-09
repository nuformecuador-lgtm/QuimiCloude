// Las tres rutas de integraciones: sus constantes, su fila en los prefijos privados, su enlace del
// menu y su pantalla.

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

  it('R15: /integraciones/inventarios no cae bajo /inventario con una lista de prefijos sin las tres rutas: el borde compara por segmentos', () => {
    const integraciones: readonly string[] = URLS
    const reales: readonly string[] = PRIVATE_ROUTE_PREFIXES
    const sinIntegraciones = reales.filter((prefijo) => !integraciones.includes(prefijo))
    expect(sinIntegraciones).toHaveLength(reales.length - URLS.length)
    expect(sinIntegraciones).toContain(INVENTORY_ROUTE)

    const decidir = (pathname: string) =>
      decideRouteAccess({
        pathname,
        search: '',
        session: { kind: 'anonymous' },
        privatePrefixes: sinIntegraciones,
        routes: { login: LOGIN_ROUTE, landing: DASHBOARD_ROUTE },
      })

    expect(decidir(INVENTORY_INTEGRATION_ROUTE)).toEqual({ kind: 'allow' })
    expect(decidir(INVENTORY_ROUTE).kind).toBe('redirect')
  })
})

describe('las rutas de integraciones tienen pantalla', () => {
  const esDeIntegraciones = (ruta: string) =>
    ruta === '/integraciones' || ruta.startsWith('/integraciones/')

  it('R14, R16: los prefijos privados bajo /integraciones son exactamente las tres constantes, y /integraciones no esta', () => {
    const prefijos: readonly string[] = PRIVATE_ROUTE_PREFIXES
    expect(prefijos.filter(esDeIntegraciones)).toEqual([
      AI_PROVIDER_INTEGRATION_ROUTE,
      INVENTORY_INTEGRATION_ROUTE,
      WHATSAPP_INTEGRATION_ROUTE,
    ])
    expect(prefijos).not.toContain('/integraciones')
  })

  it('R16: los enlaces del menu privado bajo /integraciones son exactamente las tres constantes', () => {
    const enlaces = flattenNavLinks()
    expect(enlaces.length).toBeGreaterThan(0)
    expect(enlaces.map((enlace) => enlace.href).filter(esDeIntegraciones)).toEqual([
      AI_PROVIDER_INTEGRATION_ROUTE,
      INVENTORY_INTEGRATION_ROUTE,
      WHATSAPP_INTEGRATION_ROUTE,
    ])
  })

  it('R8, R16: las paginas de app/ cuya URL empieza por integraciones son exactamente las tres, por sus segmentos', () => {
    const paginas = listFiles(join(repoRoot, 'app')).filter((file) => /page\.tsx$/.test(file))
    expect(paginas.length).toBeGreaterThan(0)
    expect(
      paginas.some((file) => urlSegmentsOfPage(file).join('/') === 'inventario'),
      'el barrido deberia ver la pagina de /inventario',
    ).toBe(true)

    const deIntegraciones = paginas
      .map((file) => urlSegmentsOfPage(file))
      .filter((segmentos) => segmentos[0] === 'integraciones')
      .map((segmentos) => `/${segmentos.join('/')}`)
      .sort()
    expect(deIntegraciones).toEqual(
      [AI_PROVIDER_INTEGRATION_ROUTE, INVENTORY_INTEGRATION_ROUTE, WHATSAPP_INTEGRATION_ROUTE].sort(),
    )
  })

  it('R13: sin sesion, el borde redirige al login cada una de las tres rutas con los prefijos reales', () => {
    for (const ruta of [
      AI_PROVIDER_INTEGRATION_ROUTE,
      INVENTORY_INTEGRATION_ROUTE,
      WHATSAPP_INTEGRATION_ROUTE,
    ]) {
      const decision = decideRouteAccess({
        pathname: ruta,
        search: '',
        session: { kind: 'anonymous' },
        privatePrefixes: PRIVATE_ROUTE_PREFIXES,
        routes: { login: LOGIN_ROUTE, landing: DASHBOARD_ROUTE },
      })
      expect(decision.kind, ruta).toBe('redirect')
      if (decision.kind !== 'redirect') continue
      expect(decision.reason, ruta).toBe('unauthenticated')
      expect(new URL(decision.to, 'http://localhost').pathname, ruta).toBe(LOGIN_ROUTE)
    }
  })
})
