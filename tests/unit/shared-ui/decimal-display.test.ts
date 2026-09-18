import { describe, expect, it } from 'vitest';

import {
  DISPLAY_FRACTION_DIGITS,
  formatDecimalDisplay,
  trimDecimal,
} from '@/lib/shared/ui/decimal-display';

/**
 * Presentacion de decimales en texto (`lib/shared/ui/decimal-display.ts`).
 *
 * Lo que se afirma aqui son las DOS reglas que motivan que haya dos funciones y no una:
 * `trimDecimal` no puede cambiar el numero -precarga campos editables, y lo que muestra es lo
 * que se vuelve a guardar-, y `formatDecimalDisplay` si redondea -solo pinta celdas de lectura-.
 */

describe('trimDecimal: quita el relleno y NO redondea', () => {
  it('«.0000» no es informacion: se va', () => {
    expect(trimDecimal('15.0000')).toBe('15');
    expect(trimDecimal('15.5000')).toBe('15.5');
    expect(trimDecimal('0.1000')).toBe('0.1');
    expect(trimDecimal('0.0000')).toBe('0');
  });

  it('NO redondea: los decimales que informan se conservan enteros', () => {
    // Esta es la razon de ser de la funcion. Este valor se precarga en un campo editable, y
    // redondearlo aqui lo reescribiria en la base la proxima vez que alguien guarde.
    expect(trimDecimal('0.1255')).toBe('0.1255');
    expect(trimDecimal('1234.5678')).toBe('1234.5678');
  });

  it('el signo sobrevive al recorte', () => {
    expect(trimDecimal('-15.0000')).toBe('-15');
    expect(trimDecimal('-0.1255')).toBe('-0.1255');
  });

  it('lo que no es un decimal en notacion plana vuelve TAL CUAL', () => {
    // Un campo a medio teclear no debe desaparecer ni convertirse en otra cosa mientras el
    // usuario escribe: la frontera de validacion es el esquema del contrato, no esta funcion.
    for (const crudo of ['', '.', '12.', '-', 'abc', '1e3', '1,5']) {
      expect(trimDecimal(crudo), `«${crudo}» deberia volver intacto`).toBe(crudo);
    }
  });
});

describe('formatDecimalDisplay: redondea a dos decimales y luego recorta', () => {
  it('dos decimales es el defecto', () => {
    expect(DISPLAY_FRACTION_DIGITS).toBe(2);
    expect(formatDecimalDisplay('0.1255')).toBe(formatDecimalDisplay('0.1255', 2));
  });

  it('el relleno se va y el resto se redondea al mas cercano', () => {
    expect(formatDecimalDisplay('15.0000')).toBe('15');
    expect(formatDecimalDisplay('15.5000')).toBe('15.5');
    expect(formatDecimalDisplay('0.1255')).toBe('0.13');
    expect(formatDecimalDisplay('39.79900')).toBe('39.8');
    expect(formatDecimalDisplay('0.1005')).toBe('0.1');
  });

  it('el empate se aleja del cero, que es lo que la gente espera de «2 decimales»', () => {
    expect(formatDecimalDisplay('0.125')).toBe('0.13');
    expect(formatDecimalDisplay('-0.125')).toBe('-0.13');
    expect(formatDecimalDisplay('0.115')).toBe('0.12');
  });

  it('nunca deja el punto suelto, aunque redondee a un entero', () => {
    // El fallo que tenia el redondeo propio del campo de cantidad: «25.001» salia como «25.»,
    // y un `type="number"` sanea esa cadena a VACIA, con lo que el campo se quedaba en blanco.
    expect(formatDecimalDisplay('25.001')).toBe('25');
    expect(formatDecimalDisplay('25.995')).toBe('26');
    expect(formatDecimalDisplay('0.001')).toBe('0');
    expect(formatDecimalDisplay('9.999')).toBe('10');
  });

  it('el arrastre cruza el punto sin perder cifras del entero', () => {
    expect(formatDecimalDisplay('99.999')).toBe('100');
    expect(formatDecimalDisplay('9999.9999')).toBe('10000');
  });

  it('es exacto: no pasa por coma flotante en ningun punto', () => {
    // Con `number`, 8.165 y 1.005 se redondean mal porque no se representan exactos.
    expect(formatDecimalDisplay('1.005')).toBe('1.01');
    expect(formatDecimalDisplay('8.165')).toBe('8.17');
    // Un entero mas largo de lo que `Number` puede representar sin perder cifras.
    expect(formatDecimalDisplay('9007199254740993.4')).toBe('9007199254740993.4');
  });

  it('otras escalas: el numero de decimales es una prop, no una constante escondida', () => {
    expect(formatDecimalDisplay('0.1255', 0)).toBe('0');
    expect(formatDecimalDisplay('0.1255', 3)).toBe('0.126');
    expect(formatDecimalDisplay('0.1255', 4)).toBe('0.1255');
    expect(formatDecimalDisplay('0.1255', 8)).toBe('0.1255');
  });

  it('lo que no es un decimal en notacion plana vuelve TAL CUAL', () => {
    for (const crudo of ['', '.', '12.', '-', 'abc']) {
      expect(formatDecimalDisplay(crudo), `«${crudo}» deberia volver intacto`).toBe(crudo);
    }
  });
});
