import { cleanup, render, screen } from '@testing-library/react';

import { esperarInteractiva, setupUser } from '../../helpers/user-event';

import {
  PRESENTATION_UNIT_FIELD,
  PRESENTATION_UNIT_OPTION_TESTID,
  PRESENTATION_UNIT_PLACEHOLDER,
  PRESENTATION_UNIT_SELECT_TESTID,
  PresentationUnitSelect,
} from '@/app/(private)/configuracion/presentaciones/components';
import type { UnitRef } from '@/lib/modules/unidades';

/**
 * Selector de unidad de la presentacion: R16, R17 y R20
 * (`specs/QC-80-unidad-desde-la-presentacion/tasks.md > T8`, `design.md > 5.1`).
 *
 * **Se monta dentro de un `<form>` de verdad** y se afirma sobre el `FormData` que ese formulario
 * enviaria: el selector es **no controlado**, asi que lo unico que importa es que el valor viaje
 * en el campo `unitId`. Leer estado de React no probaria nada de lo que R16 exige.
 *
 * **Las unidades llegan por props**: este archivo no mockea ninguna Server Action porque el
 * componente no llama a ninguna.
 */

const UNIDAD_CON_SIMBOLO: UnitRef = {
  id: 'unit-kg',
  name: 'Kilogramo',
  symbol: 'kg',
  baseUnitId: null,
  factor: null,
};
const UNIDAD_SIN_SIMBOLO: UnitRef = {
  id: 'unit-pieza',
  name: 'Pieza',
  symbol: null,
  baseUnitId: null,
  factor: null,
};
const UNIDAD_DE_OTRA_EMPRESA: UnitRef = {
  id: 'unit-caja',
  name: 'Caja',
  symbol: null,
  baseUnitId: null,
  factor: null,
};
const UNIDADES = [UNIDAD_CON_SIMBOLO, UNIDAD_SIN_SIMBOLO, UNIDAD_DE_OTRA_EMPRESA] as const;

/**
 * `data-testid` del formulario anfitrion. Es una CONSTANTE y no un literal en la consulta: la
 * guardia de convenciones de la carpeta (R35) rechaza `getByTestId('…')` escrito a mano.
 */
const FORMULARIO_TESTID = 'presentation-unit-select-host';

/** Monta el selector dentro de un formulario, que es su unico entorno real. */
function renderSelector(props: Partial<Parameters<typeof PresentationUnitSelect>[0]> = {}) {
  return render(
    <form data-testid={FORMULARIO_TESTID}>
      <PresentationUnitSelect units={UNIDADES} {...props} />
    </form>,
  );
}

/** Lo que el formulario enviaria hoy: el `FormData` real, no el estado del componente. */
function loQueSeEnviaria(): FormData {
  return new FormData(screen.getByTestId(FORMULARIO_TESTID) as HTMLFormElement);
}

afterEach(() => {
  cleanup();
});

