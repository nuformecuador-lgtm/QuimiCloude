import type { NavItem } from './private-nav';

function segments(path: string): string[] {
  return path.split(/[?#]/, 1)[0]!.split('/').filter((segment) => segment !== '');
}

function isSegmentPrefix(prefix: readonly string[], path: readonly string[]): boolean {
  return prefix.length <= path.length && prefix.every((segment, i) => segment === path[i]);
}

/**
 * Clave del módulo al que pertenece `pathname`: el `href` más largo que es prefijo de la ruta por
 * segmentos (`/pedidos` no es prefijo de `/pedidos-x`), o `/<primer segmento>` si ninguno lo es.
 * Un `href` sin segmentos (`/`) se ignora: sería prefijo de todo y fundiría todos los módulos.
 */
export function navModuleKey(pathname: string, hrefs: readonly string[]): string {
  const path = segments(pathname);
  let best: { href: string; length: number } | null = null;

  for (const href of hrefs) {
    const prefix = segments(href);
    if (prefix.length === 0 || !isSegmentPrefix(prefix, path)) continue;
    if (best === null || prefix.length > best.length) best = { href, length: prefix.length };
  }

  if (best !== null) return best.href;
  return `/${path[0] ?? ''}`;
}

/** Los `href` de todos los enlaces del menu, incluidos los hijos de cada grupo. */
export function navItemHrefs(items: readonly NavItem[]): string[] {
  return items.flatMap((item) =>
    item.kind === 'link' ? [item.href] : item.items.map((link) => link.href),
  );
}
