import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { logoutAction } from '@/lib/modules/identity/adapters/driving/logout-action';

const { endSessionMock } = vi.hoisted(() => ({
  endSessionMock: vi.fn<() => Promise<void>>(),
}));

// Se mockea el punto de composicion para contar invocaciones sin depender del no-op real:
// cuando la feature 10 rellene el stub, este test sigue midiendo el contrato de la action.
vi.mock('@/lib/composition', () => ({
  identity: { endSession: endSessionMock },
}));

/** Modulos cuyo fuente se inspecciona para R22/R35. */
const MODULOS_INSPECCIONADOS = [
  'lib/modules/identity/adapters/driving/logout-action.ts',
  'lib/modules/identity/adapters/driven/session/session-stub.ts',
] as const;

/**
 * Devuelve el fuente sin lineas de comentario.
 *
 * Los dos archivos **mencionan a proposito** `redirect`, `cookies` y compania en sus
 * comentarios de cabecera (explican que la feature 10 los anadira), asi que un grep crudo
 * daria falso positivo. Se filtran las lineas que empiezan por `//`, `*` o `/*`.
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
  it('invoca el cierre de sesion del proveedor exactamente una vez y no devuelve valor', async () => {
    // R20 (contrato de la action) — la firma esta congelada: sin parametros y sin retorno.
    const resultado = await logoutAction();

    expect(endSessionMock).toHaveBeenCalledTimes(1);
    expect(endSessionMock).toHaveBeenCalledWith();
    expect(resultado).toBeUndefined();
  });

  it('la accion de cierre de sesion no navega, no toca cookies y no accede a datos', () => {
    // R22 + R35.
    //
    // El assert va sobre el CODIGO FUENTE y no sobre el comportamiento en tiempo de
    // ejecucion a proposito: un `redirect()` anadido manana lanza una excepcion especial de
    // Next que un test de runtime podria tragarse (o que ni siquiera se ejecutaria si la
    // rama no se recorre). Mirar el fuente es la unica forma de que R22/R35 se pongan en
    // rojo el dia que alguien enchufe navegacion, cookies, base de datos o red aqui.
    const prohibidos = [
      /next\/navigation/i,
      /\bredirect\b/i,
      /next\/headers/i,
      /\bcookies\b/i,
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
