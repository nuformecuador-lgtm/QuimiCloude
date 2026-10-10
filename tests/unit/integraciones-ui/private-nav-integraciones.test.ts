// El grupo «Integraciones» del menu privado.
//
// Se afirma sobre las constantes de ruta y de etiqueta, nunca sobre el literal del copy. El
// permiso de cada hijo se compara con el que exige su pagina, LEIDO de la fuente de `page.tsx`.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { Puzzle } from 'lucide-react';
import { describe, expect, it } from 'vitest';

import { ROLE_ADMINISTRADOR, ROLE_MAESTRO, SEED_ROLE_PERMISSIONS } from '@/lib/modules/identity';
import { NAV_ICONS } from '@/lib/shared/navigation/nav-icons';
import {
  AI_PROVIDER_INTEGRATION_LABEL,
  INTEGRATIONS_LABEL,
  INVENTORY_INTEGRATION_LABEL,
  NAV_SECTION_CHAIN,
  NAV_SECTION_CONFIGURATION,
  NAV_SECTION_OPERATION,
  PRIVATE_NAV_ITEMS,
  WHATSAPP_INTEGRATION_LABEL,
  filterNavItemsByPermissions,
  firstVisibleNavHref,
  groupNavItemsBySection,
  type NavGroup,
  type NavLink,
} from '@/lib/shared/navigation/private-nav';
import {
  AI_PROVIDER_INTEGRATION_ROUTE,
  INVENTORY_INTEGRATION_ROUTE,
  WHATSAPP_INTEGRATION_ROUTE,
} from '@/lib/shared/routes';

const RAIZ = join(__dirname, '..', '..', '..');

const PERMISO = 'integraciones.modificar';

const HIJOS_ESPERADOS = [
  {
    href: AI_PROVIDER_INTEGRATION_ROUTE,
    label: AI_PROVIDER_INTEGRATION_LABEL,
    testId: 'nav-integraciones-proveedor-ia',
  },
  {
    href: INVENTORY_INTEGRATION_ROUTE,
    label: INVENTORY_INTEGRATION_LABEL,
    testId: 'nav-integraciones-inventarios',
  },
  {
    href: WHATSAPP_INTEGRATION_ROUTE,
    label: WHATSAPP_INTEGRATION_LABEL,
    testId: 'nav-integraciones-whatsapp',
  },
] as const;

const GRUPOS_DE_INTEGRACIONES = PRIVATE_NAV_ITEMS.filter(
  (item): item is NavGroup => item.kind === 'group' && item.label === INTEGRATIONS_LABEL,
);

const GRUPO = GRUPOS_DE_INTEGRACIONES[0];

const NAV_APLANADO: readonly NavLink[] = PRIVATE_NAV_ITEMS.flatMap((item) =>
  item.kind === 'group' ? item.items : [item],
);

function bajoIntegraciones(href: string): boolean {
  return href === '/integraciones' || href.startsWith('/integraciones/');
}

function paginaDe(href: string): string {
  return join(RAIZ, 'app', '(private)', ...href.split('/').filter(Boolean), 'page.tsx');
}

