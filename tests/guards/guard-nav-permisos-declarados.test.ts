// QC-75 T3 — Guardia: todo enlace del menu declara un permiso que EXISTE en el catalogo (R20).
//
// `NavLink.permission` esta tipado como `string` y no como `PermissionCode`, y no por comodidad:
// `lib/shared/**` NO puede importar `lib/modules/**` (`docs/architecture.md > La regla de
// dependencias`), asi que la union de literales de `identity/domain/permissions.ts` no llega hasta
// la navegacion. La cadena deja un hueco de la peor clase: `'pedidos.consultarr'` compila, no casa
// con ningun permiso real y **oculta el item para todo el mundo en silencio** — nada se pone rojo,
// simplemente ese modulo desaparece del menu de todos.
//
// Esta guardia es lo que cierra ese hueco. Importa a la vez `PERMISSIONS` de
// `@/lib/modules/identity` y `PRIVATE_NAV_ITEMS` de `@/lib/shared/navigation/private-nav`:
// **cruzar esas dos capas es algo que solo `tests/` puede hacer**, y ese es exactamente el motivo
// de que la guardia exista y de que viva aqui y no en produccion. Es el sustituto ejecutable del
// tipo que no se puede escribir.
//
// Mismo patron que `guard-rutas-privadas-cubiertas.test.ts`: funciones puras exportadas, casos
// sinteticos que demuestran que la regla dispara Y el simetrico que no la viola, y un ancla
// anti-vacuidad para que un recorrido roto se note en vez de pasar en verde.

import { describe, expect, it } from 'vitest';

import { PERMISSIONS } from '@/lib/modules/identity';
import { PRIVATE_NAV_ITEMS, type NavItem, type NavLink } from '@/lib/shared/navigation/private-nav';

/** Los codigos del catalogo cerrado de QC-74, como cadenas sueltas. */
const CODIGOS_VALIDOS: readonly string[] = PERMISSIONS.map((permiso) => permiso.code);

/**
 * Todos los `NavLink` del arbol, aplanando los grupos. **Entra en los hijos**: un enlace escondido
 * dentro de un submenu es tan visible en pantalla como uno de nivel superior.
 */
export function flattenNavLinks(items: readonly NavItem[]): readonly NavLink[] {
  return items.flatMap((item) => (item.kind === 'link' ? [item] : flattenNavLinks(item.items)));
}

/**
 * Descriptores legibles de los enlaces infractores: los que declaran un permiso que no esta en el
 * catalogo y los que no declaran ninguno.
 *
 * Devuelve texto y no booleanos a proposito: cuando la guardia se pone roja, lo primero que hace
 * falta es el `testId` del item y el codigo que escribio mal, no un `expected true to be false`.
 */
export function findUndeclaredNavPermissions(
  items: readonly NavItem[],
  codigosValidos: readonly string[],
): readonly string[] {
  return flattenNavLinks(items)
    .filter((enlace) => !codigosValidos.includes(enlace.permission))
    .map((enlace) => {
      const declarado =
        typeof enlace.permission === 'string' && enlace.permission.trim() !== ''
          ? enlace.permission
          : 'sin permiso';
      return `${enlace.testId} (${declarado})`;
    });
}

// Fixtures sinteticas: `testId` con prefijo `fx-` para que nadie las confunda con el menu real.
const ENLACE_VALIDO: NavLink = {
  kind: 'link',
  href: '/valido',
  label: 'Valido',
  testId: 'fx-valido',
  permission: 'inventario.consultar',
};

const ENLACE_CODIGO_INVENTADO: NavLink = {
  kind: 'link',
  href: '/pedidos',
  label: 'Pedidos',
  testId: 'fx-pedidos',
  // Una letra de mas: es el error real que esta guardia existe para cazar.
  permission: 'pedidos.consultarr',
};

// Un enlace que no declara permiso ya no compila (el campo es obligatorio desde QC-75 T1), asi que
// el unico modo de construirlo es forzando el tipo. Se hace aqui, en un caso sintetico, para
// demostrar que la guardia tambien lo cazaria si alguien desactivara la comprobacion de tipos o si
// el dato llegara de fuera de TypeScript.
const ENLACE_SIN_PERMISO = {
  kind: 'link',
  href: '/olvidado',
  label: 'Olvidado',
  testId: 'fx-olvidado',
} as unknown as NavLink;

