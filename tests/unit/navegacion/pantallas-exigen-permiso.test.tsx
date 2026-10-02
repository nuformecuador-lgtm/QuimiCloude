import { describe, expect, it, vi, beforeEach } from 'vitest';

import DashboardPage from '@/app/(private)/dashboard/page';
import InventarioPage from '@/app/(private)/inventario/page';
import PedidosPage from '@/app/(private)/pedidos/page';
import EditarRecetaPage from '@/app/(private)/produccion/formulas/[id]/page';
import EditarVersionPage from '@/app/(private)/produccion/formulas/[id]/versiones/[versionId]/page';
import NuevaVersionPage from '@/app/(private)/produccion/formulas/[id]/versiones/nueva/page';
import NuevaRecetaPage from '@/app/(private)/produccion/formulas/nueva/page';
import FormulasPage from '@/app/(private)/produccion/formulas/page';
import ProveedorDetallePage from '@/app/(private)/proveedores/[id]/page';
import ProveedoresPage from '@/app/(private)/proveedores/page';
import type { PermissionCode, SessionUser } from '@/lib/modules/identity';
import { LOGIN_ROUTE_SESSION_ENDED } from '@/lib/shared/routes';

/**
 * T6 (QC-75) — las ocho pantallas de `app/(private)/` exigen su permiso ANTES de leer o pintar
 * nada (R6, R7, R10; `design.md > 2.2`).
 *
 * **Qué demuestra y cómo.** Cada pantalla se invoca como la invoca el App Router —llamando al
 * componente `async` con sus props— y se comprueban las tres situaciones que importan:
 *
 * 1. **Sin el permiso** (sesión válida, `permissions` sin ese código): la llamada **lanza** —el
 *    `notFound()` de Next está tipado `(): never` y lanza; el mock hace lo mismo— y **ninguna**
 *    lectura de la pantalla llegó a ocurrir. Eso es lo que convierte «exige el permiso» en «exige
 *    el permiso ANTES de leer o pintar», que es lo que R6 pide y lo único que un `requirePermission`
 *    puesto al final del cuerpo no cumpliría.
 * 2. **Con el permiso**: no lanza, no llama a `notFound` y no redirige.
 * 3. **Sin sesión**: redirige a `LOGIN_ROUTE` y **no** llama a `notFound` — un anónimo no recibe
 *    404, recibe el login con su destino de vuelta (R17).
 *
 * **Qué cuenta como «lectura».** Dos cosas, y las dos se espían:
 *
 * - `params` / `searchParams` son **promesas espía**: su `then` anota el acceso. Que no se hayan
 *   resuelto prueba que la pantalla ni siquiera miró la URL. Es un espía real, no un adorno: el
 *   caso «con permiso» afirma que **sí** se leyeron, así que un espía que no funcionara pondría
 *   ese caso en rojo.
 * - Las cuatro Server Actions que las páginas invocan en su propio cuerpo (`getSupplierAction`,
 *   `getRecipeAction`, `listUnitsAction`, `listProductsAction`) están mockeadas y se afirma
 *   `not.toHaveBeenCalled()` en TODAS las pantallas, no solo en las que las usan.
 *
 * **Por qué no se renderiza el árbol.** No hace falta para lo que este archivo afirma, y traería
 * ruido ajeno: las listas de estas pantallas viven bajo `<Suspense>` en componentes de servidor
 * hijos, que el render de jsdom no ejecuta. Lo que se ve en pantalla ya lo cubren
 * `tests/unit/inventario/product-page.test.tsx`, `tests/unit/recetas-ui/recipe-page.test.tsx`,
 * `tests/unit/proveedores-ui/supplier-showcase-page.test.tsx` y sus hermanos, que montan la
 * pantalla dentro del layout privado. Aquí se afirma el CORTE, y el corte ocurre antes de que haya
 * árbol.
 *
 * El archivo es `.tsx` para caer en el proyecto `ui` de `vitest.config.mts` (jsdom), que es el que
 * incluye `tests/**\/*.test.tsx`: los módulos de página arrastran componentes de cliente en su
 * cierre de imports.
 */

