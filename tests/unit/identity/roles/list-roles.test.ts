// QC-94 T5 — Lo que la consulta DEVUELVE y lo que NO le pide al puerto (R5, R8, R9, R11, R12).
//
// La autorizacion tiene su propio archivo (`list-roles-authorization.test.ts`); aqui todos los
// actores estan autorizados y lo que se mira es la FORMA de la salida y la FORMA de la llamada.
//
// Cubre R5, R8, R9, R11, R12.

import { describe, expect, it, vi } from 'vitest';

import { createListRoles } from '@/lib/modules/identity/domain/list-roles';

import type { Actor } from '@/lib/modules/identity/domain/actor';
import type { RoleOption } from '@/lib/modules/identity/domain/role-view';
import type { RoleCatalogRepository } from '@/lib/modules/identity/ports/role-catalog-repository';

const ACTOR: Actor = { id: 'u1', companyId: 'empresa-a', permissions: ['usuarios.consultar'] };

/** Un catalogo mas largo que el del seed: si el caso de uso recortara, se veria. */
const CATALOGO: readonly RoleOption[] = [
  { id: 'r1', name: 'Administrador' },
  { id: 'r2', name: 'Bodega' },
  { id: 'r3', name: 'Operador' },
  { id: 'r4', name: 'Supervision' },
  { id: 'r5', name: 'Ventas' },
];

function puertoCon(catalogo: readonly RoleOption[]): {
  readonly roles: RoleCatalogRepository;
  readonly listAll: ReturnType<typeof vi.fn>;
} {
  const listAll = vi.fn(async () => catalogo);
  return { roles: { listAll } as unknown as RoleCatalogRepository, listAll };
}

describe('QC-94 — devuelve el catalogo ENTERO, tal y como lo da el puerto (R8, R12)', () => {
  it('no recorta, no reordena y no pagina', async () => {
    const puerto = puertoCon(CATALOGO);
    const listRoles = createListRoles({ roles: puerto.roles });

    await expect(listRoles(ACTOR)).resolves.toEqual(CATALOGO);
  });

  it('un catalogo vacio es una lista vacia, no un error', async () => {
    const puerto = puertoCon([]);
    const listRoles = createListRoles({ roles: puerto.roles });

    await expect(listRoles(ACTOR)).resolves.toEqual([]);
  });

  it('llama al puerto SIN ningun argumento (R11, R12)', async () => {
    const puerto = puertoCon(CATALOGO);
    const listRoles = createListRoles({ roles: puerto.roles });

    await listRoles(ACTOR);

    expect(puerto.listAll).toHaveBeenCalledTimes(1);
    expect(puerto.listAll).toHaveBeenCalledWith();
    expect(puerto.listAll.mock.calls[0]).toHaveLength(0);
  });
});

describe('QC-94 — el catalogo es GLOBAL: la empresa del actor no entra (R11)', () => {
  it('dos actores de empresas distintas reciben el MISMO conjunto con el mismo doble', async () => {
    const puerto = puertoCon(CATALOGO);
    const listRoles = createListRoles({ roles: puerto.roles });

    const deA = await listRoles({
      id: 'u1',
      companyId: 'empresa-a',
      permissions: ['usuarios.consultar'],
    });
    const deB = await listRoles({
      id: 'u2',
      companyId: 'empresa-b',
      permissions: ['usuarios.modificar'],
    });

    expect(deA).toEqual(deB);
    expect(deA).toEqual(CATALOGO);
    for (const llamada of puerto.listAll.mock.calls) {
      expect(llamada).toHaveLength(0);
    }
  });
});

describe('QC-94 — cada elemento trae EXACTAMENTE dos claves (R9)', () => {
  it('las claves son `id` y `name`, ni una mas', async () => {
    const puerto = puertoCon(CATALOGO);
    const listRoles = createListRoles({ roles: puerto.roles });

    const devuelto = await listRoles(ACTOR);

    expect(devuelto).not.toHaveLength(0);
    for (const rol of devuelto) {
      expect(Object.keys(rol).sort()).toEqual(['id', 'name']);
    }
  });

  it('el caso de uso no anade ni quita claves a lo que da el puerto', async () => {
    const puerto = puertoCon([{ id: 'r1', name: 'Administrador' }]);
    const listRoles = createListRoles({ roles: puerto.roles });

    const [rol] = await listRoles(ACTOR);

    expect(Object.keys(rol).sort()).toEqual(['id', 'name']);
    expect(rol).toEqual({ id: 'r1', name: 'Administrador' });
  });
});

describe('QC-94 — el actor entra por PARAMETRO (R5)', () => {
  it('la consulta declara UN solo parametro, el actor, y con el se resuelve', async () => {
    const puerto = puertoCon(CATALOGO);
    const listRoles = createListRoles({ roles: puerto.roles });

    expect(listRoles).toHaveLength(1);
    await expect(listRoles(ACTOR)).resolves.toEqual(CATALOGO);
  });
});
