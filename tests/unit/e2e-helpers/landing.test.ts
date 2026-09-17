// QC-93 T4 — el helper de aterrizaje de los E2E (R2, R3, R4, R5).
//
// La base se mockea: aqui se prueba la regla y la forma de la consulta. Que la consulta devuelva
// lo sembrado de verdad lo cierra la corrida E2E real.
const { findFirstMock } = vi.hoisted(() => ({ findFirstMock: vi.fn() }));

vi.mock('@/lib/shared/db/prisma', () => ({
  prisma: { user: { findFirst: findFirstMock } },
}));

import {
  expectedLandingRoute,
  landingRouteForPermissions,
  permissionsForUsername,
} from '@/e2e/helpers/landing';
import { ROLE_ADMINISTRADOR, ROLE_OPERADOR, SEED_ROLE_PERMISSIONS } from '@/lib/modules/identity';
import {
  PRIVATE_NAV_ITEMS,
  filterNavItemsByPermissions,
  firstVisibleNavHref,
} from '@/lib/shared/navigation/private-nav';
import { ASSIGNED_ORDERS_ROUTE, DASHBOARD_ROUTE, INVENTORY_ROUTE } from '@/lib/shared/routes';

function seedPermissionsOf(role: string): readonly string[] {
  const permissions = SEED_ROLE_PERMISSIONS[role];
  if (permissions === undefined) throw new Error(`el catalogo no tiene el rol "${role}"`);
  return permissions;
}

describe('QC-93 — landingRouteForPermissions deriva el destino con la regla del login', () => {
  it('lleva al dashboard a quien tiene los permisos sembrados del Administrador (R2)', () => {
    expect(landingRouteForPermissions(seedPermissionsOf(ROLE_ADMINISTRADOR))).toBe(DASHBOARD_ROUTE);
  });

  it('lleva a asignacion a quien tiene los permisos sembrados del Operador (R2)', () => {
    expect(landingRouteForPermissions(seedPermissionsOf(ROLE_OPERADOR))).toBe(
      ASSIGNED_ORDERS_ROUTE,
    );
  });

  it('cae en el dashboard de respaldo cuando no hay ningun permiso (R3)', () => {
    expect(landingRouteForPermissions([])).toBe(DASHBOARD_ROUTE);
  });

  it('cae en el dashboard de respaldo cuando el unico permiso no abre ningun item del menu (R3)', () => {
    expect(landingRouteForPermissions(['modulo-inventado.consultar'])).toBe(DASHBOARD_ROUTE);
  });

  it('coincide con la composicion de produccion para cada rol del catalogo, sin regla propia (R2)', () => {
    const roles = Object.keys(SEED_ROLE_PERMISSIONS);
    expect(roles.length).toBeGreaterThan(0);

    for (const role of roles) {
      const permissions = seedPermissionsOf(role);
      const fromProduction =
        firstVisibleNavHref(filterNavItemsByPermissions(PRIVATE_NAV_ITEMS, permissions)) ??
        DASHBOARD_ROUTE;
      expect(landingRouteForPermissions(permissions), role).toBe(fromProduction);
    }
  });
});

describe('QC-93 — permissionsForUsername lee los permisos del usuario vivo en la base', () => {
  beforeEach(() => {
    findFirstMock.mockReset();
  });

  it('devuelve los codigos de permiso del rol y consulta solo usuarios vivos con ese username (R4)', async () => {
    findFirstMock.mockResolvedValue({
      role: {
        permissions: [
          { permissionCode: 'inventario.consultar' },
          { permissionCode: 'asignaciones.consultar' },
        ],
      },
    });

    await expect(permissionsForUsername('qc93_operador')).resolves.toEqual([
      'inventario.consultar',
      'asignaciones.consultar',
    ]);
    expect(findFirstMock).toHaveBeenCalledTimes(1);
    expect(findFirstMock.mock.calls[0]?.[0]).toMatchObject({
      where: { username: 'qc93_operador', deletedAt: null },
    });
  });

  it('rechaza nombrando el username cuando no hay usuario vivo, sin devolver ninguna ruta (R5)', async () => {
    findFirstMock.mockResolvedValue(null);

    await expect(permissionsForUsername('qc93_fantasma')).rejects.toThrow('qc93_fantasma');
    await expect(expectedLandingRoute('qc93_fantasma')).rejects.toThrow('qc93_fantasma');
  });

  it('deriva el destino esperado de los permisos que devuelve la base (R4)', async () => {
    findFirstMock.mockResolvedValue({
      role: { permissions: [{ permissionCode: 'inventario.consultar' }] },
    });

    await expect(expectedLandingRoute('qc93_operador')).resolves.toBe(INVENTORY_ROUTE);
  });
});
