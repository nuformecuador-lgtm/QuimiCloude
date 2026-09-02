/**
 * Preferencia de tema (claro / oscuro / sistema) — R7, R9, R29, `design.md > 3.1`.
 *
 * Mismo patron que `lib/shared/ui/sidebar-state.ts`, que ya resuelve exactamente esta forma
 * de problema para la barra lateral: el proveedor de cliente (aqui `ThemeProvider`, alla
 * `SidebarProvider`) **escribe** la cookie con `document.cookie` pero nunca la lee, asi que la
 * persistencia solo existe porque el layout servidor la lee con `cookies()` y siembra el
 * estado inicial. Este modulo es la pieza pura de ese reparto: nombre de la cookie, tipo,
 * lector tolerante y constructor de la cookie. No importa nada de `lib/modules/` ni de
 * `lib/composition/` — `lib/shared/**` es hoja del grafo (`docs/architecture.md > La regla de
 * dependencias`).
 *
 * **Esta cookie es preferencia de UI, no cookie de sesion (R29).** No lleva PII, no
 * identifica a nadie y ningun service la consume: es exactamente el mismo argumento que ya
 * documenta `sidebar-state.ts` para `sidebar_state`. No se llama igual, no comparte formato y
 * no la escribe ni la lee ningun modulo de `lib/modules/identity/` — la cookie de sesion de
 * QC-8 (`SESSION_COOKIE_NAME`, `qc_session`) es `httpOnly` porque transporta una firma HMAC
 * que autentica al usuario; esta cookie **no puede** ser `httpOnly` porque tiene que poder
 * escribirla el propio cliente al cambiar de preferencia (`design.md > 3.1`).
 */

/** Nombre de la cookie de preferencia de UI que escribe `ThemeProvider`. */
export const THEME_COOKIE = 'theme_preference';

/** Un año en segundos: la preferencia de tema es duradera, no de sesion. */
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** La clase que activa `.dark` en `app/globals.css` (`@custom-variant dark (&:is(.dark *))`). */
export const THEME_DARK_CLASS = 'dark';

export type ThemePreference = 'light' | 'dark' | 'system';

const RECOGNIZED_PREFERENCES: readonly ThemePreference[] = ['light', 'dark', 'system'];

/**
 * Traduce el valor crudo de la cookie a una preferencia valida.
 *
 * Devuelve `'system'` por defecto: sin cookie, con valor vacio o con un valor no reconocido.
 * **Nunca lanza**, con el mismo criterio que `readSidebarOpenState`: una preferencia de UI
 * desconocida no es motivo para lanzar, y `'system'` es precisamente el valor por defecto que
 * fijo D4 en `requirements.md`.
 */
export function readThemePreference(rawValue: string | undefined): ThemePreference {
  if (rawValue === undefined) return 'system';

  const candidate = RECOGNIZED_PREFERENCES.find((preference) => preference === rawValue);
  return candidate ?? 'system';
}

/**
 * Construye el `Set-Cookie` que escribe el cliente al elegir una preferencia.
 *
 * `path=/` para que la preferencia aplique a toda la aplicacion (incluida la zona publica,
 * R26); `max-age` con `THEME_COOKIE_MAX_AGE`; `samesite=lax` como el resto de cookies de UI de
 * este repo. **Sin `httponly`**: tiene que poder escribirla `document.cookie` desde el
 * navegador, igual que hace `SidebarProvider` con `sidebar_state`.
 */
export function buildThemeCookie(preference: ThemePreference): string {
  return `${THEME_COOKIE}=${preference}; path=/; max-age=${THEME_COOKIE_MAX_AGE}; samesite=lax`;
}
