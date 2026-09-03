import { DASHBOARD_ROUTE, INVENTORY_ROUTE } from '../routes';

/**
 * Navegacion de la zona privada (`design.md > 4.3`).
 *
 * **Los items y sus rutas nacieron como datos de relleno (placeholder, D2), no dominio.** Salvo
 * el dashboard —que crea la feature 9— e `INVENTORY_ROUTE` —que estrena QC-22—, la unica ruta de
 * placeholder que queda es `FORMULAS_ROUTE`: visitarla hoy da **404, y eso es lo esperado**,
 * mismo patron que `FORGOT_PASSWORD_ROUTE` de la feature 7, hasta que QC-26 la convierta en real.
 * Las demas rutas de relleno (notificaciones, compras, lotes) se retiraron en QC-13 por no tener
 * feature que las respalde. La feature que traiga cada modulo del ERP sustituye su item y su
 * constante de ruta; nadie debe leer esta tabla como definicion del dominio quimico.
 *
 * `DASHBOARD_ROUTE` e `INVENTORY_ROUTE` se **reutilizan** de `lib/shared/routes.ts` en vez de
 * redeclararlas: dos constantes con la misma ruta es como se acaba con `/dashboard` y `/panel`
 * conviviendo. `INVENTORY_ROUTE` se mudo alli en QC-22 porque el middleware y la regla ruta->rol
 * la necesitan y no pueden depender de este archivo de navegacion.
 *
 * Los tests iteran `PRIVATE_NAV_ITEMS` y afirman sobre estas constantes, nunca sobre el
 * literal del copy.
 *
 * **Este archivo es la unica fuente de la navegacion.** `AppSidebar` no decide nada: recorre
 * este array y lo dibuja. Anadir un item, cambiarle el icono o moverlo de seccion se hace
 * aqui y en ningun otro sitio; el componente no se toca.
 */

/**
 * Reexport por compatibilidad: `INVENTORY_ROUTE` **vive en `lib/shared/routes.ts`**, no aqui.
 *
 * Nacio en este archivo como placeholder y quien ya la importaba de `private-nav` sigue
 * funcionando sin tocarse. Codigo nuevo debe importarla de `lib/shared/routes.ts`.
 */
export { INVENTORY_ROUTE };

// --- Ruta de ejemplo (placeholder, D2). No existe todavia: hoy da 404. ---
export const FORMULAS_ROUTE = '/produccion/formulas';

/** Nombre accesible del landmark de navegacion de la barra lateral (R3). */
export const PRIVATE_NAV_LABEL = 'Navegación principal';

/** Marca larga, modo expandido (R4, D7). */
export const BRAND_LABEL = 'QuimiCloude';

/** Marca corta, modo icono (R24, D7). */
export const BRAND_SHORT_LABEL = 'QC';

/**
 * Bajada de la marca, bajo el nombre y solo en modo expandido.
 *
 * **Es texto quemado a proposito** (decision humana del 2026-09-02): no hay identidad visual
 * definida para este producto y no la decide este archivo. Cuando la haya, esto y el simbolo
 * de `AppSidebar` salen de donde diga esa ficha.
 */
export const BRAND_TAGLINE = 'ERP Químico';

/** Titulos de las secciones en las que se agrupan los items de nivel superior. */
export const NAV_SECTION_OPERATION = 'Operación';
export const NAV_SECTION_CHAIN = 'Cadena';

/**
 * Nombre del icono de un item. **Es una cadena y no el componente a proposito.**
 *
 * `PRIVATE_NAV_ITEMS` lo consume `app/(private)/layout.tsx`, que es Server Component, y se lo
 * pasa por props a `AppSidebar`, que es cliente. Todo lo que cruza esa frontera tiene que ser
 * serializable, y un icono de `lucide-react` no lo es: es un objeto con `$$typeof` y `render`.
 * Pasarlo entero revienta en ejecucion con «Only plain objects can be passed to Client
 * Components from Server Components», y **ningun test unitario lo ve**, porque en jsdom no
 * existe esa frontera y todo se renderiza en cliente.
 *
 * El componente lo resuelve con el mapa de `nav-icons.ts`.
 */
export type NavIconName =
  | 'layout-dashboard'
  | 'package'
  | 'bell'
  | 'shopping-cart'
  | 'clipboard-list'
  | 'truck'
  | 'factory'
  | 'flask-conical'
  | 'boxes';

export type NavLink = {
  readonly kind: 'link';
  readonly href: string;
  readonly label: string;
  readonly testId: string;
  /**
   * Icono del item. Solo lo llevan los de **nivel superior**: los hijos de un submenu se
   * dibujan sin icono, como en el diseno, y por eso es opcional en vez de obligatorio.
   */
  readonly icon?: NavIconName;
  /** Seccion a la que pertenece. Solo en items de nivel superior (ver `icon`). */
  readonly section?: string;
  /**
   * Contador que se pinta como etiqueta a la derecha del item.
   *
   * **Hoy es un valor fijo, no un dato real** (decision humana del 2026-09-02): no existe
   * ninguna fuente de notificaciones en el repo, y inventarla seria dominio que nadie ha
   * especificado. La ficha que traiga las notificaciones sustituye este numero por su origen.
   */
  readonly badge?: number;
};

export type NavGroup = {
  readonly kind: 'group';
  readonly label: string;
  readonly testId: string;
  readonly icon?: NavIconName;
  readonly section?: string;
  /** Un solo nivel: los hijos son `NavLink`, nunca `NavItem`. Lo garantiza el tipo. */
  readonly items: readonly NavLink[];
};

export type NavItem = NavLink | NavGroup;

export const PRIVATE_NAV_ITEMS: readonly NavItem[] = [
  {
    kind: 'link',
    href: DASHBOARD_ROUTE,
    label: 'Dashboard',
    testId: 'nav-dashboard',
    icon: 'layout-dashboard',
    section: NAV_SECTION_OPERATION,
  },
  {
    kind: 'link',
    href: INVENTORY_ROUTE,
    label: 'Inventario',
    testId: 'nav-inventario',
    icon: 'package',
    section: NAV_SECTION_OPERATION,
  },
  {
    kind: 'group',
    label: 'Producción',
    testId: 'nav-produccion',
    icon: 'factory',
    section: NAV_SECTION_CHAIN,
    items: [
      {
        kind: 'link',
        href: FORMULAS_ROUTE,
        label: 'Fórmulas',
        testId: 'nav-produccion-formulas',
        icon: 'flask-conical',
      },
    ],
  },
];

/**
 * Agrupa los items de nivel superior por su `section`, **conservando el orden de aparicion**
 * en `PRIVATE_NAV_ITEMS` tanto para las secciones como para los items dentro de cada una.
 *
 * Vive aqui y no en el componente porque es la forma del dato, no de la vista: asi el
 * `AppSidebar` recorre y dibuja, sin decidir agrupaciones.
 *
 * Un item **sin** `section` no se pierde: cae en un grupo sin titulo, que se dibuja igual pero
 * sin encabezado. Es lo que hace que anadir un item al array nunca lo haga desaparecer de la
 * pantalla por olvidar un campo opcional.
 */
export type NavSection = {
  readonly label: string | null;
  readonly items: readonly NavItem[];
};

export function groupNavItemsBySection(items: readonly NavItem[]): readonly NavSection[] {
  const secciones: NavSection[] = [];

  for (const item of items) {
    const label = item.section ?? null;
    const ultima = secciones.find((seccion) => seccion.label === label);

    if (ultima) {
      (ultima.items as NavItem[]).push(item);
    } else {
      secciones.push({ label, items: [item] });
    }
  }

  return secciones;
}