const { getSessionUserMock, notFoundMock, redirectMock, actions } = vi.hoisted(() => ({
  getSessionUserMock: vi.fn<() => Promise<unknown>>(),
  notFoundMock: vi.fn<() => never>(),
  redirectMock: vi.fn<(ruta: string) => never>(),
  actions: {
    getSupplierAction: vi.fn(),
    getRecipeAction: vi.fn(),
    listUnitsAction: vi.fn(),
    listProductsAction: vi.fn(),
  },
}));

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  notFound: notFoundMock,
  redirect: redirectMock,
}));

vi.mock('@/lib/composition', () => ({
  identity: { getSessionUser: getSessionUserMock, endSession: vi.fn<() => Promise<void>>() },
  // QC-71 (T7): los adaptadores driving piden a la composicion la LECTURA de la cabecera del
  // identificador para pasarsela al traductor unico. Sin ella en el doble, el modulo ni carga.
  // Devuelve `null` -sin cabecera- porque esta pantalla no ejercita ningun error inesperado:
  // lo que prueba es el corte por permiso, y el traductor no llega a invocarse.
  observabilidad: { readRequestIdHeader: vi.fn(async (): Promise<string | null> => null) },
}));

vi.mock('@/lib/modules/proveedores/adapters/driving/supplier-actions', () => ({
  getSupplierAction: actions.getSupplierAction,
  listSuppliersAction: vi.fn(),
  createSupplierAction: vi.fn(),
  updateSupplierAction: vi.fn(),
  deleteSupplierAction: vi.fn(),
}));

vi.mock('@/lib/modules/recetas/adapters/driving/recipe-actions', () => ({
  getRecipeAction: actions.getRecipeAction,
  listRecipesAction: vi.fn(),
  createRecipeAction: vi.fn(),
  updateRecipeAction: vi.fn(),
  deleteRecipeAction: vi.fn(),
  listRecipeVersionsAction: vi.fn(async () => ({ status: 'success', data: [] })),
  createRecipeVersionAction: vi.fn(),
  updateRecipeVersionAction: vi.fn(),
}));

vi.mock('@/lib/modules/unidades/adapters/driving/unit-actions', () => ({
  listUnitsAction: actions.listUnitsAction,
}));

vi.mock('@/lib/modules/inventario/adapters/driving/product-actions', () => ({
  listProductsAction: actions.listProductsAction,
  createProductAction: vi.fn(),
  updateProductAction: vi.fn(),
  deleteProductAction: vi.fn(),
}));

/** Anota cada acceso a una promesa de `params`/`searchParams`, con el nombre de quien la pidió. */
const accesoAParametros = vi.fn<(quien: string) => void>();

/**
 * Una promesa espía: `await` sobre ella llama a su `then`, que anota el acceso antes de resolver.
 * Es la forma exacta en que el App Router entrega `params` y `searchParams` —un thenable—, así que
 * no falsea nada de la pantalla; solo deja constancia de que fue leída.
 */
function parametroEspia<T>(quien: string, valor: T): Promise<T> {
  return {
    then: (resolve: (value: T) => unknown) => {
      accesoAParametros(quien);
      return resolve(valor);
    },
  } as unknown as Promise<T>;
}

/** El resultado de error con el que responden las actions: ninguna pantalla necesita más. */
const RESULTADO_DE_ERROR = {
  status: 'error',
  code: 'not_found',
  message: 'MENSAJE-DEL-FIXTURE',
} as const;

const PERMISOS_DE_OTRO_MODULO = ['unidades.consultar'] as const;

function sesionCon(permissions: readonly string[]): SessionUser {
  return {
    id: 'u-test-75',
    username: 'carla.duarte',
    displayName: 'Carla Duarte Salas',
    roleName: 'Operador',
    permissions,
  };
}

type CasoDePagina = {
  /** Nombre visible del caso: la URL que sirve la pantalla. */
  readonly ruta: string;
  readonly permiso: PermissionCode;
  readonly invocar: () => Promise<unknown>;
  /**
   * `false` solo para el dashboard, que no tiene `params`, `searchParams` ni ninguna lectura: con
   * permiso no hay nada que espiar. En las otras siete el caso «con permiso» exige que sí se leyó,
   * que es lo que impide que el espía se quede mudo y el caso «sin permiso» pase por vacuidad.
   */
  readonly leeAlgo: boolean;
};

