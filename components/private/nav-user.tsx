'use client';

import { LogoutMenuItem } from '@/components/private/logout-menu-item';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';
import { logoutAction } from '@/lib/actions/logout';
import type { SessionUser } from '@/lib/modules/identity';
import { getInitials } from '@/lib/shared/ui/initials';

type NavUserProps = {
  readonly user: SessionUser;
};

/**
 * Pie de la barra lateral: identidad del usuario y menu de usuario (`design.md > 5.4`).
 *
 * **Los datos entran solo por props** (R16): este archivo no lee cookies, no consulta base
 * de datos, no hace peticiones de red y no importa el proveedor de sesion.
 *
 * El menu contiene **solo** el cierre de sesion (D12), dentro de un `<form>` real cuya
 * accion es `logoutAction` (R19). No hay `onClick` que llame a la action a mano: eso
 * romperia el envio real y el progressive enhancement.
 *
 * `closeOnClick={false}` en el item es deliberado (`design.md > 10.10`): con el valor por
 * defecto el menu se cierra al pulsar y desmonta el `<form>` antes de que la action termine,
 * lo que dejaria R20 y R21 verdes en teoria y rotos en el navegador.
 *
 * `aria-label` explicito en el disparador porque en modo icono (R27) el nombre visible se
 * oculta: el nombre accesible tiene que sobrevivir a los dos modos.
 */
export function NavUser({ user }: NavUserProps) {
  const { state, isMobile } = useSidebar();
  const isIconMode = state === 'collapsed' && !isMobile;

  return (
    <SidebarMenu data-testid="private-user">
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                size="lg"
                aria-label={user.displayName}
                data-testid="private-user-trigger"
              />
            }
          >
            <Avatar size="sm">
              <AvatarFallback data-testid="private-user-initials">
                {getInitials(user.displayName)}
              </AvatarFallback>
            </Avatar>
            {isIconMode ? null : (
              <span className="flex min-w-0 flex-1 flex-col text-left leading-tight">
                <span className="truncate text-sm" data-testid="private-user-name">
                  {user.displayName}
                </span>
                {user.roleName === null ? null : (
                  <span
                    className="truncate text-xs text-muted-foreground"
                    data-testid="private-user-role"
                  >
                    {user.roleName}
                  </span>
                )}
              </span>
            )}
          </DropdownMenuTrigger>

          <DropdownMenuContent
            side={isMobile ? 'top' : 'right'}
            align="end"
            className="min-w-48"
          >
            <form action={logoutAction} data-testid="private-logout-form">
              <DropdownMenuItem closeOnClick={false} nativeButton render={<LogoutMenuItem />} />
            </form>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
