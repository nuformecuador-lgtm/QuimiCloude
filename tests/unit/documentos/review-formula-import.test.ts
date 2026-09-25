import { describe, expect, it } from 'vitest';

import type { RecipeStepDocument } from '@/lib/modules/recetas';
import { reviewFormulaImport, type DraftLine, type FormulaDraft } from '@/lib/modules/documentos/domain/review-formula-import';

const STEP: RecipeStepDocument = { blocks: [{ kind: 'paragraph', spans: [{ text: 'Mezclar' }] }] };

function draft(overrides: Partial<FormulaDraft>): FormulaDraft {
  return {
    name: 'Formula',
    description: null,
    lines: [],
    steps: [],
    ...overrides,
  };
}

function existingLine(productId: string, percentage: string | null): DraftLine {
  return { kind: 'existing', productId, percentage };
}

function newLine(newProductName: string, percentage: string | null): DraftLine {
  return { kind: 'new', newProductName, percentage };
}

describe('documentos — reviewFormulaImport', () => {
  describe('R15 — sin lineas no se puede confirmar', () => {
    it('cero filas -> noLines true, canConfirm false', () => {
      const issues = reviewFormulaImport(draft({ lines: [] }));
      expect(issues.noLines).toBe(true);
      expect(issues.canConfirm).toBe(false);
    });
  });

  describe('R15 — filas sin producto asignado (unassigned)', () => {
    it('una fila sin producto se marca "unassigned" y bloquea confirmar', () => {
      const issues = reviewFormulaImport(
        draft({ lines: [{ kind: 'unassigned', percentage: '100.00' }] }),
      );
      expect(issues.rows).toEqual([{ index: 0, problems: ['unassigned'] }]);
      expect(issues.canConfirm).toBe(false);
    });
  });

  describe('R15 — porcentaje vacio o invalido', () => {
    it('percentage null -> "percentage_missing"', () => {
      const issues = reviewFormulaImport(draft({ lines: [existingLine('p1', null)] }));
      expect(issues.rows).toEqual([{ index: 0, problems: ['percentage_missing'] }]);
    });

    it('percentage con mas de 2 decimales -> "percentage_invalid"', () => {
      const issues = reviewFormulaImport(draft({ lines: [existingLine('p1', '33.333')] }));
      expect(issues.rows).toEqual([{ index: 0, problems: ['percentage_invalid'] }]);
    });

    it('percentage 0 -> "percentage_invalid"', () => {
      const issues = reviewFormulaImport(draft({ lines: [existingLine('p1', '0')] }));
      expect(issues.rows).toEqual([{ index: 0, problems: ['percentage_invalid'] }]);
    });

    it('percentage mayor que 100 -> "percentage_invalid"', () => {
      const issues = reviewFormulaImport(draft({ lines: [existingLine('p1', '101')] }));
      expect(issues.rows).toEqual([{ index: 0, problems: ['percentage_invalid'] }]);
    });
  });

  describe('R12, R15 — nombre de materia prima nueva invalido', () => {
    it('nombre vacio tras recortar -> "new_name_invalid"', () => {
      const issues = reviewFormulaImport(draft({ lines: [newLine('   ', '100.00')] }));
      expect(issues.rows).toEqual([{ index: 0, problems: ['new_name_invalid'] }]);
    });

    it('nombre de 201 caracteres -> "new_name_invalid"', () => {
      const nombreLargo = 'a'.repeat(201);
      const issues = reviewFormulaImport(draft({ lines: [newLine(nombreLargo, '100.00')] }));
      expect(issues.rows).toEqual([{ index: 0, problems: ['new_name_invalid'] }]);
    });

    it('nombre de 200 caracteres es valido', () => {
      const nombre = 'a'.repeat(200);
      const issues = reviewFormulaImport(draft({ lines: [newLine(nombre, '100.00')] }));
      expect(issues.rows).toEqual([]);
    });
  });

  describe('R16 — filas repetidas, sin sumar ni fusionar', () => {
    it('dos filas con el mismo productId se marcan "repeated"', () => {
      const issues = reviewFormulaImport(
        draft({ lines: [existingLine('p1', '50.00'), existingLine('p1', '50.00')] }),
      );
      expect(issues.rows).toEqual([
        { index: 0, problems: ['repeated'] },
        { index: 1, problems: ['repeated'] },
      ]);
      expect(issues.canConfirm).toBe(false);
    });

    it('dos materias primas nuevas con el mismo nombre normalizado se marcan "repeated"', () => {
      const issues = reviewFormulaImport(
        draft({ lines: [newLine('Acido Citrico', '50.00'), newLine('acido-citrico', '50.00')] }),
      );
      expect(issues.rows).toEqual([
        { index: 0, problems: ['repeated'] },
        { index: 1, problems: ['repeated'] },
      ]);
    });

    it('distinto producto y distinto nombre nuevo no se marcan repetidas', () => {
      const issues = reviewFormulaImport(
        draft({ lines: [existingLine('p1', '50.00'), existingLine('p2', '50.00')] }),
      );
      expect(issues.rows).toEqual([]);
    });

    it('no suma las filas repetidas: el total sigue contando cada una por separado', () => {
      const issues = reviewFormulaImport(
        draft({ lines: [existingLine('p1', '50.00'), existingLine('p1', '50.00')] }),
      );
      expect(issues.total).toBe('100.00');
      expect(issues.isComplete).toBe(true);
      expect(issues.canConfirm).toBe(false);
    });
  });

  describe('R15 — suma exacta 100,00 %', () => {
    it('99.99 -> incompleta', () => {
      const issues = reviewFormulaImport(draft({ lines: [existingLine('p1', '99.99')] }));
      expect(issues.total).toBe('99.99');
      expect(issues.isComplete).toBe(false);
      expect(issues.canConfirm).toBe(false);
    });

    it('100.00 -> completa', () => {
      const issues = reviewFormulaImport(draft({ lines: [existingLine('p1', '100.00')] }));
      expect(issues.total).toBe('100.00');
      expect(issues.isComplete).toBe(true);
      expect(issues.canConfirm).toBe(true);
    });

    it('100.01 -> incompleta', () => {
      const issues = reviewFormulaImport(
        draft({ lines: [existingLine('p1', '50.00'), existingLine('p2', '50.01')] }),
      );
      expect(issues.total).toBe('100.01');
      expect(issues.isComplete).toBe(false);
      expect(issues.canConfirm).toBe(false);
    });
  });

  describe('R13 — nombre', () => {
    it('nombre valido -> "ok"', () => {
      expect(reviewFormulaImport(draft({ name: 'Desengrasante' })).name).toBe('ok');
    });

    it('nombre vacio tras recortar -> "empty"', () => {
      expect(reviewFormulaImport(draft({ name: '   ' })).name).toBe('empty');
    });

    it('nombre de 121 caracteres -> "too_long"', () => {
      expect(reviewFormulaImport(draft({ name: 'a'.repeat(121) })).name).toBe('too_long');
    });

    it('nombre que normaliza a la cadena vacia -> "normalizes_empty"', () => {
      expect(reviewFormulaImport(draft({ name: '---' })).name).toBe('normalizes_empty');
    });
  });

  describe('R13 — descripcion', () => {
    it('descripcion ausente -> "ok"', () => {
      expect(reviewFormulaImport(draft({ description: null })).description).toBe('ok');
    });

    it('descripcion de 500 caracteres -> "ok"', () => {
      expect(reviewFormulaImport(draft({ description: 'a'.repeat(500) })).description).toBe('ok');
    });

    it('descripcion de 501 caracteres -> "too_long"', () => {
      expect(reviewFormulaImport(draft({ description: 'a'.repeat(501) })).description).toBe('too_long');
    });
  });

  describe('R14 — pasos', () => {
    it('sin pasos es confirmable', () => {
      const issues = reviewFormulaImport(
        draft({ lines: [existingLine('p1', '100.00')], steps: [] }),
      );
      expect(issues.steps).toBe('ok');
      expect(issues.canConfirm).toBe(true);
    });

    it('51 pasos -> "too_many"', () => {
      const steps = Array.from({ length: 51 }, () => STEP);
      expect(reviewFormulaImport(draft({ steps })).steps).toBe('too_many');
    });

    it('50 pasos es valido', () => {
      const steps = Array.from({ length: 50 }, () => STEP);
      expect(reviewFormulaImport(draft({ steps })).steps).toBe('ok');
    });

    it('un paso con 31 elementos -> "invalid"', () => {
      const pasoConTreintaYUno: RecipeStepDocument = {
        blocks: Array.from({ length: 31 }, () => ({
          kind: 'paragraph' as const,
          spans: [{ text: 'x' }],
        })),
      };
      expect(reviewFormulaImport(draft({ steps: [pasoConTreintaYUno] })).steps).toBe('invalid');
    });

    it('un paso vacio (sin caracter visible) -> "invalid"', () => {
      const pasoVacio: RecipeStepDocument = { blocks: [{ kind: 'paragraph', spans: [] }] };
      expect(reviewFormulaImport(draft({ steps: [pasoVacio] })).steps).toBe('invalid');
    });
  });

  describe('canConfirm exige todo a la vez', () => {
    it('una receta valida y completa es confirmable', () => {
      const issues = reviewFormulaImport(
        draft({
          name: 'Desengrasante',
          description: 'Uso industrial',
          lines: [existingLine('p1', '60.00'), newLine('Aditivo X', '40.00')],
          steps: [STEP],
        }),
      );
      expect(issues.canConfirm).toBe(true);
      expect(issues.rows).toEqual([]);
    });
  });
});
