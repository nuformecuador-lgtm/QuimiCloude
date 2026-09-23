// El formateador del importe del bloque de coste: `$ 1,234,567.50`, sin `Intl` ni coma flotante
// (R18) y con el valor exacto en el `title` solo cuando difiere de lo pintado (R19).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ORDER_AMOUNT_SYMBOL, formatOrderAmount, orderAmountTitle } from '@/app/(private)/pedidos/components';

describe('formatOrderAmount — R18', () => {
  it('pinta el simbolo fijo, separador de miles y siempre dos decimales', () => {
    expect(formatOrderAmount('40.0000')).toBe('$ 40.00');
    expect(formatOrderAmount('0.0000')).toBe('$ 0.00');
    expect(formatOrderAmount('0.0050')).toBe('$ 0.01');
    expect(formatOrderAmount('999.9950')).toBe('$ 1,000.00');
    expect(formatOrderAmount('1234567.5000')).toBe('$ 1,234,567.50');
    expect(formatOrderAmount('9999999999.9999')).toBe('$ 10,000,000,000.00');
    expect(formatOrderAmount('12752.5512')).toBe('$ 12,752.55');
  });

  it('usa el simbolo exportado', () => {
    expect(ORDER_AMOUNT_SYMBOL).toBe('$');
  });

  it('la fuente no usa Intl, toLocaleString, parseFloat, toFixed ni Number(', () => {
    const ruta = join(__dirname, '..', '..', '..', 'app/(private)/pedidos/components/order-amount.ts');
    const sinComentarios = readFileSync(ruta, 'utf8')
      .replace(/\/\/[^\n]*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, ' ');

    expect(sinComentarios).not.toMatch(/Intl/);
    expect(sinComentarios).not.toMatch(/toLocaleString/);
    expect(sinComentarios).not.toMatch(/parseFloat\s*\(/);
    expect(sinComentarios).not.toMatch(/\.toFixed\s*\(/);
    expect(sinComentarios).not.toMatch(/\bNumber\s*\(/);
  });
});

describe('orderAmountTitle — R19', () => {
  it('expone el valor exacto solo cuando difiere de lo pintado', () => {
    expect(orderAmountTitle('12752.5512')).toBe('12752.5512');
    expect(orderAmountTitle('40.0000')).toBeUndefined();
    expect(orderAmountTitle('1234567.5000')).toBeUndefined();
  });
});