describe('selector de unidad de la presentacion (R16, R17, R20)', () => {
  it('ofrece TODAS las unidades que recibe, sin filtrar por empresa', async () => {
    // R16 (y R27): el catalogo entero, tal cual llega por props.
    const user = setupUser();
    renderSelector();

    await user.click(screen.getByTestId(PRESENTATION_UNIT_SELECT_TESTID));

    const opciones = await screen.findAllByTestId(PRESENTATION_UNIT_OPTION_TESTID);
    expect(opciones).toHaveLength(UNIDADES.length);
    expect(opciones.map((opcion) => opcion.dataset.value)).toEqual(
      UNIDADES.map((unidad) => unidad.id),
    );
  });

  it('muestra el simbolo cuando existe y el nombre cuando no', async () => {
    // R16, `design.md > 5.1`: mismo criterio de etiqueta que QC-26 y QC-44.
    const user = setupUser();
    renderSelector();

    await user.click(screen.getByTestId(PRESENTATION_UNIT_SELECT_TESTID));

    const etiquetas = (await screen.findAllByTestId(PRESENTATION_UNIT_OPTION_TESTID)).map(
      (opcion) => opcion.textContent,
    );
    expect(etiquetas).toEqual([
      UNIDAD_CON_SIMBOLO.symbol,
      UNIDAD_SIN_SIMBOLO.name,
      UNIDAD_DE_OTRA_EMPRESA.name,
    ]);
  });

  it('no ofrece NINGUNA opcion vacia ni «sin unidad»', async () => {
    // R17 en negativo y de verdad: ninguna opcion vale cadena vacia, y las que hay son
    // exactamente las unidades recibidas. La columna es NOT NULL: ofrecer «sin unidad» seria
    // ofrecer un estado que la base rechaza.
    const user = setupUser();
    renderSelector();

    await user.click(screen.getByTestId(PRESENTATION_UNIT_SELECT_TESTID));

    const opciones = await screen.findAllByRole('option');
    expect(opciones).toHaveLength(UNIDADES.length);
    for (const opcion of opciones) {
      expect(opcion.dataset.value).toBeTruthy();
      expect(opcion.textContent).not.toBe('');
    }
    expect(
      opciones.filter((opcion) => (opcion.dataset.value ?? '') === ''),
    ).toHaveLength(0);
    // Y ninguna opcion se llama «sin unidad». Se mira el DOM de las opciones y no `queryByText`:
    // la guardia de R35 prohibe identificar por copy, y aqui el copy es justamente lo vigilado.
    expect(
      opciones.filter((opcion) => /sin unidad/i.test(opcion.textContent ?? '')),
    ).toHaveLength(0);
  });

  it('sin nada elegido muestra el marcador y no envia ninguna unidad', async () => {
    // R17: el hueco de «no he elegido» no es una opcion; es un marcador, y el envio lo rechaza
    // el esquema.
    renderSelector();

    expect(screen.getByTestId(PRESENTATION_UNIT_SELECT_TESTID)).toHaveTextContent(
      PRESENTATION_UNIT_PLACEHOLDER,
    );
    expect(loQueSeEnviaria().get(PRESENTATION_UNIT_FIELD)).toBe('');
  });

  it('al elegir una unidad, el formulario envia SU identificador', async () => {
    // R16: se envia el id, nunca la etiqueta que se ve.
    const user = setupUser();
    renderSelector();

    await user.click(screen.getByTestId(PRESENTATION_UNIT_SELECT_TESTID));
    const [primera] = await screen.findAllByTestId(PRESENTATION_UNIT_OPTION_TESTID);
    await user.click(await esperarInteractiva(primera));

    expect(loQueSeEnviaria().get(PRESENTATION_UNIT_FIELD)).toBe(UNIDAD_CON_SIMBOLO.id);
  });

  it('precarga la unidad de la presentacion que se edita', () => {
    // R15 apoyada en R16: el valor precargado es el que se enviaria sin tocar nada.
    renderSelector({ defaultValue: UNIDAD_SIN_SIMBOLO.id });

    expect(loQueSeEnviaria().get(PRESENTATION_UNIT_FIELD)).toBe(UNIDAD_SIN_SIMBOLO.id);
    expect(screen.getByTestId(PRESENTATION_UNIT_SELECT_TESTID)).toHaveTextContent(
      UNIDAD_SIN_SIMBOLO.name,
    );
  });

  it('no ofrece crear una unidad ni escribir texto libre', async () => {
    // R16 en negativo: crear unidades es la pantalla de QC-39, no esta.
    const user = setupUser();
    renderSelector();

    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.getAllByRole('combobox')).toHaveLength(1);

    await user.click(screen.getByTestId(PRESENTATION_UNIT_SELECT_TESTID));
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
  });

  it('el campo cumple el area tactil y el tamano de fuente minimos', () => {
    // R20 — 44x44 px y 16 px de fuente, en TODOS los anchos. Es la leccion de QC-90, rechazada
    // por dejar un disparador en `size-6`.
    renderSelector();
    const disparador = screen.getByTestId(PRESENTATION_UNIT_SELECT_TESTID);

    expect(disparador.className).toContain('min-h-11');
    expect(disparador.className).toContain('min-w-11');
    expect(disparador.className).toContain('text-base');
    expect(disparador.className).toContain('md:text-base');
  });
});
