// Prueba del helper `esperarInteractiva` de QC-58 (review, menor 5).
//
// POR QUE EXISTE ESTE ARCHIVO. El reviewer demostro que, reduciendo el cuerpo del helper a
// `return elemento` -o sea, dejando solo la frontera `async`-, los cinco archivos llenos de
// popups seguian pasando 61/61: en la practica quien cierra la ventana es el tick que
// introduce el `await`, y la comprobacion de `pointer-events` se satisface en el primer
// intento. Una espera cuya asercion nunca llega a mirar nada es una espera que alguien
// «optimizara» quitandole el `waitFor`, con los tests en verde y nadie enterandose de que la
// precondicion dejo de comprobarse.
//
// Estos dos casos son la red que faltaba: el primero muere si el helper deja de esperar de
// verdad, y el segundo muere si deja de comprobar de verdad.

import { describe, expect, it } from 'vitest';

import { esperarInteractiva } from '../helpers/user-event';

/** Un elemento suelto en el documento, con `pointer-events: none` puesto a mano. */
function elementoTapado(): HTMLElement {
  const elemento = document.createElement('div');
  elemento.style.pointerEvents = 'none';
  document.body.append(elemento);
  return elemento;
}

describe('esperarInteractiva (QC-58)', () => {
  it('espera de verdad: resuelve solo DESPUES de que el elemento suelte pointer-events', async () => {
    // Este es el caso que mata la version degenerada del helper. El elemento se libera a los
    // 50 ms, muy por encima del tick que regala el `await`: si alguien quita el `waitFor`, el
    // helper devuelve el elemento todavia tapado y la asercion de abajo se pone roja.
    const elemento = elementoTapado();
    setTimeout(() => {
      elemento.style.pointerEvents = '';
    }, 50);

    const devuelto = await esperarInteractiva(elemento);

    expect(devuelto).toBe(elemento);
    expect(devuelto).not.toHaveStyle({ pointerEvents: 'none' });
  });

  it('comprueba de verdad: si el elemento NO se libera nunca, la espera falla', async () => {
    // La otra mitad. Sin esto, un helper que resolviera siempre pasaria el caso de arriba por
    // casualidad del reloj.
    const elemento = elementoTapado();

    await expect(esperarInteractiva(elemento)).rejects.toThrow(/pointer-events/i);
  });
});
