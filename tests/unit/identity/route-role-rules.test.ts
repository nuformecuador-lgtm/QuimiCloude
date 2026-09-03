// QC-9 T8 — El gancho de reglas ruta→rol (R12). Dominio puro: sin Next, sin cookies, sin base (R20).
// QC-22 T14 — La PRIMERA regla real del repositorio (R4).
//
// Las reglas del primer bloque siguen siendo SINTETICAS a proposito (`design.md > 4.3`): asi lo
// que se ejercita de `findRouteRule` es la BUSQUEDA, sin depender de que la lista real diga hoy
// una cosa u otra. El segundo bloque, en cambio, mira la lista REAL.

import { readFileSync } from 'node:fs';

import { ADMIN_ROLE_NAME } from '@/lib/modules/inventario';
import { ROUTE_ROLE_RULES } from '@/lib/modules/identity/adapters/driving/route-role-rules';
import { findRouteRule, type RouteRoleRule } from '@/lib/modules/identity/domain/route-role-rules';
import { INVENTORY_ROUTE } from '@/lib/shared/routes';

const PRODUCTOS: RouteRoleRule = { prefix: '/productos', roles: ['Administrador', 'Operador'] };
const PRODUCTOS_NUEVO: RouteRoleRule = { prefix: '/productos/nuevo', roles: ['Administrador'] };
const REGLAS: readonly RouteRoleRule[] = [PRODUCTOS, PRODUCTOS_NUEVO];

describe('findRouteRule', () => {
  // R12
  it('devuelve null cuando ninguna regla casa', () => {
    expect(findRouteRule(REGLAS, '/dashboard')).toBeNull();
  });

  it('devuelve null cuando no hay reglas', () => {
    expect(findRouteRule([], '/productos')).toBeNull();
  });

  it('casa la ruta exacta del prefijo', () => {
    expect(findRouteRule(REGLAS, '/productos')).toBe(PRODUCTOS);
  });

  it('casa una ruta que cuelga del prefijo', () => {
    expect(findRouteRule(REGLAS, '/productos/abc-123')).toBe(PRODUCTOS);
  });

  // El criterio del prefijo mas largo es lo que permite que una subruta sea MAS estricta.
  it('gana el prefijo mas largo que case, no el primero de la lista', () => {
    expect(findRouteRule(REGLAS, '/productos/nuevo')).toBe(PRODUCTOS_NUEVO);
    expect(findRouteRule([PRODUCTOS_NUEVO, PRODUCTOS], '/productos/nuevo')).toBe(PRODUCTOS_NUEVO);
  });

  it('el resultado no depende del orden en que se declaren las reglas', () => {
    expect(findRouteRule([...REGLAS].reverse(), '/productos/nuevo')).toBe(PRODUCTOS_NUEVO);
    expect(findRouteRule([...REGLAS].reverse(), '/productos')).toBe(PRODUCTOS);
  });

  // Un prefijo casa por segmentos: `/productos` no cubre `/productosx`, que es otra pantalla.
  it('no casa una ruta que solo comparte el texto del prefijo sin limite de segmento', () => {
    expect(findRouteRule(REGLAS, '/productosx')).toBeNull();
  });
});

describe('ROUTE_ROLE_RULES — la lista real', () => {
  // CENTINELA INVERTIDO el 2026-09-03 (QC-22 T14, R4).
  //
  // Hasta QC-9 este bloque afirmaba que la lista estaba «vacia a proposito (D8)», con el encargo
  // escrito de que «la primera regla sera la pantalla de productos, solo Administrador». QC-22
  // trae exactamente esa pantalla, asi que la premisa dejo de ser cierta y el centinela se
  // INVIERTE en vez de borrarse: donde antes exigia el vacio, ahora exige que la unica fila sea
  // la declarada, ni una mas. Anadir una segunda regla sin ficha que la respalde sigue poniendo
  // esto en rojo, que es para lo que el centinela existe.
  //
  // La lista vive en `adapters/driving/` desde el mismo 2026-09-03: nombrar la ruta exige
  // `INVENTORY_ROUTE` de `lib/shared/routes` y el dominio no puede importar `lib/shared`.
  it('declara exactamente una regla: la pantalla de inventario, solo Administrador (R4)', () => {
    expect(ROUTE_ROLE_RULES).toEqual([{ prefix: INVENTORY_ROUTE, roles: [ADMIN_ROLE_NAME] }]);
  });

  it('la regla se aplica a la ruta de inventario y a lo que cuelgue de ella (R4)', () => {
    expect(findRouteRule(ROUTE_ROLE_RULES, INVENTORY_ROUTE)?.roles).toEqual([ADMIN_ROLE_NAME]);
    expect(findRouteRule(ROUTE_ROLE_RULES, `${INVENTORY_ROUTE}/nuevo`)?.roles).toEqual([
      ADMIN_ROLE_NAME,
    ]);
  });

  // Lo que la ficha NO hace: cerrar el resto del area privada. Cada ficha anade su fila.
  it('ninguna otra ruta privada gana regla por el camino', () => {
    expect(findRouteRule(ROUTE_ROLE_RULES, '/dashboard')).toBeNull();
    expect(findRouteRule(ROUTE_ROLE_RULES, '/dashboard/reportes')).toBeNull();
  });

  // R2 — la fila se deriva de la constante unica de ruta; el literal no se reescribe aqui.
  it('la fila se deriva de INVENTORY_ROUTE y de ADMIN_ROLE_NAME, no de literales propios', () => {
    const fuente = readFileSync(
      'lib/modules/identity/adapters/driving/route-role-rules.ts',
      'utf8',
    )
      .replace(/\/\/.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, ' ');

    expect(fuente).toContain("from '@/lib/shared/routes'");
    expect(fuente).toContain("from '@/lib/modules/inventario'");
    expect(fuente).not.toContain(`'${INVENTORY_ROUTE}'`);
    expect(fuente).not.toContain(`'${ADMIN_ROLE_NAME}'`);
  });
});
