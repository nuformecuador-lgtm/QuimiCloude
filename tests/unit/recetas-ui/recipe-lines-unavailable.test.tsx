import { cleanup, render, screen, within } from '@testing-library/react';
import { setupUser } from '../../helpers/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  RecipeLinesField,
  buildRecipePayload,
  type RecipeLineFormValue,
} from '@/app/(private)/produccion/formulas/components';

/**
 * Marcador y aviso de líneas con producto dado de baja (T16b, R53, R54; `design.md > 6.1`).
 *
 * `productName === null` es el ÚNICO discriminante -no hay ningún otro campo que estas pruebas
 * puedan usar-, y los cinco hechos que exige `tasks.md > T16b`:
 * (a) cero líneas de baja -> sin aviso y sin ningún marcador;
 * (b) dos líneas de baja -> los DOS marcadores, y solo en esas dos, más el aviso con `data-count="2"`;
 * (c) quitar una -> `data-count` pasa a `1`;
 * (d) quitar la última -> el aviso DESAPARECE del DOM;
 * (e) el payload sigue llevando la línea marcada, intacta (R21, R22).
 *
 * Los asserts van sobre `data-testid`, `role` y `data-count`, **nunca sobre el copy** (criterio
 * de honestidad de la task): así un cambio de redacción no puede tapar una regresión real.
 *
 * `listProductsAction` está mockeada porque `ProductPicker` la importa, pero **ningún test de
 * este archivo la invoca**: no se abre ningún selector, así que el doble solo evita que Vitest
 * se queje de una Server Action real fuera de un Server Component.
 */

const { listProductsActionMock } = vi.hoisted(() => ({
  listProductsActionMock: vi.fn(),
}));

