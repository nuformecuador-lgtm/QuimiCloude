import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { REFERENCIA_DEL_CASO, errorInesperado } from '../../helpers/identificador-de-request';
import { setupUser } from '../../helpers/user-event';

import { DeleteRecipeDialog } from '@/app/(private)/produccion/formulas/components/delete-recipe-dialog';
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

const ORIGINAL = { id: 'rec-original-1', name: 'Desengrasante base' };
const VERSION = { id: 'rec-version-7', name: 'Concentrada' };
const TEXTO_DE_HOY = `Se va a borrar «${ORIGINAL.name}». Esta acción no se puede deshacer.`;
const AREA_TACTIL = ['min-h-11', 'min-w-11'];

const id = {
  abrir: 'recipe-delete-open',
  dialogo: 'delete-recipe-dialog',
  mensaje: 'delete-recipe-message',
  aviso: 'delete-recipe-versions-notice',
  error: 'delete-recipe-error',
  cancelar: 'delete-recipe-cancel',
  confirmar: 'delete-recipe-confirm',
};

function versiones(n: number): readonly RecipeVersionSummary[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `v-${i + 1}`,
    name: `Versión ${i + 1}`,
    displayName: `${ORIGINAL.name} · Versión ${i + 1}`,
    isUnderReview: false,
    updatedAt: new Date('2026-09-01T10:00:00Z'),
  }));
}

function conVersiones(n: number): RecipeVersionListResult {
  return { status: 'success', data: versiones(n) };
}

function diferido<T>() {
  let resolver!: (valor: T) => void;
  const promesa = new Promise<T>((resolve) => {
    resolver = resolve;
  });
  return { promesa, resolver };
}

async function abrir(user: ReturnType<typeof setupUser>) {
  await user.click(screen.getByTestId(id.abrir));
  return screen.findByTestId(id.dialogo);
}

let toastExito: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  listRecipeVersionsActionMock.mockResolvedValue(conVersiones(0));
  deleteRecipeActionMock.mockResolvedValue({ status: 'success' });
  toastExito = vi.spyOn(toast, 'success');
});

afterEach(() => {
  cleanup();
  toast.dismiss();
  vi.restoreAllMocks();
});

describe('DeleteRecipeDialog — borrar una versión', () => {
  it('R32: nombra la versión, dice que no se puede deshacer, no cuenta y sin confirmar no invoca nada', async () => {
    const user = setupUser();
    render(<DeleteRecipeDialog recipe={VERSION} kind="version" />);

    const dialogo = await abrir(user);
    expect(within(dialogo).getByRole('heading', { name: 'Borrar versión' })).toBeInTheDocument();
    expect(within(dialogo).getByTestId(id.mensaje)).toHaveTextContent(
      `Se va a borrar la versión «${VERSION.name}». Esta acción no se puede deshacer.`,
    );
    expect(screen.queryByTestId(id.aviso)).toBeNull();
    expect(screen.getByTestId(id.confirmar)).toBeEnabled();
    expect(listRecipeVersionsActionMock).not.toHaveBeenCalled();

    await user.click(screen.getByTestId(id.cancelar));
    await waitFor(() => expect(screen.queryByTestId(id.dialogo)).toBeNull());
    expect(deleteRecipeActionMock).not.toHaveBeenCalled();
    expect(listRecipeVersionsActionMock).not.toHaveBeenCalled();
  });

  it('R32: confirmar borra esa versión una sola vez, cierra, avisa y refresca', async () => {
    const user = setupUser();
    render(<DeleteRecipeDialog recipe={VERSION} kind="version" />);

    await abrir(user);
    await user.click(screen.getByTestId(id.confirmar));

    await waitFor(() => expect(screen.queryByTestId(id.dialogo)).toBeNull());
    expect(deleteRecipeActionMock).toHaveBeenCalledTimes(1);
    expect(deleteRecipeActionMock).toHaveBeenCalledWith(VERSION.id);
    expect(toastExito).toHaveBeenCalledTimes(1);
    expect(routerMock.refresh).toHaveBeenCalledTimes(1);
    expect(listRecipeVersionsActionMock).not.toHaveBeenCalled();
  });

  it('R35: si falla el borrado de la versión el diálogo sigue abierto con el error a la vista', async () => {
    const user = setupUser();
    deleteRecipeActionMock.mockResolvedValue({
      status: 'error',
      code: 'unauthorized',
      message: 'No autorizado.',
    });
    render(<DeleteRecipeDialog recipe={VERSION} kind="version" />);

    await abrir(user);
    await user.click(screen.getByTestId(id.confirmar));

    const error = await screen.findByTestId(id.error);
    expect(error).toHaveAttribute('role', 'alert');
    expect(error).toHaveTextContent('No autorizado.');
    expect(screen.getByTestId(id.dialogo)).toBeInTheDocument();
    expect(toastExito).not.toHaveBeenCalled();
    expect(routerMock.refresh).not.toHaveBeenCalled();
  });
});

