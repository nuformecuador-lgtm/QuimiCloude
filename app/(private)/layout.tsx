import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { AppSidebar } from '@/components/private/app-sidebar';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { identity } from '@/lib/composition';
import { PRIVATE_NAV_ITEMS } from '@/lib/shared/navigation/private-nav';
import { LOGIN_ROUTE } from '@/lib/shared/routes';
import { readSidebarOpenState, SIDEBAR_STATE_COOKIE } from '@/lib/shared/ui/sidebar-state';

import { SidebarToggle } from './components';

/**
 * Layout compartido por toda la zona privada (R1, `design.md > 5.2`).
 *
 * Server Component a proposito: es el **unico** punto que llama al proveedor de sesion y
 * reparte el resultado por props (R16). Ningun componente de `components/private/` fetchea
 * nada por su cuenta.
 *
 * Este layout SI valida que haya sesion (R16, R17): sin `SessionUser`, redirige a
 * `LOGIN_ROUTE` antes de pintar nada de la zona privada. Lo que sigue **no** haciendo (R35,
 * y esta dicho para que no se lea como olvido): no lee ni emite cookie de sesion y no toca
 * base de datos ni red. La proteccion barata de ruta en `middleware.ts` es **QC-9**, anterior
 * a este render y mas eficiente; el chequeo de aqui no la sustituye, es la ultima linea de
 * defensa si algo llega hasta el Server Component sin sesion. Tampoco monta ninguna region
 * de notificaciones (R36, D9): `sonner` no entra en esta feature.
 *
 * El route group no crea ninguna URL (D11): no hay `page.tsx` y la primera pantalla privada
 * la trae la feature 9. Es lo esperado, no un archivo que falte.
 */
export default async function PrivateLayout({ children }: { children: ReactNode }) {
  const user = await identity.getSessionUser();
  if (user === null) {
    redirect(LOGIN_ROUTE);
  }

  // R28: el `SidebarProvider` **escribe** la cookie de preferencia de UI pero nunca la lee
  // (su estado inicial es `useState(defaultOpen)`), asi que la persistencia entre recargas
  // solo existe si el servidor le pasa el estado guardado. Es cookie de UI, no de sesion
  // (`lib/utils/sidebar-state.ts`, `design.md > 5.5`).
  const cookieStore = await cookies();
  const defaultOpen = readSidebarOpenState(cookieStore.get(SIDEBAR_STATE_COOKIE)?.value);

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <AppSidebar user={user} navItems={PRIVATE_NAV_ITEMS} />
      {/*
        `SidebarInset` **es** el `<main>` (lo renderiza el propio primitivo), asi que aqui no
        se anida otro: R5 exige un landmark `main` unico. Un `<header>` dentro de `<main>` es
        HTML valido y no crea landmark `banner`, que es justo lo que se quiere.
      */}
      <SidebarInset data-testid="private-content">
        <header
          data-testid="private-header"
          className="flex h-14 shrink-0 items-center gap-2 border-b px-4"
        >
          <SidebarToggle />
        </header>
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
