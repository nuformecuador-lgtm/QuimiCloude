'use client';

import { MoonIcon, SunIcon } from 'lucide-react';

import { useFallbackThemeState, useOptionalTheme } from '@/components/shared/theme-provider';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

/**
 * Nombre accesible del control de tema (R13, R23, R31).
 *
 * Constante de modulo y no un literal suelto en el JSX, siguiendo el mismo precedente que
 * `SIDEBAR_TOGGLE_LABEL` (`app/(private)/components/sidebar-toggle.tsx`): los tests citan la
 * constante, nunca el copy, y el dia que entre i18n hay un solo punto que tocar.
 */
export const THEME_TOGGLE_LABEL = 'Cambiar tema';

/**
 * Interruptor claro/oscuro del encabezado privado.
 *
 * Mientras nadie lo toque la preferencia es `system`; el primer clic la fija y desde aqui ya no
 * se vuelve a «seguir al sistema».
 *
 * Nada de lo que se pinta depende del modo resuelto: los dos iconos salen siempre y la variante
 * `dark:` decide cual se ve, asi el HTML del servidor y el de la hidratacion son iguales. El modo
 * solo se lee dentro del manejador de clic.
 */
export function ThemeToggle() {
  // Sin `ThemeProvider` ancestro el control se auto-gestiona; `active` evita suscribir el
  // respaldo a `matchMedia` cuando si hay contexto.
  const context = useOptionalTheme();
  const fallback = useFallbackThemeState({ active: context === null });

  const { resolved, setPreference } = context ?? fallback;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="outline"
            className="relative size-11"
            aria-label={THEME_TOGGLE_LABEL}
            data-testid="theme-toggle-trigger"
            // `resolved` y no la preferencia: partiendo de `system`, el primer clic va al
            // contrario de lo que el usuario esta viendo.
            onClick={() => setPreference(resolved === 'dark' ? 'light' : 'dark')}
          />
        }
      >
        <SunIcon
          aria-hidden="true"
          className="scale-100 rotate-0 opacity-100 transition-[rotate,scale,opacity] duration-(--dur-base) ease-(--ease-standard) dark:scale-0 dark:rotate-90 dark:opacity-0"
        />
        <MoonIcon
          aria-hidden="true"
          className="absolute scale-0 -rotate-90 opacity-0 transition-[rotate,scale,opacity] duration-(--dur-base) ease-(--ease-standard) dark:scale-100 dark:rotate-0 dark:opacity-100"
        />
      </TooltipTrigger>
      <TooltipContent side="bottom">{THEME_TOGGLE_LABEL}</TooltipContent>
    </Tooltip>
  );
}
