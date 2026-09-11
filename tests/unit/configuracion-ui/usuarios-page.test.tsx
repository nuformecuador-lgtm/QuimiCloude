// QC-67 T3 — El corte por permiso de la pantalla de usuarios y la decision `canModify`: R1, R4,
// R6 (mitad servidor), R8, R41.
//
// **La ubicacion se DERIVA de la constante** (R1): la ruta esperada se compone como
// `app/(private)${USERS_ROUTE}/page.tsx`. Nunca se escribe el literal de la URL.
//
// **Se mockea el PROVEEDOR DE SESION, no `requirePagePermission`.** Es la diferencia entre probar
// el corte y probar que se escribio una linea: con el doble en `@/lib/composition`, el corte se
// ejecuta de verdad —`assertPermission` incluido— y lo unico sustituido es de donde sale la sesion.
//
// **Nada se afirma por copy** (R41): la cabecera se busca por su ROL ARIA —`heading` de nivel 1—
// y los permisos se derivan del catalogo de `identity`. No se consulta por `data-testid` con un
// literal a mano: la convencion de esta carpeta exige que el identificador salga de una constante
// exportada, y la del titulo nace con la seccion de lista en T7.

import { cleanup, render, screen } from '@testing-library/react';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import UsuariosPage from '@/app/(private)/configuracion/usuarios/page';
import { PERMISSIONS } from '@/lib/modules/identity';
import { LOGIN_ROUTE_SESSION_ENDED, USERS_ROUTE } from '@/lib/shared/routes';

const { getSessionUserMock, notFoundMock, redirectMock } = vi.hoisted(() => ({
  getSessionUserMock: vi.fn<() => Promise<unknown>>(),
  // `notFound()` y `redirect()` estan tipadas `(): never` y LANZAN. Los dobles hacen lo mismo: si
  // no lanzaran, el corte seguiria ejecutandose y el test mediria otra cosa.
  notFoundMock: vi.fn<() => never>(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
  redirectMock: vi.fn<(ruta: string) => never>(() => {
    throw new Error('NEXT_REDIRECT');
  }),
}));

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  notFound: notFoundMock,
  redirect: redirectMock,
}));

vi.mock('@/lib/composition', () => ({
  identity: { getSessionUser: getSessionUserMock, endSession: vi.fn<() => Promise<void>>() },
}));

const RAIZ = join(__dirname, '..', '..', '..');
const RUTA_PAGINA = join(RAIZ, 'app', '(private)', ...USERS_ROUTE.split('/').filter(Boolean));

/** Fuente de la pagina sin comentarios: el JSDoc explica el corte y NOMBRA lo que prohibe. */
function fuenteDeLaPagina(): string {
  return readFileSync(join(RUTA_PAGINA, 'page.tsx'), 'utf8')
    .replace(/\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, ' ');
}

/** Los dos codigos del modulo `usuarios`, DERIVADOS del catalogo (R41): nunca escritos a mano. */
const CODIGOS_DE_USUARIOS: readonly string[] = PERMISSIONS.filter(
  (entrada) => entrada.module === 'usuarios',
).map((entrada) => entrada.code);

const PERMISO_DE_CONSULTA = 'usuarios.consultar';
const PERMISO_DE_ESCRITURA = 'usuarios.modificar';

function sesionCon(permissions: readonly string[]) {
  return {
    id: '99999999-9999-4999-8999-999999999999',
    username: 'admin.prueba',
    displayName: 'Admin De Prueba',
    roleName: 'Administrador',
    permissions,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getSessionUserMock.mockResolvedValue(sesionCon(CODIGOS_DE_USUARIOS));
});

afterEach(() => {
  cleanup();
});

describe('ancla: el catalogo declara los dos codigos que este archivo usa', () => {
  it('usuarios.consultar y usuarios.modificar existen y son exactamente esos', () => {
    // Anti-vacuidad: si alguien renombrara un codigo, los casos de abajo estarian probando una
    // sesion con permisos inventados en vez del corte real.
    expect([...CODIGOS_DE_USUARIOS].sort()).toEqual([PERMISO_DE_CONSULTA, PERMISO_DE_ESCRITURA]);
  });
});

describe('la pantalla vive en la ruta DERIVADA de la constante (R1)', () => {
  it('existe `app/(private)${USERS_ROUTE}/page.tsx`, compuesto a partir de la constante', () => {
    expect(existsSync(join(RUTA_PAGINA, 'page.tsx'))).toBe(true);
  });
});

describe('la pantalla NO declara armazon propio: lo hereda del layout privado (R1, R39)', () => {
  it('no monta ningun landmark principal, ni barra lateral, ni cabecera de aplicacion', async () => {
    render(await UsuariosPage());

    expect(screen.queryByRole('main')).toBeNull();
    expect(screen.queryByRole('navigation')).toBeNull();
    expect(screen.queryByRole('banner')).toBeNull();
  });

  it('su fuente no monta la region de avisos ni el armazon: en la zona privada hay UNA sola', () => {
    const fuente = fuenteDeLaPagina();

    for (const prohibido of ['Toaster', 'SidebarProvider', 'AppSidebar', 'SidebarInset']) {
      expect(fuente, `page.tsx no debe montar ${prohibido}`).not.toContain(prohibido);
    }
  });
});

