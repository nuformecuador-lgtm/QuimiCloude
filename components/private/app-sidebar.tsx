'use client';

import { ChevronRightIcon, FlaskConicalIcon, PanelLeftIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

import { NavUser } from '@/components/private/nav-user';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from '@/components/ui/sidebar';
import { NAV_ICONS } from '@/lib/shared/navigation/nav-icons';
import {
  BRAND_LABEL,
  BRAND_SHORT_LABEL,
  BRAND_TAGLINE,
  PRIVATE_NAV_LABEL,
  groupNavItemsBySection,
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

/**
 * Nombre accesible de la pastilla de colapso del borde.
 *
 * Es **distinto** del de `SidebarToggle` del encabezado a proposito: los dos controles hacen
 * lo mismo y conviven en pantalla, y dos elementos interactivos con el mismo nombre accesible
 * son indistinguibles para quien navega por lista de controles.
 */
export const SIDEBAR_EDGE_TOGGLE_LABEL = 'Plegar o desplegar la barra lateral';

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
 * `lib/shared/navigation/private-nav.ts` y de `lib/shared/routes.ts`.
 *
 * **Este componente no decide nada de la navegacion**: recorre `navItems`, los agrupa con
 * `groupNavItemsBySection` y los dibuja con el icono y el contador que trae cada uno. Anadir
 * un item, cambiarle el icono o moverlo de seccion se hace en el array, no aqui.
 *
 * Nota de API: estas primitivas son **Base UI**, no Radix. La composicion no se hace con
 * `asChild` sino con la prop `render`.
 */
export function AppSidebar({ user, navItems }: AppSidebarProps) {
  const pathname = usePathname();
  const { state, isMobile, setOpenMobile, open, toggleSidebar } = useSidebar();

  // R34: en viewport angosto nunca se aplica el modo icono, pase lo que pase con `state`.
  const isIconMode = state === 'collapsed' && !isMobile;

  // R33: cualquier navegacion cierra el panel superpuesto. Sin excepciones.
  const closeMobilePanel = () => setOpenMobile(false);

  const secciones = groupNavItemsBySection(navItems);

  return (
    // R18, `design.md > 6`: `variant="floating"` es prop publica del primitivo, y
    // `className="p-[18px]"` fija el margen exterior del panel; `tailwind-merge` resuelve el
    // conflicto con el `p-2` que trae `sidebar-container` de serie. No se toca
    // `components/ui/sidebar.tsx` (R21).
    <Sidebar collapsible="icon" variant="floating" className="p-[18px]">
      <div
        id={SIDEBAR_PANEL_ID}
        data-testid="private-sidebar"
        className="relative flex h-full w-full flex-col"
      >
        <SidebarHeader data-testid="private-brand">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                render={<Link href={DASHBOARD_ROUTE} />}
                aria-label={BRAND_LABEL}
                onClick={closeMobilePanel}
                data-testid="private-brand-link"
                className="h-auto gap-3 py-2"
              >
                {/*
                  Simbolo de marca: **quemado a proposito** (decision humana del 2026-09-02).
                  No hay identidad visual definida; cuando la haya, el icono y el degradado
                  salen de donde diga esa ficha.
                */}
                {/*
                  En modo icono el simbolo ES la marca: lleva dentro las iniciales (R24) en
                  lugar del matraz, como en el diseno. Dibujar el cuadro y ademas el texto al
                  lado no cabe en los 44px del rail —el contenido acababa aplastado contra el
                  padding— y duplicaria la marca en una columna de iconos.
                */}
                <span
                  aria-hidden={isIconMode ? undefined : 'true'}
                  data-testid="private-brand-mark"
                  className="flex size-9 shrink-0 items-center justify-center rounded-[13px] bg-linear-150 from-sidebar-primary to-sidebar-primary/70 font-mono text-[12.5px] font-medium text-sidebar-primary-foreground shadow-[0_8px_22px_-8px_var(--sidebar-primary)]"
                >
                  {isIconMode ? (
                    <span data-testid="private-brand-short">{BRAND_SHORT_LABEL}</span>
                  ) : (
                    <FlaskConicalIcon className="size-5" />
                  )}
                </span>
                {isIconMode ? null : (
                  <span className="flex min-w-0 flex-col text-left leading-tight">
                    <span
                      data-testid="private-brand-long"
                      className="truncate text-base font-semibold tracking-tight"
                    >
                      {BRAND_LABEL}
                    </span>
                    <span
                      data-testid="private-brand-tagline"
                      className="truncate font-mono text-[9.5px] tracking-[0.16em] text-muted-foreground uppercase"
                    >
                      {BRAND_TAGLINE}
                    </span>
                  </span>
                )}
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>

        <SidebarContent>
          <nav aria-label={PRIVATE_NAV_LABEL} data-testid="private-nav">
            {secciones.map((seccion, indice) => (
              <SidebarGroup key={seccion.label ?? `sin-seccion-${indice}`}>
                {seccion.label === null ? null : (
                  <SidebarGroupLabel
                    data-testid="private-nav-section"
                    className="font-mono text-[9.5px] tracking-[0.18em] uppercase"
                  >
                    {seccion.label}
                  </SidebarGroupLabel>
                )}
                <SidebarGroupContent>
                  <SidebarMenu>
                    {seccion.items.map((item) =>
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
                </SidebarGroupContent>
              </SidebarGroup>
            ))}
          </nav>
        </SidebarContent>

        <SidebarFooter>
          <NavUser user={user} />
        </SidebarFooter>

        {/*
          Pastilla de colapso en el borde del panel (diseno aprobado 2026-09-02). **No
          sustituye** al `SidebarToggle` del encabezado: el diseno lleva los dos, y quitar el
          del encabezado romperia R23 y R31 de QC-11, que lo dan por presente ahi.

          Solo escritorio: en movil el panel es un `Sheet` que se cierra solo al navegar (R33)
          y una pastilla colgada de su borde no tendria donde anclarse.
        */}
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={toggleSidebar}
          aria-label={SIDEBAR_EDGE_TOGGLE_LABEL}
          aria-expanded={open}
          aria-controls={SIDEBAR_PANEL_ID}
          data-testid="private-sidebar-edge-toggle"
          className="absolute top-6 -right-[26px] hidden rounded-[10px] bg-sidebar text-sidebar-foreground shadow-[0_0_0_1px_var(--sidebar-border),0_8px_18px_-8px_rgba(10,40,40,0.55)] md:inline-flex hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring"
        >
          <PanelLeftIcon className="size-3.5" />
        </Button>
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
  const Icon = item.icon ? NAV_ICONS[item.icon] : undefined;

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
        {Icon ? <Icon aria-hidden="true" /> : null}
        <span>{item.label}</span>
        {item.badge === undefined ? null : (
          // El contador es **un valor fijo del array**, no un dato real: no existe fuente de
          // notificaciones en el repo (ver `private-nav.ts`).
          <Badge
            data-testid={`${item.testId}-badge`}
            className="ml-auto group-data-[collapsible=icon]:hidden"
          >
            {item.badge}
          </Badge>
        )}
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
 * Controlado con estado local sembrado desde la ruta activa (R12): el submenu de la ruta
 * activa arranca abierto, pero a partir de ahi manda el usuario —si lo colapsa, no se le
 * vuelve a abrir solo en el siguiente render—. No hay `useEffect` que resincronice `open`
 * con `pathname`: eso reabriria el submenu por su cuenta y romperia R12. Con `defaultOpen`
 * el valor inicial cambiaba al navegar y Base UI avisaba de que un `Collapsible` no
 * controlado estaba cambiando su estado inicial tras inicializarse.
 */
function NavGroupInline({ group, pathname, onNavigate }: NavGroupProps) {
  const hasActiveChild = group.items.some((child) => child.href === pathname);
  const Icon = group.icon ? NAV_ICONS[group.icon] : undefined;
  const [open, setOpen] = useState(hasActiveChild);

  return (
    <SidebarMenuItem>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger
          render={
            <SidebarMenuButton
              className="w-full"
              aria-label={group.label}
              data-testid={group.testId}
            />
          }
        >
          {Icon ? <Icon aria-hidden="true" /> : null}
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
  const Icon = group.icon ? NAV_ICONS[group.icon] : undefined;

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
          {Icon ? <Icon aria-hidden="true" /> : null}
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
