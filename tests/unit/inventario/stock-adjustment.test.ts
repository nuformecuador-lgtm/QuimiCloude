import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  MOVEMENT_REASONS,
  REASONS_BY_DIRECTION,
  STOCK_QUANTITY_PATTERN,
  describeAdjustment,
  isReasonAllowed,
  reasonsFor,
} from '@/lib/modules/inventario';

describe('describeAdjustment', () => {
  it('R28 — un total contado mayor que la existencia vista es un aumento con diferencia positiva', () => {
    expect(describeAdjustment('10', '15')).toEqual({
      direction: 'increase',
      difference: '5.0000',
      amount: '5.0000',
    });
  });

  it('R28 — un total contado menor que la existencia vista es una disminucion con diferencia negativa', () => {
    expect(describeAdjustment('10', '7.25')).toEqual({
      direction: 'decrease',
      difference: '-2.7500',
      amount: '2.7500',
    });
  });

  it('R28 — un total contado de cero sobre una existencia positiva es una disminucion de toda ella', () => {
    expect(describeAdjustment('3.5', '0')).toEqual({
      direction: 'decrease',
      difference: '-3.5000',
      amount: '3.5000',
    });
  });

  it.each([
    ['12', '12'],
    ['12', '12.0000'],
    ['12.0000', '12'],
    ['0', '0.0'],
  ])('R28 — %s frente a %s es diferencia cero: la comparacion es decimal, no de cadenas', (seen, counted) => {
    expect(describeAdjustment(seen, counted)).toBe('zero');
  });

  it.each([
    ['vacio', ''],
    ['parcial con punto final', '12.'],
    ['con signo', '-1'],
    ['con signo mas', '+1'],
    ['con exponente', '1e3'],
    ['con once enteros', '12345678901'],
    ['con cinco decimales', '1.12345'],
    ['con espacios', ' 12'],
    ['con coma decimal', '12,5'],
  ])('R28 — un total contado %s es invalid', (_caso, counted) => {
    expect(describeAdjustment('10', counted)).toBe('invalid');
  });

  it.each([
    ['vacia', ''],
    ['con signo', '-1'],
    ['con exponente', '1e3'],
  ])('R28 — una existencia vista %s tambien es invalid', (_caso, seen) => {
    expect(describeAdjustment(seen, '10')).toBe('invalid');
  });

  it('R28 — acepta los extremos de la escala: diez enteros y cuatro decimales', () => {
    expect(describeAdjustment('0', '9999999999.9999')).toEqual({
      direction: 'increase',
      difference: '9999999999.9999',
      amount: '9999999999.9999',
    });
  });
});

describe('STOCK_QUANTITY_PATTERN', () => {
  it.each(['0', '12', '12.5', '1234567890.1234'])('R28 — acepta %s', (value) => {
    expect(STOCK_QUANTITY_PATTERN.test(value)).toBe(true);
  });

  it.each(['', '12.', '.5', '-1', '1e3', '12345678901', '1.12345'])('R28 — rechaza %s', (value) => {
    expect(STOCK_QUANTITY_PATTERN.test(value)).toBe(false);
  });
});

describe('motivos por sentido', () => {
  it('R4 — un aumento solo admite conteo fisico y error de carga', () => {
    expect([...reasonsFor('increase')].sort()).toEqual(['conteo_fisico', 'error_de_carga']);
    expect(isReasonAllowed('increase', 'conteo_fisico')).toBe(true);
    expect(isReasonAllowed('increase', 'error_de_carga')).toBe(true);
    expect(isReasonAllowed('increase', 'merma')).toBe(false);
    expect(isReasonAllowed('increase', 'rotura')).toBe(false);
  });

  it('R4 — una disminucion admite los cuatro motivos', () => {
    expect(reasonsFor('decrease')).toEqual(MOVEMENT_REASONS);
    for (const reason of MOVEMENT_REASONS) {
      expect(isReasonAllowed('decrease', reason)).toBe(true);
    }
  });

  it('R4 R28 — reasonsFor devuelve la misma lista que publica REASONS_BY_DIRECTION', () => {
    expect(reasonsFor('increase')).toBe(REASONS_BY_DIRECTION.increase);
    expect(reasonsFor('decrease')).toBe(REASONS_BY_DIRECTION.decrease);
  });
});

describe('una sola fuente para el sentido y los motivos', () => {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

  /** Quita comentarios para que un ejemplo en prosa no cuente como codigo. */
  function readCode(relativePath: string): string {
    return readFileSync(join(repoRoot, relativePath), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
  }

  function namedImportsFrom(code: string, specifier: string): string[] {
    const names: string[] = [];
    const pattern = /import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*'([^']+)'/g;
    for (const match of code.matchAll(pattern)) {
      if (match[2] !== specifier) continue;
      for (const raw of match[1]!.split(',')) {
        const name = raw.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0]!.trim();
        if (name !== '') names.push(name);
      }
    }
    return names;
  }

  const consumers = [
    {
      name: 'el dialogo',
      file: 'app/(private)/inventario/components/adjust-batch-dialog.tsx',
      specifier: '@/lib/modules/inventario',
      uses: ['describeAdjustment', 'reasonsFor', 'isReasonAllowed'],
    },
    {
      name: 'el caso de uso',
      file: 'lib/modules/inventario/domain/adjust-batch-stock.ts',
      specifier: './stock-adjustment',
      uses: ['describeAdjustment', 'isReasonAllowed'],
    },
  ] as const;

  it.each(consumers)(
    'R28 — $name decide sentido y motivos con las funciones de stock-adjustment, sin lista de motivos propia',
    ({ file, specifier, uses }) => {
      const code = readCode(file);

      const imported = namedImportsFrom(code, specifier);
      for (const name of uses) {
        expect(imported, `${file} debe importar ${name} de ${specifier}`).toContain(name);
        expect(code, `${file} no puede declarar su propio ${name}`).not.toMatch(
          new RegExp(`(function|const|let|var)\s+${name}\b`),
        );
      }

      expect(code, `${file} no puede declarar su propia tabla de motivos por sentido`).not.toMatch(
        /REASONS_BY_DIRECTION/,
      );
      for (const reason of MOVEMENT_REASONS) {
        expect(code, `${file} no puede nombrar el motivo ${reason} a mano`).not.toMatch(
          new RegExp(`['"\`]${reason}['"\`]`),
        );
      }
    },
  );
});