describe('el corte por permiso ocurre antes de leer o pintar nada (R4)', () => {
  it('sin sesion redirige al login, y NO responde 404: un anonimo no recibe 404', async () => {
    getSessionUserMock.mockResolvedValue(null);

    await expect(UsuariosPage()).rejects.toThrow();

    expect(redirectMock).toHaveBeenCalledWith(LOGIN_ROUTE_SESSION_ENDED);
    expect(notFoundMock).not.toHaveBeenCalled();
  });

  it('con sesion pero sin `usuarios.consultar` responde 404, no redirige', async () => {
    // Lleva el OTRO permiso del modulo a proposito: QC-74 decidio que `modificar` NO concede
    // `consultar`, y este caso es lo que lo demuestra en la pantalla.
    getSessionUserMock.mockResolvedValue(sesionCon([PERMISO_DE_ESCRITURA]));

    await expect(UsuariosPage()).rejects.toThrow();

    expect(notFoundMock).toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it('con una sesion sin ningun permiso responde 404 igual: falla cerrado', async () => {
    getSessionUserMock.mockResolvedValue(sesionCon([]));

    await expect(UsuariosPage()).rejects.toThrow();

    expect(notFoundMock).toHaveBeenCalled();
  });

  it('con `usuarios.consultar` la pantalla se sirve y pinta su cabecera', async () => {
    getSessionUserMock.mockResolvedValue(sesionCon([PERMISO_DE_CONSULTA]));

    render(await UsuariosPage());

    expect(notFoundMock).not.toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
  });

  it('el corte es UNO SOLO y es el de consultar: `modificar` no cierra la pantalla', async () => {
    // A diferencia de QC-39, cortar tambien por `usuarios.modificar` dejaria fuera a quien tiene
    // exactamente el permiso que la lista exige (`design.md > 3`).
    const llamadas = fuenteDeLaPagina().match(/requirePagePermission\(/g) ?? [];

    expect(llamadas).toHaveLength(1);
    expect(fuenteDeLaPagina()).toContain(`requirePagePermission('${PERMISO_DE_CONSULTA}')`);
  });

  it('la exigencia del permiso precede a cualquier lectura de la URL', async () => {
    // Hoy la pantalla aun no resuelve `searchParams` —eso llega con el parser de T4—, asi que el
    // caso se escribe condicionado: en cuanto exista esa lectura, el orden queda vigilado sin
    // tocar este archivo.
    const fuente = fuenteDeLaPagina();
    const lectura = fuente.indexOf('await searchParams');

    if (lectura >= 0) {
      const corte = fuente.indexOf(`requirePagePermission('${PERMISO_DE_CONSULTA}')`);
      expect(corte).toBeGreaterThanOrEqual(0);
      expect(corte, 'el permiso se exige DESPUES de leer la URL').toBeLessThan(lectura);
    }

    // Y es la PRIMERA sentencia del cuerpo: nada se resuelve antes que el corte.
    const cuerpo = fuente.slice(fuente.indexOf('export default async function'));
    expect(cuerpo.indexOf('requirePagePermission(')).toBeLessThan(cuerpo.indexOf('canModify'));
  });
});

describe('`canModify` sale de assertPermission y de nada mas (R6, R8)', () => {
  it('con `usuarios.modificar` la decision es afirmativa', async () => {
    getSessionUserMock.mockResolvedValue(sesionCon(CODIGOS_DE_USUARIOS));

    const { container } = render(await UsuariosPage());

    expect(container.querySelector('[data-can-modify="true"]')).not.toBeNull();
  });

  it('sin `usuarios.modificar` la decision es negativa, pero la pantalla se sirve', async () => {
    getSessionUserMock.mockResolvedValue(sesionCon([PERMISO_DE_CONSULTA]));

    const { container } = render(await UsuariosPage());

    expect(container.querySelector('[data-can-modify="false"]')).not.toBeNull();
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(notFoundMock).not.toHaveBeenCalled();
  });

  it('la fuente NO compara el conjunto de permisos a mano', () => {
    // QC-74 R12 dejo `assertPermission` como la UNICA implementacion de «el actor tiene este
    // permiso». Una comparacion escrita aqui seria una segunda definicion de autorizacion, libre
    // de divergir de la primera en silencio.
    const fuente = fuenteDeLaPagina();

    expect(fuente.trim().length).toBeGreaterThan(0);
    expect(fuente).toContain('assertPermission');
    for (const prohibido of ['.includes(', '.some(', '.indexOf(', '.find(', '.filter(']) {
      expect(fuente, `page.tsx no debe comparar permisos con ${prohibido}`).not.toContain(
        prohibido,
      );
    }
  });

  it('la pantalla no se construye sus propios datos: nada de DB ni de fetch a rutas propias', () => {
    // El unico consumo de servidor que R8 permite aqui es la sesion, y viaja a los componentes de
    // cliente por props. El resto —lista y roles— llega por Server Actions en T7.
    const fuente = fuenteDeLaPagina();

    for (const prohibido of ['prisma', '@/db', "fetch('/api", 'next/headers']) {
      expect(fuente, `page.tsx no debe usar ${prohibido}`).not.toContain(prohibido);
    }
  });
});
