// QC-104 T6 — EL CONTEO DEL GATE PARA SERVER ACTIONS (`design.md > 5.3`). Cubre R3, R5, R7,
// R11, R13 y es la mitad de R15 que mira las acciones (la otra mitad, las pantallas, la mide
// `session-once-per-request-render.test.tsx`).
//
// QUE SE CUENTA: `findActiveSessionUserById`, que es la UNICA consulta de la cadena de cortes
// (`resolve-session.ts:75`, «Es la UNICA consulta de la cadena»). Una llamada a ese doble = una
// lectura de la ficha de sesion. No se afirma nada sobre lo que devuelve cada action: lo que
// esta ficha promete es CUANTAS veces se lee la sesion, no que la operacion termine bien.
//
// MONTAJE, y en que se diferencia del de T5: aqui NO hay ambito de pintado. El `renderStore`
// inyectado devuelve un `Map` NUEVO en cada llamada, que es exactamente lo que hace
// `React.cache` cuando no hay peticion de React (`design.md > 0`, H5, y `> 2.2`, punto 2): el
// caso de la Server Action invocada DESDE EL NAVEGADOR, donde el ambito lo abre el
// `AsyncLocalStorage` de `runInRequestScope` y nadie mas.
//
// Se ejercita el cableado REAL de `lib/composition` —una instancia de `resolveSession`, la
// memoizacion de T3 y los `currentActor` de T4—: los unicos dobles son los adaptadores
// driven de sesion, el cliente de base de datos y lo que `next/*` necesita para que los modulos
// de las actions carguen.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import type { SessionClaims } from '@/lib/modules/identity/domain/session-claims';
import type { SessionUserRecord } from '@/lib/modules/identity/ports/session-user-reader';

const { readClaimsMock, findActiveByIdMock, headersMock, cookiesMock, revalidatePathMock } =
  vi.hoisted(() => ({
    readClaimsMock: vi.fn<() => Promise<SessionClaims | null>>(),
    findActiveByIdMock:
      vi.fn<(id: string, sessionId?: string) => Promise<SessionUserRecord | null>>(),
    headersMock: vi.fn(async () => new Headers()),
    cookiesMock: vi.fn(),
    revalidatePathMock: vi.fn(),
  }));

// `lib/composition` arrastra todos los adaptadores Prisma del repo. Instanciar `PrismaClient`
// aqui no aporta nada y exigiria `DATABASE_URL`, asi que se sustituye el modulo entero — mismo
// criterio que `tests/unit/composition/identity-facade.test.ts:20`.
vi.mock('@/lib/shared/db/prisma', () => ({ prisma: {} }));

// `next/headers` lo necesita `readRequestIdHeader` (`request-id-headers.ts:24`), que el traductor
// unico de errores invoca cuando una action traduce un fallo. Sin el doble, cualquier action que
// no acabe en exito reventaria por falta de peticion de Next.
vi.mock('next/headers', () => ({ headers: headersMock, cookies: cookiesMock }));

// `credential-setup-actions.ts:3` importa `revalidatePath` en la cabecera del modulo: sin el
// doble no carga, aunque la action que aqui se invoca no lo llame.
vi.mock('next/cache', () => ({ revalidatePath: revalidatePathMock }));

vi.mock('@/lib/modules/identity/adapters/driven/session/session-cookie', () => ({
  readSessionClaims: readClaimsMock,
  startSession: vi.fn(),
  clearSession: vi.fn(),
}));

vi.mock('@/lib/modules/identity/adapters/driven/persistence/session-user-prisma', () => ({
  findActiveSessionUserById: findActiveByIdMock,
}));

// EL AMBITO, SIN PINTADO. Se sustituye el modulo por el `createRequestScope` REAL con un
// `renderStore` que devuelve un `Map` nuevo en cada llamada. La instancia es UNA sola y de ella
// salen las dos claves, asi que `lib/composition` (que importa `requestScoped`) y los
// `currentActor` (que importan `runInRequestScope`) comparten el MISMO almacen: si fueran dos
// instancias, este archivo contaria siempre 2 y el conteo no probaria nada.
vi.mock('@/lib/shared/request-scope', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/shared/request-scope')>();
  const scope = original.createRequestScope({ renderStore: () => new Map<object, unknown>() });
  return {
    ...original,
    requestScoped: scope.requestScoped,
    runInRequestScope: scope.runInRequestScope,
  };
});