const PAGINAS: readonly CasoDePagina[] = [
  {
    ruta: '/dashboard',
    permiso: 'dashboard.consultar',
    invocar: () => DashboardPage(),
    leeAlgo: false,
  },
  {
    ruta: '/inventario',
    permiso: 'inventario.consultar',
    invocar: () => InventarioPage({ searchParams: parametroEspia('/inventario', {}) }),
    leeAlgo: true,
  },
  {
    ruta: '/pedidos',
    permiso: 'pedidos.consultar',
    invocar: () => PedidosPage({ searchParams: parametroEspia('/pedidos', {}) }),
    leeAlgo: true,
  },
  {
    ruta: '/proveedores',
    permiso: 'proveedores.consultar',
    invocar: () => ProveedoresPage({ searchParams: parametroEspia('/proveedores', {}) }),
    leeAlgo: true,
  },
  {
    ruta: '/proveedores/[id]',
    permiso: 'proveedores.consultar',
    invocar: () =>
      ProveedorDetallePage({
        params: parametroEspia('/proveedores/[id]', { id: 'ID-DEL-FIXTURE' }),
        searchParams: parametroEspia('/proveedores/[id]', {}),
      }),
    leeAlgo: true,
  },
  {
    ruta: '/produccion/formulas',
    permiso: 'recetas.consultar',
    invocar: () => FormulasPage({ searchParams: parametroEspia('/produccion/formulas', {}) }),
    leeAlgo: true,
  },
  {
    ruta: '/produccion/formulas/nueva',
    permiso: 'recetas.consultar',
    // No tiene `params` ni `searchParams`: aquí lo que se lee son las dos actions, y esas también
    // están espiadas. Por eso `leeAlgo` es `true`.
    invocar: () => NuevaRecetaPage(),
    leeAlgo: true,
  },
  {
    ruta: '/produccion/formulas/[id]',
    permiso: 'recetas.consultar',
    invocar: () =>
      EditarRecetaPage({
        params: parametroEspia('/produccion/formulas/[id]', { id: 'ID-DEL-FIXTURE' }),
      }),
    leeAlgo: true,
  },
  {
    ruta: '/produccion/formulas/[id]/versiones/nueva',
    permiso: 'recetas.consultar',
    invocar: () =>
      NuevaVersionPage({
        params: parametroEspia('/produccion/formulas/[id]/versiones/nueva', {
          id: 'ID-DEL-FIXTURE',
        }),
      }),
    leeAlgo: true,
  },
  {
    ruta: '/produccion/formulas/[id]/versiones/[versionId]',
    permiso: 'recetas.consultar',
    invocar: () =>
      EditarVersionPage({
        params: parametroEspia('/produccion/formulas/[id]/versiones/[versionId]', {
          id: 'ID-DEL-FIXTURE',
          versionId: 'ID-DE-VERSION-DEL-FIXTURE',
        }),
      }),
    leeAlgo: true,
  },
];

/** Todas las lecturas espiadas de este archivo, en un solo sitio: parámetros y Server Actions. */
function lecturasOcurridas(): readonly string[] {
  return [
    ...accesoAParametros.mock.calls.map(([quien]) => `parametros(${quien})`),
    ...Object.entries(actions)
      .filter(([, mock]) => mock.mock.calls.length > 0)
      .map(([nombre]) => `${nombre}()`),
  ];
}

beforeEach(() => {
  vi.clearAllMocks();
  // Los dos interruptores de control de Next LANZAN en producción. Un mock que devolviera
  // `undefined` dejaría a la página seguir su curso y este archivo estaría comprobando otra cosa.
  notFoundMock.mockImplementation(() => {
    throw new Error('NEXT_NOT_FOUND');
  });
  redirectMock.mockImplementation(() => {
    throw new Error('NEXT_REDIRECT');
  });
  for (const mock of Object.values(actions)) mock.mockResolvedValue(RESULTADO_DE_ERROR);
});

