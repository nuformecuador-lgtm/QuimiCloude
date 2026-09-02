'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import {
  buildThemeCookie,
  readThemePreference,
  THEME_COOKIE,
  THEME_DARK_CLASS,
  type ThemePreference,
} from '@/lib/shared/ui/theme-state';

/**
 * Contexto y proveedor del tema (R7, R8, R9, R12, R15, R17, R26, `design.md > 3.3` y `> 4`).
 *
 * Mismo reparto que `SidebarProvider` (`components/ui/sidebar.tsx`) frente a
 * `lib/shared/ui/sidebar-state.ts`: este proveedor **escribe** la cookie de preferencia al
 * cambiarla, pero nunca la lee — la persistencia entre recargas y entre sesiones del navegador
 * (R9) existe solo porque `app/layout.tsx` lee la cookie en servidor y siembra
 * `initialPreference` por props. **A propósito no hay ningún `useEffect` que lea la cookie**:
 * eso reintroduciría el parpadeo por la puerta de atrás, porque el primer render de React ya
 * tiene que coincidir con lo que el script anti-parpadeo dejó en el DOM.
 *
 * `resolved` es el modo efectivo (`'light' | 'dark'`), distinto de `preference` cuando esta es
 * `'system'`. Mientras `preference === 'system'`, un `useEffect` suscribe
 * `matchMedia('(prefers-color-scheme: dark)')` con `addEventListener('change', …)` (nunca el
 * `addListener` obsoleto) para reflejar un cambio del sistema operativo sin recargar la página
 * (R17); se da de baja al desmontar y también en cuanto la preferencia deja de ser `'system'`,
 * para que un usuario con modo fijo no se vea arrastrado por el ajuste del sistema.
 *
 * `setPreference` hace tres cosas, en este orden exacto (`design.md > 3.3`): escribe la cookie
 * con `buildThemeCookie`, aplica clase y `color-scheme` al `documentElement`, y por último
 * actualiza el estado de React — así el cambio se ve de inmediato, sin recargar (R15).
 */

