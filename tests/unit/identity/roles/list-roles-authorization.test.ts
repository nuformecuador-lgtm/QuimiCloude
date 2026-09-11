// QC-94 T5 — Autorizacion POR PERMISO de la consulta del catalogo de roles (R1, R2, R3, R4).
//
// `docs/architecture.md > Acceso a datos y autorizacion` es explicito: Prisma se conecta como dueno
// de las tablas y no setea `auth.uid()`, asi que las policies de RLS no filtran ninguna consulta de
// esta app (R7). La frontera real es el caso de uso, y una comprobacion puesta DESPUES de leer el
// catalogo seria justo el agujero que este archivo existe para encontrar.
//
// Por eso el doble del puerto FALLA SI LO LLAMAN: no basta con que la operacion lance, tiene que
// lanzar SIN haber tocado nada, y ademas se afirma `not.toHaveBeenCalled()` sobre el unico metodo
// del puerto en cada rechazo (`tasks.md > T5 > Hecho cuando`).
//
// Estilo y estructura: `tests/unit/identity/usuarios/authorization.test.ts`.
//
// Cubre R1, R2, R3, R4.

import { describe, expect, it, vi } from 'vitest';

import { UnauthorizedError } from '@/lib/modules/identity/domain/errors';
import { createListRoles } from '@/lib/modules/identity/domain/list-roles';

import type { Actor } from '@/lib/modules/identity/domain/actor';
import type { RoleCatalogRepository } from '@/lib/modules/identity/ports/role-catalog-repository';

/** El doble que LANZA si lo llaman: si la autorizacion no fuera lo primero, esto lo delata. */
function puertoQueFallaSiLoLlaman(): {
  readonly roles: RoleCatalogRepository;
  readonly listAll: ReturnType<typeof vi.fn>;
} {
  const listAll = vi.fn(() => {
    throw new Error('el puerto NO debe tocarse: la autorizacion va primero (R1, R2)');
  });
  return { roles: { listAll } as unknown as RoleCatalogRepository, listAll };
}

/** Doble inofensivo para los casos que SI deben resolverse. */
function puertoConCatalogo(): {
  readonly roles: RoleCatalogRepository;
  readonly listAll: ReturnType<typeof vi.fn>;
} {
  const listAll = vi.fn(async () => [
    { id: 'r1', name: 'Administrador' },
    { id: 'r2', name: 'Operador' },
  ]);
  return { roles: { listAll } as unknown as RoleCatalogRepository, listAll };
}

/**
 * Actores que NO deben pasar el corte. **Ninguno lleva rol** (R4): el `Actor` de QC-66 no tiene
 * campo de rol, y esta consulta no lo recibe, no lo lee y no lo compara.
 */
const RECHAZADOS: readonly (readonly [string, Actor | null | undefined])[] = [
  ['actor ausente (null)', null],
  ['actor ausente (undefined)', undefined],
  ['actor sin conjunto de permisos', { id: 'u1', companyId: 'c1' } as unknown as Actor],
  ['conjunto vacio', { id: 'u1', companyId: 'c1', permissions: [] }],
  [
    'conjunto que NO es una lista',
    { id: 'u1', companyId: 'c1', permissions: 'usuarios.consultar' } as unknown as Actor,
  ],
  [
    'permiso ajeno',
    { id: 'u1', companyId: 'c1', permissions: ['inventario.consultar', 'pedidos.modificar'] },
  ],
];

describe('QC-94 — listRoles exige el permiso ANTES de tocar el puerto (R1, R2)', () => {
  for (const [quien, actor] of RECHAZADOS) {
    it(`${quien}: rechaza con UnauthorizedError y no lee nada`, async () => {
      const puerto = puertoQueFallaSiLoLlaman();
      const listRoles = createListRoles({ roles: puerto.roles });

      await expect(listRoles(actor)).rejects.toBeInstanceOf(UnauthorizedError);
      expect(puerto.listAll).not.toHaveBeenCalled();
    });
  }
});

describe('QC-94 — basta CUALQUIERA de los dos permisos (R3)', () => {
  const ACEPTADOS: readonly (readonly [string, Actor])[] = [
    [
      'solo `usuarios.consultar`',
      { id: 'u1', companyId: 'c1', permissions: ['usuarios.consultar'] },
    ],
    [
      'solo `usuarios.modificar`',
      { id: 'u2', companyId: 'c1', permissions: ['usuarios.modificar'] },
    ],
  ];

  for (const [quien, actor] of ACEPTADOS) {
    it(`${quien}: resuelve y devuelve el catalogo completo`, async () => {
      const puerto = puertoConCatalogo();
      const listRoles = createListRoles({ roles: puerto.roles });

      await expect(listRoles(actor)).resolves.toEqual([
        { id: 'r1', name: 'Administrador' },
        { id: 'r2', name: 'Operador' },
      ]);
      expect(puerto.listAll).toHaveBeenCalledTimes(1);
    });
  }

  it('no exige los DOS a la vez: con los dos tambien resuelve', async () => {
    const puerto = puertoConCatalogo();
    const listRoles = createListRoles({ roles: puerto.roles });
    const actor: Actor = {
      id: 'u3',
      companyId: 'c1',
      permissions: ['usuarios.consultar', 'usuarios.modificar'],
    };

    await expect(listRoles(actor)).resolves.toHaveLength(2);
  });
});