const SUB = '3f2b1c9e-0d4a-4c8b-9e77-2a5f6c1d8b40';
const OTRO_SUB = '9a1d4e77-2c3b-4f58-8e06-1b7a9d3c5e02';
const COMPANY_ID = '7c1e0f52-8a3d-4b6e-9f21-5d0c4a8e7b13';
const SID = '5b6f3d21-9c4e-4a7f-8b03-6d2e1f5a9c44';

function claimsDe(sub: string): SessionClaims {
  return {
    sub,
    roleName: 'Rol firmado que ya no vale',
    companyId: COMPANY_ID,
    sessionId: SID,
    issuedAt: new Date(Date.now() - 60_000),
    expiresAt: new Date(Date.now() + 3_600_000),
  };
}

/**
 * La ficha que devuelve el doble: pasa los ocho cortes de `resolve-session.ts`, asi que HAY
 * sesion y el `currentActor` de cada action construye un actor no nulo — que es lo que hace
 * falta para que la lectura ocurra de verdad.
 *
 * `permissions` VACIO a proposito (la eleccion que el enunciado deja abierta): con actor sin
 * permisos, cada caso de uso rechaza en su primera linea con `unauthorized` y NO llega a tocar
 * el repositorio, que aqui es un `prisma` vacio. Asi el conteo no depende de que cada uno de los
 * ocho dominios tenga datos doblados. Lo que se afirma es el numero de lecturas de
 * `findActiveById`, nunca el resultado de la action.
 */
