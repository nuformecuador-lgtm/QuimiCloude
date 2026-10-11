// El item de navegacion de clientes.
//
// Se ITERA `PRIVATE_NAV_ITEMS` y se afirma sobre `CUSTOMERS_ROUTE`, `CUSTOMERS_LABEL` y el
// `testId`, nunca sobre el literal del copy. Mismo patron que `private-nav-usuarios.test.ts` y
// `private-nav-pedidos.test.ts`.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ROLE_ADMINISTRADOR, ROLE_EMPACADOR, ROLE_OPERADOR, SEED_ROLE_PERMISSIONS } from '@/lib/modules/identity';
import { NAV_ICONS } from '@/lib/shared/navigation/nav-icons';
import {
  CUSTOMERS_LABEL,
  NAV_SECTION_CHAIN,
  PRIVATE_NAV_ITEMS,
  filterNavItemsByPermissions,
  firstVisibleNavHref,
  groupNavItemsBySection,
  type NavItem,
  type NavLink,
} from '@/lib/shared/navigation/private-nav';
import { CUSTOMERS_ROUTE, SUPPLIERS_ROUTE } from '@/lib/shared/routes';

const RAIZ = join(__dirname, '..', '..', '..');

/** La pantalla, DERIVADA de la constante de ruta. */
const PAGE_PATH = join(
  RAIZ,
  'app',
  '(private)',
  ...CUSTOMERS_ROUTE.split('/').filter(Boolean),
  'page.tsx',
);

/** Todos los items de navegacion, aplanando los grupos en sus hijos. */
const NAV_APLANADO: readonly NavLink[] = PRIVATE_NAV_ITEMS.flatMap((item) =>
  item.kind === 'group' ? item.items : [item],
);

/** Los codigos que exige la pantalla, LEIDOS DE SU FUENTE. No se repiten como literal a
 *  proposito: si cambiara el corte de `page.tsx`, este test se mueve con el. */
