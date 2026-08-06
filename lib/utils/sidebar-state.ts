/**
 * Lectura del estado persistido de la barra lateral (R28, `design.md > 5.5`).
 *
 * **Esta cookie es preferencia de UI, no cookie de sesion.** No lleva PII, no identifica a
 * nadie, no la consume ningun service y la feature 10 no la toca. R35 la admite de forma
 * explicita, precisamente para que nadie lea "hay una cookie" como una contradiccion con
 * "esta feature no toca sesion".
 *
 * Por que existe este modulo en vez de dejarlo al primitivo: el `SidebarProvider` de
 * `components/ui/sidebar.tsx` **escribe** la cookie pero **nunca la lee** — su estado
 * inicial es `React.useState(defaultOpen)` con `defaultOpen = true`. Sin esta lectura en
 * servidor, una recarga siempre volveria a modo expandido y R28 quedaria incumplido.
 *
 * El nombre de la cookie se duplica aqui porque la constante equivalente del primitivo es
 * privada de `components/ui/sidebar.tsx`, archivo generado que **no se edita**. Si el CLI
 * lo cambiase, este modulo es el unico punto a tocar.
 */

/** Nombre de la cookie de preferencia de UI que escribe `SidebarProvider`. */
export const SIDEBAR_STATE_COOKIE = 'sidebar_state';

/** Valor que el primitivo escribe cuando la barra queda colapsada (modo icono). */
const COLLAPSED_VALUE = 'false';

/**
 * Traduce el valor crudo de la cookie al estado inicial del proveedor.
 *
 * Devuelve `true` (barra expandida) por defecto: sin cookie, con valor vacio o con un valor
 * no reconocido. Solo `'false'` colapsa. Un valor desconocido no es motivo para lanzar: es
 * una preferencia de UI, y el modo por defecto es una respuesta perfectamente valida.
 */
export function readSidebarOpenState(rawValue: string | undefined): boolean {
  return rawValue !== COLLAPSED_VALUE;
}
