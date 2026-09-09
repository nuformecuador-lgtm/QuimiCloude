// T8 — `convertQuantity`: la conversion entre dos unidades que comparten base (QC-76).
//
// Cubre R23 (el resultado exacto cuando la division termina, y 12 decimales TRUNCANDO cuando
// no), R24 (bases distintas -> error de dominio distinguible) y R25 (las cinco formas de
// entrada invalida). La funcion es PURA (R22): aqui no se mockea nada porque no hay nada que
// mockear —ni repositorio, ni reloj, ni registro—.
//
// Se importa por el CONTRATO del modulo (`@/lib/modules/unidades`) y no por la ruta profunda:
// si el barrel dejara de publicarla, este archivo no compilaria, que es la senal que pide R22.
// `CONVERSION_SCALE` es la unica excepcion —el barrel no la publica, la documenta— y se lee de
// su archivo para que el numero 12 de las aserciones y el del calculo sean EL MISMO.
//
// Los factores se escriben con cuatro decimales (`1000.0000`) porque asi salen de la columna
// `decimal(14,4)` que declara R3: el texto que la funcion recibira en produccion.
//
// QC-70 (R7, R28, R29): los cuatro sitios que fallan aqui llevaban el dato variable —los ids
// de las dos unidades, el factor, el texto que no parsea— INCRUSTADO en el mensaje. Ahora el
// mensaje sale del catalogo y es siempre el mismo, y el dato viaja en `diagnostic`, que va al
// registro del servidor y nunca al navegador. Lo que estos casos comprueban de mas: que el
// dato NO esta en `message` y SI esta en `diagnostic`.

import { describe, expect, it } from 'vitest';

import { errorMessage } from '@/lib/modules/errores';
import {
  convertQuantity,
  IncompatibleUnitsError,
  UnidadesError,
  ValidationError,
} from '@/lib/modules/unidades';
import type { UnitConversion } from '@/lib/modules/unidades';
import { CONVERSION_SCALE } from '@/lib/modules/unidades/domain/convert-quantity';

/**
 * Captura el error de dominio que lanza `fn`, para poder mirar su `message` y su
 * `diagnostic` por separado (QC-70 R28). Falla si no lanza: un caso que no lanza no puede
 * pasar por descuido.
 */
function capturar(fn: () => unknown): UnidadesError {
  try {
    fn();
  } catch (error) {
    if (error instanceof UnidadesError) return error;
    throw error;
  }
  throw new Error('se esperaba un UnidadesError y no se lanzo ninguno');
}

/** Familia del volumen: `mililitro` es base; `litro` y `centilitro` derivan de ella. */
const mililitro: UnitConversion = { id: 'ml', baseUnitId: null, factor: null };
const litro: UnitConversion = { id: 'l', baseUnitId: 'ml', factor: '1000.0000' };
const centilitro: UnitConversion = { id: 'cl', baseUnitId: 'ml', factor: '10.0000' };

/** Familia del peso: `gramo` es base. `tonelada` es el caso del resultado diminuto de R23. */
const gramo: UnitConversion = { id: 'g', baseUnitId: null, factor: null };
const tonelada: UnitConversion = { id: 't', baseUnitId: 'g', factor: '1000000.0000' };

/** Decision cerrada 5: el factor puede ser menor que 1 y la base no tiene por que ser la
 *  unidad mas pequena de su familia. */
const garrafa: UnitConversion = { id: 'garrafa', baseUnitId: null, factor: null };
const mediaGarrafa: UnitConversion = {
  id: 'media-garrafa',
  baseUnitId: 'garrafa',
  factor: '0.5000',
};

/** Factor con un divisor distinto de 2 y de 5: dividir entre el produce un decimal periodico. */
const tercioDeGramo: UnitConversion = { id: 'tercio', baseUnitId: 'g', factor: '3.0000' };

