import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { useActionState, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ConfirmDialog,
  ConfirmDialogBody,
  ConfirmDialogFrame,
} from '@/components/shared/confirm-dialog';
import {
  DELETE_CONFIRM_LABEL,
  DELETE_CONFIRM_PENDING_LABEL,
  DeleteConfirmDialog,
} from '@/components/shared/delete-confirm-dialog';
import { Button } from '@/components/ui/button';
import { errorMessage, type ErrorState } from '@/lib/modules/errores';

import { setupUser } from '../../helpers/user-event';

const TEST_IDS = {
  dialog: 'prueba-dialog',
  message: 'prueba-message',
  dismiss: 'prueba-dismiss',
  confirm: 'prueba-confirm',
  form: 'prueba-form',
  id: 'prueba-id',
  error: 'prueba-error',
  errorMessage: 'prueba-error-message',
} as const;

const TEXTS = {
  title: 'Eliminar la cosa',
  description: 'Se va a eliminar la cosa. Esta acción no se puede deshacer.',
  dismiss: 'Volver',
} as const;

const ERROR: ErrorState = {
  status: 'error',
  code: 'invalid_input',
  message: errorMessage('invalid_input'),
};

type State = { readonly status: 'idle' } | { readonly status: 'success' } | ErrorState;
const IDLE: State = { status: 'idle' };

// Las promesas que se dejan en vuelo se sueltan al final de cada caso.
const pendientes: Array<() => void> = [];

afterEach(async () => {
  await act(async () => {
    for (const soltar of pendientes.splice(0)) soltar();
  });
  cleanup();
});

/** Diálogo con form y `useActionState`, como los de borrado de hoy. */
function ConFormulario({
  operacion,
  onExito,
}: {
  readonly operacion: (formData: FormData) => Promise<State>;
  readonly onExito?: () => void;
}) {
  const [open, setOpen] = useState(true);
  const [state, formAction, isPending] = useActionState(
    async (_previous: State, formData: FormData) => {
      const result = await operacion(formData);
      if (result.status === 'success') {
        setOpen(false);
        onExito?.();
      }
      return result;
    },
    IDLE,
  );
  return (
    <DeleteConfirmDialog
      open={open}
      onOpenChange={setOpen}
      texts={TEXTS}
      testIds={TEST_IDS}
      submit={{
        kind: 'action',
        action: formAction,
        hidden: [{ name: 'id', value: 'cosa-1', testId: TEST_IDS.id }],
      }}
      isPending={isPending}
      error={state.status === 'error' ? state : undefined}
    />
  );
}

describe('ConfirmDialog — con form y con transición', () => {
  it('R12 — con form: envía el id oculto por la Server Action, con la variante destructiva', async () => {
    const operacion = vi.fn<(formData: FormData) => Promise<State>>(async () => ({
      status: 'success',
    }));
    const user = setupUser();
    render(<ConFormulario operacion={operacion} />);

    const confirmar = screen.getByTestId(TEST_IDS.confirm);
    expect(confirmar).toHaveAttribute('type', 'submit');
    expect(confirmar).toHaveTextContent(DELETE_CONFIRM_LABEL);
    expect(screen.getByTestId(TEST_IDS.form)).toContainElement(confirmar);
    expect(screen.getByTestId(TEST_IDS.id)).toHaveAttribute('type', 'hidden');
    expect(screen.getByTestId(TEST_IDS.message)).toHaveTextContent(TEXTS.description);
    expect(screen.getByRole('alertdialog')).toHaveAccessibleName(TEXTS.title);
    expect(confirmar.className).toContain('text-destructive');

    await user.click(confirmar);

    await waitFor(() => expect(operacion).toHaveBeenCalledTimes(1));
    expect(operacion.mock.calls[0]?.[0].get('id')).toBe('cosa-1');
    await waitFor(() => expect(screen.queryByTestId(TEST_IDS.dialog)).not.toBeInTheDocument());
  });

  it('R12 R15 — con transición: sin form, confirmar llama a onConfirm y no envía nada', async () => {
    const onConfirm = vi.fn();
    const onOpenChange = vi.fn();
    const user = setupUser();
    render(
      <ConfirmDialog
        open
        onOpenChange={onOpenChange}
        texts={{ ...TEXTS, confirm: 'Borrar' }}
        testIds={TEST_IDS}
        variant="destructive"
        submit={{ kind: 'transition', onConfirm }}
        isPending={false}
        announceBusy={false}
      />,
    );

    expect(screen.queryByTestId(TEST_IDS.form)).not.toBeInTheDocument();
    const confirmar = screen.getByTestId(TEST_IDS.confirm);
    expect(confirmar).not.toHaveAttribute('aria-busy');

    await user.click(confirmar);

    expect(onConfirm).toHaveBeenCalledTimes(1);
    // La transición decide cuándo cerrar: la base no cierra por su cuenta.
    expect(onOpenChange).not.toHaveBeenCalledWith(false, expect.anything());
  });

  it('R12 — DeleteConfirmDialog: quien cambia el texto de confirmar no hereda «Eliminando…»', () => {
    render(
      <DeleteConfirmDialog
        open
        texts={{ ...TEXTS, confirm: 'Borrar' }}
        testIds={TEST_IDS}
        submit={{ kind: 'transition', onConfirm: () => {} }}
        isPending
        announceBusy={false}
      />,
    );

    const confirmar = screen.getByTestId(TEST_IDS.confirm);
    expect(confirmar).toBeDisabled();
    expect(confirmar).toHaveTextContent('Borrar');
  });
});

