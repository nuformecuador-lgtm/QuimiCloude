// QC-44 T1, T2, T3 — Contrato de la ruta de proveedores: R2, R3, R4, R5, R6 y R47.
//
// Todo lo que esta tanda promete es invisible renderizando: que la URL viva en UNA constante,
// que el detalle se derive de ella, que el prefijo privado la cubra y que la regla ruta->rol la
// restrinja al Administrador. Por eso este archivo mezcla dos clases de asercion, las dos sin DOM:
//   - guardias de fuente y de arbol (el literal no se incrusta, los consumidores derivan);
//   - decisiones puras de `decideRouteAccess` con las constantes REALES, mismo patron que
//     `tests/unit/identity/route-access.test.ts` para `INVENTORY_ROUTE` y `FORMULAS_ROUTE`.
//
// Los asserts de navegacion ITERAN `PRIVATE_NAV_ITEMS` y afirman sobre `SUPPLIERS_ROUTE`,
// `SUPPLIERS_LABEL` y el `testId`, **nunca sobre el literal del copy** (R47, decision cerrada del
// 2026-09-04).

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

// La lista real de reglas es CABLEADO y vive en `lib/composition/` (QC-22).
import { ROUTE_ROLE_RULES } from '@/lib/composition/route-role-rules'
import {
  decideRouteAccess,
  type RouteAccessInput,
  type RouteAccessSession,
} from '@/lib/modules/identity/domain/route-access'
import { ADMIN_ROLE_NAME } from '@/lib/modules/inventario'
import {
  PRIVATE_NAV_ITEMS,
  SUPPLIERS_LABEL,
  type NavLink,
} from '@/lib/shared/navigation/private-nav'
import {
  DASHBOARD_ROUTE,
  FORMULAS_ROUTE,
  INVENTORY_ROUTE,
  LOGIN_ROUTE,
  PRIVATE_ROUTE_PREFIXES,
  SUPPLIERS_ROUTE,
  supplierDetailRoute,
} from '@/lib/shared/routes'

/** Sube desde este archivo hasta la raiz del repo (la carpeta con `package.json`). */
function findRepoRoot(startDir: string): string {
  let dir = startDir
  for (;;) {
    try {
      readFileSync(join(dir, 'package.json'))
      return dir
    } catch {
      const parent = dirname(dir)
      if (parent === dir) throw new Error(`no se encontro package.json subiendo desde ${startDir}`)
      dir = parent
    }
  }
}

const RAIZ = findRepoRoot(dirname(fileURLToPath(import.meta.url)))

const EXTENSIONES = ['.ts', '.tsx']

/** Todos los archivos de codigo bajo una carpeta del repo, en rutas relativas con `/`. */
function fuentesBajo(carpeta: string): readonly string[] {
  const absoluta = join(RAIZ, carpeta)
  if (!existsSync(absoluta)) return []

  function walk(dir: string, prefijo: string): readonly string[] {
    return readdirSync(dir).flatMap((nombre) => {
      const completa = join(dir, nombre)
      const relativa = prefijo === '' ? nombre : `${prefijo}/${nombre}`
      if (statSync(completa).isDirectory()) return walk(completa, relativa)
      return EXTENSIONES.some((ext) => nombre.endsWith(ext)) ? [relativa] : []
    })
  }

  return walk(absoluta, carpeta)
}

