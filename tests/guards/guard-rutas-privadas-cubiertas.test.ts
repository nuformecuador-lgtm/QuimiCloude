// T11 — Guardia: toda pantalla bajo `app/(private)/` esta cubierta por un prefijo privado (R1).
//
// La decision cerrada D4 dice que se protege **por convencion** todo lo que cuelga de
// `app/(private)/`: una pantalla nueva queda protegida por nacer ahi, sin registrarse a mano en
// el middleware. Pero `(private)` es un route group y **no aparece en la URL**, asi que el
// middleware no puede deducir del camino que una ruta es privada: hay una lista declarada,
// `PRIVATE_ROUTE_PREFIXES` (`lib/shared/routes.ts`, `design.md > 7`).
//
// Una lista declarada al lado de un arbol de archivos se desincroniza en silencio, y el fallo es
// del peor tipo: crear `app/(private)/productos/page.tsx` sin tocar la constante deja la pantalla
// **abierta** sin que nada compile en rojo ni ningun test se queje. Esta guardia ata las dos
// mitades: cada carpeta con `page.tsx` bajo `(private)` tiene que estar cubierta por un prefijo, y
// ningun prefijo puede sobrar. La convencion se cumple sola o falla ruidosamente; lo que no puede
// es fallar en silencio.
//
// Mismo patron que `guard-firma-sesion-unica.test.ts`: `findRepoRoot`, funciones puras exportadas
// y casos sinteticos que demuestran que la regla dispara Y el caso simetrico que no la viola.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { PRIVATE_ROUTE_PREFIXES } from '@/lib/shared/routes';

/** Sube desde este archivo hasta la raiz del repo (la carpeta con `package.json`). */
function findRepoRoot(startDir: string): string {
  let dir = startDir;
  for (;;) {
    try {
      readFileSync(join(dir, 'package.json'));
      return dir;
    } catch {
      const parent = dirname(dir);
      if (parent === dir) throw new Error(`no se encontro package.json subiendo desde ${startDir}`);
      dir = parent;
    }
  }
}

const repoRoot = findRepoRoot(dirname(fileURLToPath(import.meta.url)));

/** Raiz del arbol privado. Todo lo que cuelga de aqui exige sesion valida (R1). */
const PRIVATE_ROOT = join('app', '(private)');

/**
 * Carpetas que no producen URL y no se recorren: `components/` es la convencion de este repo
 * para colocar componentes junto a la pantalla que los usa (`docs/architecture.md`), no una ruta.
 */
const NON_ROUTE_DIRS = new Set(['components']);

/** Un segmento entre parentesis es un route group: organiza carpetas y no aparece en la URL. */
export function isRouteGroup(segment: string): boolean {
  return segment.startsWith('(') && segment.endsWith(')');
}

/**
 * URL de una carpeta con `page.tsx`, a partir de sus segmentos relativos a `app/(private)/`.
 * Los route groups se descartan; la carpeta sin segmentos utiles es la raiz.
 */
export function routeFromSegments(segments: readonly string[]): string {
  const utiles = segments.filter((segment) => !isRouteGroup(segment));
  return utiles.length === 0 ? '/' : `/${utiles.join('/')}`;
}

function listDirectories(dir: string): readonly string[] {
  let names: readonly string[];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  return names.filter((name) => statSync(join(dir, name)).isDirectory());
}

function hasPage(dir: string): boolean {
  try {
    statSync(join(dir, 'page.tsx'));
    return true;
  } catch {
    return false;
  }
}

/**
 * URLs de todas las pantallas (`page.tsx`) que cuelgan de `app/(private)/`, ignorando
 * `components/` y los route groups. Hoy: `['/dashboard']`.
 */
export function listPrivatePageRoutes(root: string): readonly string[] {
  function walk(dir: string, segments: readonly string[]): readonly string[] {
    const propias = hasPage(dir) ? [routeFromSegments(segments)] : [];
    const hijas = listDirectories(dir)
      .filter((name) => !NON_ROUTE_DIRS.has(name))
      .flatMap((name) => walk(join(dir, name), [...segments, name]));
    return [...propias, ...hijas];
  }

  return [...walk(join(root, PRIVATE_ROOT), [])].sort();
}

function isCoveredBy(route: string, prefix: string): boolean {
  return route === prefix || route.startsWith(`${prefix}/`);
}

/** Pantallas privadas que ningun prefijo declarado protege: cada una es un agujero abierto. */
export function findUncoveredRoutes(
  routes: readonly string[],
  prefixes: readonly string[],
): readonly string[] {
  return routes.filter((route) => !prefixes.some((prefix) => isCoveredBy(route, prefix)));
}

