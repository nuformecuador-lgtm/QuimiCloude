// QC-84 T19 — La paginacion de la consulta de miembros (R51, R52, R53, R54).
//
// Cierra **P2**, que el humano decidio el 2026-09-11 al aprobar el spec (decision 18): la consulta
// de miembros **si se pagina**, con los mismos tamanos que el resto de la aplicacion —**10** por
// defecto, **25** de tope— y con el total.
//
// Se pagina **en el caso de uso y DESPUES de filtrar** (`design.md > 5.3`), y esa decision es
// justo lo que este archivo tiene que hacer verdadera o falsa:
//
//   - **el total cuenta el conjunto YA filtrado** (R52). Un `COUNT(*)` sin el filtro prometeria
//     personas que la pantalla no va a mostrar nunca, y un `LIMIT` antes del filtro daria paginas
//     de tamano irregular. El caso de los 12 miembros con 4 ocultos cae en rojo si alguien cuenta
//     antes de filtrar: diria `total: 12` y **dos** paginas donde hay **una**;
//   - **ninguna persona se pierde ni se repite entre paginas** (R53), ni siquiera con dos
//     homonimas a caballo del corte. El desempate por identificador viene del `ORDER BY` del
//     puerto y el corte en memoria sobre una lista ordenada es estable por construccion; el ultimo
//     caso de este archivo es la CONTRAPRUEBA de que sin ese desempate el recorrido se rompe.
//
// Todos los tamanos entran por `deps.pagination`, cableado en `lib/composition` sobre
// `lib/shared/pagination.ts` —la MISMA implementacion que usa el resto de la aplicacion—, y aqui
// se usa esa misma y no una copia: si manana el 10 o el 25 cambian, cambian en un solo sitio y
// este archivo lo ve.

import { describe, expect, it, vi } from 'vitest';

import { createListWorkGroupMembers } from '@/lib/modules/identity/domain/list-work-group-members';
import { createListWorkGroups } from '@/lib/modules/identity/domain/list-work-groups';
import { buildPage, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, toOffsetLimit } from '@/lib/shared/pagination';

import type { Actor } from '@/lib/modules/identity/domain/actor';
import type { UserAccountStatus } from '@/lib/modules/identity/domain/account-status';
import type { Page } from '@/lib/modules/identity/domain/page';
import type { WorkGroupMemberRow } from '@/lib/modules/identity/domain/work-group-view';
import type { ListQueryLog } from '@/lib/modules/identity/ports/list-query-log';
import type {
  MemberCandidate,
  WorkGroupRepository,
} from '@/lib/modules/identity/ports/work-group-repository';

const ACTOR_ID = '11111111-1111-4111-8111-111111111111';
const COMPANY_ID = '99999999-9999-4999-8999-999999999999';
const GROUP_ID = '22222222-2222-4222-8222-222222222222';

const actor: Actor = {
  id: ACTOR_ID,
  companyId: COMPANY_ID,
  permissions: ['usuarios.consultar'],
};

const NOW = new Date('2026-09-11T12:00:00.000Z');
const PLAZO_VIGENTE = new Date('2026-09-11T12:15:00.000Z');

const log: ListQueryLog = { ignoredFields: vi.fn() } as unknown as ListQueryLog;
const pagination = { toOffsetLimit, buildPage };

/** Identificador estable y ORDENABLE: el numero va al final para que el orden sea el del indice. */
function idDe(indice: number): string {
  return `00000000-0000-4000-8000-${String(indice).padStart(12, '0')}`;
}

function persona(
  indice: number,
  apellidos: string,
  nombres: string,
  accountStatus: UserAccountStatus = 'active',
  lockedUntil: Date | null = null,
): MemberCandidate {
  return {
    id: idDe(indice),
    firstNames: nombres,
    lastNames: apellidos,
    username: `u${indice}`,
    accountStatus,
    lockedUntil,
  };
}

