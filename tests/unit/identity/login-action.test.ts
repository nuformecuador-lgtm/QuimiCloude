import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { redirect } from 'next/navigation';

import { loginAction } from '@/lib/modules/identity/adapters/driving/login-action';
import { PERMISSIONS, type SessionUser } from '@/lib/modules/identity';
import {
  PRIVATE_NAV_ITEMS,
  filterNavItemsByPermissions,
  firstVisibleNavHref,
} from '@/lib/shared/navigation/private-nav';
import {
  ASSIGNED_ORDERS_ROUTE,
  DASHBOARD_ROUTE,
  FORMULAS_ROUTE,
  INVENTORY_ROUTE,
} from '@/lib/shared/routes';
import {
  GENERIC_CREDENTIALS_ERROR,
  LOGIN_INITIAL_STATE,
  type LoginFormState,
} from '@/lib/modules/identity/adapters/driving/login-form-state';

const { verifyCredentialsMock, getSessionUserMock } = vi.hoisted(() => ({
  verifyCredentialsMock: vi.fn<(input: { username: string; password: string }) => Promise<{ ok: boolean }>>(),
  // QC-75 T9: la action lee la sesion RECIEN EMITIDA para calcular su respaldo. El doble
  // devuelve el usuario que cada caso necesita; por defecto, uno que lo puede consultar todo.
  getSessionUserMock: vi.fn<() => Promise<SessionUser | null>>(),
}));

vi.mock('@/lib/composition', () => ({
  identity: { verifyCredentials: verifyCredentialsMock, getSessionUser: getSessionUserMock },
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}));

/** Los codigos del catalogo de QC-74, derivados y no escritos a mano. */
const TODOS_LOS_PERMISOS: readonly string[] = PERMISSIONS.map((permiso) => permiso.code);

function usuarioCon(permissions: readonly string[]): SessionUser {
  return {
    id: 'usuario-1',
    username: 'ana.perez',
    displayName: 'Ana Perez',
    roleName: 'Operador',
    permissions,
  };
}

function formDataOf(fields: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    formData.set(name, value);
  }
  return formData;
}

function submit(fields: Record<string, string>, prevState: LoginFormState = LOGIN_INITIAL_STATE) {
  return loginAction(prevState, formDataOf(fields));
}

beforeEach(() => {
  vi.clearAllMocks();
  // Doble explicito: la action se testea contra un doble, nunca contra el dominio real.
  // Por defecto rechaza; los tests que necesitan otro resultado lo sobreescriben.
  verifyCredentialsMock.mockResolvedValue({ ok: false });
  // Por defecto quien entra lo puede consultar todo; con el dashboard oculto del menu, su
  // respaldo es asignacion, el primer item visible.
  getSessionUserMock.mockResolvedValue(usuarioCon(TODOS_LOS_PERMISOS));
});

