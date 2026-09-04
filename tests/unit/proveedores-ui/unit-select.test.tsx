import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import {
  NO_UNIT_VALUE,
  UNIT_FIELD,
  UnitSelect,
} from '@/app/(private)/proveedores/[id]/components';
import type { UnitRef } from '@/lib/modules/unidades';

/**
 * Selector de unidad de la linea de catalogo: R40 y R46
 * (`specs/QC-44-pantalla-de-proveedores/tasks.md > T14`, `design.md > 8.2`).
 *
 * **Se monta dentro de un `<form>` de verdad** y se afirma sobre el `FormData` que ese formulario
 * enviaria: el selector es **no controlado**, asi que lo unico que importa es que el valor viaje
 * en el campo `unitId`. Comprobarlo leyendo estado de React no probaria nada de lo que R40 exige.
 *
 * **Las unidades llegan por props** (R46): este archivo no mockea ninguna Server Action porque el
 * componente no llama a ninguna. Si algun dia la llamara, este test seguiria verde y por eso
 * existe ademas la guardia de fuente de `catalog-route-contract.test.ts`.
 */

const UNIDAD_CON_SIMBOLO: UnitRef = { id: 'unit-kg', name: 'Kilogramo', symbol: 'kg' };
const UNIDAD_SIN_SIMBOLO: UnitRef = { id: 'unit-pieza', name: 'Pieza', symbol: null };
const UNIDADES = [UNIDAD_CON_SIMBOLO, UNIDAD_SIN_SIMBOLO] as const;

/** Monta el selector dentro de un formulario, que es su unico entorno real. */
function renderSelector(props: Partial<Parameters<typeof UnitSelect>[0]> = {}) {
  return render(
    <form data-testid="formulario">
      <UnitSelect units={UNIDADES} {...props} />
    </form>,
  );
}

/** Lo que el formulario enviaria hoy: el `FormData` real, no el estado del componente. */
function loQueSeEnviaria(): FormData {
  return new FormData(screen.getByTestId('formulario') as HTMLFormElement);
}

afterEach(() => {
  cleanup();
});

describe('selector de unidad de la linea (R40, R46)', () => {
  it('ofrece unicamente las unidades existentes mas la opcion explicita «sin unidad»', async () => {
    // R40 — ni texto libre, ni unidades inventadas.
    const user = userEvent.setup();
    renderSelector();

    await user.click(screen.getByTestId('unit-select'));

    const opciones = await screen.findAllByRole('option');
    expect(opciones).toHaveLength(UNIDADES.length + 1);
    expect(screen.getByTestId('unit-option-none')).toBeInTheDocument();
    expect(screen.getAllByTestId('unit-option')).toHaveLength(UNIDADES.length);
  });

  it('muestra el simbolo cuando existe y el nombre cuando no', async () => {
    // `design.md > 8.2`, mismo criterio que QC-26.
    const user = userEvent.setup();
    renderSelector();

    await user.click(screen.getByTestId('unit-select'));

    const etiquetas = screen.getAllByTestId('unit-option').map((opcion) => opcion.textContent);
    expect(etiquetas).toEqual([UNIDAD_CON_SIMBOLO.symbol, UNIDAD_SIN_SIMBOLO.name]);
  });

  it('sin elegir nada, el formulario envia el campo de unidad como cadena vacia', async () => {
    // R40 — «sin unidad» es un estado valido de la linea y viaja como vacio: el adaptador driving
    // ya trata un opcional vacio como ausencia.
    renderSelector();

    expect(loQueSeEnviaria().get(UNIT_FIELD)).toBe(NO_UNIT_VALUE);
    expect(NO_UNIT_VALUE).toBe('');
  });

  it('al elegir una unidad, el formulario envia SU identificador', async () => {
    // R40 — se envia el id, nunca la etiqueta que se ve.
    const user = userEvent.setup();
    renderSelector();

    await user.click(screen.getByTestId('unit-select'));
    await user.click(screen.getAllByTestId('unit-option')[0]);

    expect(loQueSeEnviaria().get(UNIT_FIELD)).toBe(UNIDAD_CON_SIMBOLO.id);
  });

  it('elegir «sin unidad» despues de haber elegido una vuelve a enviar cadena vacia', async () => {
    // R40 — quitar la unidad tiene que ser posible, no solo no ponerla nunca.
    const user = userEvent.setup();
    renderSelector({ defaultValue: UNIDAD_CON_SIMBOLO.id });

    expect(loQueSeEnviaria().get(UNIT_FIELD)).toBe(UNIDAD_CON_SIMBOLO.id);

    await user.click(screen.getByTestId('unit-select'));
    await user.click(screen.getByTestId('unit-option-none'));

    expect(loQueSeEnviaria().get(UNIT_FIELD)).toBe(NO_UNIT_VALUE);
  });

  it('precarga la unidad de la linea que se edita', () => {
    // R31 (precarga) apoyada en R40: el valor precargado es el que se enviaria sin tocar nada.
    renderSelector({ defaultValue: UNIDAD_SIN_SIMBOLO.id });

    expect(loQueSeEnviaria().get(UNIT_FIELD)).toBe(UNIDAD_SIN_SIMBOLO.id);
    expect(screen.getByTestId('unit-select')).toHaveTextContent(UNIDAD_SIN_SIMBOLO.name);
  });

  it('una unidad nula precargada equivale a «sin unidad»', () => {
    // R40 — `CatalogLineView.unitId` es `string | null` y la precarga no puede romperse con `null`.
    renderSelector({ defaultValue: null });

    expect(loQueSeEnviaria().get(UNIT_FIELD)).toBe(NO_UNIT_VALUE);
  });

  it('no ofrece ninguna forma de crear una unidad ni de escribir uno libre', async () => {
    // R40 en negativo — crear unidades es QC-38/QC-39, no esta pantalla.
    const user = userEvent.setup();
    renderSelector();

    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
    // El unico control es el propio selector (rol `combobox`): ningun boton de alta junto a el,
    // a diferencia del selector de presentacion, que si ofrece crear (R38).
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.getAllByRole('combobox')).toHaveLength(1);

    await user.click(screen.getByTestId('unit-select'));
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
  });

  it('el campo cumple el area tactil y el tamano de fuente minimos', () => {
    // R48 — 44x44 px y 16 px de fuente, en todos los anchos.
    renderSelector();
    const disparador = screen.getByTestId('unit-select');

    expect(disparador.className).toContain('min-h-11');
    expect(disparador.className).toContain('min-w-11');
    expect(disparador.className).toContain('text-base');
    expect(disparador.className).toContain('md:text-base');
  });
});
