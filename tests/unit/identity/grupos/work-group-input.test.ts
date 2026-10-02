// QC-84 T3 — El BORDE de los grupos de trabajo: los cuatro esquemas de entrada y los dos tipos de
// salida (`design.md > 4.1` y `> 4.3`).
//
// Cubre R11, R14, R26, R27 (la firma), R33.
//
// Lo que se vigila aqui no es solo lo que los esquemas ACEPTAN, sino lo que RECHAZAN: la mitad de
// los requisitos es lo que NO puede entrar —la empresa (R11), la marca de baja (R40), el nombre
// normalizado (R13) y **cualquier lista de miembros** (R33)—. Por eso los cuatro esquemas son
// `strictObject`: con `object`, una clave desconocida se DESCARTA en silencio y el test quedaria
// verde mientras el llamante cree que mando una empresa. Aqui cada uno de esos campos hace FALLAR
// el `parse`.
//
// De los dos tipos de salida se afirman las claves EXACTAS, no solo que falten algunas (R26, R19):
// el `Record<keyof ...>` lo hace ademas un error de compilacion, asi que anadir `deletedAt` al
// tipo no puede pasar por aqui sin que algo se ponga rojo.
//
// Se importa por la ruta profunda de `domain/` y no por el contrato del modulo: quien reexporta
// desde `lib/modules/identity/index.ts` es T10, y este test no debe adelantarlo.

import {
  WORK_GROUP_NAME_MAX_LENGTH,
  createWorkGroupSchema,
  deleteWorkGroupSchema,
  renameWorkGroupSchema,
  workGroupMemberSchema,
} from '@/lib/modules/identity/domain/work-group-input';
import {
  WORK_GROUP_MEMBER_QUERYABLE,
  WORK_GROUP_QUERYABLE,
} from '@/lib/modules/identity/domain/work-group-queryable';
import type {
  WorkGroupMemberRow,
  WorkGroupRow,
} from '@/lib/modules/identity/domain/work-group-view';

const GRUPO_ID = '11111111-1111-4111-8111-111111111111';
const PERSONA_ID = '22222222-2222-4222-8222-222222222222';

/**
 * Los campos que NINGUN esquema del borde puede aceptar. `members` y `userIds` son R33 —la
 * decision 6, que descarto mandar el conjunto completo—; `companyId` es R11; los otros dos son el
 * estado de la fila, que decide el sistema y no el llamante (R10, R13, R40).
 */
const PROHIBIDOS: Readonly<Record<string, unknown>> = {
  companyId: '33333333-3333-4333-8333-333333333333',
  deletedAt: '2026-09-11T00:00:00.000Z',
  nameNormalized: 'turnonoche',
  members: [PERSONA_ID],
  userIds: [PERSONA_ID],
  memberIds: [PERSONA_ID],
};

describe('createWorkGroupSchema (QC-84 T3)', () => {
  it('acepta un nombre valido y lo devuelve recortado', () => {
    const resultado = createWorkGroupSchema.safeParse({ name: '  Turno noche  ' });

    expect(resultado.success).toBe(true);
    expect(resultado.success && resultado.data).toEqual({ name: 'Turno noche' });
  });

  // R14: el nombre vacio o de solo espacios se rechaza EN EL BORDE, asi que no llega a escribirse
  // ninguna fila. El `trim()` va antes del `min(1)`: al reves, '   ' pasaria.
  it.each(['', '   ', '\t\n'])('rechaza el nombre vacio o de solo espacios (%j)', (name) => {
    expect(createWorkGroupSchema.safeParse({ name }).success).toBe(false);
  });

  it('rechaza un nombre mas largo que el tope y acepta uno de exactamente el tope', () => {
    const justo = 'a'.repeat(WORK_GROUP_NAME_MAX_LENGTH);

    expect(createWorkGroupSchema.safeParse({ name: justo }).success).toBe(true);
    expect(createWorkGroupSchema.safeParse({ name: `${justo}a` }).success).toBe(false);
  });

  it('rechaza que falte el nombre y que no sea texto', () => {
    expect(createWorkGroupSchema.safeParse({}).success).toBe(false);
    expect(createWorkGroupSchema.safeParse({ name: 42 }).success).toBe(false);
  });

  // R11 y R33, el corazon de este archivo: mandar la empresa, la marca de baja o una LISTA DE
  // MIEMBROS no se ignora, FALLA. La empresa sale del actor; el conjunto completo de miembros no
  // es expresable por ningun borde de esta feature.
  it.each(Object.keys(PROHIBIDOS))('rechaza el campo prohibido %s en el alta', (campo) => {
    const entrada = { name: 'Turno noche', [campo]: PROHIBIDOS[campo] };

    expect(createWorkGroupSchema.safeParse(entrada).success, `debe RECHAZAR ${campo}`).toBe(false);
  });
});

