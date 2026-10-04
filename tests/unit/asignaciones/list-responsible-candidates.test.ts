// tests/unit/asignaciones/list-responsible-candidates.test.ts
//
// Caso de uso «candidatos para el selector de responsables».
//
// Con un doble de `PeopleDirectory`: aqui no hay base. Lo que la base demuestra —que el permiso
// sale de una fila real de `role_permissions`— es de `tests/integration/identity/**`; lo que este
// archivo demuestra es la REGLA del caso de uso.

import { describe, expect, it, vi } from 'vitest';

import type { Actor } from '@/lib/modules/asignaciones/domain/actor';
import { UnauthorizedError, ValidationError } from '@/lib/modules/asignaciones/domain/errors';
import {
  createListResponsibleCandidates,
  MAX_CANDIDATES,
  type ListResponsibleCandidatesDeps,
} from '@/lib/modules/asignaciones/domain/list-responsible-candidates';
import {
  ROLE_ADMINISTRADOR,
  ROLE_EMPACADOR,
  ROLE_OPERADOR,
  SEED_ROLE_PERMISSIONS,
  type PeopleDirectory,
  type PermissionCode,
  type PersonRef,
} from '@/lib/modules/identity';

const EMPRESA = '33333333-3333-4333-8333-333333333333';
const ANA = '11111111-1111-4111-8111-111111111111';
const BRUNO = '22222222-2222-4222-8222-222222222222';
const CARLOS = '44444444-4444-4444-8444-444444444444';
const AHORA = new Date('2026-09-23T10:00:00.000Z');

function actorCon(...permissions: readonly string[]): Actor {
  return { id: ANA, companyId: EMPRESA, permissions };
}

function persona(id: string, displayName: string, permissions: readonly PermissionCode[] = []): PersonRef {
  return { id, displayName, isActive: true, permissions };
}

function montar(personas: readonly PersonRef[]): {
  readonly listar: ReturnType<typeof createListResponsibleCandidates>;
  readonly listAliveInCompany: ReturnType<typeof vi.fn>;
} {
  const listAliveInCompany = vi.fn(async () => personas);
  const people = { listAliveInCompany } as unknown as PeopleDirectory;
  const deps: ListResponsibleCandidatesDeps = { people, now: () => AHORA };
  return { listar: createListResponsibleCandidates(deps), listAliveInCompany };
}

describe('listResponsibleCandidates', () => {
  it('exige `asignaciones.modificar`: sin el, `unauthorized` y ningun puerto tocado', async () => {
    const m = montar([persona(ANA, 'Ana')]);

    await expect(m.listar(actorCon('pedidos.consultar'), {})).rejects.toBeInstanceOf(UnauthorizedError);
    expect(m.listAliveInCompany).not.toHaveBeenCalled();
  });

  it('actor nulo o ausente: `unauthorized`', async () => {
    const m = montar([]);

    await expect(m.listar(null, {})).rejects.toBeInstanceOf(UnauthorizedError);
    await expect(m.listar(undefined, {})).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('el esquema es ESTRICTO: cualquier clave sobrante -> `invalid_input`', async () => {
    const m = montar([]);

    await expect(
      m.listar(actorCon('asignaciones.modificar'), { patatas: true }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('excluye a quien tiene `pedidos.consultar` y conserva al resto, en el mismo orden', async () => {
    const m = montar([
      persona(ANA, 'Ana'),
      persona(BRUNO, 'Bruno', ['pedidos.consultar']),
      persona(CARLOS, 'Carlos'),
    ]);

    const candidatos = await m.listar(actorCon('asignaciones.modificar'), {});

    expect(candidatos).toEqual([
      { id: ANA, displayName: 'Ana' },
      { id: CARLOS, displayName: 'Carlos' },
    ]);
  });

  it('la salida es exactamente `{ id, displayName }`, sin ningun otro campo', async () => {
    const m = montar([persona(ANA, 'Ana')]);

    const [candidato] = await m.listar(actorCon('asignaciones.modificar'), {});

    expect(Object.keys(candidato as object).sort()).toEqual(['displayName', 'id']);
  });

  it('pide a `identity` la empresa del actor, el reloj inyectado, el tope de 25 y solo cuentas `active`', async () => {
    const m = montar([]);

    await m.listar(actorCon('asignaciones.modificar'), {});

    expect(m.listAliveInCompany).toHaveBeenCalledWith(EMPRESA, AHORA, MAX_CANDIDATES, {
      accountStatus: ['active'],
    });
    expect(MAX_CANDIDATES).toBe(25);
  });

  it('R22: un usuario con exactamente los permisos sembrados del Empacador sigue siendo candidato a responsable', async () => {
    const delEmpacador = SEED_ROLE_PERMISSIONS[ROLE_EMPACADOR] ?? [];
    expect(delEmpacador.length).toBeGreaterThan(0);
    expect(delEmpacador).not.toContain('asignaciones.ejecutar');
    const m = montar([
      persona(ANA, 'Ana', SEED_ROLE_PERMISSIONS[ROLE_ADMINISTRADOR] ?? []),
      persona(BRUNO, 'Bruno', delEmpacador),
      persona(CARLOS, 'Carlos', SEED_ROLE_PERMISSIONS[ROLE_OPERADOR] ?? []),
    ]);

    const candidatos = await m.listar(actorCon('asignaciones.modificar'), {});

    expect(candidatos).toEqual([
      { id: BRUNO, displayName: 'Bruno' },
      { id: CARLOS, displayName: 'Carlos' },
    ]);
  });
});
