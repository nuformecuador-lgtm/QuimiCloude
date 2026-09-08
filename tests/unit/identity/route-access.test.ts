// QC-9 T9 · QC-75 T11 — La decision de acceso a una ruta (R16, R17, R18).
//
// Todo el archivo corre sin Next, sin cookies y sin base de datos: la entrada son objetos
// planos y la salida es un objeto plano. Eso es R20 de QC-9, y el ultimo bloque lo afirma
// explicitamente.
//
// **QC-75 retiro la lista ruta→rol.** Ya no hay reglas que pasar por parametro, ni rama
// `forbidden`, ni rol en la sesion: lo unico que decide esta funcion es si hay sesion valida.
// Los casos que antes afirmaban «este rol entra y este otro no» se sustituyen por su contrario
// exacto — una ruta privada con sesion valida pasa, sea cual sea el rol (R16)—, que es lo que
// hace ruidoso el intento de volver a meter un corte por rol en el borde.

import { readFileSync } from 'node:fs';

import {
  decideRouteAccess,
  type RouteAccessDecision,
  type RouteAccessInput,
  type RouteAccessSession,
} from '@/lib/modules/identity/domain/route-access';
import {
  DASHBOARD_ROUTE,
  FORMULAS_ROUTE,
  INVENTORY_ROUTE,
  LOGIN_ROUTE,
  NEW_RECIPE_ROUTE,
  ORDERS_ROUTE,
  PRIVATE_ROUTE_PREFIXES,
  SUPPLIERS_ROUTE,
  recipeEditRoute,
} from '@/lib/shared/routes';

const ROUTES = { login: '/login', dashboard: '/dashboard' } as const;
const PREFIJOS_PRIVADOS = ['/dashboard'] as const;

const SUB = '3f2b1c9e-0d4a-4c8b-9e77-2a5f6c1d8b40';
const ANONIMO: RouteAccessSession = { kind: 'anonymous' };
const CON_SESION: RouteAccessSession = { kind: 'authenticated', sub: SUB };

function decidir(overrides: Partial<RouteAccessInput> = {}): RouteAccessDecision {
  return decideRouteAccess({
    pathname: '/dashboard',
    search: '',
    session: ANONIMO,
    privatePrefixes: PREFIJOS_PRIVADOS,
    routes: ROUTES,
    ...overrides,
  });
}