type ThemeContextValue = {
  preference: ThemePreference;
  resolved: 'light' | 'dark';
  setPreference: (preference: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

const DARK_MEDIA_QUERY = '(prefers-color-scheme: dark)';

/** Resuelve el modo efectivo a partir de la preferencia y del sistema operativo actual. */
function resolvePreference(preference: ThemePreference): 'light' | 'dark' {
  if (preference === 'dark') return 'dark';
  if (preference === 'light') return 'light';
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'light';
  return window.matchMedia(DARK_MEDIA_QUERY).matches ? 'dark' : 'light';
}

/** Aplica el modo resuelto al elemento raíz del documento. */
function applyResolvedTheme(resolved: 'light' | 'dark'): void {
  document.documentElement.classList.toggle(THEME_DARK_CLASS, resolved === 'dark');
  document.documentElement.style.colorScheme = resolved;
}

/**
 * Estado del tema (preferencia + modo resuelto + `setPreference`), extraido de `ThemeProvider`
 * para que lo compartan las dos unicas implementaciones del criterio (`design.md > 3.3`): el
 * propio `ThemeProvider` y la ruta de respaldo de `ThemeToggle` quando no hay `<ThemeProvider>`
 * ancestro (ver `useOptionalTheme` mas abajo). `resolvePreference` y `applyResolvedTheme` (esta
 * ultima incluye `color-scheme`, no solo la clase) son la unica fuente de ese criterio; este
 * hook solo las orquesta con el estado de React.
 *
 * `active` (por defecto `true`) permite que un consumidor que no vaya a usar el resultado —el
 * respaldo de `ThemeToggle` mientras SI hay `<ThemeProvider>` ancestro— llame al hook igual
 * (las reglas de hooks lo exigen) sin suscribir el listener de `matchMedia` de mas.
 */
function useThemeState(
  initialPreference: ThemePreference,
  options?: { active?: boolean },
): ThemeContextValue {
  const active = options?.active ?? true;

  const [preference, setPreferenceState] = useState<ThemePreference>(initialPreference);
  const [resolved, setResolved] = useState<'light' | 'dark'>(() =>
    resolvePreference(initialPreference),
  );

  const setPreference = useCallback((next: ThemePreference) => {
    document.cookie = buildThemeCookie(next);

    const nextResolved = resolvePreference(next);
    applyResolvedTheme(nextResolved);

    setPreferenceState(next);
    setResolved(nextResolved);
  }, []);

  // R17: solo mientras la preferencia es 'system' y el estado esta activo. Se da de baja al
  // desmontar y al pasar a 'light'/'dark' (la dependencia en `preference` recrea el efecto en
  // cada cambio).
  //
  // `syncResolved` no solo atiende el evento `change`: tambien se llama una vez al enganchar el
  // efecto (montaje, o reenganche tras volver a `system`). Esto cierra una carrera real: si el
  // sistema operativo cambia de modo entre que `THEME_INIT_SCRIPT` pinto el DOM y que React
  // hidrata y suscribe este listener, el evento `change` ya paso y nadie lo habria visto —el
  // usuario se habria quedado en el modo viejo hasta recargar. Comparar contra la clase actual
  // del DOM (no solo contra `resolved`) hace que la llamada de montaje sea idempotente en el
  // caso normal (mismo valor que ya dejo el script) y por tanto no reintroduce parpadeo.
  useEffect(() => {
    if (!active) return;
    if (preference !== 'system') return;
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;

    const media = window.matchMedia(DARK_MEDIA_QUERY);

    const syncResolved = () => {
      const nextResolved: 'light' | 'dark' = media.matches ? 'dark' : 'light';
      const domIsDark = document.documentElement.classList.contains(THEME_DARK_CLASS);
      const domResolved: 'light' | 'dark' = domIsDark ? 'dark' : 'light';

      if (domResolved !== nextResolved) {
        applyResolvedTheme(nextResolved);
      }
      setResolved((prev) => (prev === nextResolved ? prev : nextResolved));
    };

    syncResolved();

    media.addEventListener('change', syncResolved);
    return () => media.removeEventListener('change', syncResolved);
  }, [active, preference]);

  return useMemo<ThemeContextValue>(
    () => ({ preference, resolved, setPreference }),
    [preference, resolved, setPreference],
  );
}

export function ThemeProvider({
  initialPreference,
  children,
}: {
  initialPreference: ThemePreference;
  children: ReactNode;
}) {
  const value = useThemeState(initialPreference);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** Hook de acceso al contexto del tema. Lanza si se usa fuera de `<ThemeProvider>`. */
export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (context === null) {
    throw new Error('useTheme debe usarse dentro de <ThemeProvider>');
  }
  return context;
}

/**
 * Variante que NO lanza: devuelve `null` cuando no hay `<ThemeProvider>` ancestro.
 *
 * Un solo consumidor real hoy: `ThemeToggle` (`app/(private)/components/theme-toggle.tsx`,
 * `design.md > 4`). En producción el control siempre cuelga del `<ThemeProvider>` del root
 * layout — el proveedor va en `app/layout.tsx`, no en `app/(private)/layout.tsx` (R27) — así
 * que este caso nunca ocurre sirviendo tráfico real. Existe porque `tests/unit/private-layout
 * .test.tsx` y `tests/unit/dashboard-page.test.tsx` (de QC-11/QC-12, protegidos: esta feature
 * no tiene permiso de editarlos) montan `PrivateLayout` aislado, sin `app/layout.tsx` por
 * encima, y `ThemeToggle` tiene que degradarse con gracia en ese escenario en vez de tirar
 * abajo esos tests con un `throw`. `useTheme()` sigue lanzando tal cual para cualquier otro
 * consumidor futuro que sí pueda asumir el proveedor.
 *
 * La degradación en sí (estado propio, misma lectura de cookie, mismo criterio de
 * resolución/aplicación) no es una segunda implementación: reutiliza `useThemeState` y
 * `readCookiePreference`, exportados justo debajo, para que `ThemeToggle` pueda montar su
 * propio estado sin duplicar ni un `if` del criterio. Es degradación con gracia, no una
 * segunda fuente de verdad.
 */
export function useOptionalTheme(): ThemeContextValue | null {
  return useContext(ThemeContext);
}

/**
 * Lee la preferencia de tema directamente de `document.cookie`.
 *
 * Uso exclusivo de la ruta de respaldo de `ThemeToggle` (ver `useOptionalTheme` arriba): sirve
 * para sembrar el estado inicial de `useThemeState` cuando no hay `<ThemeProvider>` que ya
 * traiga `initialPreference` sembrado desde el servidor. `ThemeProvider` en sí **nunca** lee la
 * cookie (ver el docblock de cabecera de este archivo): esta función vive aquí, no ahí, para no
 * tentar a que se cuele en el camino normal.
 */
function readCookiePreference(): ThemePreference {
  if (typeof document === 'undefined') return 'system';
  const match = document.cookie
    .split(';')
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${THEME_COOKIE}=`));
  return readThemePreference(match?.slice(THEME_COOKIE.length + 1));
}

/**
 * Hook de respaldo para consumidores fuera de `<ThemeProvider>` (ver `useOptionalTheme`).
 *
 * Siembra el estado inicial leyendo la cookie de UI ya escrita (`readCookiePreference`) y
 * delega el resto — resolución, aplicación al DOM con `color-scheme` incluido, escritura de la
 * cookie al cambiar — en `useThemeState`, el mismo hook que usa `ThemeProvider`. Ningun criterio
 * se repite: solo cambia de donde sale la preferencia inicial.
 */
export function useFallbackThemeState(options?: { active?: boolean }): ThemeContextValue {
  const [initialPreference] = useState<ThemePreference>(readCookiePreference);
  return useThemeState(initialPreference, options);
}
