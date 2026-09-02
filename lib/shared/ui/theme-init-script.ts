import { THEME_COOKIE, THEME_DARK_CLASS } from './theme-state';

/**
 * Script anti-parpadeo del tema (R7, R10, `design.md > 3.2`).
 *
 * Vive como constante de **texto**, no como archivo `.js` suelto, para que `typecheck` lo
 * cubra, viaje en el bundle del servidor y sobre todo para que se pueda **ejecutar en un
 * test** contra un DOM simulado (`tests/unit/theme/theme-init-script.test.tsx`, `design.md >
 * 8` nivel 2). Un script escrito directamente dentro del JSX no se puede probar sin un
 * navegador.
 *
 * `app/layout.tsx` lo emite como `<script>{THEME_INIT_SCRIPT}</script>`, **primer hijo de
 * `<body>`**, sin `async` ni `defer`, así que corre síncronamente antes de que el navegador
 * pinte el marcado que va detrás.
 *
 * IIFE sin dependencias, envuelta en `try/catch` que traga cualquier fallo (cookies
 * bloqueadas, `matchMedia` ausente) dejando el modo que ya trae el HTML servido: nunca deja
 * el documento peor de como llegó. El nombre de la cookie y la clase salen de
 * `theme-state.ts` (se interpolan aquí), no como literales sueltos.
 */
export const THEME_INIT_SCRIPT = `(function () {
  try {
    var match = document.cookie.match(/(?:^|; )${THEME_COOKIE}=([^;]*)/);
    var pref = match ? decodeURIComponent(match[1]) : undefined;
    var dark = pref === 'dark' || (pref !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('${THEME_DARK_CLASS}', dark);
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
  } catch (e) {}
})();`;
