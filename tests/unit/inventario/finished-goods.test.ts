// tests/unit/inventario/finished-goods.test.ts
//
// `planFinishedGoodsLine` es dominio puro: nada aqui toca la base ni el reloj.
//
// `planFinishedGoods` (una presentacion, con `floor`) pasa a
// `planFinishedGoodsLine` (una linea del reparto, envases ya dados). Los casos que probaban la
// division (`floor`, redondeo del costo unitario, `no_whole_package`) se retiran: ya no hay
// division que hacer, los envases entran como entrada validada y el costo unitario se resuelve
// una sola vez para todo el pedido en otro punto (R18, T14), no aqui.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { planFinishedGoodsLine } from '@/lib/modules/inventario/domain/finished-goods';

describe('planFinishedGoodsLine', () => {
  it('R1: 50 envases con contenido 1 -> 50.0000 exacto', () => {
    const plan = planFinishedGoodsLine({ packages: 50, content: '1', unitCost: '0.0000' });

    expect(plan).toEqual({ kind: 'planned', quantity: '50.0000' });
  });

  it('R1: 3 envases con contenido 0.75 -> 2.2500 exacto, sin redondear', () => {
    const plan = planFinishedGoodsLine({ packages: 3, content: '0.75', unitCost: '0.0000' });

    expect(plan).toEqual({ kind: 'planned', quantity: '2.2500' });
  });

  it('R1: 1 envase con contenido 1 -> 1.0000 (ya no hay "no_whole_package": el envase lo da la linea)', () => {
    const plan = planFinishedGoodsLine({ packages: 1, content: '1', unitCost: '0.0000' });

    expect(plan).toEqual({ kind: 'planned', quantity: '1.0000' });
  });

  it('content null -> no_content, sin mirar los envases', () => {
    const plan = planFinishedGoodsLine({ packages: 50, content: null, unitCost: '0.0000' });

    expect(plan).toEqual({ kind: 'no_content' });
  });

  it('no devuelve ningun otro campo en el caso planned: ni packages, ni content, ni unitCost', () => {
    const plan = planFinishedGoodsLine({ packages: 50, content: '0.75', unitCost: '2.0000' });

    expect(Object.keys(plan).sort()).toEqual(['kind', 'quantity']);
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
