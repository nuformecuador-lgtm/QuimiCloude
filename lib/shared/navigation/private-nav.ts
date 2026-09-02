import {
  Bell,
  Boxes,
  ClipboardList,
  Factory,
  FlaskConical,
  LayoutDashboard,
  Package,
  ShoppingCart,
  Truck,
  type LucideIcon,
} from 'lucide-react';

import { DASHBOARD_ROUTE } from '../routes';

/**
 * Navegacion de la zona privada (`design.md > 4.3`).
 *
 * **Los items y sus rutas son datos de relleno (placeholder, D2), no dominio.** Salvo
 * el dashboard —que crea la feature 9—, **ninguna de estas rutas existe**: visitarlas
 * hoy da **404, y eso es lo esperado**, mismo patron que `FORGOT_PASSWORD_ROUTE` de la
 * feature 7. La feature que traiga cada modulo del ERP sustituye su item y su
 * constante de ruta; nadie debe leer esta tabla como definicion del dominio quimico.
 *
 * `DASHBOARD_ROUTE` se **reutiliza** de `lib/shared/routes.ts` en vez de redeclararlo: dos
 * constantes con la misma ruta es como se acaba con `/dashboard` y `/panel` conviviendo.
 *
 * Los tests iteran `PRIVATE_NAV_ITEMS` y afirman sobre estas constantes, nunca sobre el
 * literal del copy.
 *
 * **Este archivo es la unica fuente de la navegacion.** `AppSidebar` no decide nada: recorre
 * este array y lo dibuja. Anadir un item, cambiarle el icono o moverlo de seccion se hace
 * aqui y en ningun otro sitio; el componente no se toca.
 */

// --- Rutas de ejemplo (placeholder, D2). NINGUNA existe todavia: hoy dan 404. ---
export const INVENTORY_ROUTE = '/inventario';
export const NOTIFICATIONS_ROUTE = '/notificaciones';
export const PURCHASE_ORDERS_ROUTE = '/compras/ordenes';
export const SUPPLIERS_ROUTE = '/compras/proveedores';
export const FORMULAS_ROUTE = '/produccion/formulas';
export const BATCHES_ROUTE = '/produccion/lotes';

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

export type NavLink = {
  readonly kind: 'link';
  readonly href: string;
  readonly label: string;
  readonly testId: string;
  /**
   * Icono del item. Solo lo llevan los de **nivel superior**: los hijos de un submenu se
   * dibujan sin icono, como en el diseno, y por eso es opcional en vez de obligatorio.
   */
  readonly icon?: LucideIcon;
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
  readonly icon?: LucideIcon;
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
    icon: LayoutDashboard,
    section: NAV_SECTION_OPERATION,
  },
  {
    kind: 'link',
    href: INVENTORY_ROUTE,
    label: 'Inventario',
    testId: 'nav-inventario',
    icon: Package,
    section: NAV_SECTION_OPERATION,
  },
  {
    kind: 'link',
    href: NOTIFICATIONS_ROUTE,
    label: 'Notificaciones',
    testId: 'nav-notificaciones',
    icon: Bell,
    section: NAV_SECTION_OPERATION,
    badge: 3,
  },
  {
    kind: 'group',
    label: 'Compras',
    testId: 'nav-compras',
    icon: ShoppingCart,
    section: NAV_SECTION_CHAIN,
    items: [
      {
        kind: 'link',
        href: PURCHASE_ORDERS_ROUTE,
        label: 'Órdenes de compra',
        testId: 'nav-compras-ordenes',
        icon: ClipboardList,
      },
      {
        kind: 'link',
        href: SUPPLIERS_ROUTE,
        label: 'Proveedores',
        testId: 'nav-compras-proveedores',
        icon: Truck,
      },
    ],
  },
  {
    kind: 'group',
    label: 'Producción',
    testId: 'nav-produccion',
    icon: Factory,
    section: NAV_SECTION_CHAIN,
    items: [
      {
        kind: 'link',
        href: FORMULAS_ROUTE,
        label: 'Fórmulas',
        testId: 'nav-produccion-formulas',
        icon: FlaskConical,
      },
      {
        kind: 'link',
        href: BATCHES_ROUTE,
        label: 'Lotes',
        testId: 'nav-produccion-lotes',
        icon: Boxes,
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
