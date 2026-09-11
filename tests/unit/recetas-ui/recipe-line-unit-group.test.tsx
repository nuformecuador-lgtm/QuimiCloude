import { cleanup, render, screen } from '@testing-library/react';
import { setupUser } from '../../helpers/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  RecipeLinesField,
  type RecipeLineFormValue,
} from '@/app/(private)/produccion/formulas/components';

import type { UnitRef } from '@/lib/modules/unidades';

/**
 * El selector de unidad de una línea, atado al INGREDIENTE de esa línea (QC-26bis, decisión
 * humana del 2026-09-08; QC-80 R23 y R24). Aquí se afirma lo que solo se ve montando la fila
 * -que el campo está deshabilitado, qué opciones ofrece y qué queda elegido tras el gesto-; el
 * cálculo puro de las tres reglas se prueba aparte, en `unit-group.test.ts`.
 *
 * **QC-80 no cambió ninguna regla, cambió la FUENTE del dato**: `option.unitId` sale ahora de
 * `ProductView.latestBatchUnitId` -la unidad de la presentación del LOTE MÁS RECIENTE del
 * producto- y ya no de `products.unit_id`, columna eliminada. Por eso aquí `null` quiere decir
 * **«este ingrediente todavía no tiene ningún lote»** (R23), no «no tiene unidad».
 *
 * `listProductsAction` está mockeada porque `ProductPicker` la importa, pero la página 1 baja
 * precargada por props (R49), así que abrir el desplegable de ingrediente NO la invoca.
 */

const { listProductsActionMock } = vi.hoisted(() => ({ listProductsActionMock: vi.fn() }));