/** Prefijos declarados que ya no protegen ninguna pantalla: sobran y confunden. */
export function findUnusedPrefixes(
  routes: readonly string[],
  prefixes: readonly string[],
): readonly string[] {
  return prefixes.filter((prefix) => !routes.some((route) => isCoveredBy(route, prefix)));
}

describe('guardia — toda ruta bajo app/(private)/ esta declarada como privada (R1)', () => {
  it('encuentra las pantallas privadas del arbol real', () => {
    const rutas = listPrivatePageRoutes(repoRoot);

    // Si esto se vacia, la guardia dejaria de comprobar nada sin ponerse roja: el barrido
    // tendria un bug (ruta de `app/(private)` cambiada, `sep` de Windows, etc.).
    expect(rutas.length).toBeGreaterThan(0);
    expect(rutas).toContain('/dashboard');
  });

  it('cada pantalla privada esta cubierta por un prefijo de PRIVATE_ROUTE_PREFIXES', () => {
    const rutas = listPrivatePageRoutes(repoRoot);
    const descubiertas = findUncoveredRoutes(rutas, PRIVATE_ROUTE_PREFIXES);

    expect(
      descubiertas,
      descubiertas.length === 0
        ? undefined
        : `Estas pantallas cuelgan de app/(private)/ y NINGUN prefijo las protege: ` +
            `${descubiertas.join(', ')}. El middleware no puede deducirlo del camino porque ` +
            '(private) es un route group y no aparece en la URL: añade el prefijo en ' +
            'PRIVATE_ROUTE_PREFIXES (lib/shared/routes.ts). Hasta entonces esa pantalla se ' +
            'sirve SIN sesion (R1, design.md > 7).',
    ).toEqual([]);
  });

  it('ningun prefijo declarado sobra: todos protegen alguna pantalla existente', () => {
    const rutas = listPrivatePageRoutes(repoRoot);
    const sobrantes = findUnusedPrefixes(rutas, PRIVATE_ROUTE_PREFIXES);

    expect(
      sobrantes,
      sobrantes.length === 0
        ? undefined
        : `Estos prefijos de PRIVATE_ROUTE_PREFIXES no protegen ninguna pantalla de ` +
            `app/(private)/: ${sobrantes.join(', ')}. O la pantalla se movio y el prefijo se ` +
            'quedo atras, o el prefijo esta mal escrito. Un prefijo que no corresponde a nada ' +
            'hace creer que hay proteccion donde no hay pantalla (R1).',
    ).toEqual([]);
  });

  // Casos sinteticos: la regla dispara donde debe y no donde no debe, sin depender del arbol real.
  it('la URL ignora los route groups y `components/` no produce ruta', () => {
    expect(routeFromSegments(['dashboard'])).toBe('/dashboard');
    expect(routeFromSegments(['(ventas)', 'facturas'])).toBe('/facturas');
    expect(routeFromSegments(['productos', 'nuevo'])).toBe('/productos/nuevo');
    expect(routeFromSegments([])).toBe('/');
    expect(isRouteGroup('(private)')).toBe(true);
    expect(isRouteGroup('dashboard')).toBe(false);
  });

  it('detecta una pantalla nueva sin prefijo que la cubra, y no confunde un prefijo parecido', () => {
    expect(findUncoveredRoutes(['/dashboard', '/productos'], ['/dashboard'])).toEqual([
      '/productos',
    ]);
    expect(findUncoveredRoutes(['/dashboard/reportes'], ['/dashboard'])).toEqual([]);
    // Un prefijo cubre por SEGMENTOS: `/dashboard` no protege `/dashboards-publicos`.
    expect(findUncoveredRoutes(['/dashboards-publicos'], ['/dashboard'])).toEqual([
      '/dashboards-publicos',
    ]);
  });

  it('detecta un prefijo que ya no corresponde a ninguna pantalla', () => {
    expect(findUnusedPrefixes(['/dashboard'], ['/dashboard', '/productos'])).toEqual(['/productos']);
    expect(findUnusedPrefixes(['/dashboard/reportes'], ['/dashboard'])).toEqual([]);
  });

  it('el barrido corre igual en Windows: las rutas se componen con segmentos, no con el separador del sistema', () => {
    expect(listPrivatePageRoutes(repoRoot).every((route) => !route.includes(sep === '/' ? '\\' : sep))).toBe(
      true,
    );
  });
});
