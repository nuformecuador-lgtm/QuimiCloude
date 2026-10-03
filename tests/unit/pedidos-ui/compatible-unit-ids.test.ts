import { describe, expect, it } from 'vitest';

import { compatibleUnitIds } from '@/app/(private)/pedidos/components';

const KG = { id: 'kg', baseUnitId: null };
const G = { id: 'g', baseUnitId: 'kg' };
const MG = { id: 'mg', baseUnitId: 'kg' };
const L = { id: 'l', baseUnitId: null };
const ML = { id: 'ml', baseUnitId: 'l' };
const UNIDAD = { id: 'unidad', baseUnitId: null };

const CATALOGO = [KG, G, MG, L, ML, UNIDAD];

describe('compatibleUnitIds', () => {
  it('desde la unidad base devuelve ella y sus derivadas', () => {
    expect(compatibleUnitIds(CATALOGO, 'kg')).toEqual(['kg', 'g', 'mg']);
  });

  it('desde una derivada devuelve su base y las hermanas', () => {
    expect(compatibleUnitIds(CATALOGO, 'g')).toEqual(['kg', 'g', 'mg']);
  });

  it('una unidad sin parientes solo es compatible consigo misma', () => {
    expect(compatibleUnitIds(CATALOGO, 'unidad')).toEqual(['unidad']);
  });

  it('una unidad que no esta en el catalogo solo vale ella', () => {
    expect(compatibleUnitIds(CATALOGO, 'desconocida')).toEqual(['desconocida']);
  });
});
