// QC-67 T2 — El item «Usuarios» del menu privado (R2, R3).
//
// Nacio dentro de la seccion «Configuración» (QC-67) y paso a «Operación» por decision humana del
// 2026-09-21: usuarios es operacion de la organizacion, no configuracion del producto. El objeto
// NO se movio de sitio en `PRIVATE_NAV_ITEMS` —solo cambio su `section`—, asi que sigue siendo el
// ULTIMO del array.
//
// El ocultado es por PERMISO y se decide en el servidor (QC-75): el layout privado filtra
// `PRIVATE_NAV_ITEMS` con los permisos de la sesion (`filterNavItemsByPermissions`). Aqui se
// comprueba la forma del dato y el resultado de ese filtrado con los conjuntos del seed
// IMPORTADOS; lo que necesita arbol renderizado vive en los tests del layout y del sidebar.
//
// Se ITERA `PRIVATE_NAV_ITEMS` y se afirma sobre `USERS_ROUTE`, `USERS_LABEL` y el `testId`,
// **nunca sobre el literal del copy** (R41). Mismo patron que `private-nav-unidades.test.ts`.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ROLE_ADMINISTRADOR, ROLE_OPERADOR, SEED_ROLE_PERMISSIONS } from '@/lib/modules/identity';
import { NAV_ICONS } from '@/lib/shared/navigation/nav-icons';
import {
  INTEGRATIONS_LABEL,
  NAV_SECTION_CONFIGURATION,
  NAV_SECTION_OPERATION,
  PRESENTATIONS_LABEL,
  PRIVATE_NAV_ITEMS,
  UNITS_LABEL,
  USERS_LABEL,
  filterNavItemsByPermissions,
  groupNavItemsBySection,
  type NavItem,
  type NavLink,
} from '@/lib/shared/navigation/private-nav';
import { PRESENTATIONS_ROUTE, UNITS_ROUTE, USERS_ROUTE } from '@/lib/shared/routes';

const RAIZ = join(__dirname, '..', '..', '..');

/** La pantalla, DERIVADA de la constante de ruta (R1). */
const PAGE_PATH = join(
  RAIZ,
  'app',
  '(private)',
  ...USERS_ROUTE.split('/').filter(Boolean),
  'page.tsx',
);

/** Todos los items de navegacion, aplanando los grupos en sus hijos. */
const NAV_APLANADO: readonly NavLink[] = PRIVATE_NAV_ITEMS.flatMap((item) =>
  item.kind === 'group' ? item.items : [item],
);

/** Los conjuntos del seed, IMPORTADOS (QC-74 R8, R9): ninguno se escribe a mano aqui. */
const PERMISOS_ADMINISTRADOR: readonly string[] = SEED_ROLE_PERMISSIONS[ROLE_ADMINISTRADOR] ?? [];
const PERMISOS_OPERADOR: readonly string[] = SEED_ROLE_PERMISSIONS[ROLE_OPERADOR] ?? [];

/**
 * Los codigos que exige la pantalla, LEIDOS DE SU FUENTE (R3).
 *
 * No se repiten como literal a proposito: si alguien cambiara el corte de `page.tsx`, este test
 * tiene que moverse con el en vez de seguir vigilando un conjunto imaginario. Los comentarios se
 * quitan antes de leer, porque el JSDoc de la pagina NOMBRA su codigo.
 */
