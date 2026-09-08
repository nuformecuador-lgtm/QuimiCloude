// QC-45 T2 — La seccion «Configuración» del menu privado y su unico item (R3, R4).
//
// El ocultado es por PERMISO, no por rol: QC-75 (`menu-y-rutas-por-permiso`) retiro el ocultado
// por rol y el layout privado filtra `PRIVATE_NAV_ITEMS` con los permisos de la sesion
// (`filterNavItemsByPermissions`), con `NavLink.permission` obligatorio. R4 se reformulo en esa
// clave el 2026-09-08 y hoy pide exactamente esto: `inventario.modificar`, decidido en el
// servidor, sin emitir el item ni el encabezado a quien no lo tiene.
//
// Se ITERA `PRIVATE_NAV_ITEMS` y se afirma sobre `PRESENTATIONS_ROUTE`, `PRESENTATIONS_LABEL` y
// el `testId`, **nunca sobre el literal del copy** (R35). Sin DOM: lo que esta task promete es la
// forma del dato, no como lo dibuja `AppSidebar` —que no decide nada y solo recorre este array—.
// Lo que si necesita arbol renderizado —que el layout privado pinte o no pinte el item segun el
// rol— vive en `tests/unit/navegacion/private-layout-menu.test.tsx`, para no montar el layout dos
// veces en dos archivos.
//
// Mismo patron que `tests/unit/pedidos-ui/private-nav-pedidos.test.ts`.

import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  ROLE_ADMINISTRADOR,
  ROLE_OPERADOR,
  SEED_ROLE_PERMISSIONS,
} from '@/lib/modules/identity';
import {
  NAV_SECTION_CONFIGURATION,
  PRESENTATIONS_LABEL,
  PRIVATE_NAV_ITEMS,
  filterNavItemsByPermissions,
  groupNavItemsBySection,
  type NavItem,
  type NavLink,
} from '@/lib/shared/navigation/private-nav';
import { PRESENTATIONS_ROUTE } from '@/lib/shared/routes';

const RAIZ = join(__dirname, '..', '..', '..');

/** Todos los items de navegacion, aplanando los grupos en sus hijos. */
const NAV_APLANADO: readonly NavLink[] = PRIVATE_NAV_ITEMS.flatMap((item) =>
  item.kind === 'group' ? item.items : [item],
);

/** Los conjuntos del seed, IMPORTADOS (QC-74 R8, R9): ninguno se escribe a mano aqui. */
const PERMISOS_ADMINISTRADOR: readonly string[] = SEED_ROLE_PERMISSIONS[ROLE_ADMINISTRADOR] ?? [];
const PERMISOS_OPERADOR: readonly string[] = SEED_ROLE_PERMISSIONS[ROLE_OPERADOR] ?? [];

/** Las secciones de un menu ya filtrado, por su etiqueta. */
function seccionesDe(items: readonly NavItem[]): readonly (string | null)[] {
  return groupNavItemsBySection(items).map((seccion) => seccion.label);
}

/** La ruta de archivo de la pantalla que sirve un `href`, DERIVADA del propio href (R2). */
function paginaDe(href: string): string {
  return join(RAIZ, 'app', '(private)', ...href.split('/').filter(Boolean), 'page.tsx');
}

describe('la seccion Configuración existe una sola vez y tiene un unico item (R3)', () => {
  it('hay exactamente UNA seccion Configuración y lleva exactamente UN item', () => {
    const secciones = groupNavItemsBySection(PRIVATE_NAV_ITEMS).filter(
      (seccion) => seccion.label === NAV_SECTION_CONFIGURATION,
    );

    expect(secciones).toHaveLength(1);
    // UNO a proposito, no un olvido: «Unidades» llega con QC-39 (decision cerrada de QC-45).
    expect(secciones[0]?.items).toHaveLength(1);
  });

  it('ese item apunta a PRESENTATIONS_ROUTE y declara inventario.modificar (R3, R4)', () => {
    // Se busca por `href` —la constante—, nunca por el texto visible (R35).
    const deNivelSuperior = PRIVATE_NAV_ITEMS.filter(
      (item): item is NavLink => item.kind === 'link' && item.href === PRESENTATIONS_ROUTE,
    );

    expect(deNivelSuperior).toHaveLength(1);
    expect(deNivelSuperior[0]?.label).toBe(PRESENTATIONS_LABEL);
    expect(deNivelSuperior[0]?.testId).toBe('nav-presentaciones');
    expect(deNivelSuperior[0]?.section).toBe(NAV_SECTION_CONFIGURATION);
    // El MISMO codigo que exige la pantalla con `requirePagePermission` (lo ata
    // `presentations-route-contract.test.ts`): un enlace que llevara a un 404 seria peor que no
    // tener enlace.
    expect(deNivelSuperior[0]?.permission).toBe('inventario.modificar');
    // El icono ya existia en `NavIconName` y en `NAV_ICONS`: esta ficha no anade ninguno.
    expect(deNivelSuperior[0]?.icon).toBe('boxes');
  });

  it('el destino y el testId son unicos en toda la navegacion (R3)', () => {
    expect(NAV_APLANADO.filter((item) => item.href === PRESENTATIONS_ROUTE)).toHaveLength(1);
    expect(NAV_APLANADO.filter((item) => item.testId === 'nav-presentaciones')).toHaveLength(1);
  });

  it('ningun item de la seccion apunta a una ruta sin `page.tsx` (R3)', () => {
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

    expect(sinPantalla, `items que llevan a una ruta sin pantalla: ${sinPantalla.join(', ')}`).toEqual(
      [],
    );
  });

  it('los items que ya existian siguen en pie: se anadio uno, no se sustituyo (R3)', () => {
    expect(NAV_APLANADO.map((item) => item.href)).toContain(PRESENTATIONS_ROUTE);
    expect(NAV_APLANADO.length).toBeGreaterThan(1);
  });
});

describe('el item y su seccion se ocultan a quien no tiene el permiso (intencion de R4)', () => {
  it('ancla: los dos conjuntos del seed son reales y distintos en este permiso', () => {
    // Anti-vacuidad: con los conjuntos vacios los dos casos de abajo pasarian sin comprobar nada,
    // y si el Operador ganara `inventario.modificar` el caso negativo dejaria de significar algo.
    expect(PERMISOS_ADMINISTRADOR).toContain('inventario.modificar');
    expect(PERMISOS_OPERADOR).toContain('inventario.consultar');
    expect(PERMISOS_OPERADOR).not.toContain('inventario.modificar');
  });

  it('con los permisos del Administrador estan el item Y la seccion', () => {
    const visible = filterNavItemsByPermissions(PRIVATE_NAV_ITEMS, PERMISOS_ADMINISTRADOR);

    expect(visible.map((item) => item.testId)).toContain('nav-presentaciones');
    expect(seccionesDe(visible)).toContain(NAV_SECTION_CONFIGURATION);
  });

  it('con los del Operador desaparecen los DOS: no queda encabezado huerfano', () => {
    const visible = filterNavItemsByPermissions(PRIVATE_NAV_ITEMS, PERMISOS_OPERADOR);

    expect(visible.map((item) => item.testId)).not.toContain('nav-presentaciones');
    // Lo que R4 pide de verdad: una seccion cuyo unico item se ha ido no puede quedarse como un
    // encabezado que anuncia algo que no esta.
    expect(seccionesDe(visible)).not.toContain(NAV_SECTION_CONFIGURATION);
    // Y el Operador sigue viendo lo suyo: el filtrado quita, no vacia el menu.
    expect(visible.length).toBeGreaterThan(0);
  });
});
