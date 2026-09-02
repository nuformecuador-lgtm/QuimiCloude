import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { logoutAction } from '@/lib/modules/identity/adapters/driving/logout-action';

const { endSessionMock, redirectMock } = vi.hoisted(() => ({
  endSessionMock: vi.fn<() => Promise<void>>(),
  redirectMock: vi.fn<(ruta: string) => never>(),
}));

// Se mockea el punto de composicion para contar invocaciones sin depender del no-op real:
// cuando la feature 10 rellene el stub, este test sigue midiendo el contrato de la action.
vi.mock('@/lib/composition', () => ({
  identity: { endSession: endSessionMock },
}));

// El `redirect` real de Next senializa la navegacion LANZANDO una excepcion especial en vez
// de retornar. El doble reproduce ese comportamiento (lanza un centinela) para que el test
// sea fiel: si la action metiera el redirect dentro de un `try`, la excepcion se tragaria y
// este test lo notaria.
vi.mock('next/navigation', () => ({
  redirect: (ruta: string): never => {
    redirectMock(ruta);
    throw new Error('NEXT_REDIRECT');
  },
}));

/** Modulos cuyo fuente se inspecciona para R22/R35. */
const MODULOS_INSPECCIONADOS = [
  'lib/modules/identity/adapters/driving/logout-action.ts',
] as const;

/**
 * Devuelve el fuente sin lineas de comentario.
 *
 * El archivo **menciona a proposito** `redirect` y `next/navigation` en su comentario de
 * cabecera, asi que un grep crudo daria falso positivo sobre terminos que ya estan
 * permitidos. Se filtran las lineas que empiezan por `//`, `*` o `/*`.
 */
function fuenteSinComentarios(modulo: string): string {
  return readFileSync(resolve(process.cwd(), modulo), 'utf8')
    .split('\n')
    .filter((linea) => {
      const limpia = linea.trim();
      return !limpia.startsWith('//') && !limpia.startsWith('*') && !limpia.startsWith('/*');
    })
    .join('\n');
}

beforeEach(() => {
  vi.clearAllMocks();
  endSessionMock.mockResolvedValue(undefined);
});

describe('logoutAction', () => {
  it('la firma sigue congelada: sin parametros y sin valor de retorno', () => {
    // R19 — el contrato de la action no cambia aunque ahora redirija por dentro.
    expect(logoutAction).toHaveLength(0);
  });

  it('invoca el cierre de sesion del proveedor exactamente una vez antes de redirigir', async () => {
    // R18/R20 (contrato de la action) — el `redirect` real de Next lanza para senializar
    // la navegacion, asi que la propia invocacion rechaza; se captura para poder seguir
    // afirmando sobre los mocks.
    await expect(logoutAction()).rejects.toThrow('NEXT_REDIRECT');

    expect(endSessionMock).toHaveBeenCalledTimes(1);
    expect(endSessionMock).toHaveBeenCalledWith();
  });

  it('redirige a LOGIN_ROUTE DESPUES de cerrar la sesion, no antes', async () => {
    // R18 — se afirma el ORDEN, no solo que ambas se llamaron: si la redireccion ocurriera
    // antes de endSession, el usuario volveria al login con la cookie de sesion todavia
    // puesta.
    await expect(logoutAction()).rejects.toThrow('NEXT_REDIRECT');

    expect(redirectMock).toHaveBeenCalledWith('/login');

    const [ordenEndSession] = endSessionMock.mock.invocationCallOrder;
    const [ordenRedirect] = redirectMock.mock.invocationCallOrder;

    expect(ordenEndSession).toBeDefined();
    expect(ordenRedirect).toBeDefined();
    expect(ordenEndSession).toBeLessThan(ordenRedirect as number);
  });

  it('la accion de cierre de sesion no toca cookies desde el navegador ni accede a datos', () => {
    // R22 + R35.
    //
    // El assert va sobre el CODIGO FUENTE. `redirect`, `next/navigation` y `cookies` del
    // lado servidor ya estan PERMITIDOS a proposito (decision del humano del 2026-09-02: al
    // cerrar sesion se vuelve al login), asi que ya no se prohiben aqui. Lo que sigue
    // prohibido es que el navegador manipule la cookie directamente (`document.cookie`) y
    // cualquier acceso a datos (Prisma, Supabase, red).
    const prohibidos = [
      /document\.cookie/i,
      /\bprisma\b/i,
      /\bPrismaClient\b/,
      /\bsupabase\b/i,
      /\bfetch\b/i,
    ];

    for (const modulo of MODULOS_INSPECCIONADOS) {
      const fuente = fuenteSinComentarios(modulo);

      expect(fuente.trim().length).toBeGreaterThan(0);
      for (const prohibido of prohibidos) {
        expect(fuente).not.toMatch(prohibido);
      }
    }
  });
});
