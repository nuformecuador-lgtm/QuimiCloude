import { cleanup, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { RecipeStepsField } from '@/app/(private)/produccion/formulas/components';
import type { RecipeStepFormValue } from '@/app/(private)/produccion/formulas/components/recipe-form-state';
import type { RecipeStepDocument } from '@/lib/modules/recetas';

import { setupUser } from '../../helpers/user-event';

const ROW_HEIGHT = 60;

// ProseMirror pide geometria que jsdom no calcula; mismos stubs que recipe-form.test.tsx.
beforeAll(() => {
  if (typeof Range.prototype.getClientRects !== 'function') {
    Range.prototype.getClientRects = () => {
      const rects: DOMRect[] = [];
      return Object.assign(rects, {
        item: (index: number) => rects[index] ?? null,
      }) as unknown as DOMRectList;
    };
  }
  if (typeof Range.prototype.getBoundingClientRect !== 'function') {
    Range.prototype.getBoundingClientRect = () => new DOMRect(0, 0, 0, 0);
  }
  if (typeof document.elementFromPoint !== 'function') {
    (document as unknown as { elementFromPoint: () => Element | null }).elementFromPoint = () =>
      null;
  }
});

afterEach(() => {
  cleanup();
});

/** dnd-kit decide arriba/abajo por rectangulos; jsdom los da vacios. Cada fila mide su posicion. */
function installRowRectStub(): () => void {
  const original = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function (this: Element): DOMRect {
    const row = this.closest('li[data-testid$="-row"]');
    if (row !== null) {
      const rows = row.parentElement === null ? [row] : Array.from(row.parentElement.children);
      const top = Math.max(0, rows.indexOf(row)) * ROW_HEIGHT;
      const rect = { x: 0, y: top, top, left: 0, right: 320, bottom: top + ROW_HEIGHT, width: 320, height: ROW_HEIGHT };
      return { ...rect, toJSON: () => rect } as DOMRect;
    }
    return original.call(this);
  };
  return () => {
    Element.prototype.getBoundingClientRect = original;
  };
}

function doc(text: string): RecipeStepDocument {
  return { blocks: [{ kind: 'paragraph', spans: [{ text }] }] };
}

function step(key: string, text: string): RecipeStepFormValue {
  return { key, document: doc(text) };
}

function textOf(testId: string): string {
  return screen.getByTestId(testId).textContent ?? '';
}

function SingleHarness({ initial = [step('a', 'Mezclar')] }: { readonly initial?: RecipeStepFormValue[] }) {
  const [steps, setSteps] = useState<readonly RecipeStepFormValue[]>(initial);
  return <RecipeStepsField steps={steps} onChange={setSteps} errors={{ 0: 'Paso vacio' }} />;
}

function DoubleHarness() {
  const [operator, setOperator] = useState<readonly RecipeStepFormValue[]>([
    step('op-1', 'Pesar'),
    step('op-2', 'Mezclar'),
  ]);
  const [packing, setPacking] = useState<readonly RecipeStepFormValue[]>([
    step('pk-1', 'Etiquetar'),
    step('pk-2', 'Sellar'),
  ]);
  return (
    <>
      <RecipeStepsField steps={operator} onChange={setOperator} />
      <RecipeStepsField
        steps={packing}
        onChange={setPacking}
        title="Pasos de envasado"
        addLabel="Añadir paso de envasado"
        testIdPrefix="recipe-packing-step"
        errors={{ 1: 'Paso de envasado vacio' }}
      />
    </>
  );
}

describe('RecipeStepsField reutilizable (QC-211)', () => {
  it('R7: sin props nuevas conserva titulo, texto de añadir y todos los data-testid de hoy', () => {
    render(<SingleHarness />);

    const field = screen.getByTestId('recipe-steps-field');
    expect(within(field).getByRole('heading', { name: 'Pasos' })).toBeInTheDocument();
    expect(screen.getByTestId('recipe-step-add')).toHaveTextContent('Añadir paso');
    expect(screen.getByTestId('recipe-steps-list')).toBeInTheDocument();
    expect(screen.getAllByTestId('recipe-step-row')).toHaveLength(1);
    expect(screen.getByTestId('recipe-step-handle-0')).toBeInTheDocument();
    expect(screen.getByTestId('recipe-step-text-0')).toBeInTheDocument();
    expect(screen.getByTestId('recipe-step-remove-0')).toBeInTheDocument();
    expect(screen.getByTestId('recipe-step-field-error-0')).toHaveTextContent('Paso vacio');
    expect(screen.getByTestId('recipe-step-field-error-0')).toHaveAttribute('id', 'recipe-step-error-0');
  });

  it('R7: con testIdPrefix de envasado salen titulo, texto de añadir y data-testid propios', () => {
    render(<DoubleHarness />);

    const field = screen.getByTestId('recipe-packing-steps-field');
    expect(within(field).getByRole('heading', { name: 'Pasos de envasado' })).toBeInTheDocument();
    expect(screen.getByTestId('recipe-packing-step-add')).toHaveTextContent('Añadir paso de envasado');
    expect(screen.getByTestId('recipe-packing-steps-list')).toBeInTheDocument();
    expect(screen.getAllByTestId('recipe-packing-step-row')).toHaveLength(2);
    expect(screen.getByTestId('recipe-packing-step-handle-1')).toBeInTheDocument();
    expect(textOf('recipe-packing-step-text-0')).toContain('Etiquetar');
    expect(screen.getByTestId('recipe-packing-step-remove-1')).toBeInTheDocument();
    expect(screen.getByTestId('recipe-packing-step-field-error-1')).toHaveTextContent(
      'Paso de envasado vacio',
    );
    expect(screen.queryByTestId('recipe-step-field-error-1')).toBeNull();
    // Los id de error no colisionan entre instancias.
    expect(document.querySelectorAll('#recipe-step-error-1')).toHaveLength(0);
    expect(document.querySelectorAll('#recipe-packing-step-error-1')).toHaveLength(1);
  });

  it('R7: dos instancias en el mismo arbol no comparten pasos al añadir ni al quitar', async () => {
    const user = setupUser();
    render(<DoubleHarness />);

    await user.click(screen.getByTestId('recipe-packing-step-add'));
    expect(screen.getAllByTestId('recipe-packing-step-row')).toHaveLength(3);
    expect(screen.getAllByTestId('recipe-step-row')).toHaveLength(2);

    await user.click(screen.getByTestId('recipe-step-remove-0'));
    expect(screen.getAllByTestId('recipe-step-row')).toHaveLength(1);
    expect(screen.getAllByTestId('recipe-packing-step-row')).toHaveLength(3);
    expect(textOf('recipe-packing-step-text-0')).toContain('Etiquetar');
  });

  it('R7: arrastrar con teclado en la lista de envasado no mueve la de pasos del operador', async () => {
    const uninstall = installRowRectStub();
    try {
      const user = setupUser();
      render(<DoubleHarness />);

      screen.getByTestId('recipe-packing-step-handle-0').focus();
      await user.keyboard(' ');
      await user.keyboard('{ArrowDown}');
      await user.keyboard(' ');

      expect(textOf('recipe-packing-step-text-0')).toContain('Sellar');
      expect(textOf('recipe-packing-step-text-1')).toContain('Etiquetar');
      expect(textOf('recipe-step-text-0')).toContain('Pesar');
      expect(textOf('recipe-step-text-1')).toContain('Mezclar');
    } finally {
      uninstall();
    }
  });
});
