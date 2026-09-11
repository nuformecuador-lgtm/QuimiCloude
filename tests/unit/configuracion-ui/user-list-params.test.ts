// QC-67 T4 — Parser y serializador de los parametros de lista de usuarios: R13, R14, R15, R16 y
// R17.
//
// `user-list-params.ts` es PURO a proposito (`design.md > 5`): sin DOM, sin React y sin `next/*`.
// Por eso este archivo no monta nada y puede ejercitar entrada basura, fuera de rango, un campo de
// orden no declarado y un valor de filtro inventado en unas pocas lineas.
//
// **Los asserts van contra los conjuntos IMPORTADOS del contrato de `identity` y de la tabla
// compartida**, nunca contra literales escritos aqui (R41): si manana el catalogo declara otro
// campo ordenable, este test lo acepta sin tocarse, y si alguien reescribiera la lista a mano en la
// pantalla, dejaria de casar.
//
// **El ancla de R15 esta arriba del todo y es una lista CERRADA**: afirma que `USER_QUERYABLE`
// sigue declarando exactamente esos seis ordenables, ese unico filtrable y `searchable: true`.
// Esta feature NO amplia la lista blanca; ampliarla es de otra ficha, y esa ficha tendra que darse
// de alta aqui a proposito.

import { describe, expect, it } from 'vitest';

import {
  PAGE_PARAM,
  PAGE_SIZE_PARAM,
  SEARCH_PARAM,
  SORT_PARAM,
  STATUS_PARAM,
  ACCOUNT_STATUS_COLUMN_ID,
  buildUserListQuery,
  parseUserListParams,
  userListHref,
} from '@/app/(private)/configuracion/usuarios/components';
import { PAGE_SIZE_OPTIONS, type DataTableParams } from '@/components/shared/data-table';
import { USER_ACCOUNT_STATUSES, USER_QUERYABLE } from '@/lib/modules/identity';
import { DEFAULT_PAGE_SIZE } from '@/lib/shared/pagination';
import { USERS_ROUTE } from '@/lib/shared/routes';

const PRIMERA_PAGINA = 1;

/** Un valor que el conjunto cerrado de estados NO admite, sea cual sea el conjunto de hoy. */
const ESTADO_INVENTADO = 'marciano';

/** Un campo que el contrato NO declara ordenable. */
const CAMPO_NO_ORDENABLE = 'passwordHash';

/** La columna que la pantalla SI pinta pero que NO es un campo del catalogo: es una composicion. */
const COLUMNA_DE_NOMBRE_MOSTRABLE = 'displayName';

/** El rol se pinta, pero no esta en la lista blanca ni para ordenar ni para filtrar. */
const COLUMNA_DE_ROL = 'roleName';

/** Un estado real, tomado del conjunto del contrato y no escrito a mano. */
const ESTADO_PENDIENTE = USER_ACCOUNT_STATUSES[1];

function params(overrides: Partial<DataTableParams> = {}): DataTableParams {
  return {
    page: PRIMERA_PAGINA,
    pageSize: DEFAULT_PAGE_SIZE,
    sort: null,
    filters: {},
    search: '',
    ...overrides,
  };
}

describe('ancla de R15: la lista blanca de consulta de usuarios NO se amplia aqui', () => {
  it('`USER_QUERYABLE` declara exactamente esos seis campos ordenables', () => {
    // Lista CERRADA. Si una ficha futura anade un campo, tiene que darse de alta AQUI: el ancla se
    // tensa nombrando la entrada nueva, nunca se relaja (R39).
    expect([...USER_QUERYABLE.sortable]).toEqual([
      'lastNames',
      'firstNames',
      'username',
      'email',
      'accountStatus',
      'createdAt',
    ]);
  });

  it('declara UN solo filtro, el de estado de cuenta, y de tipo seleccion', () => {
    expect(USER_QUERYABLE.filterable).toEqual({ [ACCOUNT_STATUS_COLUMN_ID]: 'select' });
    // En particular NO hay filtro por rol (R13, alternativa H descartada).
    expect(Object.keys(USER_QUERYABLE.filterable)).not.toContain(COLUMNA_DE_ROL);
  });

  it('el listado busca: `searchable` es true, asi que la caja de busqueda no miente (R12)', () => {
    expect(USER_QUERYABLE.searchable).toBe(true);
  });

  it('el conjunto de estados es el cerrado del modulo, y el parser lo usa TAL CUAL', () => {
    expect([...USER_ACCOUNT_STATUSES]).toEqual(['active', 'pending', 'inactive', 'blocked']);
  });

  it('los dos tamanos de pagina son 10 y 25, y el de por defecto es el primero (R16)', () => {
    expect([...PAGE_SIZE_OPTIONS]).toEqual([10, 25]);
    expect(DEFAULT_PAGE_SIZE).toBe(PAGE_SIZE_OPTIONS[0]);
  });
});