describe('loginAction', () => {
  it('envia usuario y contrasena a la action al hacer submit', async () => {
    await submit({ username: 'ana.perez', password: ' clave con espacios ' });

    expect(verifyCredentialsMock).toHaveBeenCalledTimes(1);
    expect(verifyCredentialsMock).toHaveBeenCalledWith({
      username: 'ana.perez',
      password: ' clave con espacios ',
    });
  });

  it('devuelve error de campo obligatorio y no verifica credenciales si un campo esta vacio', async () => {
    const sinUsuario = await submit({ username: '   ', password: 'clave' });
    const sinContrasena = await submit({ username: 'ana.perez', password: '' });
    const ambosVacios = await submit({ username: '', password: '' });

    expect(sinUsuario.status).toBe('invalid');
    expect(sinContrasena.status).toBe('invalid');
    expect(ambosVacios.status).toBe('invalid');

    if (
      sinUsuario.status !== 'invalid' ||
      sinContrasena.status !== 'invalid' ||
      ambosVacios.status !== 'invalid'
    ) {
      throw new Error('estado inesperado');
    }

    expect(sinUsuario.fieldErrors.username).toBeTruthy();
    expect(sinUsuario.fieldErrors.password).toBeUndefined();

    expect(sinContrasena.fieldErrors.password).toBeTruthy();
    expect(sinContrasena.fieldErrors.username).toBeUndefined();

    expect(ambosVacios.fieldErrors.username).toBeTruthy();
    expect(ambosVacios.fieldErrors.password).toBeTruthy();

    expect(verifyCredentialsMock).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it('usa el mismo mensaje para usuario inexistente y para contrasena incorrecta', async () => {
    verifyCredentialsMock.mockResolvedValue({ ok: false });

    const usuarioInexistente = await submit({ username: 'no.existe', password: 'clave' });
    const contrasenaIncorrecta = await submit({ username: 'ana.perez', password: 'incorrecta' });

    if (usuarioInexistente.status !== 'error' || contrasenaIncorrecta.status !== 'error') {
      throw new Error('estado inesperado');
    }

    expect(usuarioInexistente.message).toBe(GENERIC_CREDENTIALS_ERROR);
    expect(contrasenaIncorrecta.message).toBe(usuarioInexistente.message);
  });

  it('conserva el usuario escrito tras un intento rechazado', async () => {
    verifyCredentialsMock.mockResolvedValue({ ok: false });

    const rechazado = await submit({ username: 'ana.perez', password: 'clave' });
    const invalido = await submit({ username: 'ana.perez', password: '' });

    if (rechazado.status !== 'error' || invalido.status !== 'invalid') {
      throw new Error('estado inesperado');
    }

    expect(rechazado.username).toBe('ana.perez');
    expect(invalido.username).toBe('ana.perez');
  });

  it('el estado devuelto nunca contiene la contrasena', async () => {
    const secreto = 'zxq-secreto-9137';
    verifyCredentialsMock.mockResolvedValue({ ok: false });

    const rechazado = await submit({ username: 'ana.perez', password: secreto });
    const invalido = await submit({ username: '', password: secreto });

    for (const estado of [rechazado, invalido]) {
      const serializado = JSON.stringify(estado);
      expect(serializado).not.toContain(secreto);
      expect(Object.keys(estado)).not.toContain('password');
      expect(serializado).not.toMatch(/"password"/);
    }
  });

  it('redirige al primer item del menu cuando las credenciales son aceptadas y no emite toast', async () => {
    verifyCredentialsMock.mockResolvedValue({ ok: true });

    const resultado = await submit({ username: 'ana.perez', password: 'clave' });

    expect(redirect).toHaveBeenCalledTimes(1);
    expect(redirect).toHaveBeenCalledWith(ASSIGNED_ORDERS_ROUTE);
    // Sin estado de error, no hay nada de lo que el cliente pueda derivar un toast (R17).
    expect(resultado).toBeUndefined();
  });

  it('no accede a base de datos ni emite cookie', () => {
    const modulos = [
      'lib/modules/identity/adapters/driving/login-action.ts',
      'lib/modules/identity/domain/verify-credentials.ts',
    ];
    const prohibidos = [
      /(^|\/)next\/headers$/,
      /^@prisma\/client$/,
      /^\.{0,2}\/?.*\bprisma\b/i,
      /^@supabase\//,
      /supabase/i,
    ];

    for (const modulo of modulos) {
      const fuente = readFileSync(resolve(process.cwd(), modulo), 'utf8');
      const especificadores = [...fuente.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);

      expect(especificadores.length).toBeGreaterThan(0);
      for (const especificador of especificadores) {
        for (const prohibido of prohibidos) {
          expect(especificador).not.toMatch(prohibido);
        }
      }

      expect(fuente).not.toMatch(/\bcookies\s*\(/);
      expect(fuente).not.toMatch(/\bSet-Cookie\b/i);
      expect(fuente).not.toMatch(/\bprisma\b/i);
    }
  });

  it('genera un attemptId distinto por invocacion', async () => {
    verifyCredentialsMock.mockResolvedValue({ ok: false });

    const primero = await submit({ username: 'ana.perez', password: 'clave' });
    const segundo = await submit({ username: 'ana.perez', password: 'clave' });
    const invalido = await submit({ username: '', password: '' });

    if (primero.status !== 'error' || segundo.status !== 'error' || invalido.status !== 'invalid') {
      throw new Error('estado inesperado');
    }

    expect(primero.attemptId).toEqual(expect.any(String));
    expect(primero.attemptId).not.toBe(segundo.attemptId);
    expect(invalido.attemptId).not.toBe(primero.attemptId);
    expect(LOGIN_INITIAL_STATE).not.toHaveProperty('attemptId');
  });
  // QC-9 T16 (R8, R9) — El destino de vuelta. El campo `next` lo trae el formulario en un input
  // oculto, o sea que es entrada externa: se revalida aqui aunque la pantalla de login ya lo
  // hubiera validado al pintarlo. Un POST fabricado no pasa por esa pantalla.
  it('aterriza en la pantalla que se habia pedido cuando el destino de vuelta es interno (R8)', async () => {
    verifyCredentialsMock.mockResolvedValue({ ok: true });

    await submit({ username: 'ana.perez', password: 'clave', next: '/dashboard/reportes?desde=ayer' });

    expect(redirect).toHaveBeenCalledTimes(1);
    expect(redirect).toHaveBeenCalledWith('/dashboard/reportes?desde=ayer');
  });

  it('descarta un destino de vuelta externo y aterriza en el primer item del menu (R9)', async () => {
    verifyCredentialsMock.mockResolvedValue({ ok: true });

    for (const destinoFabricado of [
      'https://evil.example',
      '//evil.example',
      String.raw`/\evil.example`,
      'javascript:alert(1)',
      '%2F%2Fevil.example',
    ]) {
      vi.mocked(redirect).mockClear();

      await submit({ username: 'ana.perez', password: 'clave', next: destinoFabricado });

      expect(redirect).toHaveBeenCalledWith(ASSIGNED_ORDERS_ROUTE);
    }
  });

  it('aterriza en el primer item del menu cuando el campo next viene vacio o no viene (R8)', async () => {
    verifyCredentialsMock.mockResolvedValue({ ok: true });

    await submit({ username: 'ana.perez', password: 'clave', next: '' });
    await submit({ username: 'ana.perez', password: 'clave' });

    expect(redirect).toHaveBeenCalledTimes(2);
    expect(redirect).toHaveBeenNthCalledWith(1, ASSIGNED_ORDERS_ROUTE);
    expect(redirect).toHaveBeenNthCalledWith(2, ASSIGNED_ORDERS_ROUTE);
  });

  // QC-75 T9 (R11, R12, R13) — el respaldo del login pasa a ser el primer enlace del menu YA
  // FILTRADO por los permisos de quien entra. El orden no cambia respecto de QC-9: un destino de
  // vuelta interno y valido sigue mandando; lo unico que cambia es el respaldo.
  describe('respaldo por permisos (QC-75)', () => {
    it('aterriza en inventario cuando solo puede consultar inventario y no hay destino de vuelta (R11)', async () => {
      verifyCredentialsMock.mockResolvedValue({ ok: true });
      // Los permisos del rol `Operador` del seed: exactamente `inventario.consultar` (QC-74 R9).
      getSessionUserMock.mockResolvedValue(usuarioCon(['inventario.consultar']));

      await submit({ username: 'ana.perez', password: 'clave' });

      expect(redirect).toHaveBeenCalledTimes(1);
      expect(redirect).toHaveBeenCalledWith(INVENTORY_ROUTE);
      // Y NO al dashboard, que es lo que devolvia el respaldo anterior.
      expect(redirect).not.toHaveBeenCalledWith(DASHBOARD_ROUTE);
    });

    it('entra en el grupo del menu cuando el unico permiso cuelga de uno de sus hijos (R11)', async () => {
      verifyCredentialsMock.mockResolvedValue({ ok: true });
      getSessionUserMock.mockResolvedValue(usuarioCon(['recetas.consultar']));

      await submit({ username: 'ana.perez', password: 'clave' });

      expect(redirect).toHaveBeenCalledWith(FORMULAS_ROUTE);
    });

    it('aterriza en el dashboard cuando el usuario no tiene ningun permiso (R12)', async () => {
      verifyCredentialsMock.mockResolvedValue({ ok: true });
      getSessionUserMock.mockResolvedValue(usuarioCon([]));

      await submit({ username: 'ana.perez', password: 'clave' });

      // OJO: **ese destino dara 404** dentro del layout privado (R12, R7). Quien no tiene ningun
      // permiso tampoco tiene `dashboard.consultar`, asi que `/dashboard` responde el mismo 404
      // que cualquier otra ruta privada, con su cabecera y su control de cerrar sesion. Es lo
      // buscado: R12 prohibe devolver al login, mostrar error de credenciales o pintar una
      // pantalla de «sin acceso», y nada de eso ocurre aqui.
      expect(redirect).toHaveBeenCalledTimes(1);
      expect(redirect).toHaveBeenCalledWith(DASHBOARD_ROUTE);
    });

    it('aterriza en el primer item del menu cuando tiene todos los permisos (R11)', async () => {
      verifyCredentialsMock.mockResolvedValue({ ok: true });
      getSessionUserMock.mockResolvedValue(usuarioCon(TODOS_LOS_PERMISOS));

      await submit({ username: 'ana.perez', password: 'clave' });

      const primerItem = PRIVATE_NAV_ITEMS[0];
      if (primerItem === undefined || primerItem.kind !== 'link') {
        throw new Error('el primer item del menu deberia ser un enlace');
      }

      expect(redirect).toHaveBeenCalledWith(primerItem.href);
      // El dashboard esta oculto del menu, asi que ni con `dashboard.consultar` se aterriza alli.
      expect(primerItem.href).not.toBe(DASHBOARD_ROUTE);
    });

    it('el destino de vuelta interno gana al respaldo por permisos (R13, no regresion de QC-9 R8)', async () => {
      verifyCredentialsMock.mockResolvedValue({ ok: true });
      getSessionUserMock.mockResolvedValue(usuarioCon(['inventario.consultar']));

      await submit({ username: 'ana.perez', password: 'clave', next: '/pedidos?estado=abierto' });

      expect(redirect).toHaveBeenCalledTimes(1);
      expect(redirect).toHaveBeenCalledWith('/pedidos?estado=abierto');
      expect(redirect).not.toHaveBeenCalledWith(INVENTORY_ROUTE);
    });

    // REGRESION del fallo que destapo el E2E de T14. El navegador SIEMPRE manda el campo oculto
    // `next`: cuando no hay `?next=` viaja presente pero VACIO. Si la pagina fabricaba
    // `/dashboard` ahi, ese valor era un destino interno valido, ganaba en `resolveReturnPath` y
    // el respaldo por permisos quedaba muerto en todo login normal — el Operador aterrizaba en
    // `/dashboard` y recibia un 404. Este caso es la red que impide que vuelva (R11, R12).
    it('el campo next presente pero vacio no pisa el respaldo por permisos (R11)', async () => {
      verifyCredentialsMock.mockResolvedValue({ ok: true });
      getSessionUserMock.mockResolvedValue(usuarioCon(['inventario.consultar']));

      await submit({ username: 'ana.perez', password: 'clave', next: '' });

      expect(redirect).toHaveBeenCalledTimes(1);
      expect(redirect).toHaveBeenCalledWith(INVENTORY_ROUTE);
      expect(redirect).not.toHaveBeenCalledWith(DASHBOARD_ROUTE);
    });

    it('descarta un destino de vuelta externo y manda el respaldo calculado (R13)', async () => {
      verifyCredentialsMock.mockResolvedValue({ ok: true });
      getSessionUserMock.mockResolvedValue(usuarioCon(['inventario.consultar']));

      await submit({ username: 'ana.perez', password: 'clave', next: 'https://evil.example' });

      expect(redirect).toHaveBeenCalledTimes(1);
      expect(redirect).toHaveBeenCalledWith(INVENTORY_ROUTE);
    });

    it('cae al dashboard si la sesion no se puede leer tras un login correcto (caso defensivo)', async () => {
      verifyCredentialsMock.mockResolvedValue({ ok: true });
      getSessionUserMock.mockResolvedValue(null);

      await submit({ username: 'ana.perez', password: 'clave' });

      expect(redirect).toHaveBeenCalledTimes(1);
      expect(redirect).toHaveBeenCalledWith(DASHBOARD_ROUTE);
    });

    it('no lee la sesion cuando las credenciales son rechazadas', async () => {
      verifyCredentialsMock.mockResolvedValue({ ok: false });

      await submit({ username: 'ana.perez', password: 'clave' });

      expect(getSessionUserMock).not.toHaveBeenCalled();
      expect(redirect).not.toHaveBeenCalled();
    });
  });
});

// El aterrizaje de quien solo tiene los permisos del Maestro. Mientras ningun enlace del
// menu exija `empresas.*`, el menu filtrado queda vacio y el destino es el respaldo de siempre:
// `/dashboard`, que le responde el 404 dentro de la zona privada.
describe('aterrizaje del Maestro (QC-161)', () => {
  const PERMISOS_DEL_MAESTRO = ['empresas.consultar', 'empresas.modificar'] as const;

  it('QC-161 R33: con solo empresas.* y sin destino de vuelta aterriza en el respaldo calculado con el menu', async () => {
    verifyCredentialsMock.mockResolvedValue({ ok: true });
    getSessionUserMock.mockResolvedValue({
      ...usuarioCon(PERMISOS_DEL_MAESTRO),
      roleName: 'Maestro',
    });

    await submit({ username: 'plataforma.inicial', password: 'clave', next: '' });

    // El destino se calcula con las MISMAS funciones del menu que usa la action, no con un
    // literal: el dia que un enlace del menu exija `empresas.consultar`, esto lo seguira.
    const esperado =
      firstVisibleNavHref(filterNavItemsByPermissions(PRIVATE_NAV_ITEMS, PERMISOS_DEL_MAESTRO)) ??
      DASHBOARD_ROUTE;

    expect(redirect).toHaveBeenCalledTimes(1);
    expect(redirect).toHaveBeenCalledWith(esperado);
    // Y hoy ese destino es el respaldo de siempre: ningun enlace del menu pide `empresas.*`.
    expect(filterNavItemsByPermissions(PRIVATE_NAV_ITEMS, PERMISOS_DEL_MAESTRO)).toEqual([]);
    expect(esperado).toBe(DASHBOARD_ROUTE);
  });

  it('QC-161 R33: un destino de vuelta interno valido sigue mandando tambien para el Maestro', async () => {
    verifyCredentialsMock.mockResolvedValue({ ok: true });
    getSessionUserMock.mockResolvedValue(usuarioCon(PERMISOS_DEL_MAESTRO));

    await submit({ username: 'plataforma.inicial', password: 'clave', next: '/inventario' });

    expect(redirect).toHaveBeenCalledTimes(1);
    expect(redirect).toHaveBeenCalledWith('/inventario');
  });
});
