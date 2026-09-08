import { describe, expect, it } from 'vitest';

import {
  compareDecimalText,
  resolveLineUnitId,
  smallestUnit,
  unitsOfGroup,
} from '@/app/(private)/produccion/formulas/components';

import type { UnitRef } from '@/lib/modules/unidades';

/**
 * Las tres reglas del selector de unidad por linea (QC-26bis, decision humana del 2026-09-08).
 *
 * Se prueban SIN DOM porque `unit-group.ts` es puro: si estas reglas se pudieran romper sin que
 * este archivo se ponga en rojo, estarian escritas en el sitio equivocado.
 *
 * **Criterio de honestidad**: cada asercion cae si se borra la linea que la sostiene. En
 * particular, `mantiene la unidad ya elegida...` se pone en rojo si `resolveLineUnitId` deja de
 * consultar el grupo y devuelve siempre la mas pequena, y `el grupo de un producto sin unidad es
 * el catalogo completo` se pone en rojo si `unitsOfGroup` deja de tratar `null` como "no se
 * sabe" y devuelve un array vacio.
 */

const GRAMO: UnitRef = { id: 'u-g', name: 'Gramo', symbol: 'g', baseUnitId: null, factor: null };
const KILOGRAMO: UnitRef = {
  id: 'u-kg',
  name: 'Kilogramo',
  symbol: 'kg',
  baseUnitId: 'u-g',
  factor: '1000.0000',
};
const MILIGRAMO: UnitRef = {
  id: 'u-mg',
  name: 'Miligramo',
  symbol: 'mg',
  baseUnitId: 'u-g',
  factor: '0.0010',
};
const LITRO: UnitRef = { id: 'u-l', name: 'Litro', symbol: 'L', baseUnitId: null, factor: null };
const MILILITRO: UnitRef = {
  id: 'u-ml',
  name: 'Mililitro',
  symbol: 'mL',
  baseUnitId: 'u-l',
  factor: '0.0010',
};

const CATALOGO = [KILOGRAMO, LITRO, MILIGRAMO, GRAMO, MILILITRO] as const;

describe('compareDecimalText — orden exacto de decimales escritos como texto', () => {
  it('ordena por valor y no por longitud de la cadena', () => {
    // `'9'` es mayor que `'10'` comparando como texto plano; aqui no.
    expect(compareDecimalText('9', '10')).toBeLessThan(0);
    expect(compareDecimalText('1000.0000', '0.0010')).toBeGreaterThan(0);
  });

  it('los ceros de relleno no cambian el valor', () => {
    expect(compareDecimalText('1', '1.0000')).toBe(0);
    expect(compareDecimalText('0001.5', '1.50')).toBe(0);
  });

  it('distingue decimales que un `number` de 4 cifras confundiria', () => {
    expect(compareDecimalText('0.0001', '0.0002')).toBeLessThan(0);
  });
});

describe('unitsOfGroup — el grupo es la BASE EFECTIVA, igual que la convertibilidad', () => {
  it('un kilogramo trae su base y sus hermanas, y ninguna unidad de volumen', () => {
    const grupo = unitsOfGroup(CATALOGO, KILOGRAMO.id);

    expect(grupo.map((unit) => unit.id).sort()).toEqual(['u-g', 'u-kg', 'u-mg']);
    expect(grupo).not.toContain(LITRO);
    expect(grupo).not.toContain(MILILITRO);
  });

  it('la unidad BASE trae el mismo grupo que cualquiera de sus derivadas', () => {
    expect(unitsOfGroup(CATALOGO, GRAMO.id).map((unit) => unit.id).sort()).toEqual(
      unitsOfGroup(CATALOGO, KILOGRAMO.id).map((unit) => unit.id).sort(),
    );
  });

  it('el grupo de un producto SIN unidad es el catalogo completo, nunca uno vacio', () => {
    // Decision del humano del 2026-09-08: `products.unit_id` es anulable, y no se recorta una
    // lista a partir de un dato que no se tiene.
    expect(unitsOfGroup(CATALOGO, null)).toEqual(CATALOGO);
  });

  it('una unidad que no esta en el catalogo tambien devuelve el catalogo completo', () => {
    expect(unitsOfGroup(CATALOGO, 'u-inexistente')).toEqual(CATALOGO);
  });
});

describe('smallestUnit — la mas pequena del grupo es la de menor factor efectivo', () => {
  it('en gramos gana el miligramo, no el gramo que es la base', () => {
    // La base NO es necesariamente la mas pequena: `mg` deriva de `g` con factor `0.0010`.
    expect(smallestUnit(unitsOfGroup(CATALOGO, KILOGRAMO.id))?.id).toBe(MILIGRAMO.id);
  });

  it('sin derivadas por debajo, gana la propia base (factor efectivo 1)', () => {
    expect(smallestUnit([GRAMO, KILOGRAMO])?.id).toBe(GRAMO.id);
  });

  it('el desempate es por id, asi el resultado no depende del orden de llegada', () => {
    const gemela: UnitRef = { ...MILILITRO, id: 'u-cc' };
    expect(smallestUnit([MILILITRO, gemela])?.id).toBe('u-cc');
    expect(smallestUnit([gemela, MILILITRO])?.id).toBe('u-cc');
  });

  it('un grupo vacio no tiene unidad mas pequena', () => {
    expect(smallestUnit([])).toBeNull();
  });
});

describe('resolveLineUnitId — que unidad queda al elegir ingrediente', () => {
  it('sin unidad previa, preselecciona la mas pequena del grupo del ingrediente', () => {
    expect(resolveLineUnitId(CATALOGO, KILOGRAMO.id, '')).toBe(MILIGRAMO.id);
  });

  it('mantiene la unidad ya elegida cuando el ingrediente nuevo es del MISMO grupo', () => {
    // Cambiar de un producto en kg a otro en kg no pisa el `g` que el usuario puso a mano.
    expect(resolveLineUnitId(CATALOGO, KILOGRAMO.id, GRAMO.id)).toBe(GRAMO.id);
  });

  it('cambia a la mas pequena cuando el ingrediente nuevo es de OTRO grupo', () => {
    // `g` no significa nada en una linea que se mide en litros.
    expect(resolveLineUnitId(CATALOGO, LITRO.id, GRAMO.id)).toBe(MILILITRO.id);
  });

  it('con un ingrediente sin unidad, respeta lo ya elegido sea lo que sea', () => {
    expect(resolveLineUnitId(CATALOGO, null, LITRO.id)).toBe(LITRO.id);
  });

  it('sin catalogo no inventa ninguna unidad', () => {
    expect(resolveLineUnitId([], KILOGRAMO.id, '')).toBe('');
  });
});
