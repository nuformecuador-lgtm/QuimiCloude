// T9 — La decision de acceso a una ruta (R2, R7, R9-R13, R20, R29).
//
// Todo el archivo corre sin Next, sin cookies y sin base de datos: la entrada son objetos
// planos y la salida es un objeto plano. Eso es R20, y el ultimo bloque lo afirma explicitamente.

import { readFileSync } from 'node:fs';

// La lista real de reglas es CABLEADO y vive en `lib/composition` desde el 2026-09-03 (QC-22).
import { ROUTE_ROLE_RULES } from '@/lib/composition/route-role-rules';
import {
  decideRouteAccess,
  type RouteAccessDecision,
  type RouteAccessInput,
  type RouteAccessSession,
} from '@/lib/modules/identity/domain/route-access';
import type { RouteRoleRule } from '@/lib/modules/identity/domain/route-role-rules';
import { ROLE_ADMINISTRADOR } from '@/lib/modules/identity';
import {
  DASHBOARD_ROUTE,
  FORMULAS_ROUTE,
  INVENTORY_ROUTE,
  LOGIN_ROUTE,
  NEW_RECIPE_ROUTE,
  PRIVATE_ROUTE_PREFIXES,
  recipeEditRoute,
} from '@/lib/shared/routes';

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

// ---------------------------------------------------------------------------
// QC-22 T14 — La pantalla de inventario, con las constantes REALES (R3, R4)
// ---------------------------------------------------------------------------
//
// Los bloques de arriba usan prefijos y reglas sinteticos a proposito: lo que ejercitan es la
// POLITICA. Este bloque hace lo contrario y es el unico que lo hace: entra con
// `PRIVATE_ROUTE_PREFIXES` y `ROUTE_ROLE_RULES` de verdad, mas `INVENTORY_ROUTE` y
// `ROLE_ADMINISTRADOR` de sus constantes unicas, porque lo que se afirma aqui NO es la politica sino
// que ESTA pantalla quedo efectivamente cubierta y restringida. Con reglas sinteticas, sacar
// `/inventario` de la lista de prefijos privados no pondria rojo ningun test.
//
// R29 sigue en pie: que esto deje pasar no autoriza nada sobre los datos. El corte sobre el
// catalogo lo ponen los casos de uso de `inventario`, antes del repositorio.
const REAL = {
  search: '',
  privatePrefixes: PRIVATE_ROUTE_PREFIXES,
  rules: ROUTE_ROLE_RULES,
  routes: { login: LOGIN_ROUTE, dashboard: DASHBOARD_ROUTE },
} as const;

describe('la pantalla de inventario con las constantes reales (R3, R4)', () => {
  // R3 — la ruta esta cubierta por los prefijos privados declarados: sin sesion no se renderiza,
  // se redirige al login llevando el destino de vuelta.
  it('sin sesion redirige al login con la ruta pedida como destino de vuelta (R3)', () => {
    expect(decideRouteAccess({ ...REAL, pathname: INVENTORY_ROUTE, session: ANONIMO })).toEqual({
      kind: 'redirect',
      to: `${LOGIN_ROUTE}?next=${encodeURIComponent(INVENTORY_ROUTE)}`,
      reason: 'unauthenticated',
    });
  });

  it('sin sesion tampoco se sirve lo que cuelga de la ruta (R3)', () => {
    const decision = decideRouteAccess({
      ...REAL,
      pathname: `${INVENTORY_ROUTE}/nuevo`,
      session: ANONIMO,
    });

    expect(decision).toEqual({
      kind: 'redirect',
      to: `${LOGIN_ROUTE}?next=${encodeURIComponent(`${INVENTORY_ROUTE}/nuevo`)}`,
      reason: 'unauthenticated',
    });
  });

  // R4 — con sesion de Administrador entra; con cualquier otro rol, fuera y sin renderizar.
  it('deja pasar al Administrador (R4)', () => {
    const admin = { kind: 'authenticated', sub: SUB, roleName: ROLE_ADMINISTRADOR } as const;

    expect(decideRouteAccess({ ...REAL, pathname: INVENTORY_ROUTE, session: admin })).toEqual({
      kind: 'allow',
    });
    expect(
      decideRouteAccess({ ...REAL, pathname: `${INVENTORY_ROUTE}/nuevo`, session: admin }),
    ).toEqual({ kind: 'allow' });
  });

  it('a un rol distinto de Administrador lo saca al dashboard, no al login (R4)', () => {
    // «No autorizado» no es «no autenticado»: mandarlo al login le pediria unas credenciales
    // que ya tiene. El motivo `forbidden` es lo que distingue un caso del otro.
    expect(decideRouteAccess({ ...REAL, pathname: INVENTORY_ROUTE, session: OPERADOR })).toEqual({
      kind: 'redirect',
      to: DASHBOARD_ROUTE,
      reason: 'forbidden',
    });
    expect(
      decideRouteAccess({ ...REAL, pathname: `${INVENTORY_ROUTE}/nuevo`, session: OPERADOR }),
    ).toEqual({ kind: 'redirect', to: DASHBOARD_ROUTE, reason: 'forbidden' });
  });

  // Y el resto del area privada NO se cierra de rebote: el Operador sigue viendo su dashboard.
  it('no corta al Operador en las rutas privadas que no tienen regla (R4)', () => {
    expect(decideRouteAccess({ ...REAL, pathname: DASHBOARD_ROUTE, session: OPERADOR })).toEqual({
      kind: 'allow',
    });
  });
});