describe('DeleteRecipeDialog — borrar una original', () => {
  it('R33: sin versiones el texto es el de hoy, sin aviso de versiones', async () => {
    const user = setupUser();
    render(<DeleteRecipeDialog recipe={ORIGINAL} />);

    const dialogo = await abrir(user);
    await waitFor(() => expect(screen.getByTestId(id.confirmar)).toBeEnabled());
    expect(within(dialogo).getByRole('heading', { name: 'Borrar receta' })).toBeInTheDocument();
    expect(within(dialogo).getByTestId(id.mensaje).textContent).toBe(TEXTO_DE_HOY);
    expect(screen.queryByTestId(id.aviso)).toBeNull();
    expect(listRecipeVersionsActionMock).toHaveBeenCalledTimes(1);
    expect(listRecipeVersionsActionMock).toHaveBeenCalledWith(ORIGINAL.id);
  });

  it('R33: con una versión avisa en singular de que también se borrará su versión', async () => {
    const user = setupUser();
    listRecipeVersionsActionMock.mockResolvedValue(conVersiones(1));
    render(<DeleteRecipeDialog recipe={ORIGINAL} />);

    await abrir(user);
    const aviso = await screen.findByTestId(id.aviso);
    expect(aviso).toHaveTextContent('También se borrará su versión.');
    expect(screen.getByTestId(id.mensaje)).toHaveTextContent(TEXTO_DE_HOY);
    expect(screen.getByTestId(id.confirmar)).toBeEnabled();
  });

  it('R33: con tres versiones avisa de que también se borrarán sus 3 versiones', async () => {
    const user = setupUser();
    listRecipeVersionsActionMock.mockResolvedValue(conVersiones(3));
    render(<DeleteRecipeDialog recipe={ORIGINAL} />);

    await abrir(user);
    const aviso = await screen.findByTestId(id.aviso);
    expect(aviso).toHaveTextContent('También se borrarán sus 3 versiones.');
    expect(screen.getByTestId(id.confirmar)).toBeEnabled();
  });

  it('R34: mientras cuenta las versiones el botón de confirmar está deshabilitado', async () => {
    const user = setupUser();
    const cuenta = diferido<RecipeVersionListResult>();
    listRecipeVersionsActionMock.mockReturnValue(cuenta.promesa);
    render(<DeleteRecipeDialog recipe={ORIGINAL} />);

    await abrir(user);
    expect(screen.getByTestId(id.confirmar)).toBeDisabled();
    await user.click(screen.getByTestId(id.confirmar));
    expect(deleteRecipeActionMock).not.toHaveBeenCalled();

    cuenta.resolver(conVersiones(2));
    await waitFor(() => expect(screen.getByTestId(id.confirmar)).toBeEnabled());
    expect(screen.getByTestId(id.aviso)).toHaveTextContent('También se borrarán sus 2 versiones.');
  });

  it('R34: si no se puede contar muestra el error y deja confirmar deshabilitado', async () => {
    const user = setupUser();
    listRecipeVersionsActionMock.mockResolvedValue({
      status: 'error',
      code: 'unauthorized',
      message: 'No autorizado.',
    });
    render(<DeleteRecipeDialog recipe={ORIGINAL} />);

    await abrir(user);
    const error = await screen.findByTestId(id.error);
    expect(error).toHaveAttribute('role', 'alert');
    expect(error).toHaveTextContent('No autorizado.');
    expect(screen.queryByTestId(id.aviso)).toBeNull();
    expect(screen.getByTestId(id.confirmar)).toBeDisabled();
    await user.click(screen.getByTestId(id.confirmar));
    expect(deleteRecipeActionMock).not.toHaveBeenCalled();
  });

  it('R34: un error inesperado al contar enseña su identificador', async () => {
    const user = setupUser();
    listRecipeVersionsActionMock.mockResolvedValue(errorInesperado());
    render(<DeleteRecipeDialog recipe={ORIGINAL} />);

    await abrir(user);
    const error = await screen.findByTestId(id.error);
    expect(within(error).getByText(REFERENCIA_DEL_CASO)).toBeInTheDocument();
    expect(screen.getByTestId(id.confirmar)).toBeDisabled();
  });

  it('R33: la cuenta de una apertura anterior que llega tarde no pisa la de la actual', async () => {
    const user = setupUser();
    const primera = diferido<RecipeVersionListResult>();
    listRecipeVersionsActionMock
      .mockReturnValueOnce(primera.promesa)
      .mockResolvedValueOnce(conVersiones(1));
    render(<DeleteRecipeDialog recipe={ORIGINAL} />);

    await abrir(user);
    await user.click(screen.getByTestId(id.cancelar));
    await waitFor(() => expect(screen.queryByTestId(id.dialogo)).toBeNull());

    await abrir(user);
    await screen.findByTestId(id.aviso);
    primera.resolver(conVersiones(5));
    await primera.promesa;

    await waitFor(() =>
      expect(screen.getByTestId(id.aviso)).toHaveTextContent('También se borrará su versión.'),
    );
    expect(listRecipeVersionsActionMock).toHaveBeenCalledTimes(2);
  });

  it('R32: sin confirmar no se invoca el borrado; al confirmar se invoca una vez con la original', async () => {
    const user = setupUser();
    listRecipeVersionsActionMock.mockResolvedValue(conVersiones(3));
    render(<DeleteRecipeDialog recipe={ORIGINAL} />);

    await abrir(user);
    await screen.findByTestId(id.aviso);
    expect(deleteRecipeActionMock).not.toHaveBeenCalled();

    await user.click(screen.getByTestId(id.confirmar));
    await waitFor(() => expect(screen.queryByTestId(id.dialogo)).toBeNull());
    expect(deleteRecipeActionMock).toHaveBeenCalledTimes(1);
    expect(deleteRecipeActionMock).toHaveBeenCalledWith(ORIGINAL.id);
  });

  it('R35: si falla el borrado de la original el diálogo sigue abierto con el error a la vista', async () => {
    const user = setupUser();
    listRecipeVersionsActionMock.mockResolvedValue(conVersiones(1));
    deleteRecipeActionMock.mockResolvedValue({
      status: 'error',
      code: 'unauthorized',
      message: 'No autorizado.',
    });
    render(<DeleteRecipeDialog recipe={ORIGINAL} />);

    await abrir(user);
    await screen.findByTestId(id.aviso);
    await user.click(screen.getByTestId(id.confirmar));

    const error = await screen.findByTestId(id.error);
    expect(error).toHaveTextContent('No autorizado.');
    expect(screen.getByTestId(id.dialogo)).toBeInTheDocument();
    expect(routerMock.refresh).not.toHaveBeenCalled();
  });
});

describe('DeleteRecipeDialog — objetivos táctiles', () => {
  it.each(['recipe', 'version'] as const)(
    'R37: abrir, cancelar y confirmar tienen min-h-11 y min-w-11 (%s)',
    async (kind) => {
      const user = setupUser();
      render(<DeleteRecipeDialog recipe={kind === 'version' ? VERSION : ORIGINAL} kind={kind} />);

      await abrir(user);
      for (const testId of [id.abrir, id.cancelar, id.confirmar]) {
        for (const clase of AREA_TACTIL) {
          expect(screen.getByTestId(testId), testId).toHaveClass(clase);
        }
      }
    },
  );
});
