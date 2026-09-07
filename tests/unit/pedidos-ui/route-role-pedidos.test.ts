// QC-35 T3 — La regla ruta->rol de pedidos (R5).
//
// Decisiones puras de `decideRouteAccess` con las constantes REALES —`PRIVATE_ROUTE_PREFIXES` y
// `ROUTE_ROLE_RULES` de verdad—, mismo patron que el bloque de proveedores de
// `tests/unit/proveedores/supplier-route-contract.test.ts`. Sin Next, sin cookies, sin base.
//
// Ojo con lo que este test NO dice: que una regla deje pasar **no autoriza nada** (QC-9 R29). El
// corte real es el `requireAdmin` de los seis casos de uso de `pedidos` (QC-34 R1), que esta
// ficha no repite (R6).

import { describe, expect, it } from 'vitest';

// La lista real de reglas es CABLEADO y vive en `lib/composition/` (QC-22).
import { ROUTE_ROLE_RULES } from '@/lib/composition/route-role-rules';
import {
  decideRouteAccess,
  type RouteAccessInput,
  type RouteAccessSession,
} from '@/lib/modules/identity/domain/route-access';
import { ROLE_ADMINISTRADOR } from '@/lib/modules/identity';
import {
  DASHBOARD_ROUTE,
  INVENTORY_ROUTE,
  LOGIN_ROUTE,
  ORDERS_ROUTE,
  PRIVATE_ROUTE_PREFIXES,
  SUPPLIERS_ROUTE,
} from '@/lib/shared/routes';

const SUB = '3f2b1c9e-0d4a-4c8b-9e77-2a5f6c1d8b40';
const ANONIMO: RouteAccessSession = { kind: 'anonymous' };
const OPERADOR: RouteAccessSession = { kind: 'authenticated', sub: SUB, roleName: 'Operador' };
const ADMIN: RouteAccessSession = { kind: 'authenticated', sub: SUB, roleName: ROLE_ADMINISTRADOR };

const REAL = {
  pathname: ORDERS_ROUTE,
  search: '',
  session: ANONIMO,
  privatePrefixes: PRIVATE_ROUTE_PREFIXES,
  rules: ROUTE_ROLE_RULES,
  routes: { login: LOGIN_ROUTE, dashboard: DASHBOARD_ROUTE },
} as const satisfies RouteAccessInput;

describe('la pantalla de pedidos con las constantes reales (R5)', () => {
  it('la regla se deriva de ORDERS_ROUTE y restringe al Administrador (R5)', () => {
    expect(ROUTE_ROLE_RULES).toContainEqual({
      prefix: ORDERS_ROUTE,
      roles: [ROLE_ADMINISTRADOR],
    });
  });

  it('deja pasar al Administrador (R5)', () => {
    expect(decideRouteAccess({ ...REAL, session: ADMIN })).toEqual({ kind: 'allow' });
  });

  it('a un rol distinto de Administrador lo saca con motivo forbidden, no al login (R5)', () => {
    // «No autorizado» no es «no autenticado»: mandarlo al login le pediria unas credenciales que
    // ya tiene. Y sale ANTES de renderizar el contenido, que es lo que R5 exige.
    expect(decideRouteAccess({ ...REAL, session: OPERADOR })).toEqual({
      kind: 'redirect',
      to: DASHBOARD_ROUTE,
      reason: 'forbidden',
    });
  });

  it('sin sesion redirige al login con la ruta de pedidos como destino de vuelta (R4)', () => {
    expect(decideRouteAccess({ ...REAL, session: ANONIMO })).toEqual({
      kind: 'redirect',
      to: `${LOGIN_ROUTE}?next=${encodeURIComponent(ORDERS_ROUTE)}`,
      reason: 'unauthenticated',
    });
  });

  // Trampa deliberada: comparte el texto del prefijo pero no el limite de segmento. Si la
  // cobertura se comprobase con `startsWith` a secas, esto quedaria cubierto por error.
  it('una ruta que solo comparte el texto del prefijo, sin limite de segmento, no queda cubierta (R5)', () => {
    expect(decideRouteAccess({ ...REAL, pathname: `${ORDERS_ROUTE}X`, session: ANONIMO })).toEqual({
      kind: 'allow',
    });
  });

  it('las reglas anteriores siguen en pie: se anadio una fila, no se sustituyo (R5)', () => {
    for (const ruta of [INVENTORY_ROUTE, SUPPLIERS_ROUTE]) {
      expect(decideRouteAccess({ ...REAL, pathname: ruta, session: OPERADOR })).toEqual({
        kind: 'redirect',
        to: DASHBOARD_ROUTE,
        reason: 'forbidden',
      });
    }
  });

  it('el resto del area privada no se cierra de rebote (R5)', () => {
    expect(decideRouteAccess({ ...REAL, pathname: DASHBOARD_ROUTE, session: OPERADOR })).toEqual({
      kind: 'allow',
    });
  });
});