// ---------------------------------------------------------------------------
// QC-26 T23 — La pantalla de recetas, con las constantes REALES (R4, R6)
// ---------------------------------------------------------------------------
//
// Mismo patron que el bloque de inventario de arriba, pero con `FORMULAS_ROUTE` y sus DOS
// subrutas de formulario. La regla de inventario (R4) sigue existiendo y no se toca aqui: se
// anadio, no se sustituyo.
describe('la pantalla de recetas con las constantes reales (R4, R6)', () => {
  const ID_RECETA = '11111111-1111-4111-8111-111111111111';

  // R4 — las tres rutas de recetas quedan cubiertas por el prefijo privado declarado: sin
  // sesion no se renderiza ninguna, se redirige al login llevando el destino de vuelta.
  it.each([
    ['la lista', FORMULAS_ROUTE],
    ['el alta', NEW_RECIPE_ROUTE],
    ['la edicion', recipeEditRoute(ID_RECETA)],
  ])('sin sesion, pedir %s redirige al login con esa ruta como destino de vuelta (R4)', (_, ruta) => {
    expect(decideRouteAccess({ ...REAL, pathname: ruta, session: ANONIMO })).toEqual({
      kind: 'redirect',
      to: `${LOGIN_ROUTE}?next=${encodeURIComponent(ruta)}`,
      reason: 'unauthenticated',
    });
  });

  // Trampa deliberada: comparte el texto del prefijo pero no el limite de segmento. Si el
  // prefijo se comprobase con `startsWith` en vez de por segmentos, esto quedaria cubierto por
  // error y este test lo distingue.
  it('una ruta que solo comparte el texto del prefijo, sin limite de segmento, no queda cubierta (R4)', () => {
    expect(decideRouteAccess({ ...REAL, pathname: '/produccion/formulasX', session: ANONIMO })).toEqual({
      kind: 'allow',
    });
  });

  // R6 — con sesion de Administrador entra a las tres; con cualquier otro rol, fuera y sin
  // renderizar, con motivo `forbidden`.
  it('deja pasar al Administrador en las tres rutas (R6)', () => {
    const admin = { kind: 'authenticated', sub: SUB, roleName: ROLE_ADMINISTRADOR } as const;

    for (const ruta of [FORMULAS_ROUTE, NEW_RECIPE_ROUTE, recipeEditRoute(ID_RECETA)]) {
      expect(decideRouteAccess({ ...REAL, pathname: ruta, session: admin })).toEqual({
        kind: 'allow',
      });
    }
  });

  it('a un rol distinto de Administrador lo redirige con motivo forbidden en las tres rutas (R6)', () => {
    for (const ruta of [FORMULAS_ROUTE, NEW_RECIPE_ROUTE, recipeEditRoute(ID_RECETA)]) {
      expect(decideRouteAccess({ ...REAL, pathname: ruta, session: OPERADOR })).toEqual({
        kind: 'redirect',
        to: DASHBOARD_ROUTE,
        reason: 'forbidden',
      });
    }
  });

  // La regla de inventario (R4) no se sustituyo: sigue restringiendo su propia ruta.
  it('la regla de inventario sigue en pie: un no Administrador tampoco entra ahi (R4)', () => {
    expect(decideRouteAccess({ ...REAL, pathname: INVENTORY_ROUTE, session: OPERADOR })).toEqual({
      kind: 'redirect',
      to: DASHBOARD_ROUTE,
      reason: 'forbidden',
    });
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
