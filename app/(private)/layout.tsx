import { cookies } from 'next/headers';
import type { ReactNode } from 'react';

import { AppSidebar } from '@/components/private/app-sidebar';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { PRIVATE_NAV_ITEMS } from '@/lib/shared/navigation/private-nav';
import { getSessionUser } from '@/lib/services/session-stub';
import { readSidebarOpenState, SIDEBAR_STATE_COOKIE } from '@/lib/shared/ui/sidebar-state';

import { SidebarToggle } from './components';

/**
 * Layout compartido por toda la zona privada (R1, `design.md > 5.2`).
 *
 * Server Component a proposito: es el **unico** punto que llama al proveedor de sesion y
 * reparte el resultado por props (R16). Ningun componente de `components/private/` fetchea
 * nada por su cuenta.
 *
 * Lo que este layout **no** hace (R35, y esta dicho para que no se lea como olvido):
 * no valida la sesion, no protege las rutas privadas, no lee ni emite cookie de sesion y no
 * toca base de datos. Eso es el alcance de la feature 10 (`design.md > 8`). Tampoco monta
 * ninguna region de notificaciones (R36, D9): `sonner` no entra en esta feature.
 *
 * El route group no crea ninguna URL (D11): no hay `page.tsx` y la primera pantalla privada
 * la trae la feature 9. Es lo esperado, no un archivo que falte.
 */
export default async function PrivateLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser();

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
