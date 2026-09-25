import { cleanup, render, screen } from '@testing-library/react';

import { PRESENTATION_FIELD, PresentationSelect } from '@/components/shared/presentation-select';

import { setupUser } from '../../helpers/user-event';

/**
 * Ayuda opcional de la etiqueta de `PresentationSelect` (QC-90, T0).
 *
 * **No cubre ningun `R<n>` de QC-90**: la prop `helper` es deuda que la rama arrastraba
 * -`product-form.tsx` ya la pasaba y el componente no la tenia, con el typecheck en rojo-. Lo que
 * se vigila aqui es lo mismo que vigila el test de la ayuda de `ProductField`, y por las mismas
 * tres razones:
 *
 *   1. que el disparador sea `type="button"` -este selector vive DENTRO del formulario de
 *      producto, y un boton sin tipo dentro de un `<form>` lo enviaria-;
 *   2. que tenga nombre accesible propio, porque su contenido es solo un icono;
 *   3. que sin `helper` no se pinte absolutamente nada: los dos consumidores de hoy
 *      -inventario y proveedores- no pueden ganar adorno por la puerta de atras.
 *
 * **Las Server Actions de presentacion estan mockeadas**: son el borde del modulo `inventario`,
 * que esta task no abre, y sin ellas el componente no se puede montar fuera del servidor.
 */

const { listPresentationsActionMock, createPresentationActionMock } = vi.hoisted(() => ({
  listPresentationsActionMock: vi.fn(),
  createPresentationActionMock: vi.fn(),
}));

vi.mock('@/lib/modules/inventario/adapters/driving/presentation-actions', () => ({
  listPresentationsAction: listPresentationsActionMock,
  createPresentationAction: createPresentationActionMock,
}));

const HELPER_TEXT = 'La presentación en la que llega este lote.';

beforeEach(() => {
  listPresentationsActionMock.mockResolvedValue({
    status: 'success',
    data: { items: [], page: 1, pageSize: 25, total: 0, totalPages: 1 },
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('PresentationSelect · ayuda de la etiqueta', () => {
  it('sin `helper` no pinta ningun disparador de ayuda', () => {
    render(<PresentationSelect />);

    expect(screen.queryByTestId('presentation-helper')).toBeNull();
    expect(screen.queryByTestId('presentation-helper-text')).toBeNull();
    // La etiqueta sigue nombrando al combobox, con ayuda o sin ella.
    expect(screen.getByTestId('presentation-select')).toHaveAccessibleName('Presentación');
  });

  it('con `helper` el disparador existe, es `type="button"` y lleva su nombre accesible', () => {
    render(<PresentationSelect helper={HELPER_TEXT} />);

    const ayuda = screen.getByTestId('presentation-helper');
    expect(ayuda).toHaveAttribute('type', 'button');
    expect(ayuda).toHaveAccessibleName('Qué es Presentación');
    // El texto no esta en el documento hasta que se pide.
    expect(screen.queryByTestId('presentation-helper-text')).toBeNull();
    // Y la etiqueta no pierde su papel al ganar el icono al lado.
    expect(screen.getByTestId('presentation-select')).toHaveAccessibleName('Presentación');
  });

  it('el disparador cumple el objetivo tactil minimo', () => {
    // `docs/architecture.md > Componentes > Regla: multiplataforma`: 44x44 px como minimo, y el
    // `design.md` de QC-90 no declara excepcion. Entro a 24 px (`size-6`) y el reviewer lo paro
    // (M1). Se afirma sobre las clases -jsdom no calcula layout- igual que hacen los otros dos
    // disparadores compartidos, `data-table-header-menu` y `data-table-filter-date`.
    render(<PresentationSelect helper={HELPER_TEXT} />);

    const ayuda = screen.getByTestId('presentation-helper');
    expect(ayuda).toHaveClass('min-h-11');
    expect(ayuda).toHaveClass('min-w-11');
    // Lo que crece es el blanco de toque del boton, no el icono dibujado.
    expect(ayuda).not.toHaveClass('size-6');
  });

  it('al activar el disparador sale el contenido de la ayuda', async () => {
    const user = setupUser();

    render(<PresentationSelect helper={HELPER_TEXT} />);

    await user.hover(screen.getByTestId('presentation-helper'));

    const texto = await screen.findByTestId('presentation-helper-text', {}, { timeout: 3_000 });
    expect(texto).toHaveTextContent(HELPER_TEXT);
  });
});

/**
 * Boton de borrar del combobox (pedido humano, sin ficha SDD): la X permite vaciar de un golpe
 * lo escrito y lo elegido, sin tener que borrar el texto letra a letra.
 */
describe('PresentationSelect · boton de borrar', () => {
  it('no aparece con el campo vacio', () => {
    render(<PresentationSelect />);

    expect(screen.queryByTestId('presentation-select-clear')).toBeNull();
  });

  it('aparece con una presentacion ya elegida', () => {
    render(
      <PresentationSelect defaultValue="presentacion-1" defaultLabel="Galon 20L" />,
    );

    const borrar = screen.getByTestId('presentation-select-clear');
    expect(borrar).toHaveAccessibleName('Borrar presentación');
  });

  it('pulsarla vacia el texto y el campo oculto del formulario', async () => {
    const user = setupUser();

    render(
      <form data-testid="formulario">
        <PresentationSelect defaultValue="presentacion-1" defaultLabel="Galon 20L" />
      </form>,
    );

    await user.click(screen.getByTestId('presentation-select-clear'));

    expect(screen.getByTestId('presentation-select')).toHaveValue('');
    const enviado = new FormData(screen.getByTestId('formulario') as HTMLFormElement);
    expect(enviado.get(PRESENTATION_FIELD)).toBe('');
    expect(screen.queryByTestId('presentation-select-clear')).toBeNull();
  });
});
