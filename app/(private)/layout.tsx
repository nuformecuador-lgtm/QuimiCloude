import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { CSSProperties, ReactNode } from 'react';

import { AppSidebar } from '@/components/private/app-sidebar';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { Toaster } from '@/components/ui/sonner';
import { identity } from '@/lib/composition';
import {
  filterNavItemsByPermissions,
  PRIVATE_NAV_ITEMS,
} from '@/lib/shared/navigation/private-nav';
import { LOGIN_ROUTE } from '@/lib/shared/routes';
import { readSidebarOpenState, SIDEBAR_STATE_COOKIE } from '@/lib/shared/ui/sidebar-state';

import { LogoutButton, SidebarToggle, ThemeToggle } from './components';

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
 * defensa si algo llega hasta el Server Component sin sesion.
 *
 * Este layout SI monta la region de avisos emergentes (`<Toaster />`, R22 de QC-22). Eso
 * **supera expresamente a R36/D9 de QC-11**, que la dejaba fuera: es decision humana del
 * 2026-09-03, no una regresion ni un «ya que estamos». Se monta con las mismas opciones que
 * la zona publica (`richColors`) y **no** se promueve al root layout: hoy son dos zonas con
 * armazones distintos y promoverlo obligaria a tocar un tercer archivo sin necesidad.
 *
 * Este layout SI arma la navegacion con los permisos de la sesion (QC-75 R1, R2, R19): filtra
 * `PRIVATE_NAV_ITEMS` con `user.permissions` **antes** de pasarselo a `AppSidebar`, de modo que
 * un item sin permiso no aparece en el HTML servido —ni etiqueta, ni `href`, ni `data-testid`— en
 * vez de ocultarse con CSS. `AppSidebar` no se toca: la fuente decide y el componente dibuja
 * (decision cerrada nº 7, heredada de QC-11). Y **no anade ninguna consulta** (R19): los permisos
 * llegan en la MISMA lectura de sesion que ya existia.
 *
 * Este layout tambien es el que envuelve el 404 de la zona privada (QC-75 R8): `notFound()`
 * lanzado desde una `page.tsx` lo pinta `app/(private)/not-found.tsx`, que por vivir en este
 * route group se renderiza DENTRO de este armazon —menu filtrado, cabecera y cerrar sesion
 * presentes—.
 *
 * **Este layout NO debe llamar nunca a `notFound()`.** Un `notFound()` lanzado en un layout hace
 * fallar ese layout, asi que responderia el limite de ARRIBA y el 404 saldria pelado, sin menu ni
 * boton de salir: quien no tenga ningun permiso quedaria encerrado. El corte por permiso va en
 * cada pagina (`requirePagePermission`), no aqui. Motivo completo en `app/(private)/not-found.tsx`.
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
  // QC-75 R1, R2, R19: el menu se arma en el servidor con los permisos de esta misma lectura de
  // sesion. Cero consultas nuevas.
  const navItems = filterNavItemsByPermissions(PRIVATE_NAV_ITEMS, user.permissions);

  const cookieStore = await cookies();
  const defaultOpen = readSidebarOpenState(cookieStore.get(SIDEBAR_STATE_COOKIE)?.value);

  return (
    // R19, `design.md > 6`: el primitivo hace `{...defaults, ...style}`, asi que estas dos
    // variables (ancho expandido 272px, ancho en modo icono 78px) ganan a las de
    // `components/ui/sidebar.tsx` sin tocar ese archivo (R21).
    <SidebarProvider
      defaultOpen={defaultOpen}
      style={{ '--sidebar-width': '17rem', '--sidebar-width-icon': '4.875rem' } as CSSProperties}
    >
      <AppSidebar user={user} navItems={navItems} />
      {/*
        `SidebarInset` **es** el `<main>` (lo renderiza el propio primitivo), asi que aqui no
        se anida otro: R5 exige un landmark `main` unico. Un `<header>` dentro de `<main>` es
        HTML valido y no crea landmark `banner`, que es justo lo que se quiere.
      */}
      {/*
        `min-w-0` NO es decoracion: `SidebarInset` es un elemento flexible dentro del envoltorio
        del panel lateral, y un elemento flexible tiene `min-width: auto`, o sea que su ancho
        MINIMO es el de su contenido. Con una tabla ancha dentro, el contenido principal se
        estiraba mas alla de la ventana y el scroll horizontal se lo comia el documento entero:
        la tabla se salia del contenedor principal y arrastraba la cabecera y el resto de la
        pantalla con ella. Con `min-w-0` el contenido puede encoger hasta el ancho disponible, y
        el desbordamiento lo absorbe quien debe -el `div[data-slot=table-container]` del
        primitivo, que ya declara `overflow-x-auto`-.

        Se pasa por `className` desde aqui, no editando `components/ui/sidebar.tsx`: el primitivo
        no se toca (R21, R48), y el `cn` del propio primitivo compone las dos clases.
      */}
      <SidebarInset data-testid="private-content" className="min-w-0">
        <header
          data-testid="private-header"
          className="flex h-14 shrink-0 items-center justify-between gap-2 border-b px-4"
        >
          {/*
            El control de la cabecera queda **solo para movil** (decision humana del
            2026-09-02: «existen 2 botones para contraer el sidebar, quita el de la
            cabecera»). En escritorio el unico control es la pastilla del borde del panel.

            No se elimina del todo por una razon de funcionamiento, no de gusto: la pastilla
            vive DENTRO del panel, y en movil el panel es un `Sheet` que, cerrado, no esta en
            pantalla. Sin este boton no habria forma de abrir el menu en el telefono, y R31 de
            QC-11 quedaria sin cumplir. Se oculta por CSS, asi que sigue en el DOM y los tests
            de QC-11 que lo dan por presente siguen siendo validos.
          */}
          <div className="md:hidden">
            <SidebarToggle />
          </div>
          {/* `ml-auto` y no solo el `justify-between` del header: en escritorio el control de
              la izquierda esta oculto y no ocupa espacio, asi que sin esto los de la derecha se
              quedarian pegados al borde izquierdo.

              El cierre de sesion vive AQUI desde el 2026-09-07 (decision humana), junto al de
              tema, y ya no dentro del menu del pie de la barra lateral: era el unico item de ese
              menu, costaba dos gestos y en modo icono era el unico camino. Detalle en
              `./components/logout-button.tsx`. */}
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <LogoutButton />
          </div>
        </header>
        {children}
      </SidebarInset>
      {/* R22 de QC-22 (decision humana del 2026-09-03, supera a R36/D9 de QC-11): region de
          avisos de la zona privada, hermana del contenido para que ningun toast quede dentro
          del `<main>`. Misma configuracion que la zona publica.

          Efecto secundario que conviene saber, no es un bug: `markOthers` de Base UI excluye
          del `aria-hidden` la rama que lleva a cualquier `[aria-live]`, para que los toasts se
          sigan anunciando con el panel movil abierto. Desde que esta region existe, el
          `aria-hidden` cae en los hijos (el `<main>`, que es lo que importa) y ya no en el
          contenedor exterior, que solo conserva el marcador `data-base-ui-inert`. */}
      <Toaster richColors />
    </SidebarProvider>
  );
}
