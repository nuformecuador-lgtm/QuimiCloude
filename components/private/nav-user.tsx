'use client';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { SidebarMenu, SidebarMenuItem, useSidebar } from '@/components/ui/sidebar';
import type { SessionUser } from '@/lib/modules/identity';
import { getInitials } from '@/lib/shared/ui/initials';

type NavUserProps = {
  readonly user: SessionUser;
};

/**
 * Pie de la barra lateral: identidad del usuario (`design.md > 5.4`).
 *
 * **Los datos entran solo por props** (R16): este archivo no lee cookies, no consulta base de
 * datos, no hace peticiones de red y no importa el proveedor de sesion.
 *
 * **ENMIENDA DEL 2026-09-07 (decision humana): ya NO hay menu de usuario.** El pie abria un
 * `DropdownMenu` cuyo unico item era cerrar sesion (D12, R19-R21 de QC-11). Ese control se movio
 * al encabezado, junto al de tema (`app/(private)/components/logout-button.tsx`), asi que el menu
 * se quedaba vacio: un disparador que abre una lista sin opciones no es una pantalla mas simple,
 * es una rota. Con el desaparecen tambien `private-user-trigger` y
 * `components/private/logout-menu-item.tsx`.
 *
 * Lo que queda es lo que este pie siempre mostro -iniciales, nombre y rol-, ahora como contenido y
 * no como boton: **no hay nada que pulsar aqui**, y por eso no lo parece. El `<li>` del primitivo
 * se conserva para no romper la estructura del menu de la barra lateral.
 *
 * En modo icono (R27) se ocultan nombre y rol, que es lo que ese modo hace con todo texto; las
 * iniciales siguen visibles y el nombre completo sigue disponible como `title`, para que la
 * identidad no dependa de un texto que el modo esconde.
 */
export function NavUser({ user }: NavUserProps) {
  const { state, isMobile } = useSidebar();
  const isIconMode = state === 'collapsed' && !isMobile;

  return (
    <SidebarMenu data-testid="private-user">
      <SidebarMenuItem>
        <div
          className="flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left group-data-[collapsible=icon]:justify-center"
          title={user.displayName}
          data-testid="private-user-identity"
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
        </div>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