describe('decideRouteAccess — paso 1: lo publico se sirve tal cual', () => {
  it.each([['/'], ['/recuperar-contrasena'], ['/api/webhooks/algo']])(
    'deja pasar %s sin sesion',
    (pathname) => {
      expect(decidir({ pathname, session: ANONIMO })).toEqual({ kind: 'allow' });
    },
  );

  it('deja pasar una ruta publica con sesion valida', () => {
    expect(decidir({ pathname: '/', session: CON_SESION })).toEqual({ kind: 'allow' });
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

describe('decideRouteAccess — paso 2: ruta privada sin sesion (R17)', () => {
  it('redirige al login llevando la ruta pedida como destino de vuelta', () => {
    expect(decidir({ pathname: '/dashboard', session: ANONIMO })).toEqual({
      kind: 'redirect',
      to: '/login?next=%2Fdashboard',
      reason: 'unauthenticated',
    });
  });

  // La cadena de consulta forma parte de la ruta pedida.
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

  // Refuerzo (R17): la redireccion al login NO depende de cual sea la ruta privada, ni deja de
  // ocurrir en subrutas profundas.
  it.each([['/dashboard'], ['/dashboard/reportes'], ['/dashboard/reportes/costos/2026']])(
    'un anonimo en %s siempre acaba en el login con esa ruta como destino de vuelta',
    (pathname) => {
      expect(decidir({ pathname, session: ANONIMO })).toEqual({
        kind: 'redirect',
        to: `/login?next=${encodeURIComponent(pathname)}`,
        reason: 'unauthenticated',
      });
    },
  );
});

describe('decideRouteAccess — paso 3: login con sesion valida (R17)', () => {
  it('sin destino de vuelta redirige al dashboard', () => {
    expect(decidir({ pathname: '/login', session: CON_SESION })).toEqual({
      kind: 'redirect',
      to: '/dashboard',
      reason: 'already-authenticated',
    });
  });

  it('con destino de vuelta valido redirige ahi, no al dashboard', () => {
    expect(
      decidir({ pathname: '/login', search: '?next=%2Fdashboard%2Freportes', session: CON_SESION }),
    ).toEqual({
      kind: 'redirect',
      to: '/dashboard/reportes',
      reason: 'already-authenticated',
    });
  });

  // El destino de vuelta se valida como interno tambien aqui: nunca se emite una redireccion
  // fuera de este sitio.
  it.each([['https://evil.example'], ['//evil.example'], ['%2F%2Fevil.example']])(
    'con un destino de vuelta externo (%s) redirige al dashboard',
    (destino) => {
      const decision = decidir({
        pathname: '/login',
        search: `?next=${encodeURIComponent(destino)}`,
        session: CON_SESION,
      });

      expect(decision).toEqual({
        kind: 'redirect',
        to: '/dashboard',
        reason: 'already-authenticated',
      });
    },
  );
});

describe('decideRouteAccess — paso 4: el resto pasa, sea cual sea el rol (R16)', () => {
  it('ruta privada con sesion valida', () => {
    expect(decidir({ pathname: '/dashboard', session: CON_SESION })).toEqual({ kind: 'allow' });
  });

  // R16 — el corazon de esta ficha: no hay ninguna ruta privada que la decision cierre por
  // quien seas. Si alguien vuelve a meter un corte por rol aqui, esto se pone rojo.
  it.each([['/dashboard'], ['/dashboard/reportes'], ['/dashboard/reportes/costos']])(
    'deja pasar %s a cualquier sesion valida',
    (pathname) => {
      expect(decidir({ pathname, session: CON_SESION })).toEqual({ kind: 'allow' });
    },
  );
});

describe('decideRouteAccess — la decision no es una autorizacion', () => {
  const BASE = {
    search: '',
    privatePrefixes: PREFIJOS_PRIVADOS,
    routes: ROUTES,
  };

  const CASOS: readonly RouteAccessInput[] = [
    { ...BASE, pathname: '/', session: ANONIMO },
    { ...BASE, pathname: '/dashboard', session: ANONIMO },
    { ...BASE, pathname: '/login', session: CON_SESION },
    { ...BASE, pathname: '/dashboard', session: CON_SESION },
    { ...BASE, pathname: '/dashboard/reportes', session: CON_SESION },
  ];

  // Solo «pasa» o «redirige a». Nunca capacidades, permisos ni roles: quien autoriza es el
  // service (`docs/architecture.md > Acceso a datos y autorizacion`), no el middleware.
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

  // R16 — la entrada tampoco admite ya un rol ni una lista de reglas. Afirmarlo sobre el fuente
  // del dominio es lo que impide que vuelvan por la puerta de atras.
  it('el dominio no menciona roles ni reglas ruta→rol', () => {
    const fuente = readFileSync('lib/modules/identity/domain/route-access.ts', 'utf8');

    expect(fuente).not.toContain('roleName');
    expect(fuente).not.toContain('RouteRoleRule');
    expect(fuente).not.toContain('findRouteRule');
    expect(fuente).not.toContain('forbidden');
  });
});

// ---------------------------------------------------------------------------
// Las pantallas privadas, con las constantes REALES
// ---------------------------------------------------------------------------
//
// Los bloques de arriba usan prefijos sinteticos a proposito: lo que ejercitan es la POLITICA.
// Este bloque hace lo contrario y es el unico que lo hace: entra con `PRIVATE_ROUTE_PREFIXES` de
// verdad y con las rutas de cada modulo desde su constante unica, porque lo que se afirma aqui
// NO es la politica sino que esas pantallas siguen siendo privadas. Con prefijos sinteticos,
// sacar `/inventario` de la lista no pondria rojo ningun test.
//
// Lo que este bloque ya NO afirma (QC-75 R16) es que un rol entre y otro no: eso lo decide la
// pagina con `requirePagePermission`, y sus contratos de ruta lo comprueban modulo a modulo.
const REAL = {
  search: '',
  privatePrefixes: PRIVATE_ROUTE_PREFIXES,
  routes: { login: LOGIN_ROUTE, dashboard: DASHBOARD_ROUTE },
} as const;

const ID_RECETA = '11111111-1111-4111-8111-111111111111';

const RUTAS_PRIVADAS_REALES: readonly (readonly [string, string])[] = [
  ['el dashboard', DASHBOARD_ROUTE],
  ['la lista de inventario', INVENTORY_ROUTE],
  ['el alta de producto', `${INVENTORY_ROUTE}/nuevo`],
  ['la lista de recetas', FORMULAS_ROUTE],
  ['el alta de receta', NEW_RECIPE_ROUTE],
  ['la edicion de receta', recipeEditRoute(ID_RECETA)],
  ['la lista de pedidos', ORDERS_ROUTE],
  ['la lista de proveedores', SUPPLIERS_ROUTE],
  ['el detalle de proveedor', `${SUPPLIERS_ROUTE}/${ID_RECETA}`],
];

describe('las pantallas privadas con las constantes reales', () => {
  it.each(RUTAS_PRIVADAS_REALES)(
    'sin sesion, pedir %s redirige al login con esa ruta como destino de vuelta (R17)',
    (_, ruta) => {
      expect(decideRouteAccess({ ...REAL, pathname: ruta, session: ANONIMO })).toEqual({
        kind: 'redirect',
        to: `${LOGIN_ROUTE}?next=${encodeURIComponent(ruta)}`,
        reason: 'unauthenticated',
      });
    },
  );

  // R16 — con sesion valida entran TODAS, sin mirar rol. El corte por permiso lo pone la pagina
  // (404), no el borde.
  it.each(RUTAS_PRIVADAS_REALES)('con sesion valida, %s pasa (R16)', (_, ruta) => {
    expect(decideRouteAccess({ ...REAL, pathname: ruta, session: CON_SESION })).toEqual({
      kind: 'allow',
    });
  });

  // Trampa deliberada: comparte el texto del prefijo pero no el limite de segmento. Si el
  // prefijo se comprobase con `startsWith` en vez de por segmentos, esto quedaria cubierto por
  // error y este test lo distingue.
  it('una ruta que solo comparte el texto del prefijo, sin limite de segmento, no queda cubierta', () => {
    expect(
      decideRouteAccess({ ...REAL, pathname: '/produccion/formulasX', session: ANONIMO }),
    ).toEqual({ kind: 'allow' });
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
