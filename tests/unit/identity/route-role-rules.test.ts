// T8 — El gancho de reglas ruta→rol (R12). Dominio puro: sin Next, sin cookies, sin base (R20).
//
// Las reglas de estos tests son SINTETICAS a proposito (`design.md > 4.3`): `ROUTE_ROLE_RULES`
// esta vacio en esta ficha, asi que `findRouteRule` se ejercita con reglas propias del test. Asi
// la busqueda tiene test real hoy y la primera ficha que añada una regla no estrena codigo.

import {
  ROUTE_ROLE_RULES,
  findRouteRule,
  type RouteRoleRule,
} from '@/lib/modules/identity/domain/route-role-rules';

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

describe('ROUTE_ROLE_RULES', () => {
  // R12 — el conjunto esta vacio A PROPOSITO (D8): mientras lo este, toda sesion valida pasa a
  // cualquier ruta privada. Si alguien añade una fila aqui sin ficha que la respalde, este test
  // se pone rojo y obliga a decidirlo en el sitio correcto.
  it('esta vacio a proposito: QC-9 construye el gancho, no declara reglas', () => {
    expect(ROUTE_ROLE_RULES).toEqual([]);
  });

  it('estando vacio, ninguna ruta privada tiene regla aplicable', () => {
    expect(findRouteRule(ROUTE_ROLE_RULES, '/dashboard')).toBeNull();
    expect(findRouteRule(ROUTE_ROLE_RULES, '/dashboard/reportes')).toBeNull();
  });
});
