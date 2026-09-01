'use client';

import { ChevronRightIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { NavUser } from '@/components/private/nav-user';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from '@/components/ui/sidebar';
import {
  BRAND_LABEL,
  BRAND_SHORT_LABEL,
  PRIVATE_NAV_LABEL,
  type NavGroup,
  type NavItem,
  type NavLink,
} from '@/lib/shared/navigation/private-nav';
import { DASHBOARD_ROUTE } from '@/lib/shared/routes';
import type { SessionUser } from '@/lib/modules/identity';

/**
 * `id` del panel de la barra lateral. Lo referencia el control de colapso con
 * `aria-controls` (R23, R31), asi que **se importa desde aqui**: nunca un literal repetido
 * en dos archivos, que es como se acaba con un `aria-controls` apuntando a la nada.
 *
 * Va en un `<div>` propio dentro de `<Sidebar>` y no en el `<Sidebar>` mismo a proposito:
 * el primitivo reparte sus props en sitios distintos segun el viewport (en escritorio, en
 * el contenedor; en movil, en el `Sheet`, que no es un elemento del DOM), asi que un `id`
 * puesto en `<Sidebar>` **se perderia en movil**.
 */
export const SIDEBAR_PANEL_ID = 'private-sidebar-panel';

type AppSidebarProps = {
  readonly user: SessionUser;
  readonly navItems: readonly NavItem[];
};

/**
 * Armazon de la barra lateral privada (`design.md > 5.2`, `5.3`, `5.5`).
 *
 * Es cliente porque necesita la ruta activa (R8, R12) y cerrar el panel superpuesto al
 * navegar (R33). **No obtiene datos por su cuenta** (R16): `user` y `navItems` entran por
 * props desde el Server Component padre.
 *
 * Ningun destino se escribe como literal (R13): salen de las constantes de
 * `lib/navigation/private-nav.ts` y de `lib/types/auth.ts`.
 *
 * Nota de API: estas primitivas son **Base UI**, no Radix. La composicion no se hace con
 * `asChild` sino con la prop `render`.
 */
export function AppSidebar({ user, navItems }: AppSidebarProps) {
  const pathname = usePathname();
  const { state, isMobile, setOpenMobile } = useSidebar();

  // R34: en viewport angosto nunca se aplica el modo icono, pase lo que pase con `state`.
  const isIconMode = state === 'collapsed' && !isMobile;

  // R33: cualquier navegacion cierra el panel superpuesto. Sin excepciones.
  const closeMobilePanel = () => setOpenMobile(false);

  return (
    <Sidebar collapsible="icon">
      <div id={SIDEBAR_PANEL_ID} data-testid="private-sidebar" className="flex h-full w-full flex-col">
        <SidebarHeader data-testid="private-brand">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                render={<Link href={DASHBOARD_ROUTE} />}
                aria-label={BRAND_LABEL}
                onClick={closeMobilePanel}
                data-testid="private-brand-link"
              >
                {isIconMode ? (
                  <span data-testid="private-brand-short">{BRAND_SHORT_LABEL}</span>
                ) : (
                  <span data-testid="private-brand-long">{BRAND_LABEL}</span>
                )}
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>

        <SidebarContent>
          <nav aria-label={PRIVATE_NAV_LABEL} data-testid="private-nav">
            <SidebarMenu>
              {navItems.map((item) =>
                item.kind === 'link' ? (
                  <NavLinkItem
                    key={item.testId}
                    item={item}
                    pathname={pathname}
                    onNavigate={closeMobilePanel}
                  />
                ) : isIconMode ? (
                  <NavGroupFloating
                    key={item.testId}
                    group={item}
                    pathname={pathname}
                    onNavigate={closeMobilePanel}
                  />
                ) : (
                  <NavGroupInline
                    key={item.testId}
                    group={item}
                    pathname={pathname}
                    onNavigate={closeMobilePanel}
                  />
                ),
              )}
            </SidebarMenu>
          </nav>
        </SidebarContent>

        <SidebarFooter>
          <NavUser user={user} />
        </SidebarFooter>
      </div>
    </Sidebar>
  );
}

type NavLinkItemProps = {
  readonly item: NavLink;
  readonly pathname: string;
  readonly onNavigate: () => void;
};

/** Item simple: enlace directo, marcado como actual cuando coincide con la ruta (R8). */
function NavLinkItem({ item, pathname, onNavigate }: NavLinkItemProps) {
  const isActive = pathname === item.href;

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        render={<Link href={item.href} />}
        isActive={isActive}
        tooltip={item.label}
        aria-label={item.label}
        aria-current={isActive ? 'page' : undefined}
        onClick={onNavigate}
        data-testid={item.testId}
      >
        <span>{item.label}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

type NavGroupProps = {
  readonly group: NavGroup;
  readonly pathname: string;
  readonly onNavigate: () => void;
};

/**
 * Item con submenu en modo expandido: `Collapsible` inline (R9–R12).
 *
 * El disparador es un `<button>` real —`SidebarMenuButton` **sin** `render`—, nunca un
 * enlace: asi es alcanzable por Tab y activable con Enter y Espacio sin codigo extra. El
 * primitivo aporta `aria-expanded` y desmonta el panel al colapsar (`keepMounted` es
 * `false` por defecto), que es lo que hace verificable R10.
 *
 * `defaultOpen` y no `open` controlado (R12): el submenu de la ruta activa arranca
 * abierto, pero el usuario puede colapsarlo despues sin que se le vuelva a abrir solo.
 */
function NavGroupInline({ group, pathname, onNavigate }: NavGroupProps) {
  const hasActiveChild = group.items.some((child) => child.href === pathname);

  return (
    <SidebarMenuItem>
      <Collapsible defaultOpen={hasActiveChild}>
        <CollapsibleTrigger
          render={
            <SidebarMenuButton
              className="w-full"
              aria-label={group.label}
              data-testid={group.testId}
            />
          }
        >
          <span>{group.label}</span>
          <ChevronRightIcon className="ml-auto transition-transform duration-200 group-data-open/menu-button:rotate-90" />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub>
            {group.items.map((child) => (
              <SidebarMenuSubItem key={child.testId}>
                <SidebarMenuSubButton
                  render={<Link href={child.href} />}
                  isActive={pathname === child.href}
                  aria-current={pathname === child.href ? 'page' : undefined}
                  onClick={onNavigate}
                  data-testid={child.testId}
                >
                  <span>{child.label}</span>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            ))}
          </SidebarMenuSub>
        </CollapsibleContent>
      </Collapsible>
    </SidebarMenuItem>
  );
}

/**
 * Item con submenu en modo icono: menu flotante anclado al icono (R26).
 *
 * Un `Collapsible` que se expande hacia abajo no cabe en una columna de iconos, y los hijos
 * inline los oculta por CSS el propio `SidebarMenuSubButton`. Es una rama **o** la otra:
 * renderizar las dos a la vez duplicaria cada enlace en el arbol.
 */
function NavGroupFloating({ group, pathname, onNavigate }: NavGroupProps) {
  return (
    <SidebarMenuItem>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <SidebarMenuButton
              className="w-full"
              aria-label={group.label}
              data-testid={group.testId}
            />
          }
        >
          <span>{group.label}</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="right" align="start" className="min-w-48">
          {group.items.map((child) => (
            <DropdownMenuItem
              key={child.testId}
              render={<Link href={child.href} />}
              aria-current={pathname === child.href ? 'page' : undefined}
              onClick={onNavigate}
              data-testid={child.testId}
            >
              {child.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  );
}
