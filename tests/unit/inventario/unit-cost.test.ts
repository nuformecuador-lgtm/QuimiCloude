import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { deriveUnitCost } from '@/lib/modules/inventario/domain/unit-cost';

/**
 * Derivacion del costo unitario a partir del total (QC-90, T1; QC-141, R5). Cubre R5 y R7
 * -dividir `total / existencia` a 4 decimales, exacto, sin coma flotante, con la existencia
 * misma decimal- y R9 -el derivado que redondea a `0.0000` no es un costo guardable-.
 */
describe('deriveUnitCost', () => {
  it('divide el costo total entre la existencia y devuelve el unitario con sus cuatro decimales', () => {
    // R7
    expect(deriveUnitCost('12.5', '5')).toBe('2.5000');
    expect(deriveUnitCost('100', '4')).toBe('25.0000');
    expect(deriveUnitCost('0.5', '1')).toBe('0.5000');
  });

  it('redondea a cuatro decimales una division periodica', () => {
    // R7: 10/3 = 3.333... y la columna solo guarda cuatro decimales.
    expect(deriveUnitCost('10', '3')).toBe('3.3333');
    expect(deriveUnitCost('1', '3')).toBe('0.3333');
  });

  it('redondea la mitad exacta hacia arriba', () => {
    // R7: '1.00005' no es escribible en decimal(14,4), asi que la mitad exacta se busca con
    // un total que al dividir deja resto justo medio: 0.0001 / 2 = 0.00005 -> 0.0001.
    expect(deriveUnitCost('0.0003', '2')).toBe('0.0002');
    expect(deriveUnitCost('0.0001', '2')).toBe('0.0001');
    expect(deriveUnitCost('3', '8')).toBe('0.3750');
  });

  it('R5: divide con una existencia decimal, no solo entera', () => {
    // 1.5 unidades a 3.0000 la unidad: 4.5 / 1.5 = 3.0000.
    expect(deriveUnitCost('4.5', '1.5')).toBe('3.0000');
    // Existencia de cinco decimales: la columna solo guarda cuatro, asi que R5 espera la
    // forma que ya rechaza el patron -no una que redondee la existencia por su cuenta-.
    expect(deriveUnitCost('10', '0.00001')).toBeNull();
    // Existencia de exactamente cuatro decimales.
    expect(deriveUnitCost('1', '0.0001')).toBe('10000.0000');
  });

  it('devuelve null cuando el costo unitario derivado redondea a cero', () => {
    // R9: 0.0001 / 5 = 0.00002, que en cuatro decimales es 0.0000 y la columna tiene
    // `CHECK (unit_cost > 0)`. No hay costo que guardar: quien llama lo convierte en rechazo.
    expect(deriveUnitCost('0.0001', '5')).toBeNull();
    expect(deriveUnitCost('0.0001', '3')).toBeNull();
  });

  it('R5: devuelve null cuando la existencia es cero o no tiene forma de decimal(14,4)', () => {
    // Sin existencia no hay unitario posible. El rechazo -y su campo- lo pone el esquema; aqui
    // solo se comprueba que la funcion no inventa un valor.
    expect(deriveUnitCost('10', '0')).toBeNull();
    expect(deriveUnitCost('10', '0.0000')).toBeNull();
    // Negativa, notacion cientifica o con coma: ninguna tiene la forma que el patron acepta.
    expect(deriveUnitCost('10', '-3')).toBeNull();
    expect(deriveUnitCost('10', '1e3')).toBeNull();
    expect(deriveUnitCost('10', '2,5')).toBeNull();
  });

  it('devuelve null en vez de lanzar cuando el importe no tiene la forma de decimal(14,4)', () => {
    // R4: una cadena que no es un importe se rechaza; lanzar aqui se veria como fallo del
    // servidor en lugar de como el `invalid_input` que el borde tiene que devolver.
    expect(deriveUnitCost('12,5', '5')).toBeNull();
    expect(deriveUnitCost('-10', '5')).toBeNull();
    expect(deriveUnitCost('1e3', '5')).toBeNull();
    expect(deriveUnitCost('', '5')).toBeNull();
  });

  it('no convierte ningun importe a numero de coma flotante en el codigo fuente', () => {
    // R4, R6, comprobado sobre el TEXTO del archivo y no sobre su comportamiento: un
    // `parseFloat` intermedio daria el mismo resultado en todos los casos de arriba y aun asi
    // seria exactamente lo que R4/R6 prohiben. Esto cae en cuanto alguien lo escriba.
    const fuente = readFileSync(
      join(__dirname, '..', '..', '..', 'lib', 'modules', 'inventario', 'domain', 'unit-cost.ts'),
      'utf8',
    );

    for (const prohibido of ['Number(', 'parseFloat', 'parseInt', 'toFixed']) {
      expect(fuente.includes(prohibido), `unit-cost.ts no puede usar ${prohibido}`).toBe(false);
    }

    // Y la aritmetica es de `BigInt`, no de `number`: sin esto, el bucle de arriba pasaria en
    // verde sobre una implementacion que multiplica y divide con `number` a pelo.
    expect(fuente).toContain('BigInt');
  });
});
