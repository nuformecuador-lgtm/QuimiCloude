// QC-39 T4 — El item «Unidades» en la seccion «Configuración» del menu privado (R9, R10).
//
// La seccion la creo QC-45 y esta ficha **solo se da de alta en ella**: no la crea, no la
// renombra y no toca el item de presentaciones que ya vivia dentro. Por eso el archivo afirma
// tanto sobre el item nuevo como sobre lo que NO cambio.
//
// El ocultado es por PERMISO y se decide en el servidor (QC-75): el layout privado filtra
// `PRIVATE_NAV_ITEMS` con los permisos de la sesion (`filterNavItemsByPermissions`). Aqui se
// comprueba la forma del dato y el resultado de ese filtrado con los conjuntos del seed
// IMPORTADOS; lo que necesita arbol renderizado vive en los tests del layout y del sidebar, para
// no montar el layout dos veces en dos archivos.
//
// Se ITERA `PRIVATE_NAV_ITEMS` y se afirma sobre `UNITS_ROUTE`, `UNITS_LABEL` y el `testId`,
// **nunca sobre el literal del copy** (R49). Mismo patron que
// `private-nav-configuracion.test.ts`.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ROLE_ADMINISTRADOR, ROLE_OPERADOR, SEED_ROLE_PERMISSIONS } from '@/lib/modules/identity';
import {
  NAV_SECTION_CONFIGURATION,
  PRESENTATIONS_LABEL,
  PRIVATE_NAV_ITEMS,
  UNITS_LABEL,
  filterNavItemsByPermissions,
  groupNavItemsBySection,
  type NavItem,
  type NavLink,
} from '@/lib/shared/navigation/private-nav';
import { PRESENTATIONS_ROUTE, UNITS_ROUTE } from '@/lib/shared/routes';

const RAIZ = join(__dirname, '..', '..', '..');

/** La pantalla, DERIVADA de la constante de ruta (R8). */
const PAGE_PATH = join(RAIZ, 'app', '(private)', ...UNITS_ROUTE.split('/').filter(Boolean), 'page.tsx');

/** Todos los items de navegacion, aplanando los grupos en sus hijos. */
const NAV_APLANADO: readonly NavLink[] = PRIVATE_NAV_ITEMS.flatMap((item) =>
  item.kind === 'group' ? item.items : [item],
);

/** Los conjuntos del seed, IMPORTADOS (QC-74 R8, R9): ninguno se escribe a mano aqui. */
const PERMISOS_ADMINISTRADOR: readonly string[] = SEED_ROLE_PERMISSIONS[ROLE_ADMINISTRADOR] ?? [];
const PERMISOS_OPERADOR: readonly string[] = SEED_ROLE_PERMISSIONS[ROLE_OPERADOR] ?? [];

/**
 * Los codigos que exige la pantalla, LEIDOS DE SU FUENTE (R10).
 *
 * No se repiten como literal a proposito: si alguien cambiara el corte de `page.tsx`, este test
 * tiene que moverse con el en vez de seguir vigilando un conjunto imaginario. Los comentarios se
 * quitan antes de leer, porque el JSDoc de la pagina NOMBRA los dos codigos.
 */