describe('guardia — los permisos declarados en el menu existen en el catalogo (R20)', () => {
  // AMPLIADA el 2026-09-08 (QC-45 T2): el sexto enlace es «Presentaciones», unico item de la
  // seccion «Configuración», que declara `inventario.modificar`.
  it('ancla: el recorrido encuentra hoy los seis enlaces reales del menu', () => {
    // Anti-vacuidad. Si el recorrido se rompiera —un grupo que deja de visitarse, un cambio de
    // forma en `PRIVATE_NAV_ITEMS`—, `findUndeclaredNavPermissions` devolveria [] sobre una lista
    // vacia y la guardia pasaria en verde sin comprobar nada. Esto lo convierte en rojo.
    const enlaces = flattenNavLinks(PRIVATE_NAV_ITEMS);

    expect(enlaces).toHaveLength(6);
    expect(enlaces.map((enlace) => enlace.testId).sort()).toEqual([
      'nav-dashboard',
      'nav-inventario',
      'nav-pedidos',
      'nav-presentaciones',
      'nav-produccion-recetas',
      'nav-proveedores',
    ]);
  });

  it('el catalogo importado no esta vacio: la lista contra la que se compara es real', () => {
    // Segunda anti-vacuidad: con `CODIGOS_VALIDOS` vacio la regla diria que TODO es invalido, y
    // con la comparacion invertida diria que todo vale. Se ancla el tamaño del catalogo cerrado.
    expect(CODIGOS_VALIDOS).toHaveLength(10);
    expect(CODIGOS_VALIDOS).toContain('inventario.consultar');
  });

  it('el arbol real no tiene ningun enlace con permiso desconocido ni sin permiso', () => {
    const infractores = findUndeclaredNavPermissions(PRIVATE_NAV_ITEMS, CODIGOS_VALIDOS);

    expect(
      infractores,
      infractores.length === 0
        ? undefined
        : `Estos enlaces de PRIVATE_NAV_ITEMS declaran un permiso que NO esta en el catalogo de ` +
            `QC-74 (lib/modules/identity/domain/permissions.ts): ${infractores.join(', ')}. ` +
            'Como el campo esta tipado `string` —lib/shared no puede importar lib/modules—, ' +
            'TypeScript no lo ve: el item simplemente desapareceria del menu de todo el mundo. ' +
            'Corrige el codigo en lib/shared/navigation/private-nav.ts (QC-75 R5, R20).',
    ).toEqual([]);
  });

  it('el recorrido entra en los hijos de un grupo, no solo en el nivel superior', () => {
    const conGrupo: readonly NavItem[] = [
      { kind: 'group', label: 'Grupo', testId: 'fx-grupo', items: [ENLACE_VALIDO] },
    ];

    expect(flattenNavLinks(conGrupo).map((enlace) => enlace.testId)).toEqual(['fx-valido']);
  });

  it('dispara con un enlace cuyo permiso no esta en el catalogo, y no con el que si lo esta', () => {
    expect(findUndeclaredNavPermissions([ENLACE_CODIGO_INVENTADO], CODIGOS_VALIDOS)).toEqual([
      'fx-pedidos (pedidos.consultarr)',
    ]);
    expect(findUndeclaredNavPermissions([ENLACE_VALIDO], CODIGOS_VALIDOS)).toEqual([]);
  });

  it('dispara con un enlace que no declara ningun permiso, tambien dentro de un grupo', () => {
    const conGrupo: readonly NavItem[] = [
      ENLACE_VALIDO,
      {
        kind: 'group',
        label: 'Grupo',
        testId: 'fx-grupo',
        items: [ENLACE_VALIDO, ENLACE_SIN_PERMISO],
      },
    ];

    expect(findUndeclaredNavPermissions(conGrupo, CODIGOS_VALIDOS)).toEqual([
      'fx-olvidado (sin permiso)',
    ]);
  });

  it('un enlace de nivel superior sin permiso tambien se caza, y se reporta cada infractor', () => {
    expect(
      findUndeclaredNavPermissions([ENLACE_SIN_PERMISO, ENLACE_CODIGO_INVENTADO], CODIGOS_VALIDOS),
    ).toEqual(['fx-olvidado (sin permiso)', 'fx-pedidos (pedidos.consultarr)']);
  });
});