describe('renameWorkGroupSchema (QC-84 T3)', () => {
  it('acepta el grupo y su nombre nuevo, recortado', () => {
    const resultado = renameWorkGroupSchema.safeParse({
      workGroupId: GRUPO_ID,
      name: '  Turno tarde ',
    });

    expect(resultado.success).toBe(true);
    expect(resultado.success && resultado.data).toEqual({
      workGroupId: GRUPO_ID,
      name: 'Turno tarde',
    });
  });

  it('exige que el identificador del grupo sea un UUID', () => {
    expect(
      renameWorkGroupSchema.safeParse({ workGroupId: 'no-es-uuid', name: 'Turno tarde' }).success,
    ).toBe(false);
  });

  it.each(['', '   '])('rechaza el nombre vacio o de solo espacios al renombrar (%j)', (name) => {
    expect(renameWorkGroupSchema.safeParse({ workGroupId: GRUPO_ID, name }).success).toBe(false);
  });

  // R33: renombrar NO acepta la lista de miembros. Editar el nombre y el conjunto a la vez es
  // exactamente lo que la decision 6 descarto, y aqui es inexpresable.
  it.each(Object.keys(PROHIBIDOS))('rechaza el campo prohibido %s al renombrar', (campo) => {
    const entrada = { workGroupId: GRUPO_ID, name: 'Turno tarde', [campo]: PROHIBIDOS[campo] };

    expect(renameWorkGroupSchema.safeParse(entrada).success, `debe RECHAZAR ${campo}`).toBe(false);
  });
});

describe('workGroupMemberSchema (QC-84 T3)', () => {
  // R33: la entrada de meter y de sacar es la de UNA persona. No hay forma de nombrar a varias.
  it('acepta exactamente un grupo y una persona', () => {
    const resultado = workGroupMemberSchema.safeParse({
      workGroupId: GRUPO_ID,
      userId: PERSONA_ID,
    });

    expect(resultado.success).toBe(true);
    expect(resultado.success && resultado.data).toEqual({
      workGroupId: GRUPO_ID,
      userId: PERSONA_ID,
    });
  });

  it('exige que los dos identificadores sean UUID y que no falte ninguno', () => {
    expect(workGroupMemberSchema.safeParse({ workGroupId: GRUPO_ID }).success).toBe(false);
    expect(workGroupMemberSchema.safeParse({ userId: PERSONA_ID }).success).toBe(false);
    expect(
      workGroupMemberSchema.safeParse({ workGroupId: GRUPO_ID, userId: 'no-es-uuid' }).success,
    ).toBe(false);
  });

  // R33 otra vez, y es el caso mas importante del archivo: una LISTA de personas no pasa, ni
  // siquiera en el campo que si existe. `userId` es uno, no muchos.
  it('rechaza una lista de personas donde espera una sola', () => {
    expect(
      workGroupMemberSchema.safeParse({ workGroupId: GRUPO_ID, userId: [PERSONA_ID] }).success,
    ).toBe(false);
  });

  it.each(Object.keys(PROHIBIDOS))('rechaza el campo prohibido %s en la pertenencia', (campo) => {
    const entrada = { workGroupId: GRUPO_ID, userId: PERSONA_ID, [campo]: PROHIBIDOS[campo] };

    expect(workGroupMemberSchema.safeParse(entrada).success, `debe RECHAZAR ${campo}`).toBe(false);
  });
});

describe('deleteWorkGroupSchema (QC-84 T3)', () => {
  it('acepta solo el identificador del grupo', () => {
    const resultado = deleteWorkGroupSchema.safeParse({ workGroupId: GRUPO_ID });

    expect(resultado.success).toBe(true);
    expect(resultado.success && resultado.data).toEqual({ workGroupId: GRUPO_ID });
  });

  // R40: no hay ninguna bandera con la que pedir lo contrario de dar de baja. Restaurar no existe,
  // y el borde no deja ni nombrarlo.
  it.each([...Object.keys(PROHIBIDOS), 'restore', 'deleted'])(
    'rechaza el campo prohibido %s al dar de baja',
    (campo) => {
      const entrada = { workGroupId: GRUPO_ID, [campo]: PROHIBIDOS[campo] ?? true };

      expect(deleteWorkGroupSchema.safeParse(entrada).success, `debe RECHAZAR ${campo}`).toBe(false);
    },
  );

  it('exige que el identificador sea un UUID y que no falte', () => {
    expect(deleteWorkGroupSchema.safeParse({}).success).toBe(false);
    expect(deleteWorkGroupSchema.safeParse({ workGroupId: 'no-es-uuid' }).success).toBe(false);
  });
});

