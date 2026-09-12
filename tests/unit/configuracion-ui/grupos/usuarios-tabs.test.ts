// QC-85 T2 — La pestana vigente, leida y escrita en la direccion: R1, R2 y R7.
//
// `usuarios-tabs.ts` es PURO a proposito (`design.md > 3`): sin DOM, sin React y sin `next/*`. Por
// eso este archivo no monta nada y puede ejercitar el parametro ausente, repetido, vacio y
// desconocido en unas pocas lineas.
//
// **Ningun literal de copy y ninguna URL escrita a mano** (R41, R3): los dos valores admitidos
// salen de `USUARIOS_TABS`, el nombre del parametro de `TAB_PARAM` y el destino se compara siempre
// contra `USERS_ROUTE`, la constante de la ruta.
//
// **Todo entra por el barrel de la ruta**, nunca por ruta profunda (R38).

import { describe, expect, it } from 'vitest';

import {
  GROUPS_TAB,
  PAGE_PARAM,
  PAGE_SIZE_PARAM,
  SEARCH_PARAM,
  SORT_PARAM,
  STATUS_PARAM,
  TAB_PARAM,
  USERS_TAB,
  USUARIOS_TABS,
  isUsuariosTab,
  parseUsuariosTab,
  usuariosTabHref,
  type UsuariosTab,
} from '@/app/(private)/configuracion/usuarios/components';
import { USERS_ROUTE } from '@/lib/shared/routes';

/** Los parametros de lista de la pestana de personas, que el `href` del conmutador NO arrastra. */
const PARAMETROS_DE_LISTA = [
  PAGE_PARAM,
  PAGE_SIZE_PARAM,
  SORT_PARAM,
  STATUS_PARAM,
  SEARCH_PARAM,
] as const;

/** Consulta del `href` de una pestana, ya descompuesta. */
function consultaDe(tab: UsuariosTab): URLSearchParams {
  const href = usuariosTabHref(tab);
  const separador = href.indexOf('?');
  return new URLSearchParams(separador < 0 ? '' : href.slice(separador + 1));
}

describe('el conmutador declara EXACTAMENTE dos pestanas, y salen de constantes (R1)', () => {
  it('`USUARIOS_TABS` son dos, distintas, y son personas y grupos', () => {
    expect(USUARIOS_TABS).toHaveLength(2);
    expect(new Set(USUARIOS_TABS).size).toBe(2);
    expect([...USUARIOS_TABS]).toEqual([USERS_TAB, GROUPS_TAB]);
  });

  it('el parametro de la direccion es UNO y se nombra con `TAB_PARAM`', () => {
    // El destino de grupos se lee con el nombre de la constante, no con un literal: si manana
    // `TAB_PARAM` cambiara, el parser y el `href` cambiarian juntos o este caso se pondria rojo.
    expect(consultaDe(GROUPS_TAB).get(TAB_PARAM)).toBe(GROUPS_TAB);
    expect(parseUsuariosTab({ [TAB_PARAM]: GROUPS_TAB })).toBe(GROUPS_TAB);
  });

  it('cada pestana vuelve de su propio destino: `parse(href(t)) === t`', () => {
    for (const tab of USUARIOS_TABS) {
      const consulta = consultaDe(tab);
      const crudo = consulta.get(TAB_PARAM);
      const searchParams = crudo === null ? {} : { [TAB_PARAM]: crudo };

      expect(parseUsuariosTab(searchParams), `la pestana ${tab} no vuelve de su href`).toBe(tab);
    }
  });

  it('`isUsuariosTab` admite las dos y nada mas', () => {
    for (const tab of USUARIOS_TABS) expect(isUsuariosTab(tab)).toBe(true);

    expect(isUsuariosTab('Grupos')).toBe(false);
    expect(isUsuariosTab('')).toBe(false);
    expect(isUsuariosTab(undefined)).toBe(false);
  });
});

describe('lo ausente, lo repetido y lo desconocido caen en personas, sin fallar (R2)', () => {
  it('sin `searchParams` y sin el parametro, la pestana es la de personas', () => {
    expect(parseUsuariosTab(undefined)).toBe(USERS_TAB);
    expect(parseUsuariosTab({})).toBe(USERS_TAB);
    expect(parseUsuariosTab({ [PAGE_PARAM]: '3' })).toBe(USERS_TAB);
  });

  it('un valor que no es ninguno de los dos admitidos cae en personas y NO lanza', () => {
    const basura = [
      'cualquier-cosa',
      '',
      '   ',
      'GRUPOS',
      'personas,grupos',
      '__proto__',
      'null',
    ];

    for (const valor of basura) {
      expect(() => parseUsuariosTab({ [TAB_PARAM]: valor })).not.toThrow();
      expect(parseUsuariosTab({ [TAB_PARAM]: valor }), `«${valor}» deberia caer en personas`).toBe(
        USERS_TAB,
      );
    }
  });

  it('de un parametro repetido se toma el PRIMER valor, como en `parseUserListParams`', () => {
    expect(parseUsuariosTab({ [TAB_PARAM]: [GROUPS_TAB, USERS_TAB] })).toBe(GROUPS_TAB);
    expect(parseUsuariosTab({ [TAB_PARAM]: [USERS_TAB, GROUPS_TAB] })).toBe(USERS_TAB);
    // Y si el primero es basura, no se rescata el segundo: la convencion es el primero, punto.
    expect(parseUsuariosTab({ [TAB_PARAM]: ['marciano', GROUPS_TAB] })).toBe(USERS_TAB);
    // Un array vacio es «sin valor», no un error.
    expect(parseUsuariosTab({ [TAB_PARAM]: [] })).toBe(USERS_TAB);
  });
});

describe('el destino sale de la constante de ruta y lleva SOLO `tab` (R7, R3)', () => {
  it('los dos destinos cuelgan de `USERS_ROUTE`: ninguna URL escrita a mano', () => {
    for (const tab of USUARIOS_TABS) {
      expect(usuariosTabHref(tab).startsWith(USERS_ROUTE)).toBe(true);
    }
  });

  it('el `href` de grupos no arrastra pagina, tamano, orden, filtro ni busqueda', () => {
    const consulta = consultaDe(GROUPS_TAB);

    expect([...consulta.keys()]).toEqual([TAB_PARAM]);
    for (const parametro of PARAMETROS_DE_LISTA) {
      expect(consulta.has(parametro), `${parametro} no debe viajar entre pestanas`).toBe(false);
    }
  });

  it('el de personas es el CANONICO sin `tab`, el mismo que produce `userListHref`', () => {
    // Decision de T2, escrita en `usuarios-tabs.ts`: la pestana por defecto ya se sirve sin
    // nombrarla (R2), y `userListHref` —que esta feature no toca (R6)— emite URLs sin `tab`.
    // Emitir `?tab=personas` dejaria dos formas de la misma pestana.
    expect(usuariosTabHref(USERS_TAB)).toBe(USERS_ROUTE);
    expect(usuariosTabHref(USERS_TAB)).not.toContain(`${TAB_PARAM}=`);
  });

  it('y el de grupos SI nombra la pestana: recargar o enlazar no vuelve a personas', () => {
    expect(usuariosTabHref(GROUPS_TAB)).toBe(`${USERS_ROUTE}?${TAB_PARAM}=${GROUPS_TAB}`);
  });
});
