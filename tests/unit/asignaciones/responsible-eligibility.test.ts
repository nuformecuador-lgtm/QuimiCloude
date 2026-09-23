// tests/unit/asignaciones/responsible-eligibility.test.ts
//
// `canBeResponsible`: quien puede ser responsable de un pedido, decidido por permiso, nunca por
// rol (R33, R34).

import { describe, expect, it } from 'vitest';

import { canBeResponsible } from '@/lib/modules/asignaciones/domain/responsible-eligibility';

import type { PermissionBearer } from '@/lib/modules/identity';

function bearer(permissions: readonly string[]): PermissionBearer {
  return { permissions };
}

describe('canBeResponsible', () => {
  it("R33: con `pedidos.consultar` -> false", () => {
    expect(canBeResponsible(bearer(['pedidos.consultar']))).toBe(false);
  });

  it('R33: con `pedidos.consultar` y otros permisos -> false igualmente', () => {
    expect(canBeResponsible(bearer(['pedidos.consultar', 'asignaciones.modificar']))).toBe(false);
  });

  it('R34: sin `pedidos.consultar` -> true', () => {
    expect(canBeResponsible(bearer(['asignaciones.modificar']))).toBe(true);
  });

  it('R34: sin ningun permiso -> true (no lanza)', () => {
    expect(canBeResponsible(bearer([]))).toBe(true);
  });

  it('un conjunto de permisos ausente o invalido no lanza: se lee como sin el permiso -> true', () => {
    expect(canBeResponsible({} as unknown as PermissionBearer)).toBe(true);
    expect(canBeResponsible({ permissions: null } as unknown as PermissionBearer)).toBe(true);
  });

  it('la firma no admite ningun dato de rol: `PermissionBearer` solo tiene `permissions`', () => {
    const soloPermisos: PermissionBearer = { permissions: [] };
    expect(() => canBeResponsible(soloPermisos)).not.toThrow();
  });
});