describe('las ocho pantallas privadas exigen su permiso antes de leer o pintar (R6, R7)', () => {
  it.each(PAGINAS)(
    '$ruta responde 404 sin el permiso, y no llega a leer nada',
    async ({ invocar }) => {
      getSessionUserMock.mockResolvedValue(sesionCon(PERMISOS_DE_OTRO_MODULO));

      await expect(invocar()).rejects.toThrow('NEXT_NOT_FOUND');

      expect(notFoundMock).toHaveBeenCalledTimes(1);
      expect(redirectMock).not.toHaveBeenCalled();
      // El corazón de R6: el corte ocurrió ANTES de cualquier lectura de la pantalla.
      expect(lecturasOcurridas()).toEqual([]);
    },
  );

  it.each(PAGINAS)(
    '$ruta responde 404 con el conjunto de permisos vacío (R9)',
    async ({ invocar }) => {
      getSessionUserMock.mockResolvedValue(sesionCon([]));

      await expect(invocar()).rejects.toThrow('NEXT_NOT_FOUND');

      expect(notFoundMock).toHaveBeenCalledTimes(1);
      expect(lecturasOcurridas()).toEqual([]);
    },
  );

  it.each(PAGINAS)('$ruta se sirve con el permiso, sin 404 ni redirección', async ({ invocar, permiso, leeAlgo }) => {
    getSessionUserMock.mockResolvedValue(sesionCon([permiso]));

    await expect(invocar()).resolves.toBeDefined();

    expect(notFoundMock).not.toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
    // Ancla anti-vacuidad de los dos casos anteriores: si el espía no espiara, aquí no habría
    // nada que enseñar y este `expect` se pondría rojo.
    expect(lecturasOcurridas().length > 0).toBe(leeAlgo);
  });

  it.each(PAGINAS)('$ruta manda al login cuando no hay sesión, no a un 404', async ({ invocar }) => {
    getSessionUserMock.mockResolvedValue(null);

    await expect(invocar()).rejects.toThrow('NEXT_REDIRECT');

    expect(redirectMock).toHaveBeenCalledWith(LOGIN_ROUTE_SESSION_ENDED);
    expect(notFoundMock).not.toHaveBeenCalled();
    expect(lecturasOcurridas()).toEqual([]);
  });

  it('cada pantalla exige el permiso de SU módulo y no el de otro (design.md > 2.2)', async () => {
    for (const { permiso, invocar } of PAGINAS) {
      for (const otro of PAGINAS) {
        if (otro.permiso === permiso) continue;
        vi.clearAllMocks();
        notFoundMock.mockImplementation(() => {
          throw new Error('NEXT_NOT_FOUND');
        });
        getSessionUserMock.mockResolvedValue(sesionCon([otro.permiso]));

        await expect(invocar()).rejects.toThrow('NEXT_NOT_FOUND');
      }
    }
  });

  it('el alta y la edición de receta piden `recetas.consultar`, NO `recetas.modificar`', async () => {
    // No es un descuido (`design.md > 2.2`): el permiso de escritura lo exige el caso de uso al
    // guardar, y QC-74 cerró que no hay implicación entre permisos. Pedir `modificar` en la ruta
    // sería una segunda regla de autorización sobre la misma operación, fuera de la frontera. Si
    // alguien "endurece" la ruta, este caso se pone rojo y le explica por qué no.
    getSessionUserMock.mockResolvedValue(sesionCon(['recetas.consultar']));
    await expect(NuevaRecetaPage()).resolves.toBeDefined();

    vi.clearAllMocks();
    for (const mock of Object.values(actions)) mock.mockResolvedValue(RESULTADO_DE_ERROR);
    notFoundMock.mockImplementation(() => {
      throw new Error('NEXT_NOT_FOUND');
    });
    getSessionUserMock.mockResolvedValue(sesionCon(['recetas.modificar']));

    // Y al revés: `modificar` SOLO no abre la pantalla, porque no hay implicación entre permisos.
    await expect(NuevaRecetaPage()).rejects.toThrow('NEXT_NOT_FOUND');
  });
});
