// QC-35 T2 — El item de navegacion de pedidos (R3, R44).
//
// Se ITERA `PRIVATE_NAV_ITEMS` y se afirma sobre `ORDERS_ROUTE`, `ORDERS_LABEL` y el `testId`,
// **nunca sobre el literal del copy** (decision cerrada del 2026-09-06). Sin DOM: lo que esta
// task promete es la forma del dato, no como lo dibuja `AppSidebar` —que no decide nada y solo
// recorre este array—.

import { describe, expect, it } from 'vitest';

import {
  NAV_SECTION_OPERATION,
  ORDERS_LABEL,
  PRIVATE_NAV_ITEMS,
  type NavLink,
} from '@/lib/shared/navigation/private-nav';
import { INVENTORY_ROUTE, ORDERS_ROUTE, SUPPLIERS_ROUTE } from '@/lib/shared/routes';

/** Todos los items de navegacion, aplanando los grupos en sus hijos. */
const NAV_APLANADO: readonly NavLink[] = PRIVATE_NAV_ITEMS.flatMap((item) =>
  item.kind === 'group' ? item.items : [item],
);

describe('la navegacion privada lleva a pedidos (R3, R44)', () => {
  it('hay un item de NIVEL SUPERIOR cuyo destino es ORDERS_ROUTE (R3)', () => {
    // Se busca por `href` -la constante-, nunca por el texto visible (R44).
    const deNivelSuperior = PRIVATE_NAV_ITEMS.filter(
      (item): item is NavLink => item.kind === 'link' && item.href === ORDERS_ROUTE,
    );

    expect(deNivelSuperior).toHaveLength(1);
    expect(deNivelSuperior[0]?.label).toBe(ORDERS_LABEL);
    expect(deNivelSuperior[0]?.testId).toBe('nav-pedidos');
    // El icono ya existia en `NavIconName` y en `NAV_ICONS`: esta ficha no anade ninguno.
    expect(deNivelSuperior[0]?.icon).toBe('clipboard-list');
  });

  it('el item va en la seccion «Operación» y NO cuelga de ningun grupo (R3)', () => {
    const pedidos = PRIVATE_NAV_ITEMS.find(
      (item): item is NavLink => item.kind === 'link' && item.href === ORDERS_ROUTE,
    );
    if (!pedidos) throw new Error('PRIVATE_NAV_ITEMS no contiene el item de pedidos');

    expect(pedidos.section).toBe(NAV_SECTION_OPERATION);

    // Un pedido es produccion, no cadena de suministro: comparte seccion con inventario y no
    // con proveedores (decision humana del 2026-09-06).
    const inventario = NAV_APLANADO.find((item) => item.href === INVENTORY_ROUTE);
    const proveedores = NAV_APLANADO.find((item) => item.href === SUPPLIERS_ROUTE);
    expect(pedidos.section).toBe(inventario?.section);
    expect(pedidos.section).not.toBe(proveedores?.section);

    const comoHijoDeGrupo = PRIVATE_NAV_ITEMS.filter((item) => item.kind === 'group').flatMap(
      (item) => (item.kind === 'group' ? item.items : []),
    );
    expect(comoHijoDeGrupo.map((hijo) => hijo.href)).not.toContain(ORDERS_ROUTE);
  });

  it('el destino y el testId son unicos en toda la navegacion (R3, R44)', () => {
    expect(NAV_APLANADO.filter((item) => item.href === ORDERS_ROUTE)).toHaveLength(1);
    expect(NAV_APLANADO.filter((item) => item.testId === 'nav-pedidos')).toHaveLength(1);
  });

  it('los items que ya existian siguen en pie: se anadio uno, no se sustituyo (R3)', () => {
    expect(NAV_APLANADO.map((item) => item.href)).toEqual(
      expect.arrayContaining([INVENTORY_ROUTE, SUPPLIERS_ROUTE, ORDERS_ROUTE]),
    );
  });
});
