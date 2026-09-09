/**
 * La UNICA forma de abrir una sesion de escritura con `user-event` en este repo (QC-58, R5).
 *
 * Antes de esta ficha habia 206 llamadas sueltas a `userEvent.setup()` repartidas por 33
 * archivos, y de esas solo dos pasaban opciones. El problema no era el codigo duplicado -es
 * una linea- sino que no existia NINGUN sitio donde estuviera escrito como se teclea aqui:
 * la llamada numero 207 volvia a nacer con el retardo por defecto sin que nadie lo decidiera.
 *
 * Sin parametros, a proposito (`design.md > 2`). Si el helper aceptara opciones volverian las
 * 206 variantes con otra cara. El unico test que necesita otra cosa es el del rebote del
 * autocompletado, y se resuelve como excepcion NOMBRADA en
 * `tests/guards/guard-teclear-y-plazo.test.ts`, no como parametro abierto.
 */

import { waitFor } from '@testing-library/react';
import { expect } from 'vitest';
import userEvent from '@testing-library/user-event';
import type { UserEvent } from '@testing-library/user-event';

/**
 * Sesion de `user-event` con `delay: null` (viene de la review de QC-26, MAYOR 1).
 *
 * Por defecto `user-event` intercala un `setTimeout(0)` entre CADA evento -por cada tecla,
 * por cada movimiento de puntero-, y en un archivo de test eso son cientos de saltos al event
 * loop. `delay: null` quita solo esa espera artificial: la secuencia de eventos que recibe el
 * DOM es identica (mismos `pointerdown`/`mousedown`/`focus`/`keydown`/`input`...), y siguen
 * activas TODAS las comprobaciones de `user-event` -incluida la de `pointer-events`, que es la
 * que impide "hacer clic" en un control tapado o deshabilitado-. No se relaja nada: solo se
 * deja de esperar a nada.
 *
 * Es ademas media cura del flake de saturacion que documenta
 * `docs/verification.md > Los flakes de saturacion`: esos cientos de saltos al event loop son
 * los que, en una maquina cargada, hacian que las teclas llegaran intercaladas al campo
 * controlado ("xxxxxAxcxixdxox" en vez de "Acido citrico"). La otra media es el plazo de
 * 15 s por test de `vitest.config.mts`.
 */
export function setupUser(): UserEvent {
  return userEvent.setup({ delay: null });
}

/**
 * Espera a que un elemento de un popup de Base UI sea INTERACTIVO antes de pincharlo
 * (QC-58, decision cerrada n.º 9 del 2026-09-08).
 *
 * Los popups de Base UI -`Select`, `Menu`, `Popover`- entran con `pointer-events: none` y lo
 * sueltan un tick despues. Antes lo tapaba el `setTimeout(0)` que `user-event` intercalaba entre
 * eventos; con `setupUser()` (`delay: null`) ese respiro hay que pedirlo EXPLICITO. Sin esto,
 * `user.click` sobre una opcion recien abierta falla con
 * «Unable to perform pointer interaction as the element has pointer-events: none».
 *
 * **No relaja ninguna comprobacion**: `user-event` sigue negandose a pinchar un elemento tapado,
 * y esto solo espera a que deje de estarlo -la precondicion de la que el test ya dependia sin
 * decirlo-.
 *
 * **Bajo carga aflora donde en aislado no**: el tercer archivo afectado
 * (`proveedores-ui/catalog-line-sheet.test.tsx`) salio verde en `./init.sh --rapido` y rojo en dos
 * de las cinco corridas de la bateria completa. Por eso se aplica a TODO clic sobre el contenido
 * de un popup recien abierto, no solo a los que ya se han visto fallar.
 *
 * Uso: `await user.click(await esperarInteractiva(screen.getByTestId('unit-option-none')))`.
 *
 * **NO LE QUITES EL `waitFor` DEJANDO EL `await`.** Es tentador: en la practica la comprobacion se
 * satisface en el primer intento, y el reviewer de QC-58 demostro que con el cuerpo reducido a
 * `return elemento` los cinco archivos mas cargados de popups siguen pasando 61/61 -quien cierra
 * la ventana, hoy, es el tick que regala el `await`-. O sea que esa "optimizacion" saldria VERDE y
 * la precondicion dejaria de comprobarse sin que nadie se entere. Por eso existe
 * `tests/unit/esperar-interactiva.test.tsx`: sus dos casos se ponen ROJOS si esta espera deja de
 * esperar de verdad o deja de comprobar de verdad.
 */
export async function esperarInteractiva(elemento: HTMLElement): Promise<HTMLElement> {
  await waitFor(() => expect(elemento).not.toHaveStyle({ pointerEvents: 'none' }));
  return elemento;
}
