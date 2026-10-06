import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DIALOG_CANCEL_TESTID,
  DIALOG_FORM_ERROR_TESTID,
  DIALOG_SUBMIT_TESTID,
  ImportMissingCatalog,
  MISSING_CREATE_TESTID,
  MISSING_NAME_TESTID,
  MISSING_PRESENTATION_TESTID,
  MISSING_ROWS_TESTID,
  MISSING_SECTION_TESTID,
  MISSING_UNIT_TESTID,
  PRESENTATION_DIALOG_TESTID,
  UNIT_DIALOG_TESTID,
  dialogFieldErrorTestId,
  dialogFieldTestId,
  missingRowsLabel,
  type ImportMissingCatalogProps,
} from '@/app/(private)/inventario/importar/components';
import {
  PRESENTATION_UNIT_OPTION_TESTID,
  PRESENTATION_UNIT_SELECT_TESTID,
} from '@/components/shared/presentation-unit-select';
import { UNEXPECTED_ERROR_NOTICE_REFERENCE_TESTID } from '@/components/shared/unexpected-error-notice';
import type { ErrorState } from '@/lib/modules/errores';
import type { CreatePresentationFormState } from '@/lib/modules/inventario/adapters/driving/presentation-actions';
import type { UnitView } from '@/lib/modules/unidades';
import type { CreateUnitFormState } from '@/lib/modules/unidades/adapters/driving/unit-actions';

import { esperarInteractiva, setupUser } from '../../../helpers/user-event';

const { createUnitActionMock, createPresentationActionMock } = vi.hoisted(() => ({
  createUnitActionMock: vi.fn<(prev: CreateUnitFormState, formData: FormData) => Promise<CreateUnitFormState>>(),
  createPresentationActionMock:
    vi.fn<(prev: CreatePresentationFormState, formData: FormData) => Promise<CreatePresentationFormState>>(),
}));

vi.mock('@/lib/modules/unidades/adapters/driving/unit-actions', () => ({
  createUnitAction: createUnitActionMock,
}));

vi.mock('@/lib/modules/inventario/adapters/driving/presentation-actions', () => ({
  createPresentationAction: createPresentationActionMock,
}));

const LITRO: UnitView = { id: 'unit-litro', name: 'Litro', symbol: 'L', baseUnitId: null, factor: null, isSystem: true };
const MILILITRO: UnitView = {
  id: 'unit-ml',
  name: 'Mililitro',
  symbol: 'mL',
  baseUnitId: 'unit-litro',
  factor: '0.001',
  isSystem: true,
};

function renderCatalogo(cambios: Partial<ImportMissingCatalogProps> = {}) {
  const onCreated = vi.fn<() => void>();
  render(
    <ImportMissingCatalog
      missingUnits={[{ name: 'Galón', rowNumbers: [7, 9] }]}
      missingPresentations={[{ name: 'Bidón 20 L', rowNumbers: [8] }]}
      canCreateUnits
      canCreatePresentations
      units={[LITRO, MILILITRO]}
      onCreated={onCreated}
      {...cambios}
    />,
  );
  return { onCreated };
}

function entregado(mock: { mock: { calls: unknown[][] } }): Record<string, string> {
  const formData = mock.mock.calls[0]?.[1];
  if (!(formData instanceof FormData)) throw new Error('la acción no recibió FormData');
  return Object.fromEntries([...formData.entries()].map(([clave, valor]) => [clave, String(valor)]));
}

function errorDe(code: Exclude<ErrorState['code'], 'unexpected'>): ErrorState {
  return { status: 'error', code, message: `mensaje de ${code}` };
}

beforeEach(() => {
  vi.clearAllMocks();
  createUnitActionMock.mockResolvedValue({ status: 'success', id: 'nueva' });
  createPresentationActionMock.mockResolvedValue({ status: 'success', id: 'nueva' });
});

afterEach(() => {
  cleanup();
});

async function abrirUnidad() {
  const user = setupUser();
  await user.click(within(screen.getByTestId(MISSING_UNIT_TESTID)).getByTestId(MISSING_CREATE_TESTID));
  return { user, dialogo: await screen.findByTestId(UNIT_DIALOG_TESTID) };
}

async function abrirPresentacion() {
  const user = setupUser();
  await user.click(within(screen.getByTestId(MISSING_PRESENTATION_TESTID)).getByTestId(MISSING_CREATE_TESTID));
  return { user, dialogo: await screen.findByTestId(PRESENTATION_DIALOG_TESTID) };
}

