import {
  COST_INPUT_SCALE,
  divideCost,
  multiplyCost,
  sanitizeCostInput,
} from '@/app/(private)/inventario/components';

/**
 * Archivo propio y no `product-page.test.tsx`: alli cada caso monta la pantalla entera para
 * afirmar que teclear en un campo rellena el otro. Esto son tres funciones puras, y sin DOM ni
 * mocks sale barato barrer los bordes del redondeo.
 *
 * Los casos estan elegidos para que un `Number(...)` colado por dentro salga ROJO.
 */

describe('sanitizeCostInput', () => {
  it('deja pasar solo digitos, un punto y dos decimales', () => {
    expect(sanitizeCostInput('')).toBe('');
    expect(sanitizeCostInput('12')).toBe('12');
    expect(sanitizeCostInput('12.5')).toBe('12.5');
    expect(sanitizeCostInput('12.50')).toBe('12.50');
    // El punto final se conserva: es el estado intermedio de quien esta escribiendo.
    expect(sanitizeCostInput('12.')).toBe('12.');
  });

  it('no deja escribir texto', () => {
    expect(sanitizeCostInput('abc')).toBe('');
    expect(sanitizeCostInput('12x50')).toBe('1250');
    expect(sanitizeCostInput('-12.50')).toBe('12.50');
    expect(sanitizeCostInput('$ 12,50')).toBe('12.50');
    expect(sanitizeCostInput('1e3')).toBe('13');
  });

  it('corta en el segundo decimal', () => {
    expect(sanitizeCostInput('12.3456')).toBe('12.34');
    // Corta, no redondea: redondear mientras se teclea cambiaria el digito recien escrito.
    expect(sanitizeCostInput('12.999')).toBe('12.99');
  });

  it('convierte la coma en punto en vez de tirarla', () => {
    // Tirarla dejaria `150,00` en `15000`: cien veces el importe, en silencio.
    expect(sanitizeCostInput('150,00')).toBe('150.00');
    expect(sanitizeCostInput('0,5')).toBe('0.5');
  });

  it('un punto de mas no corta lo ya escrito, y un punto al principio gana su cero', () => {
    expect(sanitizeCostInput('12.3.')).toBe('12.3');
    expect(sanitizeCostInput('12.3.4')).toBe('12.34');
    expect(sanitizeCostInput('.5')).toBe('0.5');
  });

  it('no deja pasar de los enteros que admite la columna', () => {
    expect(sanitizeCostInput('12345678901234')).toBe('1234567890');
    expect(sanitizeCostInput('12345678901234.99')).toBe('1234567890.99');
  });
});

describe('multiplyCost', () => {
  it('multiplica sin redondear y escribe el importe SIN ceros de relleno', () => {
    // El `.00` no informa y se lee como una precision que no hay. Mismo numero, y el esquema
    // acepta las dos formas: sus decimales son opcionales.
    expect(multiplyCost('12.50', 12)).toBe('150');
    expect(multiplyCost('3.50', 7)).toBe('24.5');
    expect(multiplyCost('4', 3)).toBe('12');
    // Los decimales que SI informan se conservan enteros: aqui no se redondea nada.
    expect(multiplyCost('12.34', 2)).toBe('24.68');
    expect(multiplyCost('0.01', 3)).toBe('0.03');
    // El punto a medio escribir vale como el entero: asi el otro campo no parpadea a vacio.
    expect(multiplyCost('12.', 2)).toBe('24');
  });

  it('no pasa por coma flotante', () => {
    // Los tres casos salen mal en binario: `0.1 * 3` es `0.30000000000000004`, `0.07 * 100` es
    // `7.000000000000001` y `0.29 * 3` es `0.8699999999999999`. Con la escala entera son exactos.
    expect(multiplyCost('0.10', 3)).toBe('0.3');
    expect(multiplyCost('0.07', 100)).toBe('7');
    expect(multiplyCost('0.29', 3)).toBe('0.87');
    // El importe mas grande que la columna admite sobrevive al viaje de ida y vuelta.
    expect(multiplyCost('1234567890.12', 1)).toBe('1234567890.12');
  });

  it('sin total que escribir devuelve null', () => {
    expect(multiplyCost('12.50', 0)).toBeNull();
    expect(multiplyCost('12.50', -1)).toBeNull();
    expect(multiplyCost('12.50', 1.5)).toBeNull();
    expect(multiplyCost('12.50', Number.NaN)).toBeNull();
    expect(multiplyCost('', 3)).toBeNull();
    expect(multiplyCost('0.00', 3)).toBeNull();
    // Y cuando el producto ya no cabe en los 10 enteros de la columna.
    expect(multiplyCost('9999999999.99', 10)).toBeNull();
  });
});

describe('divideCost', () => {
  it('divide redondeando a 2 decimales MITAD ARRIBA', () => {
    expect(divideCost('150.00', 12)).toBe('12.5');
    // 150 / 7 = 21.428571..., que a dos decimales es 21.43.
    expect(divideCost('150', 7)).toBe('21.43');
    // El medio exacto sube: 0.05 / 2 = 0.025.
    expect(divideCost('0.05', 2)).toBe('0.03');
    // Y justo por debajo del medio, no.
    expect(divideCost('0.04', 3)).toBe('0.01');
  });

  it('no pasa por coma flotante', () => {
    // `0.29 / 100` en binario es `0.0029000000000000002`; con la escala entera, 29 / 100 redondea
    // a 0 y el campo se queda vacio, que es lo que este caso fija.
    expect(divideCost('0.29', 100)).toBeNull();
    expect(divideCost('1.00', 3)).toBe('0.33');
    // El importe mas grande que la columna admite sobrevive al viaje de ida y vuelta.
    expect(divideCost('1234567890.12', 1)).toBe('1234567890.12');
  });

  it('devuelve null cuando el unitario quedaria en 0.00', () => {
    // Vacio significa «deducelo tu», y el servidor lo deriva a 4 decimales, donde `0.01 / 5`
    // todavia da un importe valido (`0.0020`).
    expect(divideCost('0.01', 5)).toBeNull();
    // `0.02 / 5` es `0.004`: tambien se pierde a dos decimales.
    expect(divideCost('0.02', 5)).toBeNull();
    // `0.03 / 5` es `0.006`, y mitad arriba sube a `0.01`: ahi ya hay unitario que escribir.
    expect(divideCost('0.03', 5)).toBe('0.01');
  });

  it('sin unitario que escribir devuelve null', () => {
    expect(divideCost('150.00', 0)).toBeNull();
    expect(divideCost('150.00', -1)).toBeNull();
    expect(divideCost('150.00', 2.5)).toBeNull();
    expect(divideCost('', 3)).toBeNull();
    expect(divideCost('0', 3)).toBeNull();
  });
});

describe('COST_INPUT_SCALE', () => {
  it('son 2 decimales, y NO los 4 de la columna', () => {
    // La escala del servidor sigue siendo 4. Son dos numeros con dos duenos: si alguien los
    // iguala «por coherencia», este caso lo dice.
    expect(COST_INPUT_SCALE).toBe(2);
  });
});
