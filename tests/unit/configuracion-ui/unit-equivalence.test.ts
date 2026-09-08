// QC-39 T6 — La frase de equivalencia de la columna: R1 y R17.
//
// `unit-equivalence.ts` es PURO (`design.md > 4`): no monta DOM, asi que aqui no se renderiza
// nada. Los asserts van contra la constante EXPORTADA del marcador neutro y contra las funciones,
// nunca contra literales de copy (R49).
//
// El ultimo bloque es un test **de fuente**: afirma que el factor no se convierte a punto flotante
// en ningun punto del camino (R1). Es la unica forma barata de vigilar una invariante que no se ve
// en el resultado —`'1000.0000'` y una conversion aritmetica dan el mismo `'1000'`— y que se
// romperia el dia que alguien «arregle» el formateo con aritmetica.
//
// Se importa por ruta al archivo y no por el barrel de la ruta porque el barrel lo cierra T12.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  NO_EQUIVALENCE_LABEL,
  formatFactor,
  formatUnitEquivalence,
  unitLabel,
} from '@/app/(private)/configuracion/unidades/components/unit-equivalence';
import type { UnitView } from '@/lib/modules/unidades';

const RAIZ = join(__dirname, '..', '..', '..');

const RUTA_DEL_MODULO = 'app/(private)/configuracion/unidades/components/unit-equivalence.ts';

/** Fuente sin comentarios: la guardia mira **codigo**, no prosa. */
function fuenteSinComentarios(): string {
  return readFileSync(join(RAIZ, RUTA_DEL_MODULO), 'utf8')
    .replace(/\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, ' ');
}

const GRAMO: UnitView = {
  id: 'u-gr',
  name: 'Gramo',
  symbol: 'gr',
  baseUnitId: null,
  factor: null,
  isSystem: true,
};

const KILOGRAMO: UnitView = {
  id: 'u-kg',
  name: 'Kilogramo',
  symbol: 'kg',
  baseUnitId: GRAMO.id,
  factor: '1000.0000',
  isSystem: true,
};

/** Una unidad derivada que NO declara simbolo, ni ella ni su base. */
const CAJA_DE_DOCE: UnitView = {
  id: 'u-caja',
  name: 'Caja de doce',
  symbol: null,
  baseUnitId: 'u-pieza',
  factor: '12.0000',
  isSystem: false,
};

const PIEZA: UnitView = {
  id: 'u-pieza',
  name: 'Pieza',
  symbol: null,
  baseUnitId: null,
  factor: null,
  isSystem: false,
};

describe('formatFactor presenta el decimal sin ceros de relleno (R17)', () => {
  it.each([
    ['1000.0000', '1000'],
    ['0.5000', '0.5'],
    ['1.2340', '1.234'],
    ['2.0000', '2'],
    ['0.0000', '0'],
    ['0.0001', '0.0001'],
    ['1000', '1000'],
    ['12', '12'],
  ])('«%s» se presenta como «%s»', (crudo, esperado) => {
    expect(formatFactor(crudo)).toBe(esperado);
  });

  it('el resultado sigue siendo texto, no un numero', () => {
    expect(typeof formatFactor('1000.0000')).toBe('string');
  });
});

describe('unitLabel nombra por simbolo, o por nombre si no lo hay (R17)', () => {
  it('con simbolo, el simbolo', () => {
    expect(unitLabel(KILOGRAMO)).toBe(KILOGRAMO.symbol);
  });

  it('sin simbolo, el nombre', () => {
    expect(unitLabel(PIEZA)).toBe(PIEZA.name);
    expect(unitLabel({ name: 'Litro', symbol: '   ' })).toBe('Litro');
  });
});

describe('formatUnitEquivalence arma la frase, o no la arma (R17)', () => {
  it('una unidad DERIVADA con su base resuelta produce la frase completa', () => {
    const frase = formatUnitEquivalence(KILOGRAMO, GRAMO);

    expect(frase).toBe(`1 ${unitLabel(KILOGRAMO)} = ${formatFactor('1000.0000')} ${unitLabel(GRAMO)}`);
    expect(frase).not.toContain(NO_EQUIVALENCE_LABEL);
    // El factor se pinta canonicalizado: la columna es Decimal(14,4) y sin esto diria «1000.0000».
    expect(frase).not.toContain('1000.0000');
  });

  it('una unidad BASE produce el marcador neutro (el guion)', () => {
    expect(formatUnitEquivalence(GRAMO, undefined)).toBe(NO_EQUIVALENCE_LABEL);
    // Ni siquiera si por lo que sea llegara una base resuelta: sin `baseUnitId` no hay frase.
    expect(formatUnitEquivalence(GRAMO, KILOGRAMO)).toBe(NO_EQUIVALENCE_LABEL);
  });

  it('una unidad derivada SIN base resuelta cae al marcador neutro y NO lanza', () => {
    expect(() => formatUnitEquivalence(KILOGRAMO, undefined)).not.toThrow();
    expect(formatUnitEquivalence(KILOGRAMO, undefined)).toBe(NO_EQUIVALENCE_LABEL);
  });

  it('una unidad derivada a la que le falta el factor tampoco rompe la fila', () => {
    expect(formatUnitEquivalence({ ...KILOGRAMO, factor: null }, GRAMO)).toBe(NO_EQUIVALENCE_LABEL);
  });

  it('el marcador es el MISMO en los dos casos degradados: el usuario no los distingue', () => {
    expect(formatUnitEquivalence(GRAMO, undefined)).toBe(
      formatUnitEquivalence(KILOGRAMO, undefined),
    );
  });

  it('una unidad sin simbolo —y una base sin simbolo— se nombran por su nombre', () => {
    expect(formatUnitEquivalence(CAJA_DE_DOCE, PIEZA)).toBe(
      `1 ${CAJA_DE_DOCE.name} = 12 ${PIEZA.name}`,
    );
  });
});

describe('el factor NUNCA se convierte a punto flotante (R1)', () => {
  it('ningun camino del modulo convierte el factor a numero', () => {
    const codigo = fuenteSinComentarios();

    for (const prohibido of ['Number(', 'parseFloat', 'parseInt', '+factor', 'toFixed', 'Math.']) {
      expect(codigo, `«${prohibido}» reintroduciria la coma flotante en el unico modulo que decidio no tenerla`).not.toContain(
        prohibido,
      );
    }
  });

  it('un factor con mas precision de la que soporta un flotante se presenta intacto', () => {
    const precioso = '9007199254740993.1230';

    expect(formatFactor(precioso)).toBe('9007199254740993.123');
    expect(
      formatUnitEquivalence({ ...KILOGRAMO, factor: precioso }, GRAMO),
    ).toContain('9007199254740993.123');
  });
});