describe('lista de faltantes', () => {
  it('R20 lista cada faltante una vez, aparte, con las filas que lo nombran', () => {
    renderCatalogo();

    const unidades = screen.getAllByTestId(MISSING_UNIT_TESTID);
    expect(unidades).toHaveLength(1);
    expect(within(unidades[0]!).getByTestId(MISSING_NAME_TESTID)).toHaveTextContent('Galón');
    expect(within(unidades[0]!).getByTestId(MISSING_ROWS_TESTID)).toHaveTextContent(missingRowsLabel([7, 9]));

    const presentaciones = screen.getAllByTestId(MISSING_PRESENTATION_TESTID);
    expect(presentaciones).toHaveLength(1);
    expect(within(presentaciones[0]!).getByTestId(MISSING_NAME_TESTID)).toHaveTextContent('Bidón 20 L');
  });

  it('R20 sin faltantes no pinta la sección', () => {
    renderCatalogo({ missingUnits: [], missingPresentations: [] });

    expect(screen.queryByTestId(MISSING_SECTION_TESTID)).toBeNull();
  });

  it('R21 sin permiso de alta de unidades no ofrece el botón de crear unidad', () => {
    renderCatalogo({ canCreateUnits: false });

    expect(within(screen.getByTestId(MISSING_UNIT_TESTID)).queryByTestId(MISSING_CREATE_TESTID)).toBeNull();
    expect(within(screen.getByTestId(MISSING_PRESENTATION_TESTID)).getByTestId(MISSING_CREATE_TESTID)).toBeInTheDocument();
  });

  it('R21 sin permiso de alta de presentaciones no ofrece el botón de crear presentación', () => {
    renderCatalogo({ canCreatePresentations: false });

    expect(within(screen.getByTestId(MISSING_PRESENTATION_TESTID)).queryByTestId(MISSING_CREATE_TESTID)).toBeNull();
    expect(within(screen.getByTestId(MISSING_UNIT_TESTID)).getByTestId(MISSING_CREATE_TESTID)).toBeInTheDocument();
  });

  it('R22 pintar la lista no crea nada', () => {
    renderCatalogo();

    expect(createUnitActionMock).not.toHaveBeenCalled();
    expect(createPresentationActionMock).not.toHaveBeenCalled();
  });
});

describe('alta de unidad desde la vista previa', () => {
  it('R21 abre con el nombre prellenado y llama a createUnitAction con los campos del alta normal', async () => {
    const { onCreated } = renderCatalogo();
    const { user } = await abrirUnidad();

    expect(screen.getByTestId(dialogFieldTestId('name'))).toHaveValue('Galón');
    await user.type(screen.getByTestId(dialogFieldTestId('symbol')), 'gal');
    await user.click(screen.getByTestId(DIALOG_SUBMIT_TESTID));

    await waitFor(() => expect(createUnitActionMock).toHaveBeenCalledTimes(1));
    expect(createUnitActionMock.mock.calls[0]?.[0]).toEqual({ status: 'idle' });
    expect(entregado(createUnitActionMock)).toEqual({ name: 'Galón', symbol: 'gal' });
    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByTestId(UNIT_DIALOG_TESTID)).toBeNull());
  });

  it('R21 con unidad base elegida envía la base y el factor; sin símbolo no envía la clave', async () => {
    renderCatalogo();
    const { user } = await abrirUnidad();

    await user.click(screen.getByTestId(dialogFieldTestId('baseUnitId')));
    const opciones = await screen.findAllByTestId(`${dialogFieldTestId('baseUnitId')}-option`);
    expect(opciones.map((o) => o.textContent)).toEqual(['L']);
    await user.click(await esperarInteractiva(opciones[0]!));
    await user.type(await screen.findByTestId(dialogFieldTestId('factor')), '3.785');
    await user.click(screen.getByTestId(DIALOG_SUBMIT_TESTID));

    await waitFor(() => expect(createUnitActionMock).toHaveBeenCalledTimes(1));
    expect(entregado(createUnitActionMock)).toEqual({ name: 'Galón', baseUnitId: 'unit-litro', factor: '3.785' });
  });

  const enCampo = [
    ['unit_duplicate_name', 'name'],
    ['duplicate_symbol', 'symbol'],
    ['invalid_derivation', 'baseUnitId'],
  ] as const;

  for (const [code, campo] of enCampo) {
    it(`R21 «${code}» se pinta junto a su campo y el diálogo sigue abierto`, async () => {
      createUnitActionMock.mockResolvedValue(errorDe(code));
      const { onCreated } = renderCatalogo();
      const { user } = await abrirUnidad();

      await user.click(screen.getByTestId(DIALOG_SUBMIT_TESTID));

      expect(await screen.findByTestId(dialogFieldErrorTestId(campo))).toHaveTextContent(`mensaje de ${code}`);
      expect(screen.queryByTestId(DIALOG_FORM_ERROR_TESTID)).toBeNull();
      expect(screen.getByTestId(UNIT_DIALOG_TESTID)).toBeInTheDocument();
      expect(onCreated).not.toHaveBeenCalled();
    });
  }

  it('R21 «unauthorized» se pinta en la alerta del formulario y no crea nada', async () => {
    createUnitActionMock.mockResolvedValue(errorDe('unauthorized'));
    const { onCreated } = renderCatalogo();
    const { user } = await abrirUnidad();

    await user.click(screen.getByTestId(DIALOG_SUBMIT_TESTID));

    const alerta = await screen.findByTestId(DIALOG_FORM_ERROR_TESTID);
    expect(alerta).toHaveAttribute('data-code', 'unauthorized');
    expect(alerta).toHaveTextContent('mensaje de unauthorized');
    expect(onCreated).not.toHaveBeenCalled();
  });

  it('un error inesperado muestra su referencia', async () => {
    createUnitActionMock.mockResolvedValue({
      status: 'error',
      code: 'unexpected',
      message: 'Algo falló.',
      reference: 'REF-123',
    });
    renderCatalogo();
    const { user } = await abrirUnidad();

    await user.click(screen.getByTestId(DIALOG_SUBMIT_TESTID));

    expect(await screen.findByTestId(UNEXPECTED_ERROR_NOTICE_REFERENCE_TESTID)).toHaveTextContent('REF-123');
  });

  it('cancelar cierra el diálogo sin llamar a la acción', async () => {
    renderCatalogo();
    const { user } = await abrirUnidad();

    await user.click(screen.getByTestId(DIALOG_CANCEL_TESTID));

    await waitFor(() => expect(screen.queryByTestId(UNIT_DIALOG_TESTID)).toBeNull());
    expect(createUnitActionMock).not.toHaveBeenCalled();
  });
});

