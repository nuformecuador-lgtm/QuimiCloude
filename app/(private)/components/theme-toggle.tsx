'use client';

import { MoonIcon, SunIcon } from 'lucide-react';

import { useFallbackThemeState, useOptionalTheme } from '@/components/shared/theme-provider';
import { Button } from '@/components/ui/button';

/**
 * Nombre accesible del control de tema (R13, R23, R31).
 *
 * Constante de modulo y no un literal suelto en el JSX, siguiendo el mismo precedente que
 * `SIDEBAR_TOGGLE_LABEL` (`app/(private)/components/sidebar-toggle.tsx`): los tests citan la
 * constante, nunca el copy, y el dia que entre i18n hay un solo punto que tocar.
 */
export const THEME_TOGGLE_LABEL = 'Cambiar tema';

/**
 * Control de tema del encabezado privado (R8, R13, R14, R15, R16, `design.md > 5`).
 *
 * **ENMIENDA DEL 2026-09-07 (decision humana): es un INTERRUPTOR de dos estados, no un menu de
 * tres opciones.** Un clic alterna claro <-> oscuro y ya. La tercera opcion, «sistema», deja de
 * ser algo que el usuario elige y pasa a ser el PUNTO DE PARTIDA: mientras nadie haya tocado el
 * control, la preferencia guardada es `system` y el modo sale del sistema operativo -incluidos
 * sus cambios en vivo, que `ThemeProvider` sigue escuchando (R17)-. El primer clic la fija.
 *
 * Lo que se pierde, dicho sin adornos: una vez fijado un modo, desde este control **ya no se
 * puede volver a «seguir al sistema»** (habria que borrar la cookie de UI). Es el precio de un
 * control de un solo gesto, y es la decision que se pidio.
 *
 * `useTheme()` es el de **nuestro** proveedor (`components/shared/theme-provider.tsx`), no una
 * libreria de terceros (R28, D9).
 *
 * **Nada de lo que se PINTA depende del modo resuelto, y no es un detalle** (R12): el marcado
 * que sale del servidor y el que hidrata el cliente son identicos byte a byte. Los dos iconos se
 * pintan siempre y se alterna su visibilidad con la variante `dark:` de Tailwind (`scale-0` /
 * `scale-100`), como ya dictaba `design.md > 5`; y el nombre accesible es una constante, no una
 * frase que cambie con el modo. El modo solo se consulta DENTRO del manejador de clic, que corre
 * despues de hidratar: por eso este control no puede producir ni discrepancia de hidratacion ni
 * parpadeo, que es justo lo que R12 prohibe. Un `aria-pressed` calculado en el render, o una
 * etiqueta del tipo «cambiar a oscuro», habrian reintroducido las dos cosas.
 */
export function ThemeToggle() {
  // `useOptionalTheme` (no `useTheme`) a proposito: ver el docblock de
  // `components/shared/theme-provider.tsx > useOptionalTheme`. Sin `<ThemeProvider>` ancestro
  // (nunca pasa sirviendo trafico real, R27) este control se auto-gestiona con
  // `useFallbackThemeState`, que reutiliza exactamente el mismo criterio de resolucion y
  // aplicacion que `ThemeProvider` (`design.md > 3.3`) en vez de repetirlo aqui. `active`
  // deshabilita el listener de `matchMedia` del respaldo mientras SI hay contexto real, para no
  // suscribir de mas (las reglas de hooks exigen llamar a `useFallbackThemeState` siempre, haya
  // o no contexto).
  const context = useOptionalTheme();
  const fallback = useFallbackThemeState({ active: context === null });

  const { resolved, setPreference } = context ?? fallback;

  return (
    <Button
      variant="outline"
      className="relative size-11"
      aria-label={THEME_TOGGLE_LABEL}
      data-testid="theme-toggle-trigger"
      // El modo se lee AQUI y no en el render (ver el docblock): `resolved` es el efectivo, asi
      // que partiendo de `system` el primer clic va al contrario de lo que el usuario esta
      // viendo, no al contrario de una preferencia que aun no ha elegido.
      onClick={() => setPreference(resolved === 'dark' ? 'light' : 'dark')}
    >
      <SunIcon aria-hidden="true" className="scale-100 transition-none dark:scale-0" />
      <MoonIcon aria-hidden="true" className="absolute scale-0 transition-none dark:scale-100" />
    </Button>
  );
}
