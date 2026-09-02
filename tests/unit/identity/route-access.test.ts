// T9 — La decision de acceso a una ruta (R2, R7, R9-R13, R20, R29).
//
// Todo el archivo corre sin Next, sin cookies y sin base de datos: la entrada son objetos
// planos y la salida es un objeto plano. Eso es R20, y el ultimo bloque lo afirma explicitamente.

import { readFileSync } from 'node:fs';

import {
  decideRouteAccess,
  type RouteAccessDecision,
  type RouteAccessInput,
  type RouteAccessSession,
} from '@/lib/modules/identity/domain/route-access';
import type { RouteRoleRule } from '@/lib/modules/identity/domain/route-role-rules';

const ROUTES = { login: '/login', dashboard: '/dashboard' } as const;
const PREFIJOS_PRIVADOS = ['/dashboard'] as const;

const SUB = '3f2b1c9e-0d4a-4c8b-9e77-2a5f6c1d8b40';
const ANONIMO: RouteAccessSession = { kind: 'anonymous' };
const OPERADOR: RouteAccessSession = { kind: 'authenticated', sub: SUB, roleName: 'Operador' };
const ADMIN: RouteAccessSession = { kind: 'authenticated', sub: SUB, roleName: 'Administrador' };

function decidir(overrides: Partial<RouteAccessInput> = {}): RouteAccessDecision {
  return decideRouteAccess({
    pathname: '/dashboard',
    search: '',
    session: ANONIMO,
    privatePrefixes: PREFIJOS_PRIVADOS,
    rules: [],
    routes: ROUTES,
    ...overrides,
  });
}

describe('decideRouteAccess — paso 1: lo publico se sirve tal cual (R11)', () => {
  it.each([['/'], ['/recuperar-contrasena'], ['/api/webhooks/algo']])(
    'deja pasar %s sin sesion',
    (pathname) => {
      expect(decidir({ pathname, session: ANONIMO })).toEqual({ kind: 'allow' });
    },
  );

  it('deja pasar una ruta publica con sesion valida', () => {
    expect(decidir({ pathname: '/', session: ADMIN })).toEqual({ kind: 'allow' });
  });

  it('deja pasar el login cuando no hay sesion', () => {
    expect(decidir({ pathname: '/login', session: ANONIMO })).toEqual({ kind: 'allow' });
  });

  // Un prefijo privado casa por segmentos: `/dashboards-publicos` no es `/dashboard`.
  it('no confunde una ruta que solo comparte el texto del prefijo privado', () => {
    expect(decidir({ pathname: '/dashboards-publicos', session: ANONIMO })).toEqual({
      kind: 'allow',
    });
  });
});

describe('decideRouteAccess — paso 2: ruta privada sin sesion (R2, R7)', () => {
  it('redirige al login llevando la ruta pedida como destino de vuelta', () => {
    expect(decidir({ pathname: '/dashboard', session: ANONIMO })).toEqual({
      kind: 'redirect',
      to: '/login?next=%2Fdashboard',
      reason: 'unauthenticated',
    });
  });

  // R7 — la cadena de consulta forma parte de la ruta pedida.
  it('lleva tambien la cadena de consulta de la ruta pedida', () => {
    const decision = decidir({
      pathname: '/dashboard/reportes',
      search: '?desde=ayer',
      session: ANONIMO,
    });

    expect(decision).toEqual({
      kind: 'redirect',
      to: '/login?next=%2Fdashboard%2Freportes%3Fdesde%3Dayer',
      reason: 'unauthenticated',
    });
  });
});

describe('decideRouteAccess — paso 3: login con sesion valida (R10)', () => {
  it('sin destino de vuelta redirige al dashboard', () => {
    expect(decidir({ pathname: '/login', session: ADMIN })).toEqual({
      kind: 'redirect',
      to: '/dashboard',
      reason: 'already-authenticated',
    });
  });

  it('con destino de vuelta valido redirige ahi, no al dashboard', () => {
    expect(
      decidir({ pathname: '/login', search: '?next=%2Fdashboard%2Freportes', session: ADMIN }),
    ).toEqual({
      kind: 'redirect',
      to: '/dashboard/reportes',
      reason: 'already-authenticated',
    });
  });

  // R9 — el destino de vuelta se valida como interno tambien aqui: nunca se emite una
  // redireccion fuera de este sitio.
  it.each([['https://evil.example'], ['//evil.example'], ['%2F%2Fevil.example']])(
    'con un destino de vuelta externo (%s) redirige al dashboard',
    (destino) => {
      const decision = decidir({
        pathname: '/login',
        search: `?next=${encodeURIComponent(destino)}`,
        session: ADMIN,
      });

      expect(decision).toEqual({
        kind: 'redirect',
        to: '/dashboard',
        reason: 'already-authenticated',
      });
    },
  );
});