function permisosDeLaPagina(href: string): readonly string[] {
  return [
    ...readFileSync(paginaDe(href), 'utf8')
      .replace(/\/\/.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .matchAll(/requirePagePermission\('([^']+)'\)/g),
  ].map((coincidencia) => coincidencia[1] as string);
}

const ROLES_DE_SEMILLA = Object.keys(SEED_ROLE_PERMISSIONS);

const ROLES_SIN_EL_PERMISO = ROLES_DE_SEMILLA.filter(
  (rol) => !(SEED_ROLE_PERMISSIONS[rol] ?? []).includes(PERMISO),
);

const MENU_SIN_EL_GRUPO = PRIVATE_NAV_ITEMS.filter((item) => item !== GRUPO);

const ITEMS_PREVIOS = [
  { testId: 'nav-asignacion', section: NAV_SECTION_OPERATION },
  { testId: 'nav-dashboard', section: NAV_SECTION_OPERATION },
  { testId: 'nav-inventario', section: NAV_SECTION_OPERATION },
  { testId: 'nav-pedidos', section: NAV_SECTION_OPERATION },
  { testId: 'nav-produccion', section: NAV_SECTION_CHAIN },
  { testId: 'nav-proveedores', section: NAV_SECTION_CHAIN },
  { testId: 'nav-presentaciones', section: NAV_SECTION_CONFIGURATION },
  { testId: 'nav-unidades', section: NAV_SECTION_CONFIGURATION },
  { testId: 'nav-usuarios', section: NAV_SECTION_OPERATION },
  { testId: 'nav-clientes', section: NAV_SECTION_CHAIN },
] as const;

describe('el grupo Integraciones y sus tres hijos', () => {
  it('R1: hay exactamente un NavGroup con la etiqueta INTEGRATIONS_LABEL', () => {
    expect(GRUPOS_DE_INTEGRACIONES).toHaveLength(1);
    expect(GRUPO?.testId).toBe('nav-integraciones');
  });

  it('R1: sus hijos son exactamente tres NavLink, con destino, etiqueta y testId, en orden', () => {
    expect(GRUPO?.items).toHaveLength(3);
    expect(GRUPO?.items.map((hijo) => hijo.kind)).toEqual(['link', 'link', 'link']);
    expect(
      GRUPO?.items.map(({ href, label, testId }) => ({ href, label, testId })),
    ).toEqual(HIJOS_ESPERADOS);
  });

  it('R1: ningun otro item del menu apunta a /integraciones ni debajo', () => {
    const fuera = NAV_APLANADO.filter(
      (enlace) => bajoIntegraciones(enlace.href) && !GRUPO?.items.includes(enlace),
    );

    expect(fuera).toEqual([]);
    expect(NAV_APLANADO.filter((enlace) => bajoIntegraciones(enlace.href))).toHaveLength(3);
  });
});

describe('el permiso de cada hijo es el que exige su pagina', () => {
  it.each(HIJOS_ESPERADOS)(
    'R2: $testId declara integraciones.modificar y su page.tsx exige ese mismo y solo ese',
    ({ href }) => {
      const hijo = GRUPO?.items.find((enlace) => enlace.href === href);
      const permisos = permisosDeLaPagina(href);

      expect(permisos).toHaveLength(1);
      expect(hijo?.permission).toBe(permisos[0]);
      expect(hijo?.permission).toBe(PERMISO);
    },
  );
});

describe('la seccion y el icono del grupo', () => {
  it('R3: el grupo pertenece a la seccion Configuración', () => {
    expect(GRUPO?.section).toBe(NAV_SECTION_CONFIGURATION);

    const configuracion = groupNavItemsBySection(PRIVATE_NAV_ITEMS).find(
      (seccion) => seccion.label === NAV_SECTION_CONFIGURATION,
    );
    expect(configuracion?.items).toContain(GRUPO);
  });

  it('R3: el icono tiene fila en NAV_ICONS y se resuelve a Puzzle de lucide-react', () => {
    const icono = GRUPO?.icon;

    expect(icono).toBe('puzzle');
    if (!icono) throw new Error('el grupo Integraciones no declara icono');
    expect(NAV_ICONS[icono]).toBe(Puzzle);
  });
});

describe('el filtrado por permiso', () => {
  it('ancla: el Administrador tiene el permiso y hay al menos un rol de semilla sin el, Maestro incluido', () => {
    expect(SEED_ROLE_PERMISSIONS[ROLE_ADMINISTRADOR]).toContain(PERMISO);
    expect(ROLES_SIN_EL_PERMISO.length).toBeGreaterThanOrEqual(1);
    expect(ROLES_SIN_EL_PERMISO).toContain(ROLE_MAESTRO);
  });

  it('R4: con los permisos del Administrador aparece el grupo con sus tres hijos en orden', () => {
    const visible = filterNavItemsByPermissions(
      PRIVATE_NAV_ITEMS,
      SEED_ROLE_PERMISSIONS[ROLE_ADMINISTRADOR] ?? [],
    );
    const grupo = visible.find(
      (item): item is NavGroup => item.kind === 'group' && item.testId === 'nav-integraciones',
    );

    expect(grupo?.label).toBe(INTEGRATIONS_LABEL);
    expect(grupo?.items.map(({ href, label, testId }) => ({ href, label, testId }))).toEqual(
      HIJOS_ESPERADOS,
    );
  });

  it.each(ROLES_SIN_EL_PERMISO)(
    'R5: con los permisos de %s no sale nada del grupo en lo que se serializa',
    (rol) => {
      const visible = filterNavItemsByPermissions(PRIVATE_NAV_ITEMS, SEED_ROLE_PERMISSIONS[rol] ?? []);
      const serializado = JSON.stringify(visible);

      expect(visible.map((item) => item.testId)).not.toContain('nav-integraciones');
      expect(serializado).not.toContain(INTEGRATIONS_LABEL);
      expect(serializado).not.toContain('nav-integraciones');
      for (const hijo of HIJOS_ESPERADOS) {
        expect(serializado).not.toContain(hijo.href);
        expect(serializado).not.toContain(hijo.label);
        expect(serializado).not.toContain(hijo.testId);
      }
    },
  );
});

describe('el grupo no cambia nada de lo que ya existia', () => {
  it.each(ROLES_DE_SEMILLA)('R6: el aterrizaje de %s es el mismo con y sin el grupo', (rol) => {
    const permisos = SEED_ROLE_PERMISSIONS[rol] ?? [];

    expect(firstVisibleNavHref(filterNavItemsByPermissions(PRIVATE_NAV_ITEMS, permisos))).toBe(
      firstVisibleNavHref(filterNavItemsByPermissions(MENU_SIN_EL_GRUPO, permisos)),
    );
  });

  it('R6: sin el grupo, el menu es elemento a elemento los diez items previos', () => {
    expect(MENU_SIN_EL_GRUPO.map(({ testId, section }) => ({ testId, section }))).toEqual(
      ITEMS_PREVIOS,
    );
  });

  it('R6: el grupo es el ultimo item del array', () => {
    expect(PRIVATE_NAV_ITEMS[PRIVATE_NAV_ITEMS.length - 1]).toBe(GRUPO);
  });
});
