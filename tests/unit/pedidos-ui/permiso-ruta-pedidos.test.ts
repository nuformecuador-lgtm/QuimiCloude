// QC-35 T3, reescrito por QC-75 T12 — El permiso de la pantalla de pedidos (QC-75 R5, R6, R16).
//
// **Este archivo se llamaba `route-role-pedidos.test.ts` y afirmaba que la lista ruta->rol del
// borde tenia una fila `{prefix: ORDERS_ROUTE, roles: [Administrador]}`.** QC-75 la retiro entera
// (R16): el borde ya no corta por rol. Lo que ata hoy esta ruta a quien puede verla son dos cosas
// que tienen que declarar EL MISMO codigo de permiso:
//
//   (a) la pantalla exige `pedidos.consultar` con `requirePagePermission` (R6), y
//   (b) su item de `PRIVATE_NAV_ITEMS` declara ese permiso (R5).
//
// Si se desincronizaran, el enlace saldria en el menu de quien recibe un 404 al pulsarlo.
//
// Se conservan las decisiones puras de `decideRouteAccess` con las constantes REALES
// —`PRIVATE_ROUTE_PREFIXES` de verdad—, sin Next, sin cookies y sin base: lo que afirman ahora es
// que la ruta sigue siendo privada y que, con sesion valida, pasa el borde sea cual sea el rol.
//
// Ojo con lo que este test NO dice: que el borde deje pasar **no autoriza nada** (QC-9 R29). El
// corte sobre los datos es el `requirePermission` de los casos de uso de `pedidos`, que esta
// ficha no repite.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  decideRouteAccess,
  type RouteAccessInput,
  type RouteAccessSession,
} from '@/lib/modules/identity/domain/route-access';
import { PERMISSIONS } from '@/lib/modules/identity';
import { PRIVATE_NAV_ITEMS, type NavLink } from '@/lib/shared/navigation/private-nav';
import {
  DASHBOARD_ROUTE,
  INVENTORY_ROUTE,
  LOGIN_ROUTE,
  ORDERS_ROUTE,
  PRIVATE_ROUTE_PREFIXES,
  SUPPLIERS_ROUTE,
} from '@/lib/shared/routes';

const RAIZ = join(__dirname, '..', '..', '..');

/** La pantalla, DERIVADA de la constante: el route group `(private)` no aporta segmento. */
const PAGE_PATH = `app/(private)${ORDERS_ROUTE}/page.tsx`;

/** Texto del archivo sin comentarios: una llamada citada en un comentario no es codigo. */
function fuenteSinComentarios(ruta: string): string {
  return readFileSync(join(RAIZ, ruta), 'utf8')
    .replace(/\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, ' ');
}

/** Todos los items de navegacion, aplanando los grupos en sus hijos. */
const NAV_APLANADO: readonly NavLink[] = PRIVATE_NAV_ITEMS.flatMap((item) =>
  item.kind === 'group' ? item.items : [item],
);

const SUB = '3f2b1c9e-0d4a-4c8b-9e77-2a5f6c1d8b40';
const ANONIMO: RouteAccessSession = { kind: 'anonymous' };
const CON_SESION: RouteAccessSession = { kind: 'authenticated', sub: SUB };

const REAL = {
  pathname: ORDERS_ROUTE,
  search: '',
  session: ANONIMO,
  privatePrefixes: PRIVATE_ROUTE_PREFIXES,
  routes: { login: LOGIN_ROUTE, dashboard: DASHBOARD_ROUTE },
} as const satisfies RouteAccessInput;

describe('el permiso de la pantalla de pedidos (QC-75 R5, R6)', () => {
  // El codigo se DERIVA del catalogo de `identity`, nunca se escribe a mano: si alguien lo
  // renombrara, esto se pone rojo en vez de quedarse vigilando un permiso inexistente.
  it('la pantalla exige pedidos.consultar y su item de menu declara el mismo permiso', () => {
    const permiso = PERMISSIONS.find(
      (entrada) => entrada.module === 'pedidos' && entrada.action === 'consultar',
    );
    expect(permiso, 'el catalogo de identity deberia tener pedidos.consultar').toBeDefined();

    expect(fuenteSinComentarios(PAGE_PATH)).toContain(
      `requirePagePermission('${permiso?.code}')`,
    );

    const enlace = NAV_APLANADO.find((item) => item.href === ORDERS_ROUTE);
    expect(enlace?.permission).toBe(permiso?.code);
  });
});

describe('la ruta de pedidos sigue siendo privada (QC-75 R16, R17)', () => {
  it('sin sesion redirige al login con la ruta de pedidos como destino de vuelta', () => {
    expect(decideRouteAccess({ ...REAL, session: ANONIMO })).toEqual({
      kind: 'redirect',
      to: `${LOGIN_ROUTE}?next=${encodeURIComponent(ORDERS_ROUTE)}`,
      reason: 'unauthenticated',
    });
  });

  // R16 — sustituye a «al Operador lo saca con motivo forbidden»: el borde ya no mira el rol. A
  // quien no tenga `pedidos.consultar` lo corta el 404 de la pagina, no una redireccion.
  it('con sesion valida pasa, sea cual sea el rol', () => {
    expect(decideRouteAccess({ ...REAL, session: CON_SESION })).toEqual({ kind: 'allow' });
  });

  // Trampa deliberada: comparte el texto del prefijo pero no el limite de segmento. Si la
  // cobertura se comprobase con `startsWith` a secas, esto quedaria cubierto por error.
  it('una ruta que solo comparte el texto del prefijo, sin limite de segmento, no queda cubierta', () => {
    expect(decideRouteAccess({ ...REAL, pathname: `${ORDERS_ROUTE}X`, session: ANONIMO })).toEqual({
      kind: 'allow',
    });
  });

  it('los prefijos anteriores siguen en pie: se anadio uno, no se sustituyo', () => {
    for (const ruta of [INVENTORY_ROUTE, SUPPLIERS_ROUTE]) {
      expect(decideRouteAccess({ ...REAL, pathname: ruta, session: ANONIMO })).toEqual({
        kind: 'redirect',
        to: `${LOGIN_ROUTE}?next=${encodeURIComponent(ruta)}`,
        reason: 'unauthenticated',
      });
    }
  });

  it('el resto del area privada no se cierra de rebote', () => {
    expect(decideRouteAccess({ ...REAL, pathname: DASHBOARD_ROUTE, session: CON_SESION })).toEqual({
      kind: 'allow',
    });
  });
});
