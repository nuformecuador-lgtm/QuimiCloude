'use client';

import { MoonIcon, SunIcon } from 'lucide-react';

import { useFallbackThemeState, useOptionalTheme } from '@/components/shared/theme-provider';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { ThemePreference } from '@/lib/shared/ui/theme-state';

/**
 * Nombre accesible del disparador del control de tema (R13, R23, R31).
 *
 * Constante de modulo y no un literal suelto en el JSX, siguiendo el mismo precedente que
 * `SIDEBAR_TOGGLE_LABEL` (`app/(private)/components/sidebar-toggle.tsx`): los tests citan la
 * constante, nunca el copy, y el dia que entre i18n hay un solo punto que tocar.
 */
export const THEME_TOGGLE_LABEL = 'Cambiar tema';

/** Nombre accesible de la opcion «claro» del control de tema (R14). */
export const THEME_OPTION_LIGHT_LABEL = 'Claro';

/** Nombre accesible de la opcion «oscuro» del control de tema (R14). */
export const THEME_OPTION_DARK_LABEL = 'Oscuro';

/** Nombre accesible de la opcion «sistema» del control de tema (R14). */
export const THEME_OPTION_SYSTEM_LABEL = 'Sistema';

/**
 * Control de tema del encabezado privado (R8, R13, R14, R15, R16, `design.md > 5`).
 *
 * **Por que un grupo de radio y no un boton que cicla entre modos.** Un boton que alterna
 * `claro -> oscuro -> sistema -> claro` en cada clic no deja ver las otras dos opciones sin
 * pulsarlo antes: no se descubren por exploracion. Un `DropdownMenuRadioGroup` muestra las
 * tres a la vez y ademas da gratis el «cual esta seleccionada» programatico que exige R14
 * (`aria-checked` / `role="menuitemradio"` de la primitiva) — con el boton que cicla habria
 * que fabricar esa señal a mano.
 *
 * `useTheme()` es el de **nuestro** proveedor (`components/shared/theme-provider.tsx`), no
 * una libreria de terceros (R28, D9).
 *
 * Nota de API: `DropdownMenu*` son primitivas Base UI, no Radix (mismo detalle que documenta
 * `components/private/app-sidebar.tsx`): la composicion del disparador se hace con la prop
 * `render`, no con `asChild`.
 *
 * **Icono sol/luna sin `mounted` ni render condicional en JS.** Los dos iconos se pintan
 * siempre y se alterna su visibilidad con la variante `dark:` de Tailwind (`scale-0` /
 * `scale-100`), igual que dicta `design.md > 5`: asi el HTML de servidor y el de cliente son
 * identicos byte a byte y no hay ni discrepancia de hidratacion (R12) ni parpadeo del icono en
 * el primer fotograma. Elegir el icono en JS (por ejemplo con un `useState` + `useEffect` que
 * detecte el montaje) forzaria un segundo render solo-cliente, que es exactamente el patron
 * que R12 prohibe.
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

  const { preference, setPreference } = context ?? fallback;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            className="relative size-11"
            aria-label={THEME_TOGGLE_LABEL}
            data-testid="theme-toggle-trigger"
          />
        }
      >
        <SunIcon aria-hidden="true" className="scale-100 transition-none dark:scale-0" />
        <MoonIcon
          aria-hidden="true"
          className="absolute scale-0 transition-none dark:scale-100"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" data-testid="theme-toggle-content">
        <DropdownMenuRadioGroup
          value={preference}
          onValueChange={(value) => setPreference(value as ThemePreference)}
        >
          <DropdownMenuRadioItem value="light" data-testid="theme-toggle-option-light">
            {THEME_OPTION_LIGHT_LABEL}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark" data-testid="theme-toggle-option-dark">
            {THEME_OPTION_DARK_LABEL}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system" data-testid="theme-toggle-option-system">
            {THEME_OPTION_SYSTEM_LABEL}
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
