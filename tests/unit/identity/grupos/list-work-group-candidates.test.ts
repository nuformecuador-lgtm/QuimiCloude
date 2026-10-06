// Candidatos a grupo (fix 2026-10-05, R28 enmendado): solo personas con estado EFECTIVO activo,
// filtradas ANTES de paginar para que `total` cuente solo a las que salen.

import { describe, expect, it, vi } from 'vitest';

import { UnauthorizedError } from '@/lib/modules/identity/domain/errors';
import { createListWorkGroupCandidates } from '@/lib/modules/identity/domain/list-work-group-candidates';
import { buildPage, toOffsetLimit } from '@/lib/shared/pagination';

import type { UserAccountStatus } from '@/lib/modules/identity/domain/account-status';
import type { Actor } from '@/lib/modules/identity/domain/actor';
import type {
  WorkGroupCandidate,
  WorkGroupCandidateReader,
} from '@/lib/modules/identity/ports/work-group-candidate-reader';

const COMPANY_ID = '99999999-9999-4999-8999-999999999999';
const ACTOR_ID = '11111111-1111-4111-8111-111111111111';
const NOW = new Date('2026-10-05T12:00:00.000Z');
const VIGENTE = new Date('2026-10-05T12:15:00.000Z');
const VENCIDO = new Date('2026-10-05T11:45:00.000Z');

function actorCon(...permissions: Actor['permissions'][number][]): Actor {
  return { id: ACTOR_ID, companyId: COMPANY_ID, permissions };
}

let secuencia = 0;
function persona(accountStatus: UserAccountStatus, lockedUntil: Date | null = null): WorkGroupCandidate {
  secuencia += 1;
  const n = String(secuencia).padStart(3, '0');
  return {
    id: `00000000-0000-4000-8000-000000000${n}`,
    firstNames: `Nombre${n}`,
    lastNames: `Apellido${n}`,
    username: `u${n}`,
    accountStatus,
    lockedUntil,
    roleName: 'Operador',
  };
}

function montar(personas: readonly WorkGroupCandidate[]) {
  const listCandidatesAliveInCompany = vi.fn(async () => [...personas]);
  const candidates: WorkGroupCandidateReader = { listCandidatesAliveInCompany };
  const listar = createListWorkGroupCandidates({
    candidates,
    pagination: { toOffsetLimit, buildPage },
  });
  return { listar, listCandidatesAliveInCompany };
}

const QUERY = { page: 1, sort: null, filters: {}, search: '' };

describe('candidatos a grupo — solo estado EFECTIVO activo', () => {
  it('R28 — excluye pendiente, inactiva, bloqueada y `active` con plazo vigente; incluye bloqueada con plazo vencido', async () => {
    const activa = persona('active');
    const vencida = persona('blocked', VENCIDO);
    const { listar } = montar([
      persona('pending'),
      activa,
      persona('inactive'),
      persona('blocked'),
      persona('blocked', VIGENTE),
      persona('active', VIGENTE),
      vencida,
    ]);

    const pagina = await listar(actorCon('usuarios.modificar'), QUERY, NOW);

    expect(pagina.items.map((fila) => fila.id)).toEqual([activa.id, vencida.id]);
    expect(pagina.total).toBe(2);
  });

  it('R28 — el total cuenta solo a las activas y la paginacion corta DESPUES del filtro', async () => {
    const activas = Array.from({ length: 12 }, () => persona('active'));
    const ocultas = Array.from({ length: 7 }, () => persona('pending'));
    // Intercaladas: si se cortara antes de filtrar, la primera pagina saldria corta.
    const mezcla = activas.flatMap((a, i) => (i < ocultas.length ? [ocultas[i]!, a] : [a]));
    const { listar } = montar(mezcla);

    const uno = await listar(actorCon('usuarios.modificar'), { ...QUERY, pageSize: 5 }, NOW);
    const tres = await listar(actorCon('usuarios.modificar'), { ...QUERY, page: 3, pageSize: 5 }, NOW);

    expect(uno.total).toBe(12);
    expect(uno.totalPages).toBe(3);
    expect(uno.items.map((f) => f.id)).toEqual(activas.slice(0, 5).map((a) => a.id));
    expect(tres.items.map((f) => f.id)).toEqual(activas.slice(10).map((a) => a.id));
  });

  it('la fila trae id, displayName y roleName, y nada mas', async () => {
    const activa = persona('active');
    const { listar } = montar([activa]);

    const pagina = await listar(actorCon('usuarios.modificar'), QUERY, NOW);

    expect(Object.keys(pagina.items[0] ?? {}).sort()).toEqual(['displayName', 'id', 'roleName']);
    expect(pagina.items[0]?.roleName).toBe('Operador');
  });

  it('la empresa, el propio actor y la busqueda salen del actor y de la consulta', async () => {
    const { listar, listCandidatesAliveInCompany } = montar([]);

    await listar(actorCon('usuarios.modificar'), { ...QUERY, search: '  ana  ' }, NOW);

    expect(listCandidatesAliveInCompany).toHaveBeenCalledWith(COMPANY_ID, ACTOR_ID, 'ana');
  });

  it('exige `usuarios.modificar`: `usuarios.consultar` solo no basta y no toca el puerto', async () => {
    const { listar, listCandidatesAliveInCompany } = montar([persona('active')]);

    await expect(listar(actorCon('usuarios.consultar'), QUERY, NOW)).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
    await expect(listar(null, QUERY, NOW)).rejects.toBeInstanceOf(UnauthorizedError);
    expect(listCandidatesAliveInCompany).not.toHaveBeenCalled();
  });

  it('enmienda 2026-10-05 — el propio actor nunca es candidato: su id viaja como excluido al puerto', async () => {
    const { listar, listCandidatesAliveInCompany } = montar([]);

    await listar(actorCon('usuarios.modificar'), QUERY, NOW);

    const [, excluido] = listCandidatesAliveInCompany.mock.calls[0] as unknown as [string, string];
    expect(excluido).toBe(ACTOR_ID);
  });
});
