/**
 * Capa decorativa de la pantalla de login: las tres burbujas del fondo (`design.md > 5`).
 *
 * Server Component, sin `'use client'`: es marcado puro, sin estado, sin manejadores y sin props.
 *
 * Decorativa y nada mas (R13): `aria-hidden="true"` la saca del arbol de accesibilidad, asi que
 * ningun lector de pantalla la anuncia, y el CSS le pone `pointer-events: none` para que no
 * intercepte pulsaciones sobre el formulario. Son `<span>` vacios sin `tabindex`, de modo que no
 * entran en el orden de tabulacion por construccion y no solo por convencion.
 *
 * No introduce un segundo landmark: se monta como hermano de la tarjeta dentro del `<main>` que
 * la pagina ya tiene, sin envolver nada en otro elemento seccionador.
 *
 * Cero valores aqui: posicion, diametro, duracion, deriva, retardo y opacidad de cada burbuja
 * viven en `app/globals.css`, dentro del ambito `[data-login='screen']` y seleccionados por
 * `data-login-index`. Nada de `style` en linea, porque una propiedad personalizada escrita ahi
 * ganaria a la media query movil y esta no podria sobrescribirla.
 */
export function LoginBackground() {
  return (
    <div data-login="bubbles" aria-hidden="true">
      <span data-login="bubble" data-login-index="1" />
      <span data-login="bubble" data-login-index="2" />
      <span data-login="bubble" data-login-index="3" />
    </div>
  );
}