const PERMISOS_DE_LA_PANTALLA: readonly string[] = [
  ...readFileSync(PAGE_PATH, 'utf8')
    .replace(/\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .matchAll(/requirePagePermission\('([^']+)'\)/g),
].map((coincidencia) => coincidencia[1] as string);

/** El item de unidades, buscado por su `href` —la constante—, nunca por el texto visible. */
const ITEMS_DE_UNIDADES = PRIVATE_NAV_ITEMS.filter(
  (item): item is NavLink => item.kind === 'link' && item.href === UNITS_ROUTE,
);

/** Las secciones de un menu ya filtrado, por su etiqueta. */
function seccionesDe(items: readonly NavItem[]): readonly (string | null)[] {
  return groupNavItemsBySection(items).map((seccion) => seccion.label);
}

/** La ruta de archivo de la pantalla que sirve un `href`, DERIVADA del propio href. */
function paginaDe(href: string): string {
  return join(RAIZ, 'app', '(private)', ...href.split('/').filter(Boolean), 'page.tsx');
}

describe('la seccion Configuración sigue siendo una y ahora tiene tres items (R9)', () => {
  it('hay exactamente UNA seccion Configuración y lleva exactamente TRES items', () => {
    // Ni se crea una segunda seccion ni se renombra la que existe: se anade un item a la de
    // QC-45, que nacio con uno.
    const secciones = groupNavItemsBySection(PRIVATE_NAV_ITEMS).filter(
      (seccion) => seccion.label === NAV_SECTION_CONFIGURATION,
    );

    expect(secciones).toHaveLength(1);
    // TENSADA el 2026-09-11 (QC-67 T2, R2/R39) a TRES con «Usuarios», que entraba al FINAL, y
    // RELAJADA de vuelta a DOS el 2026-09-21: «Usuarios» paso a `NAV_SECTION_OPERATION` por
    // decision humana (es operacion, no configuracion). Lo que R9 promete sigue intacto y lo
    // comprueba el caso de abajo: el item de presentaciones no se toca y sigue siendo el primero;
    // el de unidades tampoco se mueve.
    // TENSADA el 2026-10-08 a TRES con el grupo «Integraciones», que entra al FINAL: Unidades
    // sigue en la segunda posicion.
    expect(secciones[0]?.items).toHaveLength(3);
    expect((secciones[0]?.items[1] as NavLink | undefined)?.href).toBe(UNITS_ROUTE);
  });

  it('el item de presentaciones sigue intacto y sigue siendo el PRIMERO de la seccion', () => {
    // R9 prohibe alterarlo o reordenarlo: el item nuevo se anade DETRAS, sin tocarlo.
    const seccion = groupNavItemsBySection(PRIVATE_NAV_ITEMS).find(
      (candidata) => candidata.label === NAV_SECTION_CONFIGURATION,
    );

    const primero = seccion?.items[0];
    expect(primero?.kind).toBe('link');
    expect((primero as NavLink | undefined)?.href).toBe(PRESENTATIONS_ROUTE);
    expect((primero as NavLink | undefined)?.label).toBe(PRESENTATIONS_LABEL);
    expect((primero as NavLink | undefined)?.testId).toBe('nav-presentaciones');
    expect((primero as NavLink | undefined)?.permission).toBe('inventario.modificar');
    expect((primero as NavLink | undefined)?.icon).toBe('boxes');
  });

  it('el item nuevo apunta a UNITS_ROUTE y declara etiqueta, testId, icono y seccion', () => {
    expect(ITEMS_DE_UNIDADES).toHaveLength(1);
    expect(ITEMS_DE_UNIDADES[0]?.label).toBe(UNITS_LABEL);
    expect(ITEMS_DE_UNIDADES[0]?.testId).toBe('nav-unidades');
    expect(ITEMS_DE_UNIDADES[0]?.section).toBe(NAV_SECTION_CONFIGURATION);
    // El icono es uno de los YA declarados en `NavIconName`: esta ficha no anade ninguno.
    expect(ITEMS_DE_UNIDADES[0]?.icon).toBe('flask-conical');
  });

  it('el destino y el testId son unicos en toda la navegacion', () => {
    expect(NAV_APLANADO.filter((item) => item.href === UNITS_ROUTE)).toHaveLength(1);
    expect(NAV_APLANADO.filter((item) => item.testId === 'nav-unidades')).toHaveLength(1);
  });

  it('ningun item de la seccion apunta a una ruta sin `page.tsx`', () => {
    // La deuda de los cinco items de placeholder de QC-11 —enlaces que daban 404— no se repite:
    // se comprueba el archivo EN DISCO, no una lista escrita al lado.
    const seccion = groupNavItemsBySection(PRIVATE_NAV_ITEMS).find(
      (candidata) => candidata.label === NAV_SECTION_CONFIGURATION,
    );
    if (!seccion) throw new Error('no existe la seccion Configuración en PRIVATE_NAV_ITEMS');

    const sinPantalla = seccion.items
      .flatMap((item) => (item.kind === 'group' ? item.items : [item]))
      .filter((enlace) => !existsSync(paginaDe(enlace.href)))
      .map((enlace) => `${enlace.testId} -> ${enlace.href}`);

    expect(
      sinPantalla,
      `items que llevan a una ruta sin pantalla: ${sinPantalla.join(', ')}`,
    ).toEqual([]);
  });
});

describe('el permiso del item esta CONTENIDO en el que exige la pantalla (R10)', () => {
  it('ancla: los codigos se leyeron de la fuente de page.tsx y son dos', () => {
    // Anti-vacuidad: si la lectura de la fuente fallara —ruta mal derivada, `sep` de Windows—, la
    // lista quedaria vacia y el `toContain` de abajo pasaria sin comprobar nada.
    expect(PERMISOS_DE_LA_PANTALLA).toHaveLength(2);
  });

  it('el permiso del item es uno de los que exige la pantalla', () => {
    // `NavLink.permission` es UNA cadena y la pantalla exige DOS codigos, asi que el item declara
    // uno de ellos: lo que R10 pide es CONTENCION, no igualdad. Si se desincronizaran, el enlace
    // saldria en el menu de quien recibe un 404 al pulsarlo.
    const permiso = ITEMS_DE_UNIDADES[0]?.permission;

    expect(permiso, 'el item de unidades deberia declarar un permiso').toBeDefined();
    expect(PERMISOS_DE_LA_PANTALLA).toContain(permiso);
  });
});

describe('el item y su seccion se ocultan a quien no tiene el permiso (R10)', () => {
  it('ancla: los dos conjuntos del seed son reales y distintos en estos permisos', () => {
    // Anti-vacuidad: con los conjuntos vacios los casos de abajo pasarian sin comprobar nada, y si
    // el Operador ganara los permisos de unidades el caso negativo dejaria de significar algo.
    for (const permiso of PERMISOS_DE_LA_PANTALLA) {
      expect(PERMISOS_ADMINISTRADOR).toContain(permiso);
      expect(PERMISOS_OPERADOR).not.toContain(permiso);
    }
    expect(PERMISOS_OPERADOR.length).toBeGreaterThan(0);
  });

  it('con los permisos del Administrador se ven los DOS items y la seccion', () => {
    const visible = filterNavItemsByPermissions(PRIVATE_NAV_ITEMS, PERMISOS_ADMINISTRADOR);
    const testIds = visible.map((item) => item.testId);

    expect(testIds).toContain('nav-presentaciones');
    expect(testIds).toContain('nav-unidades');
    expect(seccionesDe(visible)).toContain(NAV_SECTION_CONFIGURATION);
  });

  it('con los del Operador no queda NINGUNO y la seccion desaparece entera', () => {
    const visible = filterNavItemsByPermissions(PRIVATE_NAV_ITEMS, PERMISOS_OPERADOR);
    const testIds = visible.map((item) => item.testId);

    expect(testIds).not.toContain('nav-presentaciones');
    expect(testIds).not.toContain('nav-unidades');
    // Una seccion sin items no puede quedarse como un encabezado que anuncia algo que no esta.
    expect(seccionesDe(visible)).not.toContain(NAV_SECTION_CONFIGURATION);
    // Y el Operador sigue viendo lo suyo: el filtrado quita, no vacia el menu.
    expect(visible.length).toBeGreaterThan(0);
  });
});