describe('convertQuantity, cuando las dos unidades comparten unidad base', () => {
  it('devuelve la misma cantidad al convertir una unidad consigo misma', () => {
    expect(convertQuantity('2.5', litro, litro)).toBe('2.5');
    expect(convertQuantity('7', mililitro, mililitro)).toBe('7');
  });

  it('convierte una unidad derivada a su unidad base: 1 litro son 1000 mililitros', () => {
    expect(convertQuantity('1', litro, mililitro)).toBe('1000');
  });

  it('convierte la unidad base a una derivada suya: 1500 mililitros son 1,5 litros', () => {
    expect(convertQuantity('1500', mililitro, litro)).toBe('1.5');
  });

  it('convierte entre dos derivadas de la misma base: 2 litros son 200 centilitros', () => {
    expect(convertQuantity('2', litro, centilitro)).toBe('200');
    expect(convertQuantity('200', centilitro, litro)).toBe('2');
  });

  it('acepta un factor menor que 1: media garrafa vale media garrafa', () => {
    expect(convertQuantity('3', mediaGarrafa, garrafa)).toBe('1.5');
    expect(convertQuantity('1', garrafa, mediaGarrafa)).toBe('2');
  });

  it('no colapsa a cero un resultado diminuto: 1 gramo son 0,000001 toneladas', () => {
    // R23 y decision cerrada 17: la conversion NO redondea a ninguna escala de presentacion.
    const resultado = convertQuantity('1', gramo, tonelada);

    expect(resultado).toBe('0.000001');
    expect(resultado).not.toBe('0');
  });

  it('devuelve el resultado exacto sin ceros de relleno a la derecha', () => {
    // El factor llega con cuatro decimales de la columna, pero el resultado no los arrastra.
    expect(convertQuantity('1.5000', litro, mililitro)).toBe('1500');
    expect(convertQuantity('0.0010', litro, mililitro)).toBe('1');
  });

  it('convierte una cantidad negativa conservando el signo', () => {
    expect(convertQuantity('-1', litro, mililitro)).toBe('-1000');
    expect(convertQuantity('-1500', mililitro, litro)).toBe('-1.5');
  });

  it('devuelve cero para una cantidad cero, sin signo ni decimales sobrantes', () => {
    expect(convertQuantity('0', litro, mililitro)).toBe('0');
    expect(convertQuantity('0', gramo, tercioDeGramo)).toBe('0');
    expect(convertQuantity('-0', litro, mililitro)).toBe('0');
  });
});

describe('convertQuantity, cuando la division no termina', () => {
  it('calcula el resultado con exactamente doce decimales', () => {
    const resultado = convertQuantity('1', gramo, tercioDeGramo);

    expect(CONVERSION_SCALE).toBe(12);
    expect(resultado).toBe('0.333333333333');
    expect(resultado.split('.')[1]).toHaveLength(CONVERSION_SCALE);
  });

  it('trunca la ultima cifra y no la redondea hacia arriba', () => {
    // 2/3 = 0,6666...: redondeando a doce decimales la ultima cifra seria un 7. Truncando es
    // un 6, y ese es el criterio de R23. Esta es la asercion que distingue las dos politicas.
    const resultado = convertQuantity('2', gramo, tercioDeGramo);

    expect(resultado).toBe('0.666666666666');
    expect(resultado).not.toBe('0.666666666667');
    expect(resultado.at(-1)).toBe('6');
  });

  it('trunca hacia cero tambien con cantidades negativas, sin crecer en valor absoluto', () => {
    // Truncar es hacia cero: el valor absoluto NUNCA crece. -2/3 sale -0,666666666666 y no
    // -0,666666666667, que seria mas grande en valor absoluto que el resultado real.
    const resultado = convertQuantity('-2', gramo, tercioDeGramo);

    expect(resultado).toBe('-0.666666666666');
    expect(resultado).not.toBe('-0.666666666667');
  });
});

describe('convertQuantity, cuando las dos unidades no comparten unidad base', () => {
  it('falla con IncompatibleUnitsError y no devuelve ninguna cantidad', () => {
    // R24: distinguible del resto por su clase Y por su `code` estable, que es lo que el
    // adaptador driving que algun dia la exponga traducira.
    expect(() => convertQuantity('1', litro, gramo)).toThrow(IncompatibleUnitsError);

    let capturado: unknown;
    try {
      convertQuantity('1', litro, gramo);
    } catch (error) {
      capturado = error;
    }

    expect(capturado).toBeInstanceOf(IncompatibleUnitsError);
    expect(capturado).toBeInstanceOf(UnidadesError);
    expect((capturado as IncompatibleUnitsError).code).toBe('incompatible_units');
    expect(capturado).not.toBeInstanceOf(ValidationError);
  });

  it('falla tambien entre dos derivadas de bases distintas', () => {
    expect(() => convertQuantity('1', litro, tonelada)).toThrow(IncompatibleUnitsError);
    expect(() => convertQuantity('1', mililitro, tonelada)).toThrow(IncompatibleUnitsError);
  });

  it('QC-70 (R28, R29): los ids de las dos unidades van al diagnostico, NUNCA al mensaje', () => {
    // Ids largos a proposito: los de arriba son de UNA letra (`l`, `g`) y un `not.toContain`
    // sobre ellos pasaria o fallaria por casualidad segun las letras del mensaje.
    const origen: UnitConversion = { id: 'unit-litro-0001', baseUnitId: null, factor: null };
    const destino: UnitConversion = { id: 'unit-gramo-0002', baseUnitId: null, factor: null };

    const error = capturar(() => convertQuantity('1', origen, destino));

    // Lo que ve el navegador: el texto del catalogo para `incompatible_units`, y nada mas.
    expect(error.message).toBe(errorMessage('incompatible_units'));
    expect(error.message).not.toContain(origen.id);
    expect(error.message).not.toContain(destino.id);

    // Lo que ve el log: cuales eran las dos unidades.
    expect(error.diagnostic).toContain(origen.id);
    expect(error.diagnostic).toContain(destino.id);
  });
});