function permisosDeLaPantalla(): readonly string[] {
  return [
    ...readFileSync(PAGE_PATH, 'utf8')
      .replace(/\/\/.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .matchAll(/requirePagePermission\('([^']+)'\)/g),
  ].map((coincidencia) => coincidencia[1] as string);
}

/** El item de clientes, buscado por su `href` -la constante-, nunca por el texto visible. */
const ITEMS_DE_CLIENTES = PRIVATE_NAV_ITEMS.filter(
  (item): item is NavLink => item.kind === 'link' && item.href === CUSTOMERS_ROUTE,
);

/** Las secciones de un menu ya filtrado, por su etiqueta. */
function seccionesDe(items: readonly NavItem[]): readonly (string | null)[] {
  return groupNavItemsBySection(items).map((seccion) => seccion.label);
}

const PERMISOS_ADMINISTRADOR: readonly string[] = SEED_ROLE_PERMISSIONS[ROLE_ADMINISTRADOR] ?? [];
const PERMISOS_OPERADOR: readonly string[] = SEED_ROLE_PERMISSIONS[ROLE_OPERADOR] ?? [];
const PERMISOS_EMPACADOR: readonly string[] = SEED_ROLE_PERMISSIONS[ROLE_EMPACADOR] ?? [];

describe('la navegacion privada lleva a clientes (R4)', () => {
  it('hay un item de NIVEL SUPERIOR cuyo destino es CUSTOMERS_ROUTE', () => {
    expect(ITEMS_DE_CLIENTES).toHaveLength(1);
    expect(ITEMS_DE_CLIENTES[0]?.label).toBe(CUSTOMERS_LABEL);
    expect(ITEMS_DE_CLIENTES[0]?.testId).toBe('nav-clientes');
    expect(ITEMS_DE_CLIENTES[0]?.permission).toBe('clientes.consultar');
    // ENMIENDA QC-257: el icono de Clientes pasa de 'contact' a 'square-user' (decision humana
    // D11/P3; autorizada por el leader el 2026-10-10).
    expect(ITEMS_DE_CLIENTES[0]?.icon).toBe('square-user');
    expect(ITEMS_DE_CLIENTES[0]?.section).toBe(NAV_SECTION_CHAIN);
  });

  it('el item es el ULTIMO de la seccion «Cadena», tras proveedores', () => {
    const cadena = groupNavItemsBySection(PRIVATE_NAV_ITEMS).find(
      (seccion) => seccion.label === NAV_SECTION_CHAIN,
    )?.items ?? [];

    const ultimo = cadena[cadena.length - 1];
    expect(ultimo?.kind === 'link' ? ultimo.href : undefined).toBe(CUSTOMERS_ROUTE);

    const proveedores = NAV_APLANADO.find((item) => item.href === SUPPLIERS_ROUTE);
    expect(proveedores?.section).toBe(NAV_SECTION_CHAIN);
  });

  it('el item es el PENULTIMO de todo el array, y el ultimo es el grupo nav-integraciones', () => {
    expect(PRIVATE_NAV_ITEMS[PRIVATE_NAV_ITEMS.length - 2]).toBe(ITEMS_DE_CLIENTES[0]);

    const ultimo = PRIVATE_NAV_ITEMS[PRIVATE_NAV_ITEMS.length - 1];
    expect(ultimo?.kind).toBe('group');
    expect(ultimo?.testId).toBe('nav-integraciones');
  });

  it('su icono tiene fila en NAV_ICONS', () => {
    const icono = ITEMS_DE_CLIENTES[0]?.icon;
    expect(icono).toBeDefined();
    if (icono) expect(NAV_ICONS[icono]).toBeDefined();
  });

  it('el destino y el testId son unicos en toda la navegacion', () => {
    expect(NAV_APLANADO.filter((item) => item.href === CUSTOMERS_ROUTE)).toHaveLength(1);
    expect(NAV_APLANADO.filter((item) => item.testId === 'nav-clientes')).toHaveLength(1);
  });

  it('los items que ya existian siguen en pie: se anadio uno, no se sustituyo', () => {
    expect(NAV_APLANADO.map((item) => item.href)).toEqual(
      expect.arrayContaining([SUPPLIERS_ROUTE, CUSTOMERS_ROUTE]),
    );
  });
});

describe('el permiso del item es EL MISMO que exige la pantalla (R6)', () => {
  it('item y pagina declaran el MISMO codigo, no uno contenido en el otro', () => {
    const permisos = permisosDeLaPantalla();
    expect(permisos).toHaveLength(1);
    expect(ITEMS_DE_CLIENTES[0]?.permission).toBe(permisos[0]);
  });
});

describe('el item se oculta a quien no tiene el permiso (R4, R6)', () => {
  it('ancla: los tres conjuntos del seed son reales, y solo el Administrador tiene el permiso', () => {
    expect(PERMISOS_ADMINISTRADOR).toContain('clientes.consultar');
    expect(PERMISOS_OPERADOR).not.toContain('clientes.consultar');
    expect(PERMISOS_EMPACADOR).not.toContain('clientes.consultar');
    expect(PERMISOS_OPERADOR.length).toBeGreaterThan(0);
    expect(PERMISOS_EMPACADOR.length).toBeGreaterThan(0);
  });

  it('con los permisos del Administrador se ve el item, dentro de «Cadena»', () => {
    const visible = filterNavItemsByPermissions(PRIVATE_NAV_ITEMS, PERMISOS_ADMINISTRADOR);
    expect(visible.map((item) => item.testId)).toContain('nav-clientes');
    expect(seccionesDe(visible)).toContain(NAV_SECTION_CHAIN);
  });

  it('con los del Operador no aparece el item', () => {
    const visible = filterNavItemsByPermissions(PRIVATE_NAV_ITEMS, PERMISOS_OPERADOR);
    expect(visible.map((item) => item.testId)).not.toContain('nav-clientes');
  });

  it('con los del Empacador tampoco aparece el item', () => {
    const visible = filterNavItemsByPermissions(PRIVATE_NAV_ITEMS, PERMISOS_EMPACADOR);
    expect(visible.map((item) => item.testId)).not.toContain('nav-clientes');
  });

  it('sin el permiso, del item no sale NI etiqueta, NI destino, NI testId', () => {
    const visible = filterNavItemsByPermissions(PRIVATE_NAV_ITEMS, PERMISOS_OPERADOR);
    const serializado = JSON.stringify(visible);

    expect(serializado).not.toContain(CUSTOMERS_ROUTE);
    expect(serializado).not.toContain(CUSTOMERS_LABEL);
    expect(serializado).not.toContain('nav-clientes');
  });

  it('firstVisibleNavHref no cambia para ninguno de los tres roles del seed', () => {
    for (const permisos of [PERMISOS_ADMINISTRADOR, PERMISOS_OPERADOR, PERMISOS_EMPACADOR]) {
      const visibleSinClientes = filterNavItemsByPermissions(
        PRIVATE_NAV_ITEMS.filter((item) => item !== ITEMS_DE_CLIENTES[0]),
        permisos,
      );
      const visibleConClientes = filterNavItemsByPermissions(PRIVATE_NAV_ITEMS, permisos);

      expect(firstVisibleNavHref(visibleConClientes)).toBe(firstVisibleNavHref(visibleSinClientes));
    }
  });
});
