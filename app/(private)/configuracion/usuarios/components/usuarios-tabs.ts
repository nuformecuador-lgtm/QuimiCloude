import { USERS_ROUTE } from '@/lib/shared/routes';

import type { UserListSearchParams } from './user-list-params';

/**
 * La pestana vigente de la pantalla de usuarios, leida y escrita en la DIRECCION (R1, R2, R3, R7;
 * `design.md > 3`).
 *
 * **Sin DOM, sin React y sin `next/*` a proposito.** Es el hermano de `user-list-params.ts`: que
 * estas dos funciones sean puras es lo que permite probar R2 —lo desconocido cae a personas y no
 * lanza— sin montar la pantalla, y lo que deja que las use tanto el Server Component que decide
 * que seccion pintar como el conmutador de cliente que navega.
 *
 * **Los dos valores admitidos viven aqui y en ningun otro sitio** (R1): el conmutador, el parser,
 * la pagina y los tests salen de `USUARIOS_TABS`, nunca de un literal escrito a mano en cada
 * consumidor.
 *
 * **El patron nace en la carpeta de la ruta, no en `components/shared/`** (`design.md > 10.4`):
 * esta es la primera pantalla de Configuracion con pestanas y generalizar con un solo consumidor
 * seria inventar una abstraccion sin evidencia.
 */

/** Nombre del UNICO parametro de consulta que nombra la pestana. Una sola constante (R1). */
export const TAB_PARAM = 'tab';

/** La pestana de personas: el contenido que la pantalla ya tenia, y la pestana POR DEFECTO (R2). */
export const USERS_TAB = 'personas';

/** La pestana de grupos: el contenido que esta feature anade. */
export const GROUPS_TAB = 'grupos';

/** Las dos pestanas, en el orden en que se presentan. Exactamente dos, ni una mas (R1). */
export const USUARIOS_TABS = [USERS_TAB, GROUPS_TAB] as const;

export type UsuariosTab = (typeof USUARIOS_TABS)[number];

/**
 * De un parametro repetido se toma el PRIMER valor, **la misma convencion que
 * `parseUserListParams`**: la de `URLSearchParams.get`. Dos convenciones distintas en la misma
 * pantalla —una para `page` y otra para `tab`— serian dos formas de leer la misma URL.
 */
function firstValue(raw: string | readonly string[] | undefined): string | undefined {
  if (raw === undefined) return undefined;
  return typeof raw === 'string' ? raw : raw[0];
}

/** Si un texto cualquiera es una de las dos pestanas. Sirve de estrechamiento de tipo. */
export function isUsuariosTab(value: string | undefined): value is UsuariosTab {
  return USUARIOS_TABS.some((tab) => tab === value);
}

/**
 * La pestana que la direccion pide, **siempre una de las dos** (R2, R17): ausente, repetida,
 * vacia o desconocida no son un error, son la pestana de personas. Esta funcion no lanza nunca.
 */
export function parseUsuariosTab(searchParams: UserListSearchParams | undefined): UsuariosTab {
  const raw = firstValue(searchParams?.[TAB_PARAM]);
  return isUsuariosTab(raw) ? raw : USERS_TAB;
}

/**
 * Destino de una pestana. **Derivado de `USERS_ROUTE`** (R3): ningun archivo de producto incrusta
 * la URL como literal.
 *
 * **Emite SOLO el parametro `tab`** (R7): ni `page`, ni `pageSize`, ni `sort`, ni `q`, ni
 * `status`. Los parametros de lista de cada pestana son independientes, y arrastrar los de la
 * lista de origen a la de destino nombraria campos que la otra lista blanca no declara.
 *
 * **Para personas emite el href CANONICO, sin `tab`**, y esa es la coherencia con
 * `userListHref`: la pestana por defecto (R2) ya se sirve sin nombrarla, y `userListHref` —que
 * esta feature no toca (R6)— produce URLs sin `tab`. Emitir `?tab=personas` aqui dejaria dos
 * formas de la misma pestana, una de las cuales la propia tabla de personas borraria en cuanto el
 * usuario cambiara de pagina. Mismo criterio que `buildUserListQuery` con la busqueda vacia: de
 * cada estado, una sola URL canonica.
 */
export function usuariosTabHref(tab: UsuariosTab): string {
  if (tab === USERS_TAB) return USERS_ROUTE;
  return `${USERS_ROUTE}?${new URLSearchParams({ [TAB_PARAM]: tab }).toString()}`;
}
