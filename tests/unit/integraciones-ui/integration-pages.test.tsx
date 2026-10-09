import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { INTEGRATION_EMPTY_MESSAGE } from '@/app/(private)/integraciones/components/integration-placeholder';
import InventoryIntegrationPage from '@/app/(private)/integraciones/inventarios/page';
import AiProviderIntegrationPage from '@/app/(private)/integraciones/proveedor-ia/page';
import WhatsappIntegrationPage from '@/app/(private)/integraciones/whatsapp/page';
import type { SessionUser } from '@/lib/modules/identity';
import { PRIVATE_NAV_ITEMS, type NavLink } from '@/lib/shared/navigation/private-nav';
import {
  AI_PROVIDER_INTEGRATION_ROUTE,
  INVENTORY_INTEGRATION_ROUTE,
  LOGIN_ROUTE_SESSION_ENDED,
  WHATSAPP_INTEGRATION_ROUTE,
} from '@/lib/shared/routes';

const { getSessionUserMock, notFoundMock, redirectMock } = vi.hoisted(() => ({
  getSessionUserMock: vi.fn<() => Promise<unknown>>(),
  notFoundMock: vi.fn<() => never>(),
  redirectMock: vi.fn<(ruta: string) => never>(),
}));

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  notFound: notFoundMock,
  redirect: redirectMock,
}));

vi.mock('@/lib/composition', () => ({
  identity: { getSessionUser: getSessionUserMock, endSession: vi.fn<() => Promise<void>>() },
  observabilidad: { readRequestIdHeader: vi.fn(async (): Promise<string | null> => null) },
}));

const RAIZ = join(__dirname, '..', '..', '..');

const PERMISO = 'integraciones.modificar';

const PAGINAS = [
  { ruta: AI_PROVIDER_INTEGRATION_ROUTE, Pagina: AiProviderIntegrationPage },
  { ruta: INVENTORY_INTEGRATION_ROUTE, Pagina: InventoryIntegrationPage },
  { ruta: WHATSAPP_INTEGRATION_ROUTE, Pagina: WhatsappIntegrationPage },
] as const;

const IMPORTS_PERMITIDOS = [
  'next',
  '@/lib/modules/identity/adapters/driving/require-page-permission',
  '@/lib/shared/navigation/private-nav',
  '../components',
];

const NAV_APLANADO: readonly NavLink[] = PRIVATE_NAV_ITEMS.flatMap((item) =>
  item.kind === 'group' ? item.items : [item],
);

function etiquetaDelMenu(ruta: string): string {
  const enlaces = NAV_APLANADO.filter((enlace) => enlace.href === ruta);
  if (enlaces.length !== 1) throw new Error(`se esperaba un enlace del menu hacia ${ruta}`);
  return (enlaces[0] as NavLink).label;
}

function fuenteDe(ruta: string): string {
  return readFileSync(
    join(RAIZ, 'app', '(private)', ...ruta.split('/').filter(Boolean), 'page.tsx'),
    'utf8',
  );
}

function sinComentarios(fuente: string): string {
  return fuente.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/.*$/gm, '');
}

function sesionCon(permissions: readonly string[]): SessionUser {
  return {
    id: 'u-test-integraciones',
    username: 'carla.duarte',
    displayName: 'Carla Duarte Salas',
    roleName: 'Administrador',
    permissions,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  notFoundMock.mockImplementation(() => {
    throw new Error('NEXT_NOT_FOUND');
  });
  redirectMock.mockImplementation(() => {
    throw new Error('NEXT_REDIRECT');
  });
});

afterEach(() => {
  cleanup();
});

describe('la pagina cascaron de cada integracion', () => {
  it('R9: INTEGRATION_EMPTY_MESSAGE es el texto acordado', () => {
    expect(INTEGRATION_EMPTY_MESSAGE).toBe('Próximamente podrás configurar esta integración.');
  });

  it.each(PAGINAS)(
    'R9: $ruta con el permiso muestra la etiqueta del menu como titulo y el estado vacio',
    async ({ ruta, Pagina }) => {
      getSessionUserMock.mockResolvedValue(sesionCon([PERMISO]));

      render(await Pagina());

      expect(screen.getByTestId('integration-title').textContent).toBe(etiquetaDelMenu(ruta));
      expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(etiquetaDelMenu(ruta));
      expect(screen.getByTestId('integration-empty').textContent).toBe(INTEGRATION_EMPTY_MESSAGE);
      expect(notFoundMock).not.toHaveBeenCalled();
      expect(redirectMock).not.toHaveBeenCalled();
    },
  );

  it.each(PAGINAS)(
    'R10: $ruta no pinta formulario, campo, selector ni boton',
    async ({ Pagina }) => {
      getSessionUserMock.mockResolvedValue(sesionCon([PERMISO]));

      const { container } = render(await Pagina());

      expect(container.querySelectorAll('form, input, select, textarea, button, a')).toHaveLength(0);
      expect(screen.queryAllByRole('button')).toHaveLength(0);
      expect(screen.queryAllByRole('textbox')).toHaveLength(0);
    },
  );

  it.each(PAGINAS)(
    'R10: $ruta no declara params ni searchParams y solo importa lo de la pagina cascaron',
    ({ ruta }) => {
      const fuente = sinComentarios(fuenteDe(ruta));
      const imports = [...fuente.matchAll(/^import\s[\s\S]*?\sfrom\s'([^']+)';/gm)].map(
        (coincidencia) => coincidencia[1],
      );

      expect(fuente).not.toMatch(/\bparams\b/);
      expect(fuente).not.toMatch(/\bsearchParams\b/);
      expect(fuente).toMatch(/export default async function \w+\(\)/);
      expect(imports).toEqual(IMPORTS_PERMITIDOS);
      expect(fuente).toMatch(/^import type \{ Metadata \} from 'next';/m);
    },
  );

  it.each(PAGINAS)(
    'R11: $ruta exige integraciones.modificar una sola vez y como primera sentencia',
    ({ ruta }) => {
      const original = fuenteDe(ruta);
      const fuente = sinComentarios(original);
      const cortes = [...fuente.matchAll(/requirePagePermission\(([^)]*)\)/g)].map(
        (coincidencia) => coincidencia[1],
      );
      const primeraSentencia = /export default async function \w+\(\)\s*\{\s*([^;]+);/.exec(
        fuente,
      )?.[1];

      expect(original).toBe(fuente);
      expect(cortes).toEqual([`'${PERMISO}'`]);
      expect(primeraSentencia).toBe(`await requirePagePermission('${PERMISO}')`);
    },
  );

  it.each(PAGINAS)(
    'R12: $ruta con sesion sin el permiso responde notFound y no pinta nada',
    async ({ Pagina }) => {
      getSessionUserMock.mockResolvedValue(sesionCon(['unidades.consultar']));

      await expect(Pagina()).rejects.toThrow('NEXT_NOT_FOUND');

      expect(notFoundMock).toHaveBeenCalledTimes(1);
      expect(redirectMock).not.toHaveBeenCalled();
      expect(screen.queryByTestId('integration-title')).toBeNull();
      expect(screen.queryByTestId('integration-empty')).toBeNull();
    },
  );

  it.each(PAGINAS)(
    'R13: $ruta sin sesion redirige al login con la marca de sesion terminada',
    async ({ Pagina }) => {
      getSessionUserMock.mockResolvedValue(null);

      await expect(Pagina()).rejects.toThrow('NEXT_REDIRECT');

      expect(redirectMock).toHaveBeenCalledWith(LOGIN_ROUTE_SESSION_ENDED);
      expect(notFoundMock).not.toHaveBeenCalled();
    },
  );
});