/**
 * El puerto devuelve TODOS los candidatos ya ordenados y **no recibe pagina ni tamano**
 * (`design.md > 5`). Que ese parametro no exista es lo que impide que alguien «optimice» metiendo
 * un `LIMIT` antes del filtro. `ordenPorLlamada` permite simular un `ORDER BY` SIN desempate.
 */
function dobles(
  candidatos: readonly MemberCandidate[],
  ordenPorLlamada?: (llamada: number) => readonly MemberCandidate[],
) {
  let llamada = 0;
  const listMembersAliveInCompany = vi.fn(async () => {
    const actual = ordenPorLlamada ? ordenPorLlamada(llamada) : candidatos;
    llamada += 1;
    return actual;
  });

  const espias = { listMembersAliveInCompany };

  return {
    workGroups: { listMembersAliveInCompany } as unknown as WorkGroupRepository,
    espias,
  };
}

async function pagina(
  candidatos: readonly MemberCandidate[],
  consulta: Record<string, unknown>,
): Promise<Page<WorkGroupMemberRow>> {
  const d = dobles(candidatos);

  return createListWorkGroupMembers({ workGroups: d.workGroups, pagination, log })(
    actor,
    GROUP_ID,
    consulta,
    NOW,
  );
}

/** Un grupo con `cuantos` personas visibles, en el orden del SQL. */
function visibles(cuantos: number): readonly MemberCandidate[] {
  return Array.from({ length: cuantos }, (_, i) =>
    persona(i + 1, `Apellido${String(i + 1).padStart(3, '0')}`, `Nombre${i + 1}`),
  );
}

