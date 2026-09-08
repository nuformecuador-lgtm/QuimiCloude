'use client';

import { LogOutIcon } from 'lucide-react';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';
import { logoutAction } from '@/lib/modules/identity/adapters/driving/logout-action';

/**
 * Nombre accesible del control de cierre de sesion.
 *
 * Constante de modulo y no un literal suelto en el JSX, mismo precedente que
 * `SIDEBAR_TOGGLE_LABEL` y `THEME_TOGGLE_LABEL`: los tests citan la constante, nunca el copy, y el
 * dia que entre i18n hay un solo punto que tocar.
 */
export const LOGOUT_LABEL = 'Cerrar sesión';

/**
 * Cierre de sesion del encabezado privado.
 *
 * **ENMIENDA DEL 2026-09-07 (decision humana): el control sale del menu de usuario y pasa a ser un
 * boton propio, junto al de tema.** Hasta hoy vivia en el pie de la barra lateral, dentro del menu
 * que abria `NavUser` (D12 y R19-R21 de QC-11, `specs/11-layout-privado-con-sidebar`): cerrar
 * sesion costaba dos gestos -abrir el menu y elegir- y en modo icono el menu era el unico camino.
 * Ahora es un gesto, siempre visible y siempre en el mismo sitio. Con esto el menu de usuario se
 * quedaba sin un solo item, asi que desaparece: el pie vuelve a ser lo que muestra, la identidad.
 *
 * **Sigue siendo un `<form>` real cuya accion es `logoutAction`** (R19, R20): no hay `onClick` que
 * llame a la action a mano, que romperia el envio real y el progressive enhancement. Lo unico que
 * cambia es donde esta el boton, no como funciona.
 *
 * **Mismo aspecto que `ThemeToggle`** -`variant="outline"`, cuadrado de 44px- porque son vecinos y
 * un par de controles del encabezado no puede parecer dos cosas distintas. 44px es ademas el
 * objetivo tactil minimo que este repo exige.
 */
export function LogoutButton() {
  return (
    <form action={logoutAction} data-testid="private-logout-form">
      <LogoutSubmit />
    </form>
  );
}

/**
 * El boton en si, en su propio componente por **necesidad tecnica**, no por gusto:
 * `useFormStatus()` solo lee el estado del `<form>` ANCESTRO, asi que si el hook viviera en
 * `LogoutButton` -el componente que renderiza el `<form>`- devolveria siempre `pending: false`. Es
 * la misma leccion que dejo escrita `specs/7-pantalla-de-login/design.md > 5.2`, y la razon por la
 * que existia `components/private/logout-menu-item.tsx`, que este archivo reemplaza.
 *
 * El hook es la unica fuente del pending: sin `useState` y sin props de estado. Cuando la Server
 * Action termina, React vuelve a poner `pending` en `false` por su cuenta.
 */
function LogoutSubmit() {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      variant="outline"
      className="size-11"
      disabled={pending}
      aria-busy={pending}
      aria-label={LOGOUT_LABEL}
      data-testid="private-logout"
    >
      <LogOutIcon aria-hidden="true" />
    </Button>
  );
}