describe('convertQuantity, cuando la entrada no es valida', () => {
  // R25, las cinco formas, una por caso.

  it('rechaza una cantidad que no es un decimal valido', () => {
    for (const cantidad of ['', 'dos', '1,5', '1.', '.5', '1e3', ' 1 ', 'NaN']) {
      expect(() => convertQuantity(cantidad, litro, mililitro), cantidad).toThrow(ValidationError);
    }
  });

  it('rechaza un factor que no es un decimal valido', () => {
    const origenRoto: UnitConversion = { id: 'x', baseUnitId: 'ml', factor: 'mil' };
    const destinoRoto: UnitConversion = { id: 'y', baseUnitId: 'ml', factor: '1.000,5' };

    expect(() => convertQuantity('1', origenRoto, mililitro)).toThrow(ValidationError);
    expect(() => convertQuantity('1', mililitro, destinoRoto)).toThrow(ValidationError);
  });

  it('rechaza un factor que no es mayor que cero', () => {
    const factorCero: UnitConversion = { id: 'x', baseUnitId: 'ml', factor: '0.0000' };
    const factorNegativo: UnitConversion = { id: 'y', baseUnitId: 'ml', factor: '-1.0000' };

    expect(() => convertQuantity('1', factorCero, mililitro)).toThrow(ValidationError);
    expect(() => convertQuantity('1', mililitro, factorCero)).toThrow(ValidationError);
    expect(() => convertQuantity('1', factorNegativo, mililitro)).toThrow(ValidationError);
  });

  it('rechaza una unidad que declara unidad base sin factor', () => {
    const sinFactor: UnitConversion = { id: 'x', baseUnitId: 'ml', factor: null };

    expect(() => convertQuantity('1', sinFactor, mililitro)).toThrow(ValidationError);
    expect(() => convertQuantity('1', mililitro, sinFactor)).toThrow(ValidationError);
  });

  it('rechaza una unidad que declara factor sin unidad base', () => {
    const sinBase: UnitConversion = { id: 'x', baseUnitId: null, factor: '1000.0000' };

    expect(() => convertQuantity('1', sinBase, mililitro)).toThrow(ValidationError);
    expect(() => convertQuantity('1', mililitro, sinBase)).toThrow(ValidationError);
  });

  it('QC-70 (R28, R29): el factor invalido va al diagnostico, NUNCA al mensaje', () => {
    const factorCero: UnitConversion = { id: 'x', baseUnitId: 'ml', factor: '0.0000' };
    const factorRoto: UnitConversion = { id: 'y', baseUnitId: 'ml', factor: 'mil' };

    const porCero = capturar(() => convertQuantity('1', factorCero, mililitro));
    expect(porCero.message).toBe(errorMessage('invalid_input'));
    expect(porCero.message).not.toContain('0.0000');
    expect(porCero.diagnostic).toContain('0.0000');

    const porFormato = capturar(() => convertQuantity('1', factorRoto, mililitro));
    expect(porFormato.message).toBe(errorMessage('invalid_input'));
    expect(porFormato.message).not.toContain('mil');
    expect(porFormato.diagnostic).toContain('mil');

    // Y la cantidad, por el mismo camino: el texto que no parsea es diagnostico.
    const porCantidad = capturar(() => convertQuantity('1,5', litro, mililitro));
    expect(porCantidad.message).toBe(errorMessage('invalid_input'));
    expect(porCantidad.message).not.toContain('1,5');
    expect(porCantidad.diagnostic).toContain('1,5');

    // La pareja incompleta no lleva dato variable, pero su explicacion tambien es
    // diagnostico: el mensaje sigue siendo el generico del catalogo.
    const sinFactor: UnitConversion = { id: 'z', baseUnitId: 'ml', factor: null };
    const porPareja = capturar(() => convertQuantity('1', sinFactor, mililitro));
    expect(porPareja.message).toBe(errorMessage('invalid_input'));
    expect(porPareja.diagnostic).toContain('la unidad de origen');
  });

  it('valida la entrada antes de comparar las bases: la entrada rota manda sobre el ambito', () => {
    // Una unidad de OTRA familia y ademas con la pareja incompleta falla por invalida, no por
    // incompatible: no se devuelve ninguna cantidad en ninguno de los dos casos (R24, R25).
    const rotaYAjena: UnitConversion = { id: 'g', baseUnitId: null, factor: '3.0000' };

    expect(() => convertQuantity('1', litro, rotaYAjena)).toThrow(ValidationError);
  });
});