describe('ConfirmDialog — sin form', () => {
  it('R14 — al confirmar cierra con onOpenChange(false) antes de llamar a onConfirm', async () => {
    const orden: string[] = [];
    const user = setupUser();
    render(
      <ConfirmDialog
        open
        onOpenChange={(open) => orden.push(`onOpenChange(${String(open)})`)}
        onConfirm={() => orden.push('onConfirm')}
        texts={{ ...TEXTS, confirm: 'Comenzar' }}
        testIds={{ dialog: 'sin-form', dismiss: 'sin-form-cancel', confirm: 'sin-form-confirm' }}
      />,
    );

    const confirmar = screen.getByTestId('sin-form-confirm');
    expect(confirmar).toHaveAttribute('type', 'button');
    expect(confirmar).not.toHaveAttribute('aria-busy');

    await user.click(confirmar);

    expect(orden).toEqual(['onOpenChange(false)', 'onConfirm']);
  });
});

describe('ConfirmDialog — error', () => {
  it('R14 — si la operación responde con error, el diálogo sigue abierto con el error por su code', async () => {
    const onExito = vi.fn();
    const user = setupUser();
    render(<ConFormulario operacion={async () => ERROR} onExito={onExito} />);

    await user.click(screen.getByTestId(TEST_IDS.confirm));

    const region = await screen.findByTestId(TEST_IDS.error);
    expect(region).toHaveAttribute('role', 'alert');
    expect(region).toHaveAttribute('data-code', 'invalid_input');
    expect(screen.getByTestId(TEST_IDS.errorMessage)).toHaveTextContent(ERROR.message);
    expect(screen.getByTestId(TEST_IDS.dialog)).toBeInTheDocument();
    expect(onExito).not.toHaveBeenCalled();
    // Por defecto el error va fuera del form, entre la cabecera y el form.
    expect(screen.getByTestId(TEST_IDS.form)).not.toContainElement(region);
  });

  it('R14 R15 — las otras colocaciones: error dentro del form, o el form envolviendo la cabecera', () => {
    const { unmount } = render(
      <ConfirmDialog
        open
        texts={{ ...TEXTS, confirm: 'Cancelar el pedido' }}
        testIds={TEST_IDS}
        submit={{ kind: 'action', action: () => {}, formClassName: 'flex flex-col gap-3' }}
        layout="error-in-form"
        error={ERROR}
      >
        <textarea data-testid="prueba-motivo" />
      </ConfirmDialog>,
    );

    const form = screen.getByTestId(TEST_IDS.form);
    expect(form).toHaveClass('flex', 'flex-col', 'gap-3');
    expect(form).toContainElement(screen.getByTestId(TEST_IDS.error));
    expect(form).toContainElement(screen.getByTestId('prueba-motivo'));
    expect(form).not.toContainElement(screen.getByTestId(TEST_IDS.message));
    unmount();

    render(
      <ConfirmDialog
        open
        texts={{ ...TEXTS, confirm: 'Cancelar' }}
        testIds={TEST_IDS}
        submit={{ kind: 'action', action: () => {} }}
        layout="form-wraps-all"
        errorStyle="inline"
        error={ERROR}
      />,
    );

    expect(screen.getByTestId(TEST_IDS.form)).toContainElement(
      screen.getByTestId(TEST_IDS.message),
    );
    const inline = screen.getByTestId(TEST_IDS.error);
    expect(inline.tagName).toBe('P');
    expect(inline).not.toHaveAttribute('data-code');
  });
});