describe('alta de presentación desde la vista previa', () => {
  async function elegirUnidad(user: ReturnType<typeof setupUser>) {
    await user.click(screen.getByTestId(PRESENTATION_UNIT_SELECT_TESTID));
    const opciones = await screen.findAllByTestId(PRESENTATION_UNIT_OPTION_TESTID);
    const litro = opciones.find((o) => o.getAttribute('data-value') === LITRO.id);
    await user.click(await esperarInteractiva(litro!));
  }

  it('R21 abre con el nombre prellenado y llama a createPresentationAction con nombre, unidad y contenido', async () => {
    const { onCreated } = renderCatalogo();
    const { user } = await abrirPresentacion();

    expect(screen.getByTestId(dialogFieldTestId('name'))).toHaveValue('Bidón 20 L');
    await elegirUnidad(user);
    await user.type(screen.getByTestId(dialogFieldTestId('content')), '20,5');
    await user.click(screen.getByTestId(DIALOG_SUBMIT_TESTID));

    await waitFor(() => expect(createPresentationActionMock).toHaveBeenCalledTimes(1));
    expect(createPresentationActionMock.mock.calls[0]?.[0]).toEqual({ status: 'idle' });
    expect(entregado(createPresentationActionMock)).toEqual({
      name: 'Bidón 20 L',
      unitId: LITRO.id,
      content: '20.5',
    });
    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
  });

  it('R21 sin contenido no envía la clave', async () => {
    renderCatalogo();
    const { user } = await abrirPresentacion();

    await elegirUnidad(user);
    await user.click(screen.getByTestId(DIALOG_SUBMIT_TESTID));

    await waitFor(() => expect(createPresentationActionMock).toHaveBeenCalledTimes(1));
    expect(entregado(createPresentationActionMock)).toEqual({ name: 'Bidón 20 L', unitId: LITRO.id });
  });

  it('R21 «presentation_duplicate_name» se pinta junto al nombre', async () => {
    createPresentationActionMock.mockResolvedValue(errorDe('presentation_duplicate_name'));
    const { onCreated } = renderCatalogo();
    const { user } = await abrirPresentacion();

    await user.click(screen.getByTestId(DIALOG_SUBMIT_TESTID));

    expect(await screen.findByTestId(dialogFieldErrorTestId('name'))).toHaveTextContent(
      'mensaje de presentation_duplicate_name',
    );
    expect(onCreated).not.toHaveBeenCalled();
  });

  it('R21 «unauthorized» se pinta en la alerta del formulario', async () => {
    createPresentationActionMock.mockResolvedValue(errorDe('unauthorized'));
    renderCatalogo();
    const { user } = await abrirPresentacion();

    await user.click(screen.getByTestId(DIALOG_SUBMIT_TESTID));

    expect(await screen.findByTestId(DIALOG_FORM_ERROR_TESTID)).toHaveAttribute('data-code', 'unauthorized');
  });
});