function fichaDe(id: string): SessionUserRecord {
  return {
    id,
    username: 'ana.perez',
    firstNames: 'Ana Maria',
    lastNames: 'Perez Gomez',
    roleName: 'operador',
    companyId: COMPANY_ID,
    companyDeletedAt: null,
    permissions: [],
    accountStatus: 'active',
    lockedUntil: null,
    sessionsValidFrom: new Date('2026-08-01T00:00:00.000Z'),
    sessionRevokedAt: null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// POR QUE LA COMPOSICION SE IMPORTA UNA SOLA VEZ, EN UN `beforeAll` CON PRESUPUESTO PROPIO
//
// Mismo motivo y mismo patron que `tests/unit/composition/identity-facade.test.ts:111-115`, con
// su explicacion larga: importar `@/lib/composition` transforma el grafo ENTERO del punto de
// composicion (~7 s en este arbol) y pagarlo dentro del primer caso lo dejaba al borde del
// `testTimeout` bajo la carga de la suite, que es como se fabrica un flake. Aqui se paga una vez
// en el hook, con un plazo LOCAL de 60 s —`beforeAll` no hereda `testTimeout`—.
//
// El import sigue siendo DINAMICO a proposito: los `vi.mock` de arriba tienen que estar
// aplicados cuando el grafo se cargue.
// ─────────────────────────────────────────────────────────────────────────────────────────────
let identity: (typeof import('@/lib/composition'))['identity'];

beforeAll(async () => {
  ({ identity } = await import('@/lib/composition'));
}, 60_000);

beforeEach(() => {
  vi.clearAllMocks();
  readClaimsMock.mockResolvedValue(claimsDe(SUB));
  findActiveByIdMock.mockImplementation(async (id: string) => fichaDe(id));
});

/**
 * LOS ARCHIVOS CON `currentActor`, uno por fila, con una accion cuya entrada llega hasta
 * `currentActor()`. Esta lista es lo que R15 promete cubrir, y **ya no se fia de un numero
 * escrito a mano**: los dos casos de abajo la comparan contra el arbol, porque el noveno
 * (`session-actions.ts`, de QC-101) llego por un merge y se colo justo por ahi.
 *
 * **Crecida el 2026-09-17 por QC-63**, que estrena la pantalla de ejecucion de recetas:
 * `order-execution-actions.ts` resuelve las dos caras de la sesion y entra en el censo por su
 * nombre exacto. El censo CRECE, nunca se afloja: sigue comparandose contra el arbol, asi que un
 * archivo futuro que nadie declare aqui pone estos casos en rojo.
 *
 * **Crecida el 2026-09-18 por QC-92**, que estrena el ajuste de existencias por lote:
 * `batch-actions.ts` resuelve las dos caras de la sesion y entra en el censo por su nombre exacto.
 * El censo CRECE, nunca se afloja.
 *
 * `setCredentialWithLinkAction` NO esta y no es un olvido: es la accion PUBLICA que a proposito
 * no resuelve actor (QC-79 R18), asi que no lee la sesion ninguna vez.
 *
 * El import es dinamico y perezoso —dentro de `invocar`— para que los dobles de arriba esten
 * aplicados; despues del primero, el modulo queda cacheado.
 */
const ACCIONES: readonly { archivo: string; nombre: string; invocar: () => Promise<unknown> }[] = [
  {
    archivo: 'lib/modules/unidades/adapters/driving/unit-actions.ts',
    nombre: 'listUnitsAction',
    invocar: async () =>
      (await import('@/lib/modules/unidades/adapters/driving/unit-actions')).listUnitsAction(),
  },
  {
    archivo: 'lib/modules/inventario/adapters/driving/product-actions.ts',
    nombre: 'listProductsAction',
    invocar: async () =>
      (await import('@/lib/modules/inventario/adapters/driving/product-actions')).listProductsAction(
        { page: 1 },
      ),
  },
  {
    archivo: 'lib/modules/inventario/adapters/driving/presentation-actions.ts',
    nombre: 'listPresentationsAction',
    invocar: async () =>
      (
        await import('@/lib/modules/inventario/adapters/driving/presentation-actions')
      ).listPresentationsAction({ page: 1 }),
  },
  {
    archivo: 'lib/modules/identity/adapters/driving/credential-setup-actions.ts',
    nombre: 'resendCredentialSetupLinkAction',
    invocar: async () => {
      const formData = new FormData();
      formData.set('userId', SUB);
      return (
        await import('@/lib/modules/identity/adapters/driving/credential-setup-actions')
      ).resendCredentialSetupLinkAction({ status: 'idle' }, formData);
    },
  },
  {
    archivo: 'lib/modules/asignaciones/adapters/driving/order-assignment-actions.ts',
    nombre: 'listOrderResponsiblesAction',
    invocar: async () =>
      (
        await import('@/lib/modules/asignaciones/adapters/driving/order-assignment-actions')
      ).listOrderResponsiblesAction('7a2f1b40-3c5d-4e69-9a18-0d4b6f2e8c31'),
  },
  {
    archivo: 'lib/modules/identity/adapters/driving/work-group-actions.ts',
    nombre: 'listWorkGroupsAction',
    invocar: async () =>
      (await import('@/lib/modules/identity/adapters/driving/work-group-actions')).listWorkGroupsAction(
        { page: 1 },
      ),
  },
  {
    archivo: 'lib/modules/identity/adapters/driving/user-actions.ts',
    nombre: 'listUsersAction',
    invocar: async () =>
      (await import('@/lib/modules/identity/adapters/driving/user-actions')).listUsersAction({
        page: 1,
      }),
  },
  {
    archivo: 'lib/modules/identity/adapters/driving/role-actions.ts',
    nombre: 'listRolesAction',
    invocar: async () =>
      (await import('@/lib/modules/identity/adapters/driving/role-actions')).listRolesAction(),
  },
  {
    // El NOVENO. Entro con la sincronizacion con `dev` (QC-101) DESPUES del grep de H4, que conto
    // ocho, asi que se quedo fuera de T4 y lo encontro el reviewer. Se invoca desde el navegador
    // (`end-user-sessions-dialog.tsx`), que es el supuesto exacto de R3.
    archivo: 'lib/modules/identity/adapters/driving/session-actions.ts',
    nombre: 'endAllSessionsAction',
    invocar: async () => {
      const formData = new FormData();
      formData.set('id', OTRO_SUB);
      return (
        await import('@/lib/modules/identity/adapters/driving/session-actions')
      ).endAllSessionsAction({ status: 'idle' }, formData);
    },
  },
  {
    archivo: 'lib/modules/pedidos/adapters/driving/order-actions.ts',
    nombre: 'listOrdersAction',
    invocar: async () =>
      (await import('@/lib/modules/pedidos/adapters/driving/order-actions')).listOrdersAction({
        page: 1,
      }),
  },
  {
    // Anadido el 2026-09-17 por QC-63, que estrena la pantalla de ejecucion: su archivo de
    // `driving/` resuelve las dos caras de la sesion, asi que el censo tiene que cubrirlo o R15
    // dejaria de ser cierta. Se nombra el ARCHIVO EXACTO, como las otras once filas.
    archivo: 'lib/modules/asignaciones/adapters/driving/order-execution-actions.ts',
    nombre: 'startAssignedOrderAction',
    invocar: async () =>
      (
        await import('@/lib/modules/asignaciones/adapters/driving/order-execution-actions')
      ).startAssignedOrderAction('no-es-un-uuid'),
  },
  {
    // La accion captura los errores y devuelve un estado, asi que una entrada invalida no rompe
    // el caso: lo que esta lista mide es cuantas veces se lee la sesion por invocacion.
    archivo: 'lib/modules/documentos/adapters/driving/document-upload-actions.ts',
    nombre: 'issueUploadLinksAction',
    invocar: async () =>
      (
        await import('@/lib/modules/documentos/adapters/driving/document-upload-actions')
      ).issueUploadLinksAction({} as never),
  },
  {
    // Anadida el 2026-09-18 por QC-92: su archivo de `driving/` resuelve las dos caras de la
    // sesion, asi que el censo tiene que cubrirlo. Se invoca la LECTURA, que es la mas barata.
    archivo: 'lib/modules/inventario/adapters/driving/batch-actions.ts',
    nombre: 'listProductBatchesAction',
    invocar: async () =>
      (
        await import('@/lib/modules/inventario/adapters/driving/batch-actions')
      ).listProductBatchesAction('7a2f1b40-3c5d-4e69-9a18-0d4b6f2e8c31'),
  },
  {
    archivo: 'lib/modules/recetas/adapters/driving/recipe-actions.ts',
    nombre: 'listRecipesAction',
    invocar: async () =>
      (await import('@/lib/modules/recetas/adapters/driving/recipe-actions')).listRecipesAction({
        page: 1,
      }),
  },
  {
    // Los dos archivos de `driving/` de proveedores resuelven las dos caras de la sesion desde
    // que el modulo acota sus consultas por empresa: el actor ya no basta con el usuario, hace
    // falta tambien su empresa. Se elige en cada uno una accion de LISTADO porque su entrada
    // llega hasta `currentActor()` sin depender de ninguna fila sembrada.
    archivo: 'lib/modules/proveedores/adapters/driving/supplier-actions.ts',
    nombre: 'listSuppliersAction',
    invocar: async () =>
      (
        await import('@/lib/modules/proveedores/adapters/driving/supplier-actions')
      ).listSuppliersAction({ page: 1 }),
  },
  {
    // El proveedor del que se pide el catalogo no tiene por que existir: la accion captura el
    // error y devuelve un estado, y lo que esta lista mide es cuantas veces se lee la sesion
    // por invocacion, no el desenlace.
    archivo: 'lib/modules/proveedores/adapters/driving/supplier-catalog-actions.ts',
    nombre: 'listCatalogLinesAction',
    invocar: async () =>
      (
        await import('@/lib/modules/proveedores/adapters/driving/supplier-catalog-actions')
      ).listCatalogLinesAction('4c9d2f81-6b0a-4f3e-9d27-5a1e8c30b742', { page: 1 }),
  },
  {
    // Anadida por QC-111: su archivo de `driving/` resuelve las dos caras de la sesion, asi que el
    // censo tiene que cubrirlo. Se invoca la consulta, que es la mas barata.
    archivo: 'lib/modules/documentos/adapters/driving/document-batch-actions.ts',
    nombre: 'getBatchStatusAction',
    invocar: async () =>
      (
        await import('@/lib/modules/documentos/adapters/driving/document-batch-actions')
      ).getBatchStatusAction('4c9d2f81-6b0a-4f3e-9d27-5a1e8c30b742'),
  },
  {
    // Su archivo de `driving/` resuelve las dos caras de la sesion, asi que el
    // censo tiene que cubrirlo. Entrada VALIDA para que la resolucion de actor llegue a ocurrir
    // -una entrada invalida rechaza antes de `currentActor()`, que es justo lo que esta lista mide-.
    archivo: 'lib/modules/documentos/adapters/driving/catalog-import-actions.ts',
    nombre: 'previewCatalogImportAction',
    invocar: async () =>
      (
        await import('@/lib/modules/documentos/adapters/driving/catalog-import-actions')
      ).previewCatalogImportAction({
        supplierId: '4c9d2f81-6b0a-4f3e-9d27-5a1e8c30b742',
        documentFileId: '7a2f1b40-3c5d-4e69-9a18-0d4b6f2e8c31',
      }),
  },
  {
    // Anadida por QC-154: su archivo de `driving/` resuelve las dos caras de la sesion, asi que
    // el censo tiene que cubrirlo. Se invoca la LECTURA, que es la mas barata.
    archivo: 'lib/modules/clientes/adapters/driving/customer-actions.ts',
    nombre: 'listCustomersAction',
    invocar: async () =>
      (
        await import('@/lib/modules/clientes/adapters/driving/customer-actions')
      ).listCustomersAction({ page: 1 }),
  },
];

/**
 * Los archivos de `adapters/driving/` que resuelven LAS DOS CARAS de la sesion, leidos DEL ARBOL.
 *
 * Esto sustituye a un `expect(...size).toBe(8)` que contaba las filas de `ACCIONES`: como contaba
 * su propia lista, un noveno `currentActor` en disco lo dejaba verde, que es exactamente lo que
 * paso con `session-actions.ts`. Un numero escrito a mano no vigila el arbol; el arbol si.
 *
 * **NADA se escribe a mano aqui, y el motivo es esta misma ficha.** La primera version de esta
 * funcion llevaba la lista de modulos en una constante y no bajaba a las subcarpetas, o sea que
 * repetia —en el mecanismo que existe para que una lista no vigile el arbol— el defecto que vino
 * a arreglar: un archivo con las dos caras en un **modulo nuevo** o en una **subcarpeta** de
 * `driving/` quedaba invisible. Lo encontro el reviewer y lo probo por mutacion. Ahora los
 * modulos salen de `readdirSync('lib/modules')` y el recorrido es **en profundidad**.
 */
function archivosConLasDosCaras(): string[] {
  const raizDeModulos = resolve(process.cwd(), 'lib/modules');
  const encontrados: string[] = [];

  /** Recorre en profundidad: una subcarpeta de `driving/` no puede esconder un `currentActor`. */
  const recorrer = (absoluto: string, relativo: string): void => {
    for (const entrada of readdirSync(absoluto, { withFileTypes: true })) {
      const hijoAbsoluto = join(absoluto, entrada.name);
      const hijoRelativo = `${relativo}/${entrada.name}`;

      if (entrada.isDirectory()) {
        recorrer(hijoAbsoluto, hijoRelativo);
        continue;
      }
      if (!entrada.name.endsWith('.ts')) continue;

      const fuente = readFileSync(hijoAbsoluto, 'utf8');
      // Las dos proyecciones juntas: es la firma de `currentActor`, y lo que R3 acota.
      if (
        fuente.includes('identity.getSessionUser()') &&
        fuente.includes('identity.getSessionContext()')
      ) {
        encontrados.push(hijoRelativo);
      }
    }
  };

  // Los modulos salen del DISCO, no de una constante: un modulo nuevo entra solo.
  for (const modulo of readdirSync(raizDeModulos, { withFileTypes: true })) {
    if (!modulo.isDirectory()) continue;

    const driving = join(raizDeModulos, modulo.name, 'adapters', 'driving');
    if (!existsSync(driving)) continue;

    recorrer(driving, `lib/modules/${modulo.name}/adapters/driving`);
  }

  return encontrados.sort();
}

describe('QC-104 · una lectura de sesion por invocacion de Server Action', () => {
  // R15 exige el conteo en CADA Server Action que resuelve a la vez el usuario y la empresa. Estos
  // dos casos son lo que impide que esa promesa se quede atras del arbol: no hay ningun numero
  // congelado, la lista se compara contra lo que hay en disco.
  it('TODO archivo de driving/ con las dos caras esta en la lista (R15)', () => {
    const enLaLista = new Set(ACCIONES.map((accion) => accion.archivo));
    const sinCubrir = archivosConLasDosCaras().filter((ruta) => !enLaLista.has(ruta));

    expect(
      sinCubrir,
      `hay ${sinCubrir.length} archivo(s) con las dos caras de la sesion fuera del conteo de R15: ` +
        `${sinCubrir.join(', ')}. Anade su fila a ACCIONES.`,
    ).toEqual([]);
  });

  it('TODO archivo de driving/ con las dos caras abre ambito con `runInRequestScope` (R3)', () => {
    const sinAmbito = archivosConLasDosCaras().filter(
      (ruta) => !readFileSync(resolve(process.cwd(), ruta), 'utf8').includes('runInRequestScope'),
    );

    expect(
      sinAmbito,
      `hay ${sinAmbito.length} archivo(s) que resuelven las dos caras SIN ambito de peticion: ` +
        `${sinAmbito.join(', ')}. Envuelve su \`Promise.all\` en \`runInRequestScope\`.`,
    ).toEqual([]);
  });

  describe.each(ACCIONES)('$nombre ($archivo)', ({ invocar }) => {
    it('lee la ficha de sesion EXACTAMENTE una vez por invocacion (R3)', async () => {
      await invocar();

      expect(findActiveByIdMock).toHaveBeenCalledTimes(1);
    });

    it('dos invocaciones seguidas leen DOS veces: nada se reutiliza entre peticiones (R5)', async () => {
      await invocar();
      await invocar();

      expect(findActiveByIdMock).toHaveBeenCalledTimes(2);
    });
  });
});

describe('QC-104 · fuera de todo ambito (R7, R13)', () => {
  it('cada llamada directa relee, y la cookie NUEVA gana sobre la anterior', async () => {
    // Esto es lo que protege al INICIO DE SESION (`design.md > 2.7`): `login-action` emite la
    // cookie y despues lee la sesion en la MISMA invocacion. Si esa segunda lectura reutilizara
    // un «sin sesion» memoizado antes, el login devolveria la sesion vieja.
    readClaimsMock.mockResolvedValue(claimsDe(SUB));
    const primera = await identity.getSessionUser();

    readClaimsMock.mockResolvedValue(claimsDe(OTRO_SUB));
    const segunda = await identity.getSessionUser();

    expect(primera?.id).toBe(SUB);
    expect(segunda?.id).toBe(OTRO_SUB);
    expect(findActiveByIdMock).toHaveBeenCalledTimes(2);
  });

  it('sin ambito tampoco comparten entre si las dos caras de la sesion', async () => {
    // Las dos proyecciones salen de la misma instancia, pero SIN peticion no hay nada que
    // memoizar: son dos lecturas, igual que antes de esta ficha (R7).
    await identity.getSessionUser();
    await identity.getSessionContext();

    expect(findActiveByIdMock).toHaveBeenCalledTimes(2);
  });
});

describe('QC-104 · el inicio de sesion no abre ningun ambito (R13)', () => {
  it('`login-action.ts` no contiene `runInRequestScope`', () => {
    // Prueba de FUENTE, y no de comportamiento, porque lo que se protege es una decision de
    // construccion (`design.md > 2.7`): «no se abre `runInRequestScope` alrededor de codigo que
    // escriba la cookie de sesion». Si alguien lo envolviera «por consistencia» con los ocho
    // `currentActor`, esta linea se pone roja antes de que el login empiece a devolver la sesion
    // de antes de emitirla.
    const fuente = readFileSync(
      resolve(process.cwd(), 'lib/modules/identity/adapters/driving/login-action.ts'),
      'utf8',
    );

    expect(fuente).not.toContain('runInRequestScope');
    expect(fuente).not.toContain('request-scope');
  });
});

describe('QC-104 · las dos proyecciones conservan su firma (R11)', () => {
  it('`getSessionUser` y `getSessionContext` siguen sin parametros', () => {
    // Memoizar por peticion NO se paga con una clave, un identificador ni un «ambito» que el
    // llamante tenga que pasar: el contrato de QC-48 R21 queda igual que estaba.
    expect(identity.getSessionUser.length).toBe(0);
    expect(identity.getSessionContext.length).toBe(0);
  });
});
