// tests/unit/inventario/finished-goods.test.ts
//
// `planFinishedGoods` es dominio puro: nada aqui toca la base ni el reloj. Cubre R12, R14, R19,
// R41 y R42 (`design.md > 4.1`, anexo `> 10` C3).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { planFinishedGoods } from '@/lib/modules/inventario/domain/finished-goods';

describe('planFinishedGoods', () => {
  it('R12: 50.5 de pedido con contenido 1 -> 50 envases y 50', () => {
    const plan = planFinishedGoods({ orderQuantity: '50.5', content: '1', lotCost: '0.0000' });

    expect(plan).toMatchObject({ kind: 'planned', packages: '50', quantity: '50.0000' });
  });

  it('R12: 10 de pedido con contenido 3 -> 3 envases y 9', () => {
    const plan = planFinishedGoods({ orderQuantity: '10', content: '3', lotCost: '0.0000' });

    expect(plan).toMatchObject({ kind: 'planned', packages: '3', quantity: '9.0000' });
  });

  it('R12: 50 de pedido con contenido 0.75 -> 66 envases y 49.5', () => {
    const plan = planFinishedGoods({ orderQuantity: '50', content: '0.75', lotCost: '0.0000' });

    expect(plan).toMatchObject({ kind: 'planned', packages: '66', quantity: '49.5000' });
  });

  it('R14: el costo unitario redondea MITAD ARRIBA y divide entre la cantidad que ENTRA, no entre la del pedido', () => {
    // 50.5 de pedido con contenido 1 -> entran 50 (el sobrante 0.5 no entra); costo 100 / 50 = 2.0000.
    const plan = planFinishedGoods({ orderQuantity: '50.5', content: '1', lotCost: '100' });

    expect(plan).toMatchObject({ kind: 'planned', quantity: '50.0000', unitCost: '2.0000' });
  });

  it('R14: divide con redondeo mitad arriba cuando la division no es exacta', () => {
    // 10 / 3 -> entran 9; costo 3 / 9 = 0.3333... -> 0.3333.
    const plan = planFinishedGoods({ orderQuantity: '10', content: '3', lotCost: '3' });

    expect(plan).toMatchObject({ kind: 'planned', quantity: '9.0000', unitCost: '0.3333' });
  });

  it('R19: 0.5 de pedido con contenido 1 no llena ni un envase -> no_whole_package', () => {
    const plan = planFinishedGoods({ orderQuantity: '0.5', content: '1', lotCost: '0.0000' });

    expect(plan).toEqual({ kind: 'no_whole_package' });
  });

  it('content null -> no_content, sin mirar la cantidad del pedido', () => {
    const plan = planFinishedGoods({ orderQuantity: '50.5', content: null, lotCost: '0.0000' });

    expect(plan).toEqual({ kind: 'no_content' });
  });

  it('R41: el plan devuelve el contenido usado, normalizado a cuatro decimales', () => {
    const plan = planFinishedGoods({ orderQuantity: '50', content: '0.75', lotCost: '0.0000' });

    expect(plan).toMatchObject({ kind: 'planned', content: '0.7500' });
  });

  it('R42: costo del lote 0.0000 -> costo unitario 0.0000 (un lote de produccion es el unico que puede costar cero)', () => {
    const plan = planFinishedGoods({ orderQuantity: '50.5', content: '1', lotCost: '0.0000' });

    expect(plan).toMatchObject({ kind: 'planned', unitCost: '0.0000' });
  });

  it('R42 (anexo C3): un costo que redondea a cero al dividir entre la cantidad que entra tambien da 0.0000', () => {
    // 0.0001 / 5 = 0.00002 -> redondea a 0.0000 en cuatro decimales; `deriveUnitCost` devuelve
    // `null` y el plan lo convierte en '0.0000', no en un rechazo.
    const plan = planFinishedGoods({ orderQuantity: '5', content: '1', lotCost: '0.0001' });

    expect(plan).toMatchObject({ kind: 'planned', quantity: '5.0000', unitCost: '0.0000' });
  });

  it('el costo unitario nunca es negativo ni sale de una division con resto exacto sin redondear', () => {
    const plan = planFinishedGoods({ orderQuantity: '100', content: '1', lotCost: '25' });

    expect(plan).toMatchObject({ kind: 'planned', unitCost: '0.2500' });
  });

  it('no convierte ninguna cantidad a numero de coma flotante en el codigo fuente', () => {
    // Comprobado sobre el TEXTO del archivo: un `parseFloat` intermedio daria el mismo resultado
    // en todos los casos de arriba y aun asi seria exactamente lo que esta prohibido.
    const fuente = readFileSync(
      join(__dirname, '..', '..', '..', 'lib', 'modules', 'inventario', 'domain', 'finished-goods.ts'),
      'utf8',
    );

    for (const prohibido of ['Number(', 'parseFloat', 'parseInt', 'toFixed']) {
      expect(fuente.includes(prohibido), `finished-goods.ts no puede usar ${prohibido}`).toBe(false);
    }

    expect(fuente).toContain('BigInt');
  });
});