describe('ida y vuelta: `parse(build(p))` devuelve `p` (R17)', () => {
  const casos: readonly DataTableParams[] = [
    params(),
    params({ page: 3, pageSize: PAGE_SIZE_OPTIONS[1] }),
    params({ sort: { columnId: USER_QUERYABLE.sortable[0], direction: 'desc' } }),
    params({ search: 'lopez' }),
    params({
      filters: { [ACCOUNT_STATUS_COLUMN_ID]: { kind: 'select', values: [ESTADO_PENDIENTE] } },
    }),
    params({
      page: 2,
      pageSize: PAGE_SIZE_OPTIONS[1],
      sort: { columnId: 'email', direction: 'asc' },
      filters: {
        [ACCOUNT_STATUS_COLUMN_ID]: { kind: 'select', values: [...USER_ACCOUNT_STATUSES] },
      },
      search: 'lopez',
    }),
  ];

  for (const [indice, caso] of casos.entries()) {
    it(`el caso ${indice} sobrevive a serializar y volver a leer`, () => {
      const leidos = parseUserListParams(
        Object.fromEntries(new URLSearchParams(buildUserListQuery(caso))),
      );

      expect(leidos).toEqual(caso);
    });
  }
});

describe('la paginacion se acota y nunca falla (R16, R17)', () => {
  const entradasDePagina = ['0', '-1', '1e3', '1.5', '0x2', ' 2 ', '', 'abc', '9007199254740993'];

  for (const entrada of entradasDePagina) {
    it(`\`page=${JSON.stringify(entrada)}\` cae a la primera pagina sin error`, () => {
      expect(parseUserListParams({ [PAGE_PARAM]: entrada }).page).toBe(PRIMERA_PAGINA);
    });
  }

  it('una pagina valida se respeta', () => {
    expect(parseUserListParams({ [PAGE_PARAM]: '7' }).page).toBe(7);
  });

  it('un tamano que no esta entre los dos admitidos cae al de por defecto', () => {
    expect(parseUserListParams({ [PAGE_SIZE_PARAM]: '7' }).pageSize).toBe(DEFAULT_PAGE_SIZE);
    expect(parseUserListParams({ [PAGE_SIZE_PARAM]: '1000' }).pageSize).toBe(DEFAULT_PAGE_SIZE);
  });

  it('los dos tamanos admitidos se respetan', () => {
    for (const opcion of PAGE_SIZE_OPTIONS) {
      expect(parseUserListParams({ [PAGE_SIZE_PARAM]: String(opcion) }).pageSize).toBe(opcion);
    }
  });

  it('un parametro repetido toma el PRIMER valor, como `URLSearchParams.get`', () => {
    expect(parseUserListParams({ [PAGE_PARAM]: ['4', '9'] }).page).toBe(4);
  });
});

describe('el orden se valida contra la lista blanca IMPORTADA (R14, R15)', () => {
  for (const campo of USER_QUERYABLE.sortable) {
    it(`\`${campo}\` es un orden aceptado porque el contrato lo declara`, () => {
      expect(parseUserListParams({ [SORT_PARAM]: `${campo}:desc` }).sort).toEqual({
        columnId: campo,
        direction: 'desc',
      });
    });
  }

  it('un campo no declarado es «sin orden», no un error', () => {
    expect(parseUserListParams({ [SORT_PARAM]: `${CAMPO_NO_ORDENABLE}:asc` }).sort).toBeNull();
  });

  it('el nombre mostrable no ordena: es una composicion, no una columna', () => {
    expect(USER_QUERYABLE.sortable).not.toContain(COLUMNA_DE_NOMBRE_MOSTRABLE);
    expect(
      parseUserListParams({ [SORT_PARAM]: `${COLUMNA_DE_NOMBRE_MOSTRABLE}:asc` }).sort,
    ).toBeNull();
  });

  it('el rol tampoco ordena: no esta en la lista blanca', () => {
    expect(USER_QUERYABLE.sortable).not.toContain(COLUMNA_DE_ROL);
    expect(parseUserListParams({ [SORT_PARAM]: `${COLUMNA_DE_ROL}:asc` }).sort).toBeNull();
  });

  it('una direccion desconocida, un separador ausente o un campo vacio son «sin orden»', () => {
    for (const entrada of ['email:arriba', 'email', ':asc', '', 'email:', 'email:asc:desc']) {
      expect(parseUserListParams({ [SORT_PARAM]: entrada }).sort).toBeNull();
    }
  });
});

