// El selector de version del formulario de pedido, aislado del formulario.
//
// Lo que viaja es el `input` oculto `recipeVersionId`: se afirma sobre el `FormData` de un
// `<form>` real, que es lo que leera la action. Sin asserts sobre copy, salvo la nota de la
// version del pedido editado, que es justo lo que se quiere ver.

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ORIGINAL_VERSION_VALUE,
  RECIPE_VERSION_FIELD,
  RECIPE_VERSION_SELECT_TESTID,
  RecipeVersionSelect,
  type RecipeVersionChoice,
} from '@/app/(private)/pedidos/components';
import type { RecipeVersionListResult } from '@/lib/modules/recetas/adapters/driving/recipe-actions';
import type { RecipeVersionSummary } from '@/lib/modules/recetas';
import { esperarInteractiva, setupUser } from '../../helpers/user-event';

const { listRecipeVersionsActionMock } = vi.hoisted(() => ({
  listRecipeVersionsActionMock: vi.fn<(id: string) => Promise<RecipeVersionListResult>>(),
}));

vi.mock('@/lib/modules/recetas/adapters/driving/recipe-actions', () => ({
  listRecipeVersionsAction: listRecipeVersionsActionMock,
}));

const RECETA = crypto.randomUUID();
const OTRA_RECETA = crypto.randomUUID();

function version(name: string, isUnderReview = false): RecipeVersionSummary {
  return {
    id: crypto.randomUUID(),
    name,
    displayName: `Original · ${name}`,
    isUnderReview,
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };
}

const VIVA = version('Sin colorante');
const OTRA_VIVA = version('Concentrada');
const POR_REVISAR = version('A medias', true);

function exito(data: readonly RecipeVersionSummary[]): RecipeVersionListResult {
  return { status: 'success', data };
}

const onChange = vi.fn<(versionId: string | null) => void>();

type Props = {
  recipeId: string | null;
  initialVersion?: RecipeVersionChoice | null;
};

function Selector({ recipeId, initialVersion = null }: Props) {
  return (
    <form data-testid="form">
      <RecipeVersionSelect
        recipeId={recipeId}
        initialVersion={initialVersion}
        onChange={onChange}
      />
    </form>
  );
}

function trigger(): HTMLElement {
  return screen.getByTestId(RECIPE_VERSION_SELECT_TESTID);
}

function enviado(): FormData {
  return new FormData(screen.getByTestId('form') as HTMLFormElement);
}

async function opciones(user: ReturnType<typeof setupUser>): Promise<HTMLElement[]> {
  await user.click(trigger());
  return screen.findAllByTestId(`${RECIPE_VERSION_SELECT_TESTID}-option`);
}

beforeEach(() => {
  vi.clearAllMocks();
  listRecipeVersionsActionMock.mockResolvedValue(exito([]));
});

afterEach(() => {
  cleanup();
});

describe('selector de version: deshabilitado en «Original» sin nada que ofrecer', () => {
  it('R27: sin receta esta deshabilitado en «Original» y no pide nada', () => {
    render(<Selector recipeId={null} />);

    expect(trigger()).toBeDisabled();
    expect(enviado().get(RECIPE_VERSION_FIELD)).toBe(ORIGINAL_VERSION_VALUE);
    expect(listRecipeVersionsActionMock).not.toHaveBeenCalled();
  });

  it('R27: una receta sin versiones ofrecibles (solo por revisar) lo deja deshabilitado en «Original»', async () => {
    listRecipeVersionsActionMock.mockResolvedValue(exito([POR_REVISAR]));
    render(<Selector recipeId={RECETA} />);

    await waitFor(() => expect(listRecipeVersionsActionMock).toHaveBeenCalledWith(RECETA));
    await waitFor(() => expect(trigger()).toBeDisabled());
    expect(enviado().get(RECIPE_VERSION_FIELD)).toBe(ORIGINAL_VERSION_VALUE);
  });

  it('R27: el input oculto viaja en el FormData aunque el control este deshabilitado', () => {
    render(<Selector recipeId={null} />);

    expect(trigger()).toBeDisabled();
    expect([...enviado().keys()]).toEqual([RECIPE_VERSION_FIELD]);
  });
});

describe('selector de version: lo que ofrece', () => {
  it('R26: «Original» primero, despues las versiones vivas y ninguna por revisar', async () => {
    const user = setupUser();
    listRecipeVersionsActionMock.mockResolvedValue(exito([VIVA, POR_REVISAR, OTRA_VIVA]));
    render(<Selector recipeId={RECETA} />);

    await waitFor(() => expect(trigger()).toBeEnabled());
    const lista = await opciones(user);

    expect(lista.map((o) => o.getAttribute('data-value'))).toEqual([
      ORIGINAL_VERSION_VALUE,
      VIVA.id,
      OTRA_VIVA.id,
    ]);
    expect(enviado().get(RECIPE_VERSION_FIELD)).toBe(ORIGINAL_VERSION_VALUE);
  });

  it('R28: elegir una version la deja en el FormData y avisa con su id; volver a «Original» avisa con null', async () => {
    const user = setupUser();
    listRecipeVersionsActionMock.mockResolvedValue(exito([VIVA]));
    render(<Selector recipeId={RECETA} />);
    await waitFor(() => expect(trigger()).toBeEnabled());

    let lista = await opciones(user);
    await user.click(await esperarInteractiva(lista[1]!));

    await waitFor(() => expect(enviado().get(RECIPE_VERSION_FIELD)).toBe(VIVA.id));
    expect(onChange).toHaveBeenLastCalledWith(VIVA.id);

    lista = await opciones(user);
    await user.click(await esperarInteractiva(lista[0]!));

    await waitFor(() => expect(enviado().get(RECIPE_VERSION_FIELD)).toBe(ORIGINAL_VERSION_VALUE));
    expect(onChange).toHaveBeenLastCalledWith(null);
  });
});

