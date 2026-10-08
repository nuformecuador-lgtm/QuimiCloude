import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  PERMISSIONS,
  ROLE_ACONDICIONAMIENTO,
  ROLE_ADMINISTRADOR,
  ROLE_EMPACADOR,
  ROLE_OPERADOR,
  SEED_ROLE_PERMISSIONS,
  type PermissionCode,
} from '@/lib/modules/identity';
import { requirePagePermission } from '@/lib/modules/identity/adapters/driving/require-page-permission';
import { LOGIN_ROUTE_SESSION_ENDED } from '@/lib/shared/routes';

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
    expect(redirectMock).toHaveBeenCalledWith(LOGIN_ROUTE_SESSION_ENDED);
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

// Quien solo tiene los permisos del Maestro pide pantallas privadas de empresa.
describe('requirePagePermission con los permisos del Maestro (QC-161)', () => {
  const PERMISOS_DEL_MAESTRO = ['empresas.consultar', 'empresas.modificar'];

  it('QC-161 R34: una pagina de inventario.consultar responde el mismo 404, sin redirigir', async () => {
    getSessionUserMock.mockResolvedValue(usuario(PERMISOS_DEL_MAESTRO));

    await expect(requirePagePermission('inventario.consultar')).rejects.toThrow('NEXT_NOT_FOUND');

    expect(notFoundMock).toHaveBeenCalledTimes(1);
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it('QC-161 R34: cualquier permiso del catalogo que no sea empresas.* responde 404', async () => {
    getSessionUserMock.mockResolvedValue(usuario(PERMISOS_DEL_MAESTRO));
    const ajenos = PERMISSIONS.map((p) => p.code).filter((code) => !code.startsWith('empresas.'));
    expect(ajenos.length).toBeGreaterThan(0);

    for (const code of ajenos) {
      notFoundMock.mockClear();
      await expect(requirePagePermission(code)).rejects.toThrow('NEXT_NOT_FOUND');
      expect(notFoundMock).toHaveBeenCalledTimes(1);
    }
    expect(redirectMock).not.toHaveBeenCalled();
  });

  // Simetrico: el corte es por permiso y no por quien es. Con `empresas.consultar` la misma
  // sesion pasa, que es lo que necesitara la pantalla del Maestro.
  it('QC-161 R34: con empresas.consultar la pagina que lo exige no corta', async () => {
    getSessionUserMock.mockResolvedValue(usuario(PERMISOS_DEL_MAESTRO));

    await expect(requirePagePermission('empresas.consultar')).resolves.toBeUndefined();

    expect(notFoundMock).not.toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
  });
});

// El codigo que exige cada pagina se lee de su fuente: si la pagina cambiara de permiso, este
// bloque juzga el nuevo, no una copia.
describe('requirePagePermission con los permisos del Administrador de acondicionamiento (QC-216)', () => {
  const PERMISOS_DEL_ROL = SEED_ROLE_PERMISSIONS[ROLE_ACONDICIONAMIENTO] ?? [];

  function codigoQueExige(pagina: string): PermissionCode {
    const fuente = readFileSync(resolve(process.cwd(), pagina), 'utf8');
    const codigos = [...fuente.matchAll(/requirePagePermission\(\s*['"`]([^'"`]+)['"`]\s*\)/g)].map(
      (match) => match[1],
    );
    expect(codigos, `${pagina} debe exigir exactamente un permiso`).toHaveLength(1);
    const codigo = PERMISSIONS.find((permiso) => permiso.code === codigos[0])?.code;
    expect(codigo, `${pagina} exige un codigo que no esta en el catalogo`).toBeDefined();
    return codigo as PermissionCode;
  }

  it('QC-216 R13: el rol tiene permisos sembrados con los que juzgar', () => {
    expect(PERMISOS_DEL_ROL.length).toBeGreaterThan(0);
  });

  it('QC-216 R13: /asignacion deja pasar al rol, sin redirigir ni responder 404', async () => {
    getSessionUserMock.mockResolvedValue(usuario(PERMISOS_DEL_ROL));

    await expect(
      requirePagePermission(codigoQueExige('app/(private)/asignacion/page.tsx')),
    ).resolves.toBeUndefined();

    expect(notFoundMock).not.toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it.each([
    ['/asignacion/<id>', 'app/(private)/asignacion/[id]/page.tsx'],
    ['/asignacion/empaque/<id>', 'app/(private)/asignacion/empaque/[id]/page.tsx'],
    ['/pedidos', 'app/(private)/pedidos/page.tsx'],
    ['/inventario', 'app/(private)/inventario/page.tsx'],
  ])('QC-216 R13: %s responde «no encontrado» al rol', async (_ruta, pagina) => {
    getSessionUserMock.mockResolvedValue(usuario(PERMISOS_DEL_ROL));

    await expect(requirePagePermission(codigoQueExige(pagina))).rejects.toThrow('NEXT_NOT_FOUND');

    expect(notFoundMock).toHaveBeenCalledTimes(1);
    expect(redirectMock).not.toHaveBeenCalled();
  });

  const DETALLE = 'app/(private)/asignacion/acondicionamiento/[id]/page.tsx';

  it('R18: /asignacion/acondicionamiento/<id> deja pasar al rol, sin redirigir ni responder 404', async () => {
    getSessionUserMock.mockResolvedValue(usuario(PERMISOS_DEL_ROL));

    await expect(requirePagePermission(codigoQueExige(DETALLE))).resolves.toBeUndefined();

    expect(notFoundMock).not.toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it.each([ROLE_ADMINISTRADOR, ROLE_OPERADOR, ROLE_EMPACADOR])(
    'R18: /asignacion/acondicionamiento/<id> responde «no encontrado» con los permisos sembrados de %s',
    async (rol) => {
      getSessionUserMock.mockResolvedValue(usuario(SEED_ROLE_PERMISSIONS[rol] ?? []));

      await expect(requirePagePermission(codigoQueExige(DETALLE))).rejects.toThrow('NEXT_NOT_FOUND');

      expect(notFoundMock).toHaveBeenCalledTimes(1);
      expect(redirectMock).not.toHaveBeenCalled();
    },
  );
});