describe('ConfirmDialog — pendiente', () => {
  it('R13 — mientras envía: confirmar deshabilitado, aria-busy y «Eliminando…»', async () => {
    const user = setupUser();
    render(
      <ConFormulario
        operacion={() =>
          new Promise<State>((resolve) => {
            pendientes.push(() => resolve({ status: 'success' }));
          })
        }
      />,
    );

    const confirmar = screen.getByTestId(TEST_IDS.confirm);
    expect(confirmar).toHaveAttribute('aria-busy', 'false');

    await user.click(confirmar);

    await waitFor(() => expect(screen.getByTestId(TEST_IDS.confirm)).toBeDisabled());
    expect(screen.getByTestId(TEST_IDS.confirm)).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByTestId(TEST_IDS.confirm)).toHaveTextContent(DELETE_CONFIRM_PENDING_LABEL);
  });
});

describe('ConfirmDialog — apertura', () => {
  it('R15 — disparador propio: cerrado no pinta el diálogo y el disparador lo abre', async () => {
    const user = setupUser();
    render(
      <ConfirmDialog
        trigger={{
          render: <Button variant="ghost" touch aria-label="Borrar la cosa" data-testid="prueba-open" />,
          children: 'x',
        }}
        texts={{ ...TEXTS, confirm: 'Borrar' }}
        testIds={TEST_IDS}
        submit={{ kind: 'action', action: () => {} }}
      />,
    );

    expect(screen.queryByTestId(TEST_IDS.dialog)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Borrar la cosa' }));

    expect(await screen.findByTestId(TEST_IDS.dialog)).toBeInTheDocument();

    await user.click(screen.getByTestId(TEST_IDS.dismiss));

    await waitFor(() => expect(screen.queryByTestId(TEST_IDS.dialog)).not.toBeInTheDocument());
  });

  it('R15 — controlada: sin disparador, el diálogo sigue a open', () => {
    const props = {
      texts: TEXTS,
      testIds: TEST_IDS,
      submit: { kind: 'action', action: () => {} },
    } as const;
    const { rerender } = render(<DeleteConfirmDialog open={false} {...props} />);

    expect(screen.queryByTestId(TEST_IDS.dialog)).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();

    rerender(<DeleteConfirmDialog open {...props} />);

    expect(screen.getByTestId(TEST_IDS.dialog)).toBeInTheDocument();
  });

  it('R15 — marco y cuerpo por separado: el cuerpo se monta con cada apertura', async () => {
    const user = setupUser();
    function Cuerpo() {
      const [veces] = useState(() => (montajes += 1));
      return (
        <ConfirmDialogBody
          texts={{ ...TEXTS, description: `Montaje ${veces}`, confirm: 'Cancelar' }}
          testIds={TEST_IDS}
          submit={{ kind: 'action', action: () => {} }}
          layout="form-wraps-all"
          confirmAs="button"
        />
      );
    }
    let montajes = 0;
    render(
      <ConfirmDialogFrame
        testId={TEST_IDS.dialog}
        trigger={{ render: <Button data-testid="prueba-open" />, children: 'Abrir' }}
      >
        <Cuerpo />
      </ConfirmDialogFrame>,
    );

    await user.click(screen.getByTestId('prueba-open'));
    expect(await screen.findByTestId(TEST_IDS.message)).toHaveTextContent('Montaje 1');
    await user.click(screen.getByTestId(TEST_IDS.dismiss));
    await waitFor(() => expect(screen.queryByTestId(TEST_IDS.dialog)).not.toBeInTheDocument());

    await user.click(screen.getByTestId('prueba-open'));
    expect(await screen.findByTestId(TEST_IDS.message)).toHaveTextContent('Montaje 2');
  });
});
