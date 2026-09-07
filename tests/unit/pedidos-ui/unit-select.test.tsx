// QC-35 T9 — Selector de unidad del pedido: R32 y R43.
//
// **Se monta dentro de un `<form>` de verdad** y se afirma sobre el `FormData` que ese formulario
// enviaria: el selector es **no controlado**, asi que lo unico que importa es que el valor viaje
// en el campo `unitId`. Comprobarlo leyendo estado de React no probaria nada de lo que R32 exige.
//
// **Las unidades llegan por props** (R43): este archivo no mockea ninguna Server Action porque el
// componente no llama a ninguna, y una guardia de fuente lo comprueba en negativo.

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';

import {
  UNIT_FIELD,
  UNIT_OPTION_TESTID,
  UNIT_SELECT_TESTID,
  UnitSelect,
} from '@/app/(private)/pedidos/components';
import type { UnitRef } from '@/lib/modules/unidades';

const UNIDAD_CON_SIMBOLO: UnitRef = { id: crypto.randomUUID(), name: 'Kilogramo', symbol: 'kg' };
const UNIDAD_SIN_SIMBOLO: UnitRef = { id: crypto.randomUUID(), name: 'Pieza', symbol: null };
const UNIDADES = [UNIDAD_CON_SIMBOLO, UNIDAD_SIN_SIMBOLO] as const;

function renderSelector(props: Partial<Parameters<typeof UnitSelect>[0]> = {}) {
  return render(
    <form data-testid="formulario">
      <UnitSelect units={UNIDADES} {...props} />
    </form>,
  );
}

function loQueSeEnviaria(): FormData {
  return new FormData(screen.getByTestId('formulario') as HTMLFormElement);
}

afterEach(() => {
  cleanup();
});

describe('selector de unidad del pedido (R32, R43)', () => {
  it('ofrece unicamente las unidades existentes, sin opcion vacia', async () => {
    // R32 — ni texto libre, ni «sin unidad»: `createOrderSchema` exige un uuid.
    const user = userEvent.setup();
    renderSelector();

    await user.click(screen.getByTestId(UNIT_SELECT_TESTID));

    const opciones = await screen.findAllByRole('option');
    expect(opciones).toHaveLength(UNIDADES.length);
    expect(screen.getAllByTestId(UNIT_OPTION_TESTID)).toHaveLength(UNIDADES.length);
  });

  it('muestra el simbolo cuando existe y el nombre cuando no', async () => {
    // `design.md > 9.2`, mismo criterio que QC-26.
    const user = userEvent.setup();
    renderSelector();

    await user.click(screen.getByTestId(UNIT_SELECT_TESTID));

    const etiquetas = screen.getAllByTestId(UNIT_OPTION_TESTID).map((o) => o.textContent);
    expect(etiquetas).toEqual([UNIDAD_CON_SIMBOLO.symbol, UNIDAD_SIN_SIMBOLO.name]);
  });

  it('al elegir una unidad, el formulario envia SU identificador', async () => {
    // R32 — el selector es no controlado y su valor viaja en el `FormData`.
    const user = userEvent.setup();
    renderSelector();

    await user.click(screen.getByTestId(UNIT_SELECT_TESTID));
    const opciones = await screen.findAllByTestId(UNIT_OPTION_TESTID);
    await user.click(opciones[1]);

    expect(loQueSeEnviaria().get(UNIT_FIELD)).toBe(UNIDAD_SIN_SIMBOLO.id);
  });

  it('en la edicion arranca con la unidad ya asignada al pedido', async () => {
    // R28 — precarga.
    renderSelector({ defaultValue: UNIDAD_CON_SIMBOLO.id });

    expect(loQueSeEnviaria().get(UNIT_FIELD)).toBe(UNIDAD_CON_SIMBOLO.id);
  });

  it('no importa ninguna operacion de creacion de unidades', () => {
    // R32 en negativo — guardia de FUENTE: el alta de unidades es QC-38 y su pantalla QC-39.
    const fuente = readFileSync('app/(private)/pedidos/components/unit-select.tsx', 'utf8');

    expect(fuente).not.toContain('createUnitAction');
    expect(fuente).not.toContain('unit-actions');
    expect(fuente).not.toContain('@/lib/composition');
  });
});