describe('QC-84 T19 — la paginacion de los miembros (R51, R52, R53, R54)', () => {
  it('R51 — sin tamano de pagina se usan DIEZ', async () => {
    // El defecto sale de `lib/shared/pagination.ts` a traves de `deps.pagination`, no de un 10
    // escrito a mano en el dominio.
    expect(DEFAULT_PAGE_SIZE).toBe(10);

    const page = await pagina(visibles(12), { page: 1 });

    expect(page.items).toHaveLength(10);
    expect(page.pageSize).toBe(10);
    expect(page.page).toBe(1);
    expect(page.total).toBe(12);
    expect(page.totalPages).toBe(2);
  });

  it('R51 — pedir CIEN devuelve VEINTICINCO, y no un error', async () => {
    // «DEBE **acotarlo** a 25 y no devolver ninguna pagina sin limite superior». Lo importante es
    // que la peticion se atienda acotada: rechazarla seria otro comportamiento y no es el pedido.
    expect(MAX_PAGE_SIZE).toBe(25);

    const page = await pagina(visibles(40), { page: 1, pageSize: 100 });

    expect(page.items).toHaveLength(25);
    expect(page.pageSize).toBe(25);
    expect(page.total).toBe(40);

    // Y el borde exacto: 26 se acota, 25 pasa entero, y un tamano pequeno se respeta tal cual.
    expect((await pagina(visibles(40), { page: 1, pageSize: 26 })).items).toHaveLength(25);
    expect((await pagina(visibles(40), { page: 1, pageSize: 25 })).items).toHaveLength(25);
    expect((await pagina(visibles(40), { page: 1, pageSize: 3 })).items).toHaveLength(3);
  });

  it('R52 — el total cuenta SOLO a las filtradas: 12 miembros con 4 ocultos son `total: 8` y UNA pagina', async () => {
    // El caso literal de `tasks.md > T19`. Mutacion que lo pone rojo: contar antes de filtrar
    // —`candidates.length` en vez de `visible.length`—, que daria `total: 12` y `totalPages: 2`
    // prometiendo una segunda pagina que la pantalla no puede mostrar.
    const doce: readonly MemberCandidate[] = [
      persona(1, 'Alvarez', 'Ana'),
      persona(2, 'Benitez', 'Bruno', 'pending'), // oculta 1
      persona(3, 'Cedeno', 'Carla'),
      persona(4, 'Duran', 'Diana', 'inactive'), // oculta 2
      persona(5, 'Erazo', 'Elias'),
      persona(6, 'Freire', 'Fabio', 'active', PLAZO_VIGENTE), // oculta 3: bloqueada por intentos
      persona(7, 'Gomez', 'Gina'),
      persona(8, 'Haro', 'Hugo', 'blocked', null), // oculta 4: bloqueo administrativo
      persona(9, 'Ibarra', 'Ines'),
      persona(10, 'Jaramillo', 'Julio'),
      persona(11, 'Loor', 'Lucia'),
      persona(12, 'Mora', 'Mateo'),
    ];
    expect(doce).toHaveLength(12);

    const page = await pagina(doce, { page: 1 });

    expect(page.total, 'el total conto a las ocultas').toBe(8);
    expect(page.items).toHaveLength(8);
    expect(page.totalPages, 'prometio una segunda pagina que no existe').toBe(1);

    // Y la segunda pagina, si alguien la pide, viene vacia: no hay nadie mas que ensenar.
    const segunda = await pagina(doce, { page: 2 });
    expect(segunda.items).toEqual([]);
    expect(segunda.total).toBe(8);

    // Las cuatro ocultas no estan en ninguna de las dos.
    const ids = [...page.items, ...segunda.items].map((fila) => fila.id);
    for (const oculta of [idDe(2), idDe(4), idDe(6), idDe(8)]) {
      expect(ids, `${oculta} salio en alguna pagina`).not.toContain(oculta);
    }
  });

  it('R53 — recorrer TODAS las paginas devuelve a CADA persona exactamente UNA vez, con dos homonimas dentro', async () => {
    // 23 visibles y 2 ocultas. Las dos HOMONIMAS —mismos apellidos y mismos nombres— quedan en las
    // posiciones 10 y 11 del conjunto filtrado, es decir, a caballo del corte de la primera
    // pagina: es el sitio exacto donde un orden sin desempate estable pierde a una y repite a la
    // otra.
    const candidatos: MemberCandidate[] = [];
    for (let i = 1; i <= 9; i += 1) {
      candidatos.push(persona(i, `Apellido${String(i).padStart(3, '0')}`, `Nombre${i}`));
    }
    const homonimaA = persona(10, 'Loor', 'Maria Jose');
    const homonimaB = persona(11, 'Loor', 'Maria Jose');
    candidatos.push(homonimaA, homonimaB);
    candidatos.push(persona(12, 'Mora', 'Mateo', 'pending')); // oculta
    for (let i = 13; i <= 24; i += 1) {
      candidatos.push(persona(i, `Zapata${String(i).padStart(3, '0')}`, `Nombre${i}`));
    }
    candidatos.push(persona(26, 'Zuniga', 'Zoe', 'inactive')); // oculta

    const esperados = candidatos
      .filter((c) => c.accountStatus === 'active' && c.lockedUntil === null)
      .map((c) => c.id);
    expect(esperados).toHaveLength(23);

    const recorrido: string[] = [];
    for (const numero of [1, 2, 3]) {
      const page = await pagina(candidatos, { page: numero, pageSize: 10 });
      expect(page.total, `pagina ${numero}`).toBe(23);
      expect(page.totalPages, `pagina ${numero}`).toBe(3);
      recorrido.push(...page.items.map((fila) => fila.id));
    }

    // Ni una repetida, ni una perdida, y en el mismo orden que el puerto entrego.
    expect(new Set(recorrido).size, 'alguien salio en dos paginas').toBe(recorrido.length);
    expect(recorrido).toHaveLength(23);
    expect(recorrido).toEqual(esperados);

    // Las dos homonimas estan las dos, una a cada lado del corte, y con el MISMO nombre mostrable.
    expect(recorrido[9]).toBe(homonimaA.id);
    expect(recorrido[10]).toBe(homonimaB.id);
    const primeraPagina = await pagina(candidatos, { page: 1, pageSize: 10 });
    const segundaPagina = await pagina(candidatos, { page: 2, pageSize: 10 });
    expect(primeraPagina.items.at(-1)?.displayName).toBe(segundaPagina.items[0]?.displayName);
    expect(primeraPagina.items.at(-1)?.id).not.toBe(segundaPagina.items[0]?.id);
  });

  it('R53 — CONTRAPRUEBA: sin el desempate por identificador, el recorrido pierde a una y repite a la otra', async () => {
    // Que el caso de arriba este verde no prueba nada si no se puede romper. Aqui el doble simula
    // un `ORDER BY last_names, first_names` SIN `id`: las dos homonimas se intercambian entre una
    // consulta y la siguiente, que es lo unico que la base puede hacer legitimamente cuando el
    // orden no las distingue. El resultado es el defecto que R53 prohibe.
    const base = visibles(9);
    const homonimaA = persona(10, 'Loor', 'Maria Jose');
    const homonimaB = persona(11, 'Loor', 'Maria Jose');
    const resto = Array.from({ length: 12 }, (_, i) =>
      persona(i + 12, `Zapata${String(i + 12).padStart(3, '0')}`, `Nombre${i + 12}`),
    );

    const enOrden = [...base, homonimaA, homonimaB, ...resto];
    const intercambiadas = [...base, homonimaB, homonimaA, ...resto];

    const d = dobles(enOrden, (llamada) => (llamada === 0 ? enOrden : intercambiadas));
    const listar = createListWorkGroupMembers({ workGroups: d.workGroups, pagination, log });

    const primera = await listar(actor, GROUP_ID, { page: 1, pageSize: 10 }, NOW);
    const segunda = await listar(actor, GROUP_ID, { page: 2, pageSize: 10 }, NOW);
    const recorrido = [...primera.items, ...segunda.items].map((fila) => fila.id);

    // Una aparece DOS veces y la otra NINGUNA: exactamente lo que el desempate del puerto evita.
    expect(recorrido.filter((id) => id === homonimaA.id)).toHaveLength(2);
    expect(recorrido).not.toContain(homonimaB.id);
    expect(new Set(recorrido).size).toBeLessThan(recorrido.length);
  });

  it('R54 — la pagina de miembros tiene la MISMA forma que la del listado de grupos, y acepta la consulta igual', async () => {
    // QC-85 pagina las dos listas con una sola manera. La del listado de grupos la arma el
    // adaptador driven con `buildPage`; la de miembros la arma el caso de uso con el MISMO
    // `buildPage` inyectado. Aqui se comparan las dos formas, clave por clave.
    const consulta = { page: 2, pageSize: 5 };

    const grupos = {
      listAliveInCompany: vi.fn(async () =>
        buildPage([{ id: GROUP_ID, name: 'Turno noche' }], 6, 2, 5),
      ),
    } as unknown as WorkGroupRepository;

    const paginaDeGrupos = await createListWorkGroups({ workGroups: grupos, log })(actor, consulta);
    const paginaDeMiembros = await pagina(visibles(6), consulta);

    const FORMA = ['items', 'page', 'pageSize', 'total', 'totalPages'];
    expect(Object.keys(paginaDeGrupos).sort()).toEqual(FORMA);
    expect(Object.keys(paginaDeMiembros).sort()).toEqual(FORMA);

    // Y la misma consulta produce la misma pagina y el mismo tamano en las dos listas.
    expect(paginaDeMiembros.page).toBe(paginaDeGrupos.page);
    expect(paginaDeMiembros.pageSize).toBe(paginaDeGrupos.pageSize);
    expect(paginaDeMiembros.total).toBe(paginaDeGrupos.total);
    expect(paginaDeMiembros.totalPages).toBe(paginaDeGrupos.totalPages);
    expect(paginaDeMiembros.items).toHaveLength(1);
  });
});