const PERMISOS_DE_LA_PANTALLA: readonly string[] = [
  ...readFileSync(PAGE_PATH, 'utf8')
    .replace(/\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .matchAll(/requirePagePermission\('([^']+)'\)/g),
].map((coincidencia) => coincidencia[1] as string);

/** El item de usuarios, buscado por su `href` —la constante—, nunca por el texto visible. */
const ITEMS_DE_USUARIOS = PRIVATE_NAV_ITEMS.filter(
  (item): item is NavLink => item.kind === 'link' && item.href === USERS_ROUTE,
);

/** Los items de la unica seccion «Configuración», o `undefined` si no existe. */
function seccionConfiguracion(): readonly NavItem[] | undefined {
  return groupNavItemsBySection(PRIVATE_NAV_ITEMS).find(
    (seccion) => seccion.label === NAV_SECTION_CONFIGURATION,
  )?.items;
}

/** Las secciones de un menu ya filtrado, por su etiqueta. */
function seccionesDe(items: readonly NavItem[]): readonly (string | null)[] {
  return groupNavItemsBySection(items).map((seccion) => seccion.label);
}

/** La ruta de archivo de la pantalla que sirve un `href`, DERIVADA del propio href. */
function paginaDe(href: string): string {
  return join(RAIZ, 'app', '(private)', ...href.split('/').filter(Boolean), 'page.tsx');
}

describe('la seccion Configuración lleva presentaciones, unidades e integraciones, sin usuarios (R2, 2026-09-21)', () => {
  it('hay exactamente UNA seccion Configuración y lleva exactamente TRES items', () => {
    const secciones = groupNavItemsBySection(PRIVATE_NAV_ITEMS).filter(
      (seccion) => seccion.label === NAV_SECTION_CONFIGURATION,
    );

    expect(secciones).toHaveLength(1);
    expect(secciones[0]?.items).toHaveLength(3);
  });

  it('el orden de Configuración es presentaciones, unidades e integraciones, sin usuarios', () => {
    const items = seccionConfiguracion() ?? [];

    expect(items.map((item) => (item.kind === 'link' ? item.href : item.label))).toEqual([
      PRESENTATIONS_ROUTE,
      UNITS_ROUTE,
      INTEGRATIONS_LABEL,
    ]);
  });

  it('usuarios es el ULTIMO item de la seccion Operación', () => {
    // El objeto no se movio de sitio en el array (solo cambio su `section`), asi que sigue siendo
    // el ultimo enlace declarado dentro de «Operación».
    const operacion =
      groupNavItemsBySection(PRIVATE_NAV_ITEMS).find(
        (seccion) => seccion.label === NAV_SECTION_OPERATION,
      )?.items ?? [];

    const ultimo = operacion[operacion.length - 1];
    expect(ultimo?.kind === 'link' ? ultimo.href : undefined).toBe(USERS_ROUTE);
  });

  it('los dos items que ya existian siguen intactos, campo por campo', () => {
    const [presentaciones, unidades] = (seccionConfiguracion() ?? []) as readonly NavLink[];

    expect(presentaciones?.label).toBe(PRESENTATIONS_LABEL);
    expect(presentaciones?.testId).toBe('nav-presentaciones');
    expect(presentaciones?.permission).toBe('inventario.modificar');
    expect(presentaciones?.icon).toBe('boxes');

    expect(unidades?.label).toBe(UNITS_LABEL);
    expect(unidades?.testId).toBe('nav-unidades');
    expect(unidades?.permission).toBe('unidades.consultar');
    expect(unidades?.icon).toBe('flask-conical');
  });

  it('el item nuevo apunta a USERS_ROUTE y declara etiqueta, testId, permiso, icono y seccion', () => {
    expect(ITEMS_DE_USUARIOS).toHaveLength(1);
    expect(ITEMS_DE_USUARIOS[0]?.label).toBe(USERS_LABEL);
    expect(ITEMS_DE_USUARIOS[0]?.testId).toBe('nav-usuarios');
    expect(ITEMS_DE_USUARIOS[0]?.permission).toBe('usuarios.consultar');
    expect(ITEMS_DE_USUARIOS[0]?.section).toBe(NAV_SECTION_OPERATION);
    expect(ITEMS_DE_USUARIOS[0]?.icon).toBe('users');
  });

  it('su icono tiene fila en NAV_ICONS y no colisiona con los de Configuración', () => {
    // El nombre del icono es una CADENA porque cruza la frontera servidor->cliente: quien lo
    // resuelve es el mapa. Un nombre sin fila dibujaria un hueco, y el `Record` solo lo impide en
    // typecheck; aqui se comprueba el dato ya construido.
    const iconos = (seccionConfiguracion() ?? [])
      .map((item) => item.icon)
      .filter((icono): icono is NonNullable<NavItem['icon']> => icono !== undefined);

    expect(new Set(iconos).size).toBe(iconos.length);
    for (const icono of iconos) {
      expect(NAV_ICONS[icono]).toBeDefined();
    }
  });

  it('el destino y el testId son unicos en toda la navegacion', () => {
    expect(NAV_APLANADO.filter((item) => item.href === USERS_ROUTE)).toHaveLength(1);
    expect(NAV_APLANADO.filter((item) => item.testId === 'nav-usuarios')).toHaveLength(1);
  });

  it('ningun item de la seccion apunta a una ruta sin `page.tsx`', () => {
    // La deuda de los cinco items de placeholder de QC-11 —enlaces que daban 404— no se repite:
    // se comprueba el archivo EN DISCO, no una lista escrita al lado.
    const items = seccionConfiguracion();
    if (!items) throw new Error('no existe la seccion Configuración en PRIVATE_NAV_ITEMS');

    const sinPantalla = items
      .flatMap((item) => (item.kind === 'group' ? item.items : [item]))
      .filter((enlace) => !existsSync(paginaDe(enlace.href)))
      .map((enlace) => `${enlace.testId} -> ${enlace.href}`);

    expect(
      sinPantalla,
      `items que llevan a una ruta sin pantalla: ${sinPantalla.join(', ')}`,
    ).toEqual([]);
  });
});

describe('el permiso del item es EL MISMO que exige la pantalla (R3)', () => {
  it('ancla: el codigo se leyo de la fuente de page.tsx y es exactamente uno', () => {
    // Anti-vacuidad: si la lectura de la fuente fallara —ruta mal derivada, `sep` de Windows—, la
    // lista quedaria vacia y la igualdad de abajo compararia contra la nada. Y es UNO, no dos: a
    // diferencia de QC-39, esta pantalla corta solo por `consultar` (`design.md > 3`).
    expect(PERMISOS_DE_LA_PANTALLA).toHaveLength(1);
  });

  it('item y pagina declaran el MISMO codigo, no uno contenido en el otro', () => {
    // Aqui no hay contencion que valga: con un solo codigo a cada lado, el enlace y el 404
    // coinciden exactamente, asi que nadie ve un enlace que le daria 404 ni pierde una pantalla
    // cuyo enlace no ve. Si se desincronizaran, esto se pone rojo.
    expect(ITEMS_DE_USUARIOS[0]?.permission).toBe(PERMISOS_DE_LA_PANTALLA[0]);
  });
});

describe('el item se oculta a quien no tiene el permiso (R3)', () => {
  it('ancla: los dos conjuntos del seed son reales y distintos en este permiso', () => {
    // Anti-vacuidad: con los conjuntos vacios los casos de abajo pasarian sin comprobar nada.
    for (const permiso of PERMISOS_DE_LA_PANTALLA) {
      expect(PERMISOS_ADMINISTRADOR).toContain(permiso);
      expect(PERMISOS_OPERADOR).not.toContain(permiso);
    }
    expect(PERMISOS_OPERADOR.length).toBeGreaterThan(0);
  });

  it('con los permisos del Administrador se ven los TRES items, en Configuración y en Operación', () => {
    const visible = filterNavItemsByPermissions(PRIVATE_NAV_ITEMS, PERMISOS_ADMINISTRADOR);
    const testIds = visible.map((item) => item.testId);

    expect(testIds).toContain('nav-presentaciones');
    expect(testIds).toContain('nav-unidades');
    expect(testIds).toContain('nav-usuarios');
    expect(seccionesDe(visible)).toContain(NAV_SECTION_CONFIGURATION);
    expect(seccionesDe(visible)).toContain(NAV_SECTION_OPERATION);
  });

  it('con los del Operador no aparece usuarios, pero Operación no desaparece', () => {
    const visible = filterNavItemsByPermissions(PRIVATE_NAV_ITEMS, PERMISOS_OPERADOR);
    const testIds = visible.map((item) => item.testId);

    expect(testIds).not.toContain('nav-usuarios');
    // Usuarios vive en «Operación», que le sigue mostrando al Operador el resto de sus items: la
    // seccion no desaparece por perder este uno.
    expect(seccionesDe(visible)).toContain(NAV_SECTION_OPERATION);
    // Configuración si desaparece entera: el Operador tampoco tiene presentaciones ni unidades.
    expect(seccionesDe(visible)).not.toContain(NAV_SECTION_CONFIGURATION);
    // Y el Operador sigue viendo lo suyo: el filtrado quita, no vacia el menu.
    expect(visible.length).toBeGreaterThan(0);
  });

  it('sin el permiso, del item no sale NI etiqueta, NI destino, NI testId', () => {
    // R3 exige que no se emita nada del item, no que se esconda con estilos: el filtrado ocurre en
    // el servidor y lo que no pasa el filtro no llega al payload.
    const visible = filterNavItemsByPermissions(PRIVATE_NAV_ITEMS, PERMISOS_OPERADOR);
    const serializado = JSON.stringify(visible);

    expect(serializado).not.toContain(USERS_ROUTE);
    expect(serializado).not.toContain(USERS_LABEL);
    expect(serializado).not.toContain('nav-usuarios');
  });
});
