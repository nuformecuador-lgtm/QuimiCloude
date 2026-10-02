import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { setupUser } from '../../helpers/user-event';

import { RecipeVersionList } from '@/app/(private)/produccion/formulas/components/recipe-version-list';
import type {
  DeleteRecipeFormState,
  RecipeVersionListResult,
} from '@/lib/modules/recetas/adapters/driving/recipe-actions';
import type { RecipeVersionSummary } from '@/lib/modules/recetas';

const { routerMock, listRecipeVersionsActionMock, deleteRecipeActionMock } = vi.hoisted(() => ({
  routerMock: {
    push: vi.fn<(href: string) => void>(),
    replace: vi.fn<(href: string) => void>(),
    refresh: vi.fn<() => void>(),
    back: vi.fn<() => void>(),
    forward: vi.fn<() => void>(),
    prefetch: vi.fn<(href: string) => void>(),
  },
  listRecipeVersionsActionMock: vi.fn<(originalId: string) => Promise<RecipeVersionListResult>>(),
  deleteRecipeActionMock: vi.fn<(id: string) => Promise<DeleteRecipeFormState>>(),
}));

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => routerMock,
}));

vi.mock('@/lib/modules/recetas/adapters/driving/recipe-actions', () => ({
  listRecipeVersionsAction: listRecipeVersionsActionMock,
  deleteRecipeAction: deleteRecipeActionMock,
}));

const ORIGINAL_ID = 'rec-original-1';
const AREA_TACTIL = ['min-h-11', 'min-w-11'];

function version(id: string, name: string, isUnderReview = false): RecipeVersionSummary {
  return {
    id,
    name,
    displayName: `Desengrasante base · ${name}`,
    isUnderReview,
    updatedAt: new Date('2026-09-01T10:00:00Z'),
  };
}

// Orden deliberadamente no alfabético: el componente no debe reordenar.
const VERSIONES: readonly RecipeVersionSummary[] = [
  version('v-zeta', 'Zeta concentrada'),
  version('v-alfa', 'Alfa diluida', true),
  version('v-medio', 'Media carga'),
];

function filas() {
  return screen.getAllByTestId('recipe-version-row');
}

beforeEach(() => {
  vi.clearAllMocks();
  deleteRecipeActionMock.mockResolvedValue({ status: 'success' });
  listRecipeVersionsActionMock.mockResolvedValue({ status: 'success', data: [] });
  vi.spyOn(toast, 'success');
});

afterEach(() => {
  cleanup();
  toast.dismiss();
  vi.restoreAllMocks();
});

describe('RecipeVersionList', () => {
  it('R1: pinta una fila por versión en el orden recibido con enlace a su página', () => {
    render(<RecipeVersionList originalId={ORIGINAL_ID} versions={VERSIONES} />);

    const seccion = screen.getByRole('region', { name: 'Versiones' });
    expect(within(seccion).getByRole('heading', { name: 'Versiones' })).toBeInTheDocument();

    const enlaces = filas().map((fila) => within(fila).getByTestId('recipe-version-link'));
    expect(enlaces.map((e) => e.textContent)).toEqual([
      'Zeta concentrada',
      'Alfa diluida',
      'Media carga',
    ]);
    expect(enlaces.map((e) => e.getAttribute('href'))).toEqual([
      `/produccion/formulas/${ORIGINAL_ID}/versiones/v-zeta`,
      `/produccion/formulas/${ORIGINAL_ID}/versiones/v-alfa`,
      `/produccion/formulas/${ORIGINAL_ID}/versiones/v-medio`,
    ]);
    expect(screen.queryByTestId('recipe-versions-empty')).toBeNull();
  });

  it('R2: «Por revisar» aparece solo en las versiones que lo están', () => {
    render(<RecipeVersionList originalId={ORIGINAL_ID} versions={VERSIONES} />);

    const [zeta, alfa, medio] = filas();
    expect(within(zeta).queryByTestId('recipe-version-under-review')).toBeNull();
    expect(within(alfa).getByTestId('recipe-version-under-review')).toHaveTextContent(
      'Por revisar',
    );
    expect(within(medio).queryByTestId('recipe-version-under-review')).toBeNull();
    expect(screen.getAllByTestId('recipe-version-under-review')).toHaveLength(1);
  });

  it('R3: sin versiones muestra el texto de vacío y ninguna lista', () => {
    render(<RecipeVersionList originalId={ORIGINAL_ID} versions={[]} />);

    expect(screen.getByTestId('recipe-versions-empty')).toHaveTextContent(
      'Esta receta todavía no tiene versiones.',
    );
    expect(screen.queryByRole('list')).toBeNull();
    expect(screen.queryAllByTestId('recipe-version-row')).toHaveLength(0);
    expect(screen.getByRole('region', { name: 'Versiones' })).toBeInTheDocument();
  });

  it.each([
    ['con versiones', VERSIONES],
    ['sin versiones', []],
  ] as const)('R4: «Nueva versión» enlaza a la página de alta (%s)', (_, versions) => {
    render(<RecipeVersionList originalId={ORIGINAL_ID} versions={versions} />);

    const nueva = screen.getByRole('link', { name: 'Nueva versión' });
    expect(nueva).toHaveAttribute('href', `/produccion/formulas/${ORIGINAL_ID}/versiones/nueva`);
  });

  it('R32: borrar una versión pasa por el diálogo en modo versión y confirma con su id', async () => {
    const user = setupUser();
    render(<RecipeVersionList originalId={ORIGINAL_ID} versions={VERSIONES} />);

    const alfa = filas()[1];
    await user.click(within(alfa).getByRole('button', { name: 'Borrar Alfa diluida' }));

    const dialogo = await screen.findByTestId('delete-recipe-dialog');
    expect(within(dialogo).getByRole('heading', { name: 'Borrar versión' })).toBeInTheDocument();
    expect(within(dialogo).getByTestId('delete-recipe-message')).toHaveTextContent(
      'Se va a borrar la versión «Alfa diluida». Esta acción no se puede deshacer.',
    );
    expect(deleteRecipeActionMock).not.toHaveBeenCalled();

    await user.click(within(dialogo).getByTestId('delete-recipe-confirm'));

    await waitFor(() => expect(screen.queryByTestId('delete-recipe-dialog')).toBeNull());
    expect(deleteRecipeActionMock).toHaveBeenCalledTimes(1);
    expect(deleteRecipeActionMock).toHaveBeenCalledWith('v-alfa');
    expect(routerMock.refresh).toHaveBeenCalledTimes(1);
    expect(listRecipeVersionsActionMock).not.toHaveBeenCalled();
  });

  it('R37: enlaces y botones nuevos tienen objetivo táctil de al menos 44x44', () => {
    render(<RecipeVersionList originalId={ORIGINAL_ID} versions={VERSIONES} />);

    const controles = [
      screen.getByRole('link', { name: 'Nueva versión' }),
      ...screen.getAllByTestId('recipe-version-link'),
      ...screen.getAllByTestId('recipe-delete-open'),
    ];
    expect(controles).toHaveLength(1 + VERSIONES.length * 2);
    for (const control of controles) {
      expect(control).toHaveClass(...AREA_TACTIL);
    }
  });
});
