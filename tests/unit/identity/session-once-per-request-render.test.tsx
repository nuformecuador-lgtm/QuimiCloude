// QC-104 T5 — EL CONTEO DEL GATE PARA PANTALLAS (`design.md > 5.2`).
//
// Cubre R1, R2, R5, R9, R10, R12, R14 y R15: en UNA peticion simulada, servir una pantalla de la
// zona privada —layout, pagina, cortes por permiso y las Server Actions que sus componentes de
// servidor invocan mientras se pinta— lee la ficha de sesion EXACTAMENTE UNA vez.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// QUE SE EJERCITA DE VERDAD, Y QUE SE SIMULA
//
// - Se ejercita el CABLEADO REAL de `lib/composition/index.ts` (la instancia unica de
//   `createResolveSession` detras de `requestScoped`) y el codigo REAL de las pantallas, de
//   `requirePagePermission` y de los `currentActor` de los adaptadores driving.
// - Se SIMULA el ambito de pintado. En Vitest el `cache` de React no memoiza nada
//   (`design.md > 0`, hallazgo H5: `react.development.js` devuelve `fn.apply(null, arguments)`),
//   asi que ejercitar React de verdad no probaria nada. Por eso `@/lib/shared/request-scope` se
//   sustituye por el `createRequestScope` **real** con un `renderStore` que este archivo controla:
//   «empieza la peticion» devuelve SIEMPRE el mismo `Map`; fuera de peticion, uno nuevo en cada
//   llamada, que es justo el contrato documentado de `React.cache`.
//   Que React comparta de verdad dentro de la peticion de Next lo prueba la medicion en ejecucion
//   de R16, una sola vez y a mano. Aqui se prueba el CABLEADO.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// POR QUE NO SE RENDERIZA EL ARBOL DE REACT (decision de montaje de este archivo)
//
// `design.md > 5.2` deja elegir el montaje mas robusto. Se invoca cada funcion de servidor de la
// pantalla —layout, pagina y las secciones de servidor que la pagina monta— **dentro del mismo
// ambito de pintado simulado**, en vez de renderizar el arbol con testing-library. Razones:
//
// 1. Las secciones viven bajo `<Suspense>` y el render de jsdom **no ejecuta** componentes de
//    servidor `async`: renderizar NO llamaria a las acciones que son la mayor parte de las
//    lecturas (hallazgo H3), o sea que el conteo saldria verde sin contar casi nada.
// 2. Lo que este archivo afirma es CUANTAS VECES se lee la ficha de sesion, y eso no depende de
//    una sola etiqueta del DOM. Lo que se ve en pantalla ya lo cubren los tests de cada pantalla.
// 3. Mismo criterio que `tests/unit/navegacion/pantallas-exigen-permiso.test.tsx`, que tambien
//    invoca las pantallas como las invoca el App Router en vez de montarlas.
//
// En `/pedidos` se invocan ADEMAS, dentro del mismo ambito, las acciones que
// `order-list-section.tsx` llama cuando la lista trae filas (`:147`, `:179-180`): con la base
// doblada la lista sale vacia y la seccion sale por el estado vacio antes de llegar a ellas, asi
// que se llaman aqui para que el conteo cubra ese camino de verdad y no por casualidad.

import type { SessionClaims } from '@/lib/modules/identity/domain/session-claims';
import type { SessionUserRecord } from '@/lib/modules/identity/ports/session-user-reader';
import { PERMISSIONS } from '@/lib/modules/identity/domain/permissions';

import type { DataTableParams } from '@/components/shared/data-table';