describe('el filtro de estado es multivalor y descarta lo desconocido UNO A UNO (R13, R17)', () => {
  it('varios valores validos entran todos', () => {
    expect(
      parseUserListParams({ [STATUS_PARAM]: `${USER_ACCOUNT_STATUSES[1]},${USER_ACCOUNT_STATUSES[3]}` })
        .filters[ACCOUNT_STATUS_COLUMN_ID],
    ).toEqual({ kind: 'select', values: [USER_ACCOUNT_STATUSES[1], USER_ACCOUNT_STATUSES[3]] });
  });

  it('`status=pending,marciano` conserva `pending` y descarta el desconocido', () => {
    expect(
      parseUserListParams({ [STATUS_PARAM]: `${ESTADO_PENDIENTE},${ESTADO_INVENTADO}` }).filters[
        ACCOUNT_STATUS_COLUMN_ID
      ],
    ).toEqual({ kind: 'select', values: [ESTADO_PENDIENTE] });
  });

  it('`status=marciano` es «sin filtro», no un filtro que no case con nada', () => {
    expect(parseUserListParams({ [STATUS_PARAM]: ESTADO_INVENTADO }).filters).toEqual({});
  });

  it('una lista vacia, de comas o de espacios tampoco produce filtro ni error', () => {
    for (const entrada of ['', ',', ' , , ', '   ']) {
      expect(parseUserListParams({ [STATUS_PARAM]: entrada }).filters).toEqual({});
    }
  });

  it('los repetidos se colapsan: el mismo estado dos veces filtra una', () => {
    expect(
      parseUserListParams({ [STATUS_PARAM]: `${ESTADO_PENDIENTE},${ESTADO_PENDIENTE}` }).filters[
        ACCOUNT_STATUS_COLUMN_ID
      ],
    ).toEqual({ kind: 'select', values: [ESTADO_PENDIENTE] });
  });

  it('NO se lee ningun otro filtro: el rol que llegue por la URL se ignora (R13, R15)', () => {
    expect(parseUserListParams({ [STATUS_PARAM]: ESTADO_PENDIENTE, roleName: 'Administrador' })
      .filters).toEqual({
      [ACCOUNT_STATUS_COLUMN_ID]: { kind: 'select', values: [ESTADO_PENDIENTE] },
    });
  });
});

describe('la busqueda se lee y se normaliza (R12)', () => {
  it('un termino con espacios alrededor se recorta', () => {
    expect(parseUserListParams({ [SEARCH_PARAM]: '  lopez  ' }).search).toBe('lopez');
  });

  it('solo espacios es no buscar, y no se emite en la URL canonica', () => {
    expect(parseUserListParams({ [SEARCH_PARAM]: '   ' }).search).toBe('');
    expect(buildUserListQuery(params({ search: '   ' }))).not.toContain(`${SEARCH_PARAM}=`);
  });

  it('sin parametro, la busqueda es cadena vacia', () => {
    expect(parseUserListParams(undefined).search).toBe('');
  });
});

describe('ninguna entrada produce un error (R17)', () => {
  const basura: readonly Record<string, string | readonly string[] | undefined>[] = [
    {},
    { [PAGE_PARAM]: 'NaN', [PAGE_SIZE_PARAM]: '-3', [SORT_PARAM]: '::', [STATUS_PARAM]: '@@' },
    { [PAGE_PARAM]: [], [SORT_PARAM]: undefined, [STATUS_PARAM]: [ESTADO_INVENTADO] },
    { [SEARCH_PARAM]: 'a'.repeat(5000) },
    { desconocido: 'lo-que-sea' },
  ];

  for (const [indice, entrada] of basura.entries()) {
    it(`la entrada ${indice} produce una lista, no una excepcion`, () => {
      expect(() => parseUserListParams(entrada)).not.toThrow();
      expect(parseUserListParams(entrada).page).toBeGreaterThanOrEqual(PRIMERA_PAGINA);
    });
  }

  it('sin `searchParams` en absoluto devuelve los valores por defecto', () => {
    expect(parseUserListParams(undefined)).toEqual(params());
  });
});

describe('el destino se DERIVA de la constante de ruta (R1)', () => {
  it('`userListHref` empieza por `USERS_ROUTE` y lleva la cadena canonica', () => {
    const vigentes = params({ page: 2 });

    expect(userListHref(vigentes)).toBe(`${USERS_ROUTE}?${buildUserListQuery(vigentes)}`);
  });

  it('la cadena canonica siempre emite pagina y tamano', () => {
    const query = new URLSearchParams(buildUserListQuery(params()));

    expect(query.get(PAGE_PARAM)).toBe(String(PRIMERA_PAGINA));
    expect(query.get(PAGE_SIZE_PARAM)).toBe(String(DEFAULT_PAGE_SIZE));
    expect(query.get(SORT_PARAM)).toBeNull();
    expect(query.get(STATUS_PARAM)).toBeNull();
  });
});
