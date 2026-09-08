import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { requirePagePermission } from '@/lib/modules/identity/adapters/driving/require-page-permission';

type UsuarioDeSesion = { readonly id: string; readonly permissions: readonly string[] };

const { getSessionUserMock, redirectMock, notFoundMock } = vi.hoisted(() => ({
  getSessionUserMock: vi.fn<() => Promise<unknown>>(),
  redirectMock: vi.fn<(ruta: string) => void>(),
  notFoundMock: vi.fn<() => void>(),
}));

// Se mockea el punto de composicion: el helper es un adaptador driving y lo unico que se mide
// aqui es su contrato (a quien pregunta y como corta), no la cadena real de sesion.
vi.mock('@/lib/composition', () => ({
  identity: { getSessionUser: getSessionUserMock },
}));

// Los dos interruptores de Next SENIALIZAN LANZANDO, no retornando: ambos estan tipados
// `(): never`. Los dobles reproducen eso —`NEXT_REDIRECT` y `NEXT_NOT_FOUND`— para que el test
// sea fiel: si el helper metiera la llamada dentro de un `try`, la excepcion se tragaria y este
// test lo notaria.
vi.mock('next/navigation', () => ({
  redirect: (ruta: string): never => {
    redirectMock(ruta);
    throw new Error('NEXT_REDIRECT');
  },
  notFound: (): never => {
    notFoundMock();
    throw new Error('NEXT_NOT_FOUND');
  },
}));

const FUENTE = 'lib/modules/identity/adapters/driving/require-page-permission.ts';

function usuario(permissions: readonly string[]): UsuarioDeSesion {
  return { id: 'u-1', permissions };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('requirePagePermission', () => {
  it('sin sesion redirige al login y NO llama a notFound', async () => {
    // R6 — el layout y la pagina se renderizan en paralelo, asi que la pagina no puede dar por
    // hecho que el redirect del layout ya ocurrio: aqui esta la ultima linea de defensa.
    getSessionUserMock.mockResolvedValue(null);

    await expect(requirePagePermission('inventario.consultar')).rejects.toThrow('NEXT_REDIRECT');

    expect(redirectMock).toHaveBeenCalledTimes(1);
    expect(redirectMock).toHaveBeenCalledWith('/login');
    expect(notFoundMock).not.toHaveBeenCalled();
  });

  it('con el permiso exacto resuelve sin lanzar y no corta de ninguna forma', async () => {
    // R6 — el camino feliz: ni redireccion ni 404.
    getSessionUserMock.mockResolvedValue(usuario(['inventario.consultar', 'pedidos.consultar']));

    await expect(requirePagePermission('inventario.consultar')).resolves.toBeUndefined();

    expect(redirectMock).not.toHaveBeenCalled();
    expect(notFoundMock).not.toHaveBeenCalled();
  });

  it('con sesion pero sin el permiso llama a notFound() y la llamada LANZA', async () => {
    // R7 — el 404 no puede "seguir de largo": si `notFound()` no interrumpiera, la pantalla se
    // pintaria igual. Por eso se afirma el rechazo, no solo la invocacion.
    getSessionUserMock.mockResolvedValue(usuario(['inventario.consultar']));

    await expect(requirePagePermission('pedidos.consultar')).rejects.toThrow('NEXT_NOT_FOUND');

    expect(notFoundMock).toHaveBeenCalledTimes(1);
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it('con el conjunto de permisos VACIO tambien responde 404, sin pantalla de «sin acceso»', async () => {
    // R9 — quien no puede consultar nada recibe 404 en toda ruta privada; su login no se rechaza
    // ni se le pinta una pantalla especial. Aqui se mide la mitad de la pantalla.
    getSessionUserMock.mockResolvedValue(usuario([]));

    await expect(requirePagePermission('dashboard.consultar')).rejects.toThrow('NEXT_NOT_FOUND');

    expect(notFoundMock).toHaveBeenCalledTimes(1);
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it('el permiso se compara EXACTO: `inventario.modificar` no abre `inventario.consultar`', async () => {
    // QC-74 R13, heredado — no hay implicacion entre permisos. Tener el de escritura de un modulo
    // no concede el de lectura, ni al reves.
    getSessionUserMock.mockResolvedValue(usuario(['inventario.modificar']));

    await expect(requirePagePermission('inventario.consultar')).rejects.toThrow('NEXT_NOT_FOUND');

    expect(notFoundMock).toHaveBeenCalledTimes(1);
  });

  it('el fuente delega en assertPermission y no compara el conjunto de permisos a mano', () => {
    // R10 — QC-74 R12 dejo `assertPermission` como la UNICA implementacion de «el actor tiene
    // este permiso». Un `includes` aqui seria una segunda definicion de autorizacion, libre de
    // divergir en silencio. El assert va sobre el FUENTE porque es la unica forma de impedir la
    // "simplificacion" a un `if`, que pasaria todos los tests de comportamiento de arriba.
    const fuente = readFileSync(resolve(process.cwd(), FUENTE), 'utf8');

    expect(fuente.trim().length).toBeGreaterThan(0);
    expect(fuente).toContain('assertPermission');
    expect(fuente).not.toContain('.includes(');
  });
});
