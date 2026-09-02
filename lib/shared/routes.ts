export const DASHBOARD_ROUTE = '/dashboard';

export const LOGIN_ROUTE = '/login';

/** Ruta aun inexistente (S6): hoy devuelve 404 y el slug definitivo esta sin confirmar. */
export const FORGOT_PASSWORD_ROUTE = '/recuperar-contrasena';

/**
 * Prefijos de URL que cuelgan de `app/(private)/` y, por tanto, exigen sesion valida (R1).
 *
 * `(private)` es un route group: **no aparece en la URL**, asi que el middleware no puede
 * deducir del camino que una ruta es privada y hay que declararlo. Para que la declaracion no se
 * quede atras del arbol de archivos, `tests/guards/guard-rutas-privadas-cubiertas.test.ts`
 * compara esta lista con las carpetas que tienen `page.tsx` bajo `app/(private)/`: una pantalla
 * nueva sin prefijo que la cubra pone el gate en rojo con su nombre, y un prefijo que ya no
 * corresponde a ninguna pantalla, tambien.
 */
export const PRIVATE_ROUTE_PREFIXES = ['/dashboard'] as const;