vi.mock('@/lib/modules/inventario/adapters/driving/product-actions', () => ({
  listProductsAction: listProductsActionMock,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const NOTICE_TEST_ID = 'recipe-lines-unavailable-notice';

const INITIAL_PRODUCT_PAGE = { items: [], totalPages: 1 };

function unavailableTestId(index: number): string {
  return `recipe-line-unavailable-${index}`;
}

/** Línea con producto disponible: `productName` es una cadena no vacía. */
function availableLine(key: string, name: string): RecipeLineFormValue {
  return {
    key,
    productId: `product-${key}`,
    productName: name,
    percentage: '10',
    productUnitId: null,
  };
}

/** Línea "dada de baja": el único discriminante es `productName === null` (R53, R54). */
function unavailableLine(key: string): RecipeLineFormValue {
  return {
    key,
    productId: `product-${key}`,
    productName: null,
    percentage: '25',
    productUnitId: null,
  };
}

/** Componente controlado mínimo para poder observar los cambios de `lines` entre renders. */
function Harness({
  initialLines,
  onLinesChange,
}: {
  readonly initialLines: readonly RecipeLineFormValue[];
  readonly onLinesChange?: (lines: readonly RecipeLineFormValue[]) => void;
}) {
  const [lines, setLines] = useState(initialLines);
  return (
    <RecipeLinesField
      lines={lines}
      onChange={(next: readonly RecipeLineFormValue[]) => {
        setLines(next);
        onLinesChange?.(next);
      }}
      units={[]}
      initialProductPage={INITIAL_PRODUCT_PAGE}
      tools={[]}
      onToolsChange={() => {}}
      initialMachinePage={INITIAL_PRODUCT_PAGE}
    />
  );
}

describe('aviso y marcador de líneas con producto dado de baja', () => {
  it('(a) sin líneas de baja, el aviso no existe y ninguna celda lleva marcador', () => {
    render(<Harness initialLines={[availableLine('l1', 'Ácido cítrico'), availableLine('l2', 'Sosa cáustica')]} />);

    expect(screen.queryByTestId(NOTICE_TEST_ID)).not.toBeInTheDocument();
    expect(screen.queryByTestId(unavailableTestId(0))).not.toBeInTheDocument();
    expect(screen.queryByTestId(unavailableTestId(1))).not.toBeInTheDocument();
  });

  it('(b) con dos líneas de baja existen los dos marcadores -y solo esos- y el aviso cuenta 2', () => {
    render(
      <Harness
        initialLines={[
          availableLine('l1', 'Ácido cítrico'),
          unavailableLine('l2'),
          unavailableLine('l3'),
        ]}
      />,
    );

    expect(screen.queryByTestId(unavailableTestId(0))).not.toBeInTheDocument();
    expect(screen.getByTestId(unavailableTestId(1))).toBeInTheDocument();
    expect(screen.getByTestId(unavailableTestId(2))).toBeInTheDocument();

    const notice = screen.getByTestId(NOTICE_TEST_ID);
    expect(notice).toHaveAttribute('role', 'status');
    expect(notice).toHaveAttribute('data-count', '2');
  });

  it('(c) al quitar una de las dos líneas de baja, data-count pasa a 1', async () => {
    const user = setupUser();
    render(
      <Harness
        initialLines={[unavailableLine('l1'), unavailableLine('l2'), availableLine('l3', 'Glicerina')]}
      />,
    );

    expect(screen.getByTestId(NOTICE_TEST_ID)).toHaveAttribute('data-count', '2');

    await user.click(screen.getByTestId('recipe-line-remove-0'));

    expect(screen.getByTestId(NOTICE_TEST_ID)).toHaveAttribute('data-count', '1');
  });

  it('(d) al quitar la última línea de baja, el aviso desaparece del DOM', async () => {
    const user = setupUser();
    render(<Harness initialLines={[unavailableLine('l1'), availableLine('l2', 'Glicerina')]} />);

    expect(screen.getByTestId(NOTICE_TEST_ID)).toBeInTheDocument();

    await user.click(screen.getByTestId('recipe-line-remove-0'));

    expect(screen.queryByTestId(NOTICE_TEST_ID)).not.toBeInTheDocument();
  });

  it('(f) la línea de baja no deja añadir otra después: su `+` está deshabilitado', () => {
    render(<Harness initialLines={[unavailableLine('l1'), availableLine('l2', 'Glicerina')]} />);

    expect(screen.getByTestId('recipe-line-add-0')).toBeDisabled();
    expect(screen.getByTestId('recipe-line-add-1')).toBeEnabled();
  });

  it('(e) el payload enviado sigue conteniendo la línea marcada, intacta (R21, R22)', () => {
    const markedLine = unavailableLine('l1');
    const lines = [markedLine, availableLine('l2', 'Glicerina')];

    render(<Harness initialLines={lines} />);

    // El marcador existe en pantalla...
    expect(screen.getByTestId(unavailableTestId(0))).toBeInTheDocument();

    // ...pero `buildRecipePayload` no conoce `productName`: la línea viaja completa e intacta.
    const payload = buildRecipePayload('edit', {
      name: 'Receta de prueba',
      description: '',
      lines,
      tools: [],
      steps: [],
      image: { kind: 'untouched' },
    });

    expect(payload.lines).toHaveLength(2);
    expect(payload.lines[0]).toEqual({
      productId: markedLine.productId,
      percentage: markedLine.percentage,
    });
  });
});

describe('dentro de la celda de producto solo se marca la línea afectada', () => {
  it('la celda de una línea disponible no lleva testid de no disponible', () => {
    render(
      <Harness
        initialLines={[availableLine('l1', 'Ácido cítrico'), unavailableLine('l2')]}
      />,
    );

    const rows = screen.getAllByTestId('recipe-line-row');
    expect(within(rows[0]).queryByTestId(unavailableTestId(0))).not.toBeInTheDocument();
    expect(within(rows[1]).getByTestId(unavailableTestId(1))).toBeInTheDocument();
  });
});
