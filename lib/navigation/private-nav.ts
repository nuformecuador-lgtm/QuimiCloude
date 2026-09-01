import { DASHBOARD_ROUTE } from '@/lib/types/auth';

/**
 * Navegacion de la zona privada (`design.md > 4.3`).
 *
 * **Los items y sus rutas son datos de relleno (placeholder, D2), no dominio.** Salvo
 * el dashboard —que crea la feature 9—, **ninguna de estas rutas existe**: visitarlas
 * hoy da **404, y eso es lo esperado**, mismo patron que `FORGOT_PASSWORD_ROUTE` de la
 * feature 7. La feature que traiga cada modulo del ERP sustituye su item y su
 * constante de ruta; nadie debe leer esta tabla como definicion del dominio quimico.
 *
 * `DASHBOARD_ROUTE` se **reutiliza** de `lib/types/auth.ts` en vez de redeclararlo: dos
 * constantes con la misma ruta es como se acaba con `/dashboard` y `/panel` conviviendo.
 *
 * Los tests iteran `PRIVATE_NAV_ITEMS` y afirman sobre estas constantes, nunca sobre el
 * literal del copy.
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

export type NavLink = {
  readonly kind: 'link';
  readonly href: string;
  readonly label: string;
  readonly testId: string;
};

export type NavGroup = {
  readonly kind: 'group';
  readonly label: string;
  readonly testId: string;
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
  },
  {
    kind: 'link',
    href: INVENTORY_ROUTE,
    label: 'Inventario',
    testId: 'nav-inventario',
  },
  {
    kind: 'link',
    href: NOTIFICATIONS_ROUTE,
    label: 'Notificaciones',
    testId: 'nav-notificaciones',
  },
  {
    kind: 'group',
    label: 'Compras',
    testId: 'nav-compras',
    items: [
      {
        kind: 'link',
        href: PURCHASE_ORDERS_ROUTE,
        label: 'Órdenes de compra',
        testId: 'nav-compras-ordenes',
      },
      {
        kind: 'link',
        href: SUPPLIERS_ROUTE,
        label: 'Proveedores',
        testId: 'nav-compras-proveedores',
      },
    ],
  },
  {
    kind: 'group',
    label: 'Producción',
    testId: 'nav-produccion',
    items: [
      {
        kind: 'link',
        href: FORMULAS_ROUTE,
        label: 'Fórmulas',
        testId: 'nav-produccion-formulas',
      },
      {
        kind: 'link',
        href: BATCHES_ROUTE,
        label: 'Lotes',
        testId: 'nav-produccion-lotes',
      },
    ],
  },
];
