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
