// QC-75 T2 — las dos funciones puras de la navegacion (R1, R3, R4, R11).
//
// Viven en `lib/shared/navigation/private-nav.ts` y no en `AppSidebar` porque la fuente decide y
// el componente dibuja (decision cerrada nº 7). Por eso se prueban aqui, sin render, sin jsdom y
// sin mocks: son un `filter` y un recorrido, y lo que hay que demostrar es la REGLA, no la vista.
//
// La mayoria de los casos usan fixtures sinteticas —reconocibles como dato de prueba— para que el
// dia que cambie el menu real no se caiga la prueba de la regla. Al final hay un caso sobre
// `PRIVATE_NAV_ITEMS` de verdad: es el que ata la regla al arbol que se sirve.

import { describe, expect, it } from 'vitest';

import { INVENTORY_ROUTE } from '@/lib/shared/routes';
import {
  filterNavItemsByPermissions,
  firstVisibleNavHref,
  PRIVATE_NAV_ITEMS,
  type NavItem,
} from '@/lib/shared/navigation/private-nav';

const SECCION_A = 'Seccion A';
const SECCION_B = 'Seccion B';

/**
 * Menu sintetico: dos enlaces sueltos en secciones distintas y un grupo de dos hijos con permisos
 * distintos. Basta para todos los casos de la regla.
 */
function menuFixture(): readonly NavItem[] {
  return [
    {
      kind: 'link',
      href: '/uno',
      label: 'Uno',
      testId: 'fx-uno',
      permission: 'inventario.consultar',
      icon: 'package',
      section: SECCION_A,
    },
    {
      kind: 'link',
      href: '/dos',
      label: 'Dos',
      testId: 'fx-dos',
      permission: 'pedidos.consultar',
      icon: 'clipboard-list',
      section: SECCION_A,
    },
    {
      kind: 'group',
      label: 'Grupo',
      testId: 'fx-grupo',
      icon: 'factory',
      section: SECCION_B,
      items: [
        {
          kind: 'link',
          href: '/grupo/hijo-a',
          label: 'Hijo A',
          testId: 'fx-hijo-a',
          permission: 'recetas.consultar',
        },
        {
          kind: 'link',
          href: '/grupo/hijo-b',
          label: 'Hijo B',
          testId: 'fx-hijo-b',
          permission: 'proveedores.consultar',
        },
      ],
    },
  ];
}

/** Los `testId` visibles, aplanando los grupos: la forma mas legible de afirmar sobre el orden. */
function testIds(items: readonly NavItem[]): readonly string[] {
  return items.flatMap((item) =>
    item.kind === 'link' ? [item.testId] : [item.testId, ...item.items.map((hijo) => hijo.testId)],
  );
}

describe('filterNavItemsByPermissions (R1, R3, R4)', () => {
  it('conserva el enlace cuyo permiso esta en el conjunto', () => {
    const resultado = filterNavItemsByPermissions(menuFixture(), ['inventario.consultar']);

    expect(testIds(resultado)).toEqual(['fx-uno']);
  });

  it('quita el enlace cuyo permiso NO esta en el conjunto', () => {
    const resultado = filterNavItemsByPermissions(menuFixture(), ['pedidos.consultar']);

    expect(testIds(resultado)).not.toContain('fx-uno');
    expect(testIds(resultado)).toEqual(['fx-dos']);
  });

  it('un permiso de otra accion del mismo modulo NO enseña el item: se filtra por `.consultar` exacto', () => {
    // Heredado de QC-74: no hay implicacion entre permisos. Tener `inventario.modificar` no da
    // acceso a la pantalla; el codigo se compara entero, no por prefijo de modulo.
    const resultado = filterNavItemsByPermissions(menuFixture(), ['inventario.modificar']);

    expect(resultado).toEqual([]);
  });

  it('conserva el grupo con SOLO los hijos visibles', () => {
    const resultado = filterNavItemsByPermissions(menuFixture(), ['recetas.consultar']);

    expect(testIds(resultado)).toEqual(['fx-grupo', 'fx-hijo-a']);
  });

  it('el grupo sin ningun hijo visible desaparece ENTERO, etiqueta incluida (R3)', () => {
    // El permiso que sobrevive es el de un enlace suelto, asi que el resultado no esta vacio por
    // casualidad: el grupo se fue y el enlace se quedo.
    const resultado = filterNavItemsByPermissions(menuFixture(), ['pedidos.consultar']);

    expect(testIds(resultado)).toEqual(['fx-dos']);
    expect(resultado.some((item) => item.kind === 'group')).toBe(false);
  });

  it('conserva el orden y la seccion de cada item; no reordena, no mueve ni duplica (R4)', () => {
    // Se piden los permisos en orden INVERSO al del menu, a proposito: si la funcion siguiera el
    // orden de los permisos en vez del del menu, esto saldria al reves.
    const resultado = filterNavItemsByPermissions(menuFixture(), [
      'proveedores.consultar',
      'pedidos.consultar',
      'inventario.consultar',
    ]);

    expect(testIds(resultado)).toEqual(['fx-uno', 'fx-dos', 'fx-grupo', 'fx-hijo-b']);
    expect(resultado.map((item) => item.section)).toEqual([SECCION_A, SECCION_A, SECCION_B]);
    expect(new Set(testIds(resultado)).size).toBe(testIds(resultado).length);
  });

  it('con el conjunto de permisos vacio devuelve [] (R9: quien no puede consultar nada no ve menu)', () => {
    expect(filterNavItemsByPermissions(menuFixture(), [])).toEqual([]);
  });

  it('con la lista de items vacia devuelve []', () => {
    expect(filterNavItemsByPermissions([], ['inventario.consultar'])).toEqual([]);
  });

  it('NO muta el array de entrada ni sus items ni los hijos de los grupos (R4)', () => {
    const entrada = menuFixture();
    const copiaProfunda = structuredClone(entrada) as NavItem[];

    filterNavItemsByPermissions(entrada, ['inventario.consultar', 'recetas.consultar']);

    expect(entrada).toEqual(copiaProfunda);
  });

  it('devuelve estructuras nuevas: tocar el resultado no alcanza a la entrada', () => {
    const entrada = menuFixture();
    const resultado = filterNavItemsByPermissions(entrada, ['recetas.consultar']);

    expect(resultado[0]).not.toBe(entrada[2]);
    const grupo = resultado[0];
    if (grupo === undefined || grupo.kind !== 'group') throw new Error('se esperaba el grupo');
    const original = entrada[2];
    if (original === undefined || original.kind !== 'group') throw new Error('fixture rota');
    expect(grupo.items).not.toBe(original.items);
    expect(original.items).toHaveLength(2);
  });
});