describe('selector de version: cambiar de receta', () => {
  it('R28: cambiar de receta pide sus versiones y vuelve a «Original»', async () => {
    const user = setupUser();
    listRecipeVersionsActionMock.mockResolvedValue(exito([VIVA]));
    const { rerender } = render(<Selector recipeId={RECETA} />);
    await waitFor(() => expect(trigger()).toBeEnabled());
    const lista = await opciones(user);
    await user.click(await esperarInteractiva(lista[1]!));
    await waitFor(() => expect(enviado().get(RECIPE_VERSION_FIELD)).toBe(VIVA.id));

    listRecipeVersionsActionMock.mockResolvedValue(exito([OTRA_VIVA]));
    rerender(<Selector recipeId={OTRA_RECETA} />);

    expect(enviado().get(RECIPE_VERSION_FIELD)).toBe(ORIGINAL_VERSION_VALUE);
    await waitFor(() => expect(listRecipeVersionsActionMock).toHaveBeenLastCalledWith(OTRA_RECETA));
    const nuevas = await opciones(user);
    expect(nuevas.map((o) => o.getAttribute('data-value'))).toEqual([
      ORIGINAL_VERSION_VALUE,
      OTRA_VIVA.id,
    ]);
  });

  it('R28: la respuesta de una receta ya superada se descarta aunque llegue la ultima', async () => {
    const user = setupUser();
    const pendientes = new Map<string, (r: RecipeVersionListResult) => void>();
    listRecipeVersionsActionMock.mockImplementation(
      (id) => new Promise((resolve) => pendientes.set(id, resolve)),
    );
    const { rerender } = render(<Selector recipeId={RECETA} />);
    rerender(<Selector recipeId={OTRA_RECETA} />);
    await waitFor(() => expect(pendientes.size).toBe(2));

    pendientes.get(OTRA_RECETA)?.(exito([OTRA_VIVA]));
    await waitFor(() => expect(trigger()).toBeEnabled());
    pendientes.get(RECETA)?.(exito([VIVA]));

    const lista = await opciones(user);
    expect(lista.map((o) => o.getAttribute('data-value'))).toEqual([
      ORIGINAL_VERSION_VALUE,
      OTRA_VIVA.id,
    ]);
  });
});

describe('selector de version: edicion de un pedido con version', () => {
  it('R29: una version por revisar sale elegida, con su nota, habilitada y en el FormData', async () => {
    listRecipeVersionsActionMock.mockResolvedValue(exito([POR_REVISAR]));
    render(
      <Selector recipeId={RECETA} initialVersion={{ id: POR_REVISAR.id, name: POR_REVISAR.name }} />,
    );

    await waitFor(() => expect(trigger()).toHaveTextContent('por revisar'));
    expect(trigger()).toHaveTextContent(POR_REVISAR.name);
    expect(trigger()).toBeEnabled();
    expect(enviado().get(RECIPE_VERSION_FIELD)).toBe(POR_REVISAR.id);
  });

  it('R29: una version dada de baja (no vuelve en el listado) sale elegida con su nota', async () => {
    const baja = version('Retirada');
    listRecipeVersionsActionMock.mockResolvedValue(exito([VIVA]));
    render(<Selector recipeId={RECETA} initialVersion={{ id: baja.id, name: baja.name }} />);

    await waitFor(() => expect(trigger()).toHaveTextContent('dada de baja'));
    expect(trigger()).toHaveTextContent(baja.name);
    expect(trigger()).toBeEnabled();
    expect(enviado().get(RECIPE_VERSION_FIELD)).toBe(baja.id);
  });

  it('R29: tras pasar a «Original», la version del pedido sigue ofrecida para volver a ella', async () => {
    const user = setupUser();
    listRecipeVersionsActionMock.mockResolvedValue(exito([POR_REVISAR]));
    render(
      <Selector recipeId={RECETA} initialVersion={{ id: POR_REVISAR.id, name: POR_REVISAR.name }} />,
    );
    await waitFor(() => expect(trigger()).toHaveTextContent('por revisar'));

    let lista = await opciones(user);
    await user.click(await esperarInteractiva(lista[0]!));
    await waitFor(() => expect(enviado().get(RECIPE_VERSION_FIELD)).toBe(ORIGINAL_VERSION_VALUE));

    lista = await opciones(user);
    expect(lista.map((o) => o.getAttribute('data-value'))).toEqual([
      ORIGINAL_VERSION_VALUE,
      POR_REVISAR.id,
    ]);
  });
});

describe('selector de version: multiplataforma', () => {
  it('el control mide al menos 44 px de objetivo tactil y usa texto de 16 px', () => {
    render(<Selector recipeId={null} />);

    expect(trigger().className).toContain('min-h-11');
    expect(trigger().className).toContain('min-w-11');
    expect(trigger().className).toContain('text-base');
  });
});