describe('decideRouteAccess — paso 4: sesion valida sin el rol que la ruta exige (R13)', () => {
  const SOLO_ADMIN: RouteRoleRule = { prefix: '/dashboard/reportes', roles: ['Administrador'] };

  it('redirige al DASHBOARD, nunca al login: no autorizado no es no autenticado', () => {
    expect(
      decidir({ pathname: '/dashboard/reportes', session: OPERADOR, rules: [SOLO_ADMIN] }),
    ).toEqual({ kind: 'redirect', to: '/dashboard', reason: 'forbidden' });
  });

  it('deja pasar a quien si tiene el rol que la regla exige', () => {
    expect(
      decidir({ pathname: '/dashboard/reportes', session: ADMIN, rules: [SOLO_ADMIN] }),
    ).toEqual({ kind: 'allow' });
  });

  // R12 — el conjunto vacio es el estado de esta ficha: toda sesion valida pasa.
  it('sin reglas declaradas, toda sesion valida pasa a cualquier ruta privada', () => {
    expect(decidir({ pathname: '/dashboard/reportes', session: OPERADOR, rules: [] })).toEqual({
      kind: 'allow',
    });
  });

  // R13 — el bucle prohibido: redirigir el dashboard al dashboard.
  it('si la ruta no autorizada ES el dashboard, deja pasar en vez de redirigir (sin bucle)', () => {
    const reglaSobreDashboard: RouteRoleRule = { prefix: '/dashboard', roles: ['Administrador'] };

    expect(
      decidir({ pathname: '/dashboard', session: OPERADOR, rules: [reglaSobreDashboard] }),
    ).toEqual({ kind: 'allow' });
  });

  it('si el propio dashboard tampoco esta autorizado, una subruta suya tampoco redirige ahi', () => {
    const reglaSobreDashboard: RouteRoleRule = { prefix: '/dashboard', roles: ['Administrador'] };

    expect(
      decidir({ pathname: '/dashboard/reportes', session: OPERADOR, rules: [reglaSobreDashboard] }),
    ).toEqual({ kind: 'allow' });
  });

  // La regla mas larga gana tambien desde la decision, no solo en `findRouteRule`.
  it('aplica la regla del prefijo mas largo que case', () => {
    const reglas: readonly RouteRoleRule[] = [
      { prefix: '/dashboard/reportes', roles: ['Administrador', 'Operador'] },
      { prefix: '/dashboard/reportes/costos', roles: ['Administrador'] },
    ];

    expect(decidir({ pathname: '/dashboard/reportes', session: OPERADOR, rules: reglas })).toEqual({
      kind: 'allow',
    });
    expect(
      decidir({ pathname: '/dashboard/reportes/costos', session: OPERADOR, rules: reglas }),
    ).toEqual({ kind: 'redirect', to: '/dashboard', reason: 'forbidden' });
  });
});

describe('decideRouteAccess — paso 5: el resto pasa', () => {
  it('ruta privada con sesion valida y sin regla que la cubra', () => {
    expect(decidir({ pathname: '/dashboard', session: OPERADOR })).toEqual({ kind: 'allow' });
  });
});

describe('decideRouteAccess — R29: la decision no es una autorizacion', () => {
  const BASE = {
    search: '',
    privatePrefixes: PREFIJOS_PRIVADOS,
    rules: [] as readonly RouteRoleRule[],
    routes: ROUTES,
  };

  const CASOS: readonly RouteAccessInput[] = [
    { ...BASE, pathname: '/', session: ANONIMO },
    { ...BASE, pathname: '/dashboard', session: ANONIMO },
    { ...BASE, pathname: '/login', session: ADMIN },
    { ...BASE, pathname: '/dashboard', session: ADMIN },
    {
      ...BASE,
      pathname: '/dashboard/reportes',
      session: OPERADOR,
      rules: [{ prefix: '/dashboard/reportes', roles: ['Administrador'] }],
    },
  ];

  // R29 — solo «pasa» o «redirige a». Nunca capacidades, permisos ni roles: quien autoriza es
  // el service (`docs/architecture.md > Acceso a datos y autorizacion`), no el middleware.
  it('solo devuelve allow o redirect, y nunca capacidades, permisos ni roles', () => {
    for (const entrada of CASOS) {
      const decision = decideRouteAccess(entrada);

      expect(['allow', 'redirect']).toContain(decision.kind);
      expect(Object.keys(decision).sort()).toEqual(
        decision.kind === 'allow' ? ['kind'] : ['kind', 'reason', 'to'],
      );
      expect(JSON.stringify(decision)).not.toContain('Administrador');
      expect(JSON.stringify(decision)).not.toContain('Operador');
      expect(JSON.stringify(decision)).not.toContain(SUB);
    }
  });
});

describe('decideRouteAccess — R20: se ejercita sin Next, sin cookies y sin base de datos', () => {
  it('los prefijos privados y las rutas entran como parametros, no se importan', () => {
    // Prefijos y rutas inventados por el test: si el dominio los importara de `lib/shared`,
    // estos dos casos no podrian afirmarse.
    const decision = decideRouteAccess({
      pathname: '/zona-privada/algo',
      search: '',
      session: ANONIMO,
      privatePrefixes: ['/zona-privada'],
      rules: [],
      routes: { login: '/entrar', dashboard: '/inicio' },
    });

    expect(decision).toEqual({
      kind: 'redirect',
      to: '/entrar?next=%2Fzona-privada%2Falgo',
      reason: 'unauthenticated',
    });
  });

  it('el modulo de dominio solo importa de su propia carpeta: ni next, ni Prisma, ni lib/shared', () => {
    const fuente = readFileSync('lib/modules/identity/domain/route-access.ts', 'utf8');
    const especificadores = [...fuente.matchAll(/^import .*? from '([^']+)';$/gm)].map((m) => m[1]);

    expect(especificadores.length).toBeGreaterThan(0);
    for (const especificador of especificadores) {
      expect(especificador.startsWith('./')).toBe(true);
    }
  });
});