describe('firstVisibleNavHref (R11)', () => {
  it('devuelve el href del primer enlace, de arriba abajo', () => {
    expect(firstVisibleNavHref(menuFixture())).toBe('/uno');
  });

  it('entra en el grupo cuando es el primer item, y toma su primer hijo por orden', () => {
    const soloGrupo = filterNavItemsByPermissions(menuFixture(), [
      'recetas.consultar',
      'proveedores.consultar',
    ]);

    expect(firstVisibleNavHref(soloGrupo)).toBe('/grupo/hijo-a');
  });

  it('salta un grupo que se haya quedado sin hijos y sigue con el siguiente item', () => {
    const conGrupoVacio: readonly NavItem[] = [
      { kind: 'group', label: 'Vacio', testId: 'fx-vacio', items: [] },
      {
        kind: 'link',
        href: '/despues',
        label: 'Despues',
        testId: 'fx-despues',
        permission: 'pedidos.consultar',
      },
    ];

    expect(firstVisibleNavHref(conGrupoVacio)).toBe('/despues');
  });

  it('devuelve null con la lista vacia (R12: el login usa entonces su ultimo respaldo)', () => {
    expect(firstVisibleNavHref([])).toBeNull();
  });

  it('NO muta el array de entrada', () => {
    const entrada = menuFixture();
    const copiaProfunda = structuredClone(entrada) as NavItem[];

    firstVisibleNavHref(entrada);

    expect(entrada).toEqual(copiaProfunda);
  });
});

describe('sobre el menu real (PRIVATE_NAV_ITEMS)', () => {
  it('un Operador con solo `inventario.consultar` ve un unico item y aterriza en inventario', () => {
    const visible = filterNavItemsByPermissions(PRIVATE_NAV_ITEMS, ['inventario.consultar']);

    expect(testIds(visible)).toEqual(['nav-inventario']);
    expect(firstVisibleNavHref(visible)).toBe(INVENTORY_ROUTE);
  });

  it('con permisos vacios el menu real queda vacio y sin aterrizaje', () => {
    const visible = filterNavItemsByPermissions(PRIVATE_NAV_ITEMS, []);

    expect(visible).toEqual([]);
    expect(firstVisibleNavHref(visible)).toBeNull();
  });

  it('filtrar el menu real no lo muta: PRIVATE_NAV_ITEMS es un valor compartido por proceso', () => {
    const copiaProfunda = structuredClone(PRIVATE_NAV_ITEMS) as NavItem[];

    filterNavItemsByPermissions(PRIVATE_NAV_ITEMS, ['recetas.consultar']);
    firstVisibleNavHref(PRIVATE_NAV_ITEMS);

    expect(PRIVATE_NAV_ITEMS).toEqual(copiaProfunda);
  });
});
