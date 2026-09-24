// Con los permisos del Empacador, el menu privado deja visible unicamente el enlace de
// Asignacion, y el aterrizaje tras el login es su ruta.
//
// Sobre `PRIVATE_NAV_ITEMS` REAL: el menu y el aterrizaje ya funcionan por permiso, asi que este
// archivo no toca `lib/shared/navigation/**`, solo prueba el resultado con el conjunto exacto que
// el seed le da al Empacador. `SEED_ROLE_PERMISSIONS[ROLE_EMPACADOR]`, nunca una lista copiada a
// mano (misma regla que `tests/unit/asignaciones/empacador-authorization.test.ts`).
//
// El caso simetrico del Operador demuestra que el test distingue: con sus permisos aparece ademas
// `nav-inventario`, que el Empacador no ve.

import { describe, expect, it } from 'vitest';

import { ROLE_EMPACADOR, ROLE_OPERADOR, SEED_ROLE_PERMISSIONS } from '@/lib/modules/identity';
import { ASSIGNED_ORDERS_ROUTE, INVENTORY_ROUTE } from '@/lib/shared/routes';
import {
  filterNavItemsByPermissions,
  firstVisibleNavHref,
  PRIVATE_NAV_ITEMS,
  type NavItem,
} from '@/lib/shared/navigation/private-nav';

/** Los `testId` visibles, aplanando los grupos. */
function testIds(items: readonly NavItem[]): readonly string[] {
  return items.flatMap((item) =>
    item.kind === 'link' ? [item.testId] : [item.testId, ...item.items.map((hijo) => hijo.testId)],
  );
}

describe('R15 — el menu del Empacador deja visible solo Asignacion', () => {
  it('con los permisos exactos del Empacador, filterNavItemsByPermissions deja solo nav-asignacion', () => {
    const permisosDelEmpacador = SEED_ROLE_PERMISSIONS[ROLE_EMPACADOR];
    expect(permisosDelEmpacador).toBeDefined();

    const visible = filterNavItemsByPermissions(PRIVATE_NAV_ITEMS, permisosDelEmpacador ?? []);

    expect(testIds(visible)).toEqual(['nav-asignacion']);
  });

  it('con los permisos exactos del Empacador, firstVisibleNavHref aterriza en ASSIGNED_ORDERS_ROUTE', () => {
    const permisosDelEmpacador = SEED_ROLE_PERMISSIONS[ROLE_EMPACADOR];
    const visible = filterNavItemsByPermissions(PRIVATE_NAV_ITEMS, permisosDelEmpacador ?? []);

    expect(firstVisibleNavHref(visible)).toBe(ASSIGNED_ORDERS_ROUTE);
  });

  // Caso simetrico: con los permisos del Operador aparece ADEMAS nav-inventario, que demuestra que
  // el test de arriba distingue por permisos y no pasa en verde con cualquier menu.
  it('con los permisos del Operador aparece ademas nav-inventario, y el aterrizaje sigue siendo Asignacion', () => {
    const permisosDelOperador = SEED_ROLE_PERMISSIONS[ROLE_OPERADOR];
    expect(permisosDelOperador).toBeDefined();

    const visible = filterNavItemsByPermissions(PRIVATE_NAV_ITEMS, permisosDelOperador ?? []);

    expect(testIds(visible)).toContain('nav-inventario');
    expect(testIds(visible)).toContain('nav-asignacion');
    // El Operador NO tiene `terminados.consultar`; el Empacador es el unico que aterriza igual.
    expect(firstVisibleNavHref(visible)).toBe(ASSIGNED_ORDERS_ROUTE);
  });

  it('ancla anti-vacuidad: el menu real trae ambos enlaces y las dos rutas no son la misma', () => {
    expect(ASSIGNED_ORDERS_ROUTE).not.toBe(INVENTORY_ROUTE);
    const testIdsDelMenu = testIds(PRIVATE_NAV_ITEMS);
    expect(testIdsDelMenu).toContain('nav-inventario');
    expect(testIdsDelMenu).toContain('nav-asignacion');
  });
});