vi.mock('@/lib/modules/inventario/adapters/driving/product-actions', () => ({
  listProductsAction: listProductsActionMock,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const GRAMO: UnitRef = { id: 'u-g', name: 'Gramo', symbol: 'g', baseUnitId: null, factor: null };
const KILOGRAMO: UnitRef = {
  id: 'u-kg',
  name: 'Kilogramo',
  symbol: 'kg',
  baseUnitId: 'u-g',
  factor: '1000.0000',
};
const LITRO: UnitRef = { id: 'u-l', name: 'Litro', symbol: 'L', baseUnitId: null, factor: null };
const MILILITRO: UnitRef = {
  id: 'u-ml',
  name: 'Mililitro',
  symbol: 'mL',
  baseUnitId: 'u-l',
  factor: '0.0010',
};

const UNITS = [KILOGRAMO, GRAMO, LITRO, MILILITRO] as const;

const SOSA = { id: 'p-sosa', name: 'Sosa cáustica', unitId: KILOGRAMO.id };
const AGUA = { id: 'p-agua', name: 'Agua destilada', unitId: LITRO.id };
/**
 * Producto SIN NINGÚN LOTE (R23): `latestBatchUnitId` es `null`, así que no hay presentación de
 * la que derivar su unidad. Es el caso de la receta que se escribe antes de comprar el
 * ingrediente.
 */
const COLORANTE = { id: 'p-colorante', name: 'Colorante rojo', unitId: null };

const INITIAL_PRODUCT_PAGE = { items: [SOSA, AGUA, COLORANTE], totalPages: 1 };

function Harness({ initialLines = [] as readonly RecipeLineFormValue[] }) {
  const [lines, setLines] = useState(initialLines);
  return (
    <RecipeLinesField
      lines={lines}
      onChange={setLines}
      units={UNITS}
      initialProductPage={INITIAL_PRODUCT_PAGE}
    />
  );
}

async function elegirIngrediente(user: ReturnType<typeof setupUser>, nombre: string) {
  await user.click(screen.getByTestId('recipe-line-product-0'));
  await user.click(await screen.findByRole('option', { name: nombre }));
}

/** Etiquetas de las opciones que ofrece el selector de unidad de la línea 0. */
async function opcionesDeUnidad(
  user: ReturnType<typeof setupUser>,
): Promise<string[]> {
  await user.click(screen.getByTestId('recipe-line-unit-0'));
  const opciones = await screen.findAllByTestId('recipe-line-unit-0-option');
  return opciones.map((opcion) => opcion.textContent ?? '');
}

describe('el selector de unidad depende del ingrediente de su línea', () => {
  it('R24 — sin ingrediente elegido, el campo de unidad está DESHABILITADO', () => {
    render(<Harness />);

    expect(screen.getByTestId('recipe-line-unit-0')).toBeDisabled();
  });

  it('R24 — al elegir ingrediente, el campo se habilita', async () => {
    const user = setupUser();
    render(<Harness />);

    await elegirIngrediente(user, SOSA.name);

    expect(screen.getByTestId('recipe-line-unit-0')).toBeEnabled();
  });

  it('R24 — solo ofrece las unidades del GRUPO del ingrediente: un producto en kg lista kg y g', async () => {
    const user = setupUser();
    render(<Harness />);

    await elegirIngrediente(user, SOSA.name);

    expect((await opcionesDeUnidad(user)).sort()).toEqual(['g', 'kg']);
  });

  it('R24 — un ingrediente de otra magnitud ofrece OTRO grupo, y ninguna unidad de masa', async () => {
    const user = setupUser();
    render(<Harness />);

    await elegirIngrediente(user, AGUA.name);

    const opciones = await opcionesDeUnidad(user);
    expect(opciones.sort()).toEqual(['L', 'mL']);
    expect(opciones).not.toContain('kg');
  });

  it('R24 — preselecciona la unidad MÁS PEQUEÑA del grupo, no la primera del catálogo', async () => {
    const user = setupUser();
    render(<Harness />);

    await elegirIngrediente(user, SOSA.name);

    // `g` frente a `kg`: gana el factor menor, no el orden en que llegó el catálogo.
    expect(screen.getByTestId('recipe-line-unit-0')).toHaveTextContent('g');
    expect(screen.getByTestId('recipe-line-unit-0')).not.toHaveTextContent('kg');
  });

  it('R24 — cambiar a un ingrediente del MISMO grupo NO pisa la unidad ya elegida', async () => {
    const user = setupUser();
    render(<Harness initialLines={[]} />);

    await elegirIngrediente(user, SOSA.name);
    // El usuario sube a `kg` a mano...
    await user.click(screen.getByTestId('recipe-line-unit-0'));
    await user.click(await screen.findByRole('option', { name: 'kg' }));
    expect(screen.getByTestId('recipe-line-unit-0')).toHaveTextContent('kg');

    // ...y cambia el ingrediente por otro que se mide igual: su elección sobrevive.
    await elegirIngrediente(user, SOSA.name);
    expect(screen.getByTestId('recipe-line-unit-0')).toHaveTextContent('kg');
  });

  it('R24 — cambiar a un ingrediente de OTRO grupo sí cambia la unidad a la más pequeña del nuevo', async () => {
    const user = setupUser();
    render(<Harness />);

    await elegirIngrediente(user, SOSA.name);
    expect(screen.getByTestId('recipe-line-unit-0')).toHaveTextContent('g');

    await elegirIngrediente(user, AGUA.name);
    // `g` no significa nada en una línea que se mide en litros.
    expect(screen.getByTestId('recipe-line-unit-0')).toHaveTextContent('mL');
  });

  it('R23 — un ingrediente SIN NINGÚN LOTE ofrece el catálogo completo, no una lista vacía', async () => {
    const user = setupUser();
    render(<Harness />);

    await elegirIngrediente(user, COLORANTE.name);

    expect((await opcionesDeUnidad(user)).sort()).toEqual(['L', 'g', 'kg', 'mL']);
  });

  it('R23 — un ingrediente SIN NINGÚN LOTE deja el selector HABILITADO: la línea no se bloquea', async () => {
    const user = setupUser();
    render(<Harness />);

    await elegirIngrediente(user, COLORANTE.name);

    // Sin lote no hay dato con el que acotar, pero eso no es motivo para bloquear la línea: se
    // escriben recetas antes de comprar el ingrediente.
    expect(screen.getByTestId('recipe-line-unit-0')).toBeEnabled();
  });

  it('R23 — un ingrediente SIN NINGÚN LOTE queda con una unidad elegida, no en blanco', async () => {
    const user = setupUser();
    render(<Harness />);

    await elegirIngrediente(user, COLORANTE.name);

    // La más pequeña del catálogo entero, que es el grupo cuando no hay con qué acotar: `mL` y
    // `g` empatan a factor mínimo dentro de su grupo, y aquí compiten `0.0010` (mL) contra `1`
    // (g y L), así que gana `mL`.
    expect(screen.getByTestId('recipe-line-unit-0')).toHaveTextContent('mL');
  });

  it('R23 — con un ingrediente SIN NINGÚN LOTE, la unidad ya elegida a mano SE MANTIENE', async () => {
    const user = setupUser();
    render(<Harness />);

    await elegirIngrediente(user, SOSA.name);
    await user.click(screen.getByTestId('recipe-line-unit-0'));
    await user.click(await screen.findByRole('option', { name: 'kg' }));

    await elegirIngrediente(user, COLORANTE.name);

    // El grupo es el catálogo entero, así que `kg` sigue perteneciendo a él: no se pisa.
    expect(screen.getByTestId('recipe-line-unit-0')).toHaveTextContent('kg');
  });
});

describe('el campo de cantidad es numérico y su valor sigue siendo una cadena', () => {
  it('el input declara type="number"', () => {
    render(<Harness />);

    expect(screen.getByTestId('recipe-line-quantity-0')).toHaveAttribute('type', 'number');
  });
});
