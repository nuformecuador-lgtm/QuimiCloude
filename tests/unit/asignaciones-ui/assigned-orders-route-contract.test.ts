// QC-88 T13 — Contrato de la ruta de pedidos asignados: R33, calcado de
// `tests/unit/pedidos-ui/order-route-contract.test.ts`.
//
// Lo que este archivo promete es invisible renderizando: que la URL viva en UNA sola constante de
// `lib/shared/routes.ts`, que el helper de detalle exista y derive de ella (R21, R22 - al reves
// que en `/pedidos`, aqui SI hay pagina de detalle, la monta QC-63), que el prefijo privado la
// cubra exactamente una vez, que la pantalla viva donde dice la constante, que sus componentes
// cuelguen de `components/` con su barrel sin `'use client'`, y que ningun archivo de la ruta
// escriba la URL como literal.

import { existsSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { PERMISSIONS } from '@/lib/modules/identity';
import { PRIVATE_NAV_ITEMS, type NavLink } from '@/lib/shared/navigation/private-nav';
import {
  ASSIGNED_ORDERS_ROUTE,
  DASHBOARD_ROUTE,
  INVENTORY_ROUTE,
  PRIVATE_ROUTE_PREFIXES,
  assignedOrderRoute,
} from '@/lib/shared/routes';

/** Texto del archivo sin comentarios: un literal citado dentro de un comentario no es codigo. */
function fuenteSinComentarios(ruta: string): string {
  return readFileSync(ruta, 'utf8')
    .replace(/\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, ' ');
}

describe('la ruta de pedidos asignados se declara una sola vez (R1, R33)', () => {
  it('la constante vive en lib/shared/routes.ts', () => {
    expect(fuenteSinComentarios('lib/shared/routes.ts')).toContain(
      'export const ASSIGNED_ORDERS_ROUTE',
    );
  });

  it('existe un helper de ruta de detalle y deriva de la constante (R21, R22)', () => {
    expect(typeof assignedOrderRoute).toBe('function');
    expect(assignedOrderRoute('x')).toBe('/asignacion/x');
    expect(assignedOrderRoute('x')).toBe(`${ASSIGNED_ORDERS_ROUTE}/x`);
  });

  it('nadie redeclara la constante: private-nav la IMPORTA', () => {
    for (const ruta of ['lib/shared/navigation/private-nav.ts']) {
      const codigo = fuenteSinComentarios(ruta);
      expect(codigo, `${ruta} no puede redeclarar ASSIGNED_ORDERS_ROUTE`).not.toContain(
        'const ASSIGNED_ORDERS_ROUTE =',
      );
      expect(codigo).toContain('ASSIGNED_ORDERS_ROUTE');
    }
  });
});

describe('el prefijo privado cubre la pantalla de asignacion (R2, R33)', () => {
  it('ASSIGNED_ORDERS_ROUTE esta en PRIVATE_ROUTE_PREFIXES exactamente UNA vez', () => {
    expect(
      PRIVATE_ROUTE_PREFIXES.filter((prefijo) => prefijo === ASSIGNED_ORDERS_ROUTE),
    ).toEqual([ASSIGNED_ORDERS_ROUTE]);
  });

  it('los prefijos que ya existian no se sustituyeron: se anadio uno', () => {
    for (const prefijo of [DASHBOARD_ROUTE, INVENTORY_ROUTE]) {
      expect(PRIVATE_ROUTE_PREFIXES).toContain(prefijo);
    }
  });

  it('la pantalla exige asignaciones.consultar y su item de menu declara ese mismo permiso (R3, R4, R5)', () => {
    const permiso = PERMISSIONS.find(
      (entrada) => entrada.module === 'asignaciones' && entrada.action === 'consultar',
    );
    expect(permiso, 'el catalogo de identity deberia tener asignaciones.consultar').toBeDefined();

    expect(fuenteSinComentarios(`app/(private)${ASSIGNED_ORDERS_ROUTE}/page.tsx`)).toContain(
      `requirePagePermission('${permiso?.code}')`,
    );

    const enlace = PRIVATE_NAV_ITEMS.flatMap((item) =>
      item.kind === 'group' ? item.items : [item],
    ).find((item: NavLink) => item.href === ASSIGNED_ORDERS_ROUTE);
    expect(enlace?.permission).toBe(permiso?.code);
  });
});

// La pantalla existe donde dice la constante (R1, R33).
describe('la pantalla vive donde dice la constante (R33)', () => {
  const CARPETA_DE_LA_RUTA = `app/(private)${ASSIGNED_ORDERS_ROUTE}`;

  it('existe `app/(private)${ASSIGNED_ORDERS_ROUTE}/page.tsx`, derivado de la constante', () => {
    expect(existsSync(`${CARPETA_DE_LA_RUTA}/page.tsx`)).toBe(true);
  });

  it('los componentes propios de la ruta viven en `components/` con su barrel', () => {
    expect(existsSync(`${CARPETA_DE_LA_RUTA}/components/index.ts`)).toBe(true);
  });

  it('el barrel NO declara `use client`: la frontera la declara cada componente', () => {
    expect(fuenteSinComentarios(`${CARPETA_DE_LA_RUTA}/components/index.ts`)).not.toContain(
      'use client',
    );
  });

  it('la pagina importa desde el barrel y NUNCA por ruta profunda', () => {
    const codigo = fuenteSinComentarios(`${CARPETA_DE_LA_RUTA}/page.tsx`);

    expect(codigo).toContain("from './components'");
    expect(codigo).not.toMatch(/from '\.\/components\/[^']+'/);
  });

  it('ningun archivo de la ruta escribe la URL como literal: todo deriva de ASSIGNED_ORDERS_ROUTE', () => {
    for (const archivo of [
      `${CARPETA_DE_LA_RUTA}/page.tsx`,
      `${CARPETA_DE_LA_RUTA}/components/index.ts`,
      `${CARPETA_DE_LA_RUTA}/components/assigned-orders-list-params.ts`,
      `${CARPETA_DE_LA_RUTA}/components/assigned-orders-list-section.tsx`,
      `${CARPETA_DE_LA_RUTA}/components/assigned-order-enter-trigger.tsx`,
    ]) {
      expect(
        fuenteSinComentarios(archivo),
        `${archivo} no puede llevar la URL a mano`,
      ).not.toContain(`'${ASSIGNED_ORDERS_ROUTE}'`);
    }
  });

  it('la seccion importa la action por su RUTA EXACTA, nunca por el barrel del modulo (R41-equivalente)', () => {
    const codigo = fuenteSinComentarios(
      `${CARPETA_DE_LA_RUTA}/components/assigned-orders-list-section.tsx`,
    );

    expect(codigo).toContain(
      "from '@/lib/modules/asignaciones/adapters/driving/order-assignment-actions'",
    );
    expect(codigo).not.toContain("from '@/lib/modules/asignaciones'");
  });
});
