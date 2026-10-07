// Con los permisos del Administrador de acondicionamiento, el menu privado deja visible solo
// Asignacion y el aterrizaje tras el login es su ruta. Sobre `PRIVATE_NAV_ITEMS` real y con el
// conjunto que el seed le declara, nunca una lista copiada a mano.

import { describe, expect, it } from 'vitest';

import { ROLE_ACONDICIONAMIENTO, ROLE_OPERADOR, SEED_ROLE_PERMISSIONS } from '@/lib/modules/identity';
import { ASSIGNED_ORDERS_ROUTE } from '@/lib/shared/routes';
import {
  filterNavItemsByPermissions,
  firstVisibleNavHref,
  PRIVATE_NAV_ITEMS,
  type NavItem,
} from '@/lib/shared/navigation/private-nav';

function testIds(items: readonly NavItem[]): readonly string[] {
  return items.flatMap((item) =>
    item.kind === 'link' ? [item.testId] : [item.testId, ...item.items.map((hijo) => hijo.testId)],
  );
}

const PERMISOS_DEL_ROL = SEED_ROLE_PERMISSIONS[ROLE_ACONDICIONAMIENTO];

describe('R12 — el menu del Administrador de acondicionamiento deja visible solo Asignacion', () => {
  it('R12: con los permisos exactos del rol, filterNavItemsByPermissions deja solo nav-asignacion', () => {
    expect(PERMISOS_DEL_ROL).toBeDefined();

    const visible = filterNavItemsByPermissions(PRIVATE_NAV_ITEMS, PERMISOS_DEL_ROL ?? []);

    expect(testIds(visible)).toEqual(['nav-asignacion']);
  });

  it('R12: con los permisos exactos del rol, el aterrizaje tras el login es /asignacion', () => {
    const visible = filterNavItemsByPermissions(PRIVATE_NAV_ITEMS, PERMISOS_DEL_ROL ?? []);

    expect(ASSIGNED_ORDERS_ROUTE).toBe('/asignacion');
    expect(firstVisibleNavHref(visible)).toBe(ASSIGNED_ORDERS_ROUTE);
  });

  it('R12: el caso simetrico: el permiso de acondicionamiento solo no abre ningun enlace', () => {
    const visible = filterNavItemsByPermissions(PRIVATE_NAV_ITEMS, ['acondicionamiento.modificar']);

    expect(testIds(visible)).toEqual([]);
    expect(firstVisibleNavHref(visible)).toBeNull();
  });

  it('R12: el caso simetrico: con los permisos del Operador aparece ademas nav-inventario', () => {
    const visible = filterNavItemsByPermissions(
      PRIVATE_NAV_ITEMS,
      SEED_ROLE_PERMISSIONS[ROLE_OPERADOR] ?? [],
    );

    expect(testIds(visible)).toContain('nav-asignacion');
    expect(testIds(visible)).toContain('nav-inventario');
  });
});
