import {
  Bell,
  Boxes,
  ClipboardList,
  Contact,
  Factory,
  FlaskConical,
  LayoutDashboard,
  Package,
  ShoppingCart,
  Truck,
  Users,
  type LucideIcon,
} from 'lucide-react';

import type { NavIconName } from './private-nav';

/**
 * Traduce el nombre de icono que declara `PRIVATE_NAV_ITEMS` al componente que lo dibuja.
 *
 * **Vive separado de `private-nav.ts` por una razon de ejecucion, no de estilo.** Ese archivo
 * lo importa `app/(private)/layout.tsx`, que es Server Component, y sus items cruzan por props
 * a `AppSidebar`, que es cliente. Un icono de `lucide-react` no es serializable —es un objeto
 * con `$$typeof` y `render`—, asi que meterlo en el array rompe la aplicacion en ejecucion:
 *
 *     Only plain objects can be passed to Client Components from Server Components.
 *
 * Y no lo ve **ningun test unitario**, porque en jsdom no existe la frontera servidor/cliente
 * y todo se renderiza igual. Paso en `dev` el 2026-09-02 con la suite entera en verde.
 *
 * Por eso el array lleva cadenas y la resolucion ocurre aqui, del lado del cliente.
 *
 * Anadir un icono nuevo es anadir su nombre a `NavIconName` y su fila a este mapa: el tipo
 * `Record` obliga a que las dos listas cuadren, asi que **olvidar una fila no compila**.
 */
export const NAV_ICONS: Record<NavIconName, LucideIcon> = {
  'layout-dashboard': LayoutDashboard,
  package: Package,
  bell: Bell,
  'shopping-cart': ShoppingCart,
  'clipboard-list': ClipboardList,
  truck: Truck,
  factory: Factory,
  'flask-conical': FlaskConical,
  boxes: Boxes,
  // QC-67 R2 — la fila del unico icono que esa ficha anade. El `Record<NavIconName, LucideIcon>`
  // obliga a que este aqui: olvidarla no compila.
  users: Users,
  contact: Contact,
};