/** Texto del archivo sin comentarios: un literal citado dentro de un comentario no es codigo. */
function fuenteSinComentarios(ruta: string): string {
  return readFileSync(join(RAIZ, ruta), 'utf8')
    .replace(/\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
}

/** El literal de la URL, en las dos formas de comilla que el repo permite. */
const LITERALES_DE_RUTA = [`'${SUPPLIERS_ROUTE}'`, `"${SUPPLIERS_ROUTE}"`]

/** Todos los items de navegacion, aplanando los grupos en sus hijos. */
const NAV_APLANADO: readonly NavLink[] = PRIVATE_NAV_ITEMS.flatMap((item) =>
  item.kind === 'group' ? item.items : [item],
)

// ---------------------------------------------------------------------------
// T1 — La constante, el helper de detalle y el prefijo privado (R2, R3, R5)
// ---------------------------------------------------------------------------

describe('la ruta de proveedores se declara una sola vez (R2, R3)', () => {
  it('la constante vive en lib/shared/routes.ts y el helper de detalle se DERIVA de ella (R2, R3)', () => {
    expect(fuenteSinComentarios('lib/shared/routes.ts')).toContain('export const SUPPLIERS_ROUTE')

    // R3 — el detalle no es otra cadena escrita a mano: es la constante mas el identificador.
    expect(supplierDetailRoute('sonda-de-prueba')).toBe(`${SUPPLIERS_ROUTE}/sonda-de-prueba`)
    expect(supplierDetailRoute('otra')).toBe(`${SUPPLIERS_ROUTE}/otra`)

    // Si manana `SUPPLIERS_ROUTE` cambiara, el helper cambia con ella: el prefijo del resultado
    // es siempre la constante, no una copia.
    expect(supplierDetailRoute('x').startsWith(`${SUPPLIERS_ROUTE}/`)).toBe(true)
  })

  it('ningun archivo de producto incrusta el literal de la ruta (R2, R3)', () => {
    const conElLiteral: string[] = []

    for (const carpeta of ['app', 'components', 'lib', 'hooks']) {
      for (const ruta of fuentesBajo(carpeta)) {
        if (ruta === 'lib/shared/routes.ts') continue
        const codigo = fuenteSinComentarios(ruta)
        if (LITERALES_DE_RUTA.some((literal) => codigo.includes(literal))) conElLiteral.push(ruta)
      }
    }

    expect(
      conElLiteral,
      'el literal de la ruta de proveedores solo puede vivir en lib/shared/routes.ts',
    ).toEqual([])
  })

  it('nadie redeclara la constante: private-nav y la regla ruta->rol la IMPORTAN (R2)', () => {
    for (const ruta of ['lib/shared/navigation/private-nav.ts', 'lib/composition/route-role-rules.ts']) {
      const codigo = fuenteSinComentarios(ruta)
      expect(codigo, `${ruta} no puede redeclarar SUPPLIERS_ROUTE`).not.toContain(
        'const SUPPLIERS_ROUTE =',
      )
      expect(codigo).toContain('SUPPLIERS_ROUTE')
    }
  })
})

describe('el prefijo privado cubre la lista y el detalle (R5)', () => {
  it('SUPPLIERS_ROUTE esta en PRIVATE_ROUTE_PREFIXES exactamente UNA vez (R5)', () => {
    // Una segunda fila para el detalle seria redundante -la comparacion es por segmentos- y la
    // guardia de rutas privadas la señalaria como prefijo sin pantalla propia (`design.md > 13.K`).
    expect(PRIVATE_ROUTE_PREFIXES.filter((prefijo) => prefijo === SUPPLIERS_ROUTE)).toEqual([
      SUPPLIERS_ROUTE,
    ])

    // Los prefijos que ya existian no se sustituyeron: se añadio uno.
    expect(PRIVATE_ROUTE_PREFIXES).toContain(INVENTORY_ROUTE)
    expect(PRIVATE_ROUTE_PREFIXES).toContain(FORMULAS_ROUTE)
    expect(PRIVATE_ROUTE_PREFIXES).toContain(DASHBOARD_ROUTE)
  })
})

// ---------------------------------------------------------------------------
// T2 — El item de navegacion (R4, R47)
// ---------------------------------------------------------------------------

describe('la navegacion privada lleva a proveedores (R4, R47)', () => {
  it('hay un item de NIVEL SUPERIOR cuyo destino es SUPPLIERS_ROUTE (R4)', () => {
    // Se busca por `href` -la constante-, nunca por el texto visible (R47).
    const deNivelSuperior = PRIVATE_NAV_ITEMS.filter(
      (item): item is NavLink => item.kind === 'link' && item.href === SUPPLIERS_ROUTE,
    )

    expect(deNivelSuperior).toHaveLength(1)
    expect(deNivelSuperior[0]?.label).toBe(SUPPLIERS_LABEL)
    expect(deNivelSuperior[0]?.testId).toBe('nav-proveedores')
    // Solo los items de nivel superior llevan icono; `truck` ya existia en `NavIconName`.
    expect(deNivelSuperior[0]?.icon).toBe('truck')
  })

  it('el item va en la seccion «Cadena», junto al grupo de produccion y NO dentro de el (R4)', () => {
    const proveedores = PRIVATE_NAV_ITEMS.find(
      (item): item is NavLink => item.kind === 'link' && item.href === SUPPLIERS_ROUTE,
    )
    const produccion = PRIVATE_NAV_ITEMS.find(
      (item) => item.kind === 'group' && item.testId === 'nav-produccion',
    )

    if (!proveedores || !produccion) throw new Error('falta el item de proveedores o el grupo')
    expect(proveedores.section).toBe(produccion.section)

    // Y no cuelga de ningun grupo: proveedores es modulo de dominio propio (epica QC-41).
    const comoHijoDeGrupo = PRIVATE_NAV_ITEMS.filter((item) => item.kind === 'group').flatMap(
      (item) => (item.kind === 'group' ? item.items : []),
    )
    expect(comoHijoDeGrupo.map((hijo) => hijo.href)).not.toContain(SUPPLIERS_ROUTE)
  })

  it('el destino y el testId son unicos en toda la navegacion (R4, R47)', () => {
    expect(NAV_APLANADO.filter((item) => item.href === SUPPLIERS_ROUTE)).toHaveLength(1)
    expect(NAV_APLANADO.filter((item) => item.testId === 'nav-proveedores')).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// T3 — La regla ruta->rol, con las constantes REALES (R6)
// ---------------------------------------------------------------------------
//
// Mismo patron que los bloques de inventario y de recetas de
// `tests/unit/identity/route-access.test.ts`: entrada y salida son objetos planos, sin Next, sin
// cookies y sin base de datos.

const SUB = '3f2b1c9e-0d4a-4c8b-9e77-2a5f6c1d8b40'
const ID_PROVEEDOR = '22222222-2222-4222-8222-222222222222'
const ANONIMO: RouteAccessSession = { kind: 'anonymous' }
const OPERADOR: RouteAccessSession = { kind: 'authenticated', sub: SUB, roleName: 'Operador' }
const ADMIN: RouteAccessSession = {
  kind: 'authenticated',
  sub: SUB,
  roleName: ADMIN_ROLE_NAME,
}

const REAL = {
  pathname: SUPPLIERS_ROUTE,
  search: '',
  session: ANONIMO,
  privatePrefixes: PRIVATE_ROUTE_PREFIXES,
  rules: ROUTE_ROLE_RULES,
  routes: { login: LOGIN_ROUTE, dashboard: DASHBOARD_ROUTE },
} as const satisfies RouteAccessInput

const RUTAS_DE_PROVEEDORES = [SUPPLIERS_ROUTE, supplierDetailRoute(ID_PROVEEDOR)] as const

describe('la pantalla de proveedores con las constantes reales (R5, R6)', () => {
  it('la regla se deriva de SUPPLIERS_ROUTE y restringe al Administrador (R6)', () => {
    expect(ROUTE_ROLE_RULES).toContainEqual({
      prefix: SUPPLIERS_ROUTE,
      roles: [ADMIN_ROLE_NAME],
    })
  })

  it.each([
    ['la lista', SUPPLIERS_ROUTE],
    ['el detalle', supplierDetailRoute(ID_PROVEEDOR)],
  ])('sin sesion, pedir %s redirige al login con esa ruta como destino de vuelta (R5)', (_, ruta) => {
    expect(decideRouteAccess({ ...REAL, pathname: ruta, session: ANONIMO })).toEqual({
      kind: 'redirect',
      to: `${LOGIN_ROUTE}?next=${encodeURIComponent(ruta)}`,
      reason: 'unauthenticated',
    })
  })

  // Trampa deliberada: comparte el texto del prefijo pero no el limite de segmento. Si la
  // cobertura se comprobase con `startsWith` a secas, esto quedaria cubierto por error.
  it('una ruta que solo comparte el texto del prefijo, sin limite de segmento, no queda cubierta (R5)', () => {
    expect(
      decideRouteAccess({ ...REAL, pathname: `${SUPPLIERS_ROUTE}X`, session: ANONIMO }),
    ).toEqual({ kind: 'allow' })
  })

  it('deja pasar al Administrador en la lista y en el detalle (R6)', () => {
    for (const ruta of RUTAS_DE_PROVEEDORES) {
      expect(decideRouteAccess({ ...REAL, pathname: ruta, session: ADMIN })).toEqual({
        kind: 'allow',
      })
    }
  })

  it('a un rol distinto de Administrador lo saca con motivo forbidden, no al login (R6)', () => {
    // «No autorizado» no es «no autenticado»: mandarlo al login le pediria unas credenciales que
    // ya tiene. El motivo `forbidden` distingue un caso del otro.
    for (const ruta of RUTAS_DE_PROVEEDORES) {
      expect(decideRouteAccess({ ...REAL, pathname: ruta, session: OPERADOR })).toEqual({
        kind: 'redirect',
        to: DASHBOARD_ROUTE,
        reason: 'forbidden',
      })
    }
  })

  it('las reglas de inventario y de recetas siguen en pie: se añadio una fila, no se sustituyo (R6)', () => {
    for (const ruta of [INVENTORY_ROUTE, FORMULAS_ROUTE]) {
      expect(decideRouteAccess({ ...REAL, pathname: ruta, session: OPERADOR })).toEqual({
        kind: 'redirect',
        to: DASHBOARD_ROUTE,
        reason: 'forbidden',
      })
    }
  })

  it('el resto del area privada no se cierra de rebote (R6)', () => {
    expect(decideRouteAccess({ ...REAL, pathname: DASHBOARD_ROUTE, session: OPERADOR })).toEqual({
      kind: 'allow',
    })
  })
})
