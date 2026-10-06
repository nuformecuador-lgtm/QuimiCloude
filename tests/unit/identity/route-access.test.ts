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
  ASSIGNED_ORDERS_ROUTE,
  DASHBOARD_ROUTE,
  FORMULAS_ROUTE,
  INVENTORY_ROUTE,
  LOGIN_ROUTE,
  NEW_RECIPE_ROUTE,
  ORDERS_ROUTE,
  PRIVATE_ROUTE_PREFIXES,
  SESSION_ENDED_PARAM,
  SUPPLIERS_ROUTE,
  recipeEditRoute,
} from '@/lib/shared/routes';

const ROUTES = { login: '/login', landing: '/asignacion' } as const;
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
  it('sin destino de vuelta redirige a la ruta de aterrizaje', () => {
    expect(decidir({ pathname: '/login', session: CON_SESION })).toEqual({
      kind: 'redirect',
      to: '/asignacion',
      reason: 'already-authenticated',
    });
  });

  it('con destino de vuelta valido redirige ahi, no a la ruta de aterrizaje', () => {
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
    'con un destino de vuelta externo (%s) redirige a la ruta de aterrizaje',
    (destino) => {
      const decision = decidir({
        pathname: '/login',
        search: `?next=${encodeURIComponent(destino)}`,
        session: CON_SESION,
      });

      expect(decision).toEqual({
        kind: 'redirect',
        to: '/asignacion',
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
  routes: { login: LOGIN_ROUTE, landing: ASSIGNED_ORDERS_ROUTE },
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
      routes: { login: '/entrar', landing: '/inicio' },
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

// ---------------------------------------------------------------------------
// QC-78 T24 — la marca de sesion cortada (R29, R30 b)
// ---------------------------------------------------------------------------
//
// El nombre de la marca ENTRA COMO PARAMETRO, igual que los prefijos y las rutas: el literal vive
// en `lib/shared/routes.ts` y el dominio tiene prohibido importarlo. Aqui se usa el nombre real
// (`SESSION_ENDED_PARAM`) y no uno inventado, porque lo que estos casos afirman es la politica
// que el adaptador cablea de verdad; que el adaptador lo pase es cosa de su propio test.

const MARCA = SESSION_ENDED_PARAM;
const CON_MARCA = `?${MARCA}=fin`;

/** Como `decidir`, pero con la marca DECLARADA, que es como la cablea el adaptador. */
function decidirConMarcaDeclarada(overrides: Partial<RouteAccessInput> = {}): RouteAccessDecision {
  return decidir({ sessionEndedParam: MARCA, ...overrides });
}

describe('decideRouteAccess — R29: el login con la marca se sirve en vez de rebotar', () => {
  // El caso que rompe el bucle. La cookie sigue firmada y viva —el borde no puede saber otra
  // cosa—, pero el servidor ACABA DE DECIDIR con la base que esa sesion ya no vale. Sin esto, el
  // borde devuelve a la zona privada, el layout vuelve a cortar, y el navegador muere en el
  // vigesimo salto.
  it('sirve el login a una sesion valida que llega con la marca, en vez de devolverla a la zona privada', () => {
    expect(
      decidirConMarcaDeclarada({ pathname: '/login', search: CON_MARCA, session: CON_SESION }),
    ).toEqual({ kind: 'allow' });
  });

  // Y la otra mitad, que es la que impide que el arreglo se coma la regla entera: SIN marca, el
  // login con sesion valida sigue redirigiendo exactamente como siempre.
  it('sin la marca, el login con sesion valida sigue redirigiendo a la ruta de aterrizaje', () => {
    expect(decidirConMarcaDeclarada({ pathname: '/login', session: CON_SESION })).toEqual({
      kind: 'redirect',
      to: '/asignacion',
      reason: 'already-authenticated',
    });
  });

  it('sin la marca, el login con sesion valida y destino de vuelta sigue redirigiendo ahi', () => {
    expect(
      decidirConMarcaDeclarada({
        pathname: '/login',
        search: '?next=%2Fdashboard%2Freportes',
        session: CON_SESION,
      }),
    ).toEqual({
      kind: 'redirect',
      to: '/dashboard/reportes',
      reason: 'already-authenticated',
    });
  });

  // Si el destino de vuelta ganara, el usuario volveria a la zona privada de la que el servidor
  // acaba de echarlo: el bucle otra vez. La marca gana.
  it('con la marca gana la marca aunque la query traiga tambien un destino de vuelta valido', () => {
    expect(
      decidirConMarcaDeclarada({
        pathname: '/login',
        search: `?next=%2Fdashboard%2Freportes&${MARCA}=fin`,
        session: CON_SESION,
      }),
    ).toEqual({ kind: 'allow' });
  });

  // Se comprueba PRESENCIA y no valor: el valor lo fija un unico sitio
  // (`LOGIN_ROUTE_SESSION_ENDED`) y comparar tambien el texto solo anadiria un segundo literal
  // que mantener sincronizado. Que `?sesion=` vacio tambien sirva es la consecuencia buscada.
  it.each([[`?${MARCA}=fin`], [`?${MARCA}=`], [`?${MARCA}`], [`?${MARCA}=loquesea`]])(
    'basta con que la marca este presente (%s) para no redirigir, sea cual sea su valor',
    (search) => {
      expect(
        decidirConMarcaDeclarada({ pathname: '/login', search, session: CON_SESION }),
      ).toEqual({ kind: 'allow' });
    },
  );

  // R30 (a) por el lado de la decision: la marca es UNA sola y no lleva motivo. Si alguien
  // intentara distinguir los tres cortes con un valor distinto por corte, la decision no lo
  // notaria —y este caso deja escrito que no debe notarlo.
  it('el login sin sesion se sigue sirviendo igual, traiga o no la marca', () => {
    expect(
      decidirConMarcaDeclarada({ pathname: '/login', search: CON_MARCA, session: ANONIMO }),
    ).toEqual(decidirConMarcaDeclarada({ pathname: '/login', session: ANONIMO }));
  });
});

// R30 (b) se demuestra EN NEGATIVO: no se afirma «la marca no hace nada», se compara cada
// decision con la MISMA peticion sin marca y se exige igualdad. Un literal escrito a mano no
// demostraria lo mismo: pasaria igual si ambas ramas cambiaran a la vez.
describe('decideRouteAccess — R30 (b): la marca es de un solo sentido', () => {
  it('una ruta privada con la marca se decide identicamente a la misma sin ella (con sesion)', () => {
    const conMarca = decidirConMarcaDeclarada({
      pathname: '/dashboard',
      search: CON_MARCA,
      session: CON_SESION,
    });

    expect(conMarca).toEqual(decidirConMarcaDeclarada({ pathname: '/dashboard', session: CON_SESION }));
    expect(conMarca).toEqual({ kind: 'allow' });
  });

  // El caso que importa de verdad: la marca NO deja entrar a un anonimo. Quien la escriba a mano
  // en una ruta privada sigue acabando en el login con su destino de vuelta.
  it('una ruta privada con la marca sigue mandando al login a un anonimo, igual que sin ella', () => {
    const conMarca = decidirConMarcaDeclarada({
      pathname: '/dashboard/reportes',
      search: CON_MARCA,
      session: ANONIMO,
    });
    const sinMarca = decidirConMarcaDeclarada({
      pathname: '/dashboard/reportes',
      session: ANONIMO,
    });

    expect(conMarca.kind).toBe('redirect');
    expect(conMarca).toEqual({
      kind: 'redirect',
      to: '/login?next=%2Fdashboard%2Freportes%3Fsesion%3Dfin',
      reason: 'unauthenticated',
    });
    // La unica diferencia con la peticion sin marca es el destino de vuelta, que arrastra la query
    // pedida tal cual (R7); el TIPO de decision y el motivo son los mismos.
    expect(conMarca.kind).toBe(sinMarca.kind);
    expect(conMarca.kind === 'redirect' && conMarca.reason).toBe(
      sinMarca.kind === 'redirect' && sinMarca.reason,
    );
  });

  it('una ruta publica con la marca se sirve igual que sin ella', () => {
    for (const session of [ANONIMO, CON_SESION]) {
      expect(decidirConMarcaDeclarada({ pathname: '/', search: CON_MARCA, session })).toEqual(
        decidirConMarcaDeclarada({ pathname: '/', session }),
      );
      expect(decidirConMarcaDeclarada({ pathname: '/', search: CON_MARCA, session })).toEqual({
        kind: 'allow',
      });
    }
  });

  // La marca no convierte una sesion ausente en valida ni una valida en ausente. Se recorren los
  // dos `kind` sobre rutas publicas y privadas: la decision entera debe coincidir. El login queda
  // fuera a proposito — es el UNICO sitio donde R29 dice que la marca cambia algo, y esta cubierto
  // arriba.
  it.each([['/'], ['/dashboards-publicos'], ['/dashboard'], ['/dashboard/reportes/costos']])(
    'la marca no altera la decision de %s ni para el anonimo ni para la sesion valida',
    (pathname) => {
      for (const session of [ANONIMO, CON_SESION]) {
        const conMarca = decidirConMarcaDeclarada({ pathname, search: CON_MARCA, session });
        const sinMarca = decidirConMarcaDeclarada({ pathname, session });

        expect(conMarca.kind).toBe(sinMarca.kind);
      }
    },
  );

  // No persiste ni se propaga: cuando el paso 2 construye el redirect al login para una ruta
  // privada pedida con la marca, esa marca NO queda como parametro del login. `buildLoginRedirect`
  // codifica `pathname + search` ENTERO dentro de `next`, asi que el texto `sesion` sobrevive
  // percent-encoded dentro del destino de vuelta, pero NO como parametro propio de la URL del
  // login — y por tanto no dispara la excepcion de R29 en el salto siguiente. Eso es lo que este
  // caso ata: la vuelta de tuerca es el segundo `expect`, que mete el login resultante otra vez
  // por la decision y comprueba que sigue redirigiendo como siempre.
  it('la marca no queda como parametro del login al que se redirige una ruta privada', () => {
    const decision = decidirConMarcaDeclarada({
      pathname: '/dashboard',
      search: CON_MARCA,
      session: ANONIMO,
    });
    if (decision.kind !== 'redirect') throw new Error('se esperaba una redireccion al login');

    const [camino = '', query = ''] = decision.to.split('?');
    expect(camino).toBe('/login');
    expect(new URLSearchParams(query).has(MARCA)).toBe(false);

    // Y la comprobacion que cierra el circulo: ese login, pedido despues con sesion valida, NO se
    // sirve — sigue redirigiendo al destino de vuelta, porque la marca no llego a el.
    expect(
      decidirConMarcaDeclarada({ pathname: camino, search: `?${query}`, session: CON_SESION }),
    ).toEqual({
      kind: 'redirect',
      to: '/dashboard?sesion=fin',
      reason: 'already-authenticated',
    });
  });
});

// El campo `sessionEndedParam` es OPCIONAL a proposito (`design.md > 10.2`): hacerlo obligatorio
// rompia el typecheck de cinco archivos de test de otras zonas que construyen un
// `RouteAccessInput` literal. El precio es que sin declararla la marca no existe, y esa decision
// necesita su propia red: si alguien "simplificara" leyendo el literal dentro del dominio, este
// bloque se pondria rojo.
describe('decideRouteAccess — sin marca declarada, el comportamiento es el de siempre', () => {
  it('la regla 3 dispara aunque la query traiga el texto de la marca', () => {
    expect(decidir({ pathname: '/login', search: CON_MARCA, session: CON_SESION })).toEqual({
      kind: 'redirect',
      to: '/asignacion',
      reason: 'already-authenticated',
    });
  });

  it('con destino de vuelta y el texto de la marca, sigue ganando el destino de vuelta', () => {
    expect(
      decidir({
        pathname: '/login',
        search: `?next=%2Fdashboard%2Freportes&${MARCA}=fin`,
        session: CON_SESION,
      }),
    ).toEqual({
      kind: 'redirect',
      to: '/dashboard/reportes',
      reason: 'already-authenticated',
    });
  });
});