const { readClaimsMock, findActiveByIdMock, pintado, prismaDoble } = vi.hoisted(() => {
  /**
   * El ambito de pintado que el test controla. `mapa` no es `null` mientras dura una peticion
   * simulada: entonces `renderStore()` devuelve SIEMPRE el mismo `Map` y `request-scope` detecta
   * que hay pintado. Fuera, cada llamada devuelve uno nuevo y no se memoiza nada (R7).
   */
  const pintadoSimulado = { mapa: null as Map<object, unknown> | null };

  /**
   * Doble del cliente Prisma. `lib/composition` arrastra los adaptadores Prisma de TODOS los
   * modulos; instanciar `PrismaClient` aqui exigiria `DATABASE_URL` y una base, y este archivo no
   * cuenta filas: cuenta LECTURAS DE SESION, que van por `findActiveSessionUserById` y estan
   * dobladas aparte. Cualquier consulta responde el vacio de su forma, de modo que las acciones
   * de lista recorren su camino real —incluido `currentActor`, que es lo que se cuenta— y acaban
   * en una lista vacia en vez de en un error.
   */
  const responder = (metodo: string) => {
    return async (...args: readonly unknown[]): Promise<unknown> => {
      if (metodo === '$transaction') {
        const primero = args[0];
        if (typeof primero === 'function') {
          return (primero as (cliente: unknown) => unknown)(cliente);
        }
        return [];
      }
      if (metodo === 'count') return 0;
      if (metodo === 'findUnique' || metodo === 'findFirst') return null;
      if (metodo === 'aggregate') return {};
      return [];
    };
  };

  const modelo = new Proxy(
    {},
    {
      get: (_objetivo, propiedad) =>
        typeof propiedad === 'string' ? responder(propiedad) : undefined,
    },
  );

  const cliente: unknown = new Proxy(
    {},
    {
      get: (_objetivo, propiedad) => {
        if (typeof propiedad !== 'string') return undefined;
        // `then` tiene que seguir siendo `undefined`: si no, cualquier `await` sobre el cliente
        // lo tomaria por un thenable y se colgaria.
        if (propiedad === 'then') return undefined;
        return propiedad.startsWith('$') ? responder(propiedad) : modelo;
      },
    },
  );

  return {
    readClaimsMock: vi.fn<() => Promise<SessionClaims | null>>(),
    findActiveByIdMock: vi.fn<(id: string, sid: string) => Promise<SessionUserRecord | null>>(),
    pintado: pintadoSimulado,
    prismaDoble: cliente,
  };
});

vi.mock('@/lib/shared/db/prisma', () => ({ prisma: prismaDoble }));

vi.mock('@/lib/modules/identity/adapters/driven/session/session-cookie', () => ({
  readSessionClaims: readClaimsMock,
  startSession: vi.fn(),
  clearSession: vi.fn(),
}));

// EL CONTADOR de este archivo: `findActiveById` es la UNICA consulta de la resolucion de sesion
// (`resolve-session.ts:75`, «es la UNICA consulta de la cadena»). Cada llamada suya es «una
// lectura de la ficha de sesion» en el vocabulario de los requisitos.
vi.mock('@/lib/modules/identity/adapters/driven/persistence/session-user-prisma', () => ({
  findActiveSessionUserById: findActiveByIdMock,
}));

vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined }),
  headers: async () => ({ get: () => null }),
}));

/** Centinela que imita el comportamiento real de `redirect` y `notFound`: no retornan, lanzan. */
class CorteDeNext extends Error {
  constructor(public readonly clase: 'redirect' | 'notFound', public readonly destino?: string) {
    super(`${clase}${destino === undefined ? '' : `:${destino}`}`);
  }
}

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  redirect: (destino: string) => {
    throw new CorteDeNext('redirect', destino);
  },
  notFound: () => {
    throw new CorteDeNext('notFound');
  },
}));