describe('tipos de salida de las dos consultas (QC-84 T3)', () => {
  // El `Record<keyof ...>` es la mitad que vigila el COMPILADOR: si al tipo le falta una clave o
  // le sobra otra, esto no compila. El `expect` de abajo es la mitad que vigila el CONTENIDO: fija
  // la lista exacta, para que anadir una clave al tipo y al `Record` a la vez tampoco pase
  // inadvertido (R19, R26).
  const CLAVES_DE_GRUPO: Record<keyof WorkGroupRow, true> = {
    id: true,
    name: true,
    members: true,
  };

  const CLAVES_DE_MIEMBRO: Record<keyof WorkGroupMemberRow, true> = {
    id: true,
    displayName: true,
  };

  /** Ninguno de estos puede estar en ninguna de las dos proyecciones (R19, R26). */
  const NUNCA: readonly string[] = [
    'nameNormalized',
    'companyId',
    'deletedAt',
    'createdAt',
    'updatedAt',
    'accountStatus',
    'passwordHash',
    'email',
    'lockedUntil',
  ];

  it('la fila del listado trae el identificador, el nombre y sus miembros, y nada mas (R26)', () => {
    expect(Object.keys(CLAVES_DE_GRUPO)).toEqual(['id', 'name', 'members']);
    for (const campo of NUNCA) {
      expect(Object.keys(CLAVES_DE_GRUPO), `WorkGroupRow no puede traer ${campo}`).not.toContain(
        campo,
      );
    }
  });

  it('la fila de miembro trae el identificador y el nombre mostrable, y nada mas (R19)', () => {
    expect(Object.keys(CLAVES_DE_MIEMBRO)).toEqual(['id', 'displayName']);
    for (const campo of NUNCA) {
      expect(
        Object.keys(CLAVES_DE_MIEMBRO),
        `WorkGroupMemberRow no puede traer ${campo}`,
      ).not.toContain(campo);
    }
  });
});

describe('las dos listas blancas de campos consultables (QC-84 T4)', () => {
  // R27: la firma del listado es la del contrato compartido de QC-57 —pagina, tamano, busqueda,
  // filtro y orden en UNA sola forma—, asi que declarar un campo consultable mas es una linea en
  // la lista blanca y **no cambia la forma de la consulta**. Lo que este test fija es el contenido
  // de esas listas; que `sanitizeListQuery` las respete lo demuestra
  // `tests/guards/guard-contrato-listados.test.ts`, que NO se toca en esta ficha.
  it('el listado de grupos ordena por nombre y por fecha de alta, no declara filtros y busca', () => {
    expect(WORK_GROUP_QUERYABLE.sortable).toEqual(['name', 'createdAt']);
    expect(WORK_GROUP_QUERYABLE.filterable).toEqual({});
    expect(WORK_GROUP_QUERYABLE.searchable).toBe(true);
  });

  // R22: el orden de los miembros es FIJO —apellidos, nombres, identificador—, asi que la lista de
  // ordenables esta vacia a proposito. R54: de la consulta compartida, esta solo usa la pagina y
  // el tamano.
  it('la lista de miembros no declara orden, ni filtro, ni busqueda', () => {
    expect(WORK_GROUP_MEMBER_QUERYABLE.sortable).toEqual([]);
    expect(WORK_GROUP_MEMBER_QUERYABLE.filterable).toEqual({});
    expect(WORK_GROUP_MEMBER_QUERYABLE.searchable).toBe(false);
  });

  // R9, R40: `deletedAt` no esta en ninguna de las dos listas. `NEVER_QUERYABLE`, dentro de
  // `list-query.ts`, lo bloquea ademas por su cuenta: son dos defensas, no una redundancia.
  it('deletedAt no es consultable por ninguna de las dos listas', () => {
    for (const lista of [WORK_GROUP_QUERYABLE, WORK_GROUP_MEMBER_QUERYABLE]) {
      expect(lista.sortable).not.toContain('deletedAt');
      expect(Object.keys(lista.filterable)).not.toContain('deletedAt');
    }
  });
});