// El helper REAL, con el ambito de pintado bajo control del test (`design.md > 5.2`). No se dobla
// su semantica: se dobla solo de donde sale «hay peticion», que es lo unico que Vitest no puede
// dar de verdad (H5).
vi.mock('@/lib/shared/request-scope', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/shared/request-scope')>();
  const ambito = real.createRequestScope({
    renderStore: () => pintado.mapa ?? new Map<object, unknown>(),
  });
  return {
    ...real,
    requestScoped: ambito.requestScoped,
    runInRequestScope: ambito.runInRequestScope,
  };
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Fixtures de la sesion
// ─────────────────────────────────────────────────────────────────────────────────────────────

const SUB = '3f2b1c9e-0d4a-4c8b-9e77-2a5f6c1d8b40';
const COMPANY_ID = '7c1e0f52-8a3d-4b6e-9f21-5d0c4a8e7b13';
const SID = '5b6f3d21-9c4e-4a7f-8b03-6d2e1f5a9c44';

const CLAIMS_VIGENTES: SessionClaims = {
  sub: SUB,
  roleName: 'Rol firmado que ya no vale',
  companyId: COMPANY_ID,
  sessionId: SID,
  issuedAt: new Date(Date.now() - 60_000),
  expiresAt: new Date(Date.now() + 3_600_000),
};

/**
 * La ficha que devuelve la base. Trae el catalogo ENTERO de permisos, derivado de `PERMISSIONS` y
 * nunca escrito a mano: las tres pantallas de R2 cortan por permisos distintos y lo que aqui se
 * cuenta son las LECTURAS, no la autorizacion. Un permiso que faltara convertiria el conteo en el
 * de un 404, que es otra cosa.
 */
const RECORD: SessionUserRecord = {
  id: SUB,
  username: 'ana.perez',
  firstNames: 'Ana Maria',
  lastNames: 'Perez Gomez',
  roleName: 'operador',
  companyId: COMPANY_ID,
  companyDeletedAt: null,
  permissions: PERMISSIONS.map((permiso) => permiso.code),
  accountStatus: 'active',
  lockedUntil: null,
  sessionsValidFrom: new Date('2026-08-01T00:00:00.000Z'),
  sessionRevokedAt: null,
};

/** Parametros de lista ya acotados, como los entrega cada `parse*ListParams`. */
const PARAMS: DataTableParams = { page: 1, pageSize: 10, sort: null, filters: {}, search: '' };

// ─────────────────────────────────────────────────────────────────────────────────────────────
// POR QUE TODO SE IMPORTA UNA SOLA VEZ, EN UN `beforeAll` CON PRESUPUESTO PROPIO
//
// Mismo motivo y mismo patron que `tests/unit/composition/identity-facade.test.ts:111-115`, cuyos
// comentarios explican el caso entero: `@/lib/composition` arrastra y transforma el grafo ENTERO
// del punto de composicion (~7 s en este arbol) y ese grafo crece con cada ficha. Pagarlo dentro
// de un caso se lo carga al PRIMERO que importe —que no tiene la culpa— y lo tumba bajo carga con
// el `testTimeout` de 15 s. Aqui ademas se importan las tres pantallas, que arrastran sus arboles
// de componentes.
//
// El presupuesto de 60 s es LOCAL a ESTE hook: `beforeAll` no hereda `testTimeout` y su defecto
// (10 s) es MENOR que el de los casos, asi que sin este numero el hook expiraria antes.
//
// El import sigue siendo DINAMICO a proposito: los `vi.mock` de arriba tienen que estar aplicados
// cuando el grafo se cargue.
// ─────────────────────────────────────────────────────────────────────────────────────────────

let identity: (typeof import('@/lib/composition'))['identity'];
let PrivateLayout: (typeof import('@/app/(private)/layout'))['default'];
let UsuariosPage: (typeof import('@/app/(private)/configuracion/usuarios/page'))['default'];
let UserListSection: (typeof import('@/app/(private)/configuracion/usuarios/components/user-list-section'))['UserListSection'];
let UnidadesPage: (typeof import('@/app/(private)/configuracion/unidades/page'))['default'];
let UnitListSection: (typeof import('@/app/(private)/configuracion/unidades/components/unit-list-section'))['UnitListSection'];
let PedidosPage: (typeof import('@/app/(private)/pedidos/page'))['default'];
let OrderListSection: (typeof import('@/app/(private)/pedidos/components/order-list-section'))['OrderListSection'];
let AsignacionPage: (typeof import('@/app/(private)/asignacion/page'))['default'];
let PackingOrdersListSection: (typeof import('@/app/(private)/asignacion/components'))['PackingOrdersListSection'];
let VIEW_PARAM: (typeof import('@/app/(private)/asignacion/components'))['VIEW_PARAM'];
let PackingOrderPage: (typeof import('@/app/(private)/asignacion/empaque/[id]/page'))['default'];
let listUsersAction: (typeof import('@/lib/modules/identity/adapters/driving/user-actions'))['listUsersAction'];
let listWorkGroupsAction: (typeof import('@/lib/modules/identity/adapters/driving/work-group-actions'))['listWorkGroupsAction'];
let listResponsiblesForOrdersAction: (typeof import('@/lib/modules/asignaciones/adapters/driving/order-assignment-actions'))['listResponsiblesForOrdersAction'];

beforeAll(async () => {
  ({ identity } = await import('@/lib/composition'));
  ({ default: PrivateLayout } = await import('@/app/(private)/layout'));
  ({ default: UsuariosPage } = await import('@/app/(private)/configuracion/usuarios/page'));
  ({ UserListSection } = await import(
    '@/app/(private)/configuracion/usuarios/components/user-list-section'
  ));
  ({ default: UnidadesPage } = await import('@/app/(private)/configuracion/unidades/page'));
  ({ UnitListSection } = await import(
    '@/app/(private)/configuracion/unidades/components/unit-list-section'
  ));
  ({ default: PedidosPage } = await import('@/app/(private)/pedidos/page'));
  ({ OrderListSection } = await import('@/app/(private)/pedidos/components/order-list-section'));
  ({ default: AsignacionPage } = await import('@/app/(private)/asignacion/page'));
  ({ PackingOrdersListSection, VIEW_PARAM } = await import(
    '@/app/(private)/asignacion/components'
  ));
  ({ default: PackingOrderPage } = await import('@/app/(private)/asignacion/empaque/[id]/page'));
  ({ listUsersAction } = await import('@/lib/modules/identity/adapters/driving/user-actions'));
  ({ listWorkGroupsAction } = await import(
    '@/lib/modules/identity/adapters/driving/work-group-actions'
  ));
  ({ listResponsiblesForOrdersAction } = await import(
    '@/lib/modules/asignaciones/adapters/driving/order-assignment-actions'
  ));
}, 60_000);

beforeEach(() => {
  vi.clearAllMocks();
  pintado.mapa = null;
  readClaimsMock.mockResolvedValue(CLAIMS_VIGENTES);
  findActiveByIdMock.mockResolvedValue(RECORD);
});

afterEach(() => {
  pintado.mapa = null;
  vi.restoreAllMocks();
});

/**
 * UNA peticion: abre el ambito de pintado simulado, corre lo que la peticion hace y lo cierra.
 * Fuera de `fn` no hay ambito, asi que nada se puede reutilizar entre peticiones (R5).
 */
async function enUnaPeticion<T>(fn: () => Promise<T>): Promise<T> {
  pintado.mapa = new Map<object, unknown>();
  try {
    return await fn();
  } finally {
    pintado.mapa = null;
  }
}

/** El layout privado, invocado como lo invoca el App Router. */
async function pintarLayout(): Promise<void> {
  await PrivateLayout({ children: null });
}

/** `/configuracion/usuarios`: layout + pagina + la seccion de lista que la pagina monta. */
async function pintarUsuarios(): Promise<void> {
  await pintarLayout();
  await UsuariosPage({ searchParams: Promise.resolve({}) });
  await UserListSection({ params: PARAMS, canModify: true, currentUserId: SUB });
}

/** `/configuracion/unidades`: layout + pagina (que corta DOS veces) + la seccion de lista. */
async function pintarUnidades(): Promise<void> {
  await pintarLayout();
  await UnidadesPage({ searchParams: Promise.resolve({}) });
  await UnitListSection({ params: PARAMS });
}

/**
 * `/pedidos`: layout + pagina + la seccion de lista, MAS las tres acciones que la seccion invoca
 * cuando la lista trae filas (`order-list-section.tsx:147, 179-180`). Con la base doblada la lista
 * sale vacia y la seccion sale antes de llegar a ellas; se invocan aqui, en el MISMO ambito, para
 * que el conteo cubra tambien ese camino.
 */
async function pintarPedidos(): Promise<void> {
  await pintarLayout();
  await PedidosPage({ searchParams: Promise.resolve({}) });
  await OrderListSection({ params: PARAMS });
  await listResponsiblesForOrdersAction(['0a3f2b1c-9e0d-4a4c-8b9e-772a5f6c1d8b']);
  await listUsersAction({ page: 1, pageSize: 25 });
  await listWorkGroupsAction({ page: 1, pageSize: 25 });
}

/** `/asignacion?vista=por_empacar`: layout + pagina + la seccion de lista que la pagina monta. */
async function pintarPorEmpacar(): Promise<void> {
  await pintarLayout();
  await AsignacionPage({ searchParams: Promise.resolve({ [VIEW_PARAM]: 'por_empacar' }) });
  await PackingOrdersListSection({ params: PARAMS });
}

/**
 * `/asignacion/empaque/[id]`: layout + pagina. Con la base doblada el pedido no aparece y la
 * pagina corta con `notFound`, que aqui se descarta: lo que se cuenta es la lectura de sesion, no
 * el desenlace de la pagina.
 */
async function pintarPantallaDeEmpaque(): Promise<void> {
  await pintarLayout();
  try {
    await PackingOrderPage({
      params: Promise.resolve({ id: '0a3f2b1c-9e0d-4a4c-8b9e-772a5f6c1d8b' }),
    });
  } catch (error) {
    if (!(error instanceof CorteDeNext)) throw error;
  }
}

const PANTALLAS = [
  { ruta: '/configuracion/usuarios', pintar: pintarUsuarios },
  { ruta: '/configuracion/unidades', pintar: pintarUnidades },
  { ruta: '/pedidos', pintar: pintarPedidos },
  { ruta: '/asignacion?vista=por_empacar', pintar: pintarPorEmpacar },
  { ruta: '/asignacion/empaque/[id]', pintar: pintarPantallaDeEmpaque },
] as const;

describe('QC-104 · una sola lectura de sesion por peticion (pantallas)', () => {
  describe('R1, R2 — exactamente UNA lectura por peticion en las tres pantallas', () => {
    for (const { ruta, pintar } of PANTALLAS) {
      it(`${ruta} lee la ficha de sesion exactamente 1 vez`, async () => {
        await enUnaPeticion(pintar);

        expect(findActiveByIdMock).toHaveBeenCalledTimes(1);
      });
    }
  });

  describe('R5 — nunca entre peticiones', () => {
    it('dos peticiones simuladas seguidas leen la ficha DOS veces', async () => {
      await enUnaPeticion(pintarUsuarios);
      await enUnaPeticion(pintarUsuarios);

      expect(findActiveByIdMock).toHaveBeenCalledTimes(2);
    });
  });

  describe('R12 — las dos proyecciones salen de LA MISMA lectura', () => {
    it('el id del usuario y el del contexto coinciden con una sola lectura', async () => {
      const { user, context } = await enUnaPeticion(async () => {
        await pintarLayout();
        const [user, context] = await Promise.all([
          identity.getSessionUser(),
          identity.getSessionContext(),
        ]);
        return { user, context };
      });

      expect(findActiveByIdMock).toHaveBeenCalledTimes(1);
      expect(user?.id).toBe(context?.userId);
      expect(user?.roleName).toBe(context?.roleName);
    });
  });

  describe('R9, R10 — la lectura falla: una consulta y una sola linea de registro', () => {
    it('layout y pagina resuelven «sin sesion» sin reintentar la consulta', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      findActiveByIdMock.mockRejectedValue(new Error('la base fallo'));

      const cortes = await enUnaPeticion(async () => {
        const recogidos: CorteDeNext[] = [];
        for (const pintar of [
          () => pintarLayout(),
          () => UsuariosPage({ searchParams: Promise.resolve({}) }),
        ]) {
          try {
            await pintar();
          } catch (error) {
            if (!(error instanceof CorteDeNext)) throw error;
            recogidos.push(error);
          }
        }
        return recogidos;
      });

      // Los dos resuelven «sin sesion»: el layout redirige al login y la pagina tambien —los dos
      // se pintan en paralelo y cualquiera puede ganar, por eso los dos cortan—.
      expect(cortes).toHaveLength(2);
      expect(cortes.every((corte) => corte.clase === 'redirect')).toBe(true);

      // R9: UNA consulta para toda la peticion. La promesa rechazada se comparte y nadie
      // reintenta.
      expect(findActiveByIdMock).toHaveBeenCalledTimes(1);

      // R10: UNA sola linea de registro. La escribe `sessionCheckLog`
      // (`resolve-session.ts:76-87` -> `session-check-log-console.ts`), que resuelve la cabecera
      // del identificador antes de escribir, asi que la linea llega en un turno posterior.
      await vi.waitFor(() => {
        expect(lineasDeSesion(consoleError)).toHaveLength(1);
      });
      expect(lineasDeSesion(consoleError)).toHaveLength(1);
    });
  });

  describe('R14 — el camino feliz no escribe en el registro', () => {
    it('servir la pantalla sin fallos no llama a console.*', async () => {
      const espias = {
        log: vi.spyOn(console, 'log').mockImplementation(() => {}),
        warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
        error: vi.spyOn(console, 'error').mockImplementation(() => {}),
        info: vi.spyOn(console, 'info').mockImplementation(() => {}),
        debug: vi.spyOn(console, 'debug').mockImplementation(() => {}),
      };

      for (const { pintar } of PANTALLAS) {
        await enUnaPeticion(pintar);
      }

      // Un turno de gracia: la linea de `sessionCheckLog` se escribiria en una microtarea
      // posterior, asi que sin esto un log tardio se colaria sin que el test lo viera.
      await new Promise((resolve) => setTimeout(resolve, 0));

      for (const [canal, espia] of Object.entries(espias)) {
        expect(espia, `console.${canal} no debe escribir nada en el camino feliz`).not
          .toHaveBeenCalled();
      }
    });
  });
});

/**
 * Las lineas del registro que escribe la comprobacion de sesion, y solo esas: las del prefijo
 * `[session-check]` de `session-check-log-console.ts`. Se filtra por prefijo a proposito, para que
 * R10 cuente LA LINEA DE LA SESION y no cualquier otra cosa que un doble pudiera escribir.
 */
function lineasDeSesion(espia: { readonly mock: { readonly calls: readonly unknown[][] } }) {
  return espia.mock.calls
    .map((llamada) => llamada[0])
    .filter((linea) => typeof linea === 'string' && linea.startsWith('[session-check]'));
}
