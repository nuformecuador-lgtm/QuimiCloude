// QC-45 T7 — El panel lateral de alta y edicion de presentacion: R21, R22, R23, R24, R25.
//
// **Las Server Actions estan mockeadas.** No es un atajo: son el borde del modulo `inventario`,
// que esta ficha no abre (R30), y sustituirlas es lo unico que permite ejercitar el panel sin
// base de datos. La validacion previa del cliente NO se mockea: corre con los esquemas de verdad
// del contrato publico.
//
// **El panel se monta solo**, sin la pagina: `page.tsx` y la columna de acciones son de otras
// tasks. El modo CONTROLADO (`open`/`onOpenChange`) es justo el contrato que la fila usara, asi
// que el disparador de fila se simula aqui con un boton minimo que hace lo mismo.
//
// **Ningun assert sobre literales de copy** (R35): todo va por rol ARIA, `data-testid` exportado
// como constante o constantes importadas del contrato.

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  PRESENTATION_CREATE_OPEN_TESTID,
  PRESENTATION_ERROR_NAME_TESTID,
  PRESENTATION_FIELD_NAME_TESTID,
  PRESENTATION_FORM_CANCEL_TESTID,
  PRESENTATION_FORM_ERROR_CODE_TESTID,
  PRESENTATION_FORM_ERROR_TESTID,
  PRESENTATION_FORM_SUBMIT_TESTID,
  PRESENTATION_FORM_TESTID,
  PRESENTATION_NAME_FIELD,
  PRESENTATION_SHEET_TESTID,
  PresentationSheet,
  type PresentationSheetTarget,
} from '@/app/(private)/configuracion/presentaciones/components';
import { DuplicateNameError, ValidationError } from '@/lib/modules/inventario';
import type {
  CreatePresentationFormState,
  PresentationMutationFormState,
} from '@/lib/modules/inventario/adapters/driving/presentation-actions';

const { routerMock, createPresentationActionMock, updatePresentationActionMock } = vi.hoisted(
  () => ({
    routerMock: {
      push: vi.fn<(href: string) => void>(),
      replace: vi.fn<(href: string) => void>(),
      refresh: vi.fn<() => void>(),
      back: vi.fn<() => void>(),
      forward: vi.fn<() => void>(),
      prefetch: vi.fn<(href: string) => void>(),
    },
    createPresentationActionMock:
      vi.fn<
        (prev: CreatePresentationFormState, data: FormData) => Promise<CreatePresentationFormState>
      >(),
    updatePresentationActionMock:
      vi.fn<
        (
          id: string,
          prev: PresentationMutationFormState,
          data: FormData,
        ) => Promise<PresentationMutationFormState>
      >(),
  }),
);

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => routerMock,
}));

vi.mock('@/lib/modules/inventario/adapters/driving/presentation-actions', () => ({
  createPresentationAction: createPresentationActionMock,
  updatePresentationAction: updatePresentationActionMock,
  deletePresentationAction: vi.fn(() => {
    throw new Error('deletePresentationAction no debe invocarse desde el panel lateral');
  }),
  listPresentationsAction: vi.fn(() => {
    throw new Error('listPresentationsAction no debe invocarse desde el panel lateral');
  }),
}));

/** Codigos ESTABLES del dominio, tomados de las clases de error y no escritos a mano (R24). */
const DUPLICATE_NAME_CODE = new DuplicateNameError().code;
const INVALID_INPUT_CODE = new ValidationError().code;

const NOMBRE_ESCRITO = 'Bidón 20 L';

const PRESENTACION: PresentationSheetTarget = {
  id: crypto.randomUUID(),
  name: 'Tambor 200 L',
};

/**
 * Disparador de fila simulado. La columna de acciones (T4) hara exactamente esto: montar el panel
 * CONTROLADO y abrirlo con la presentacion de la fila.
 */
const ROW_EDIT_TESTID = 'fila-editar';

function FilaConPanel({ presentation }: { readonly presentation: PresentationSheetTarget }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" data-testid={ROW_EDIT_TESTID} onClick={() => setOpen(true)}>
        {presentation.name}
      </button>
      <PresentationSheet presentation={presentation} open={open} onOpenChange={setOpen} />
    </>
  );
}

let toastExito: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  createPresentationActionMock.mockResolvedValue({ status: 'success', id: crypto.randomUUID() });
  updatePresentationActionMock.mockResolvedValue({ status: 'success' });
  toastExito = vi.spyOn(toast, 'success');
});

afterEach(() => {
  cleanup();
  toast.dismiss();
  vi.restoreAllMocks();
});

/** Abre el alta y espera al formulario. */
async function abrirAlta(user: ReturnType<typeof userEvent.setup>) {
  render(<PresentationSheet />);
  await user.click(screen.getByTestId(PRESENTATION_CREATE_OPEN_TESTID));
  return screen.findByTestId(PRESENTATION_FORM_TESTID);
}

describe('panel lateral de presentaciones (R21-R25)', () => {
  it('el alta se abre en un panel lateral, sin navegar y sin dialogo modal centrado', async () => {
    // R21 — ni pagina aparte ni modal centrado, y ninguna navegacion.
    const user = userEvent.setup();
    await abrirAlta(user);

    const panel = screen.getByTestId(PRESENTATION_SHEET_TESTID);
    expect(panel).toBeInTheDocument();
    // Es el panel lateral del primitivo `sheet`, anclado a un lado.
    expect(panel).toHaveAttribute('data-slot', 'sheet-content');
    expect(panel.getAttribute('data-side')).toBe('right');
    // Y NO un dialogo de alerta centrado.
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(document.querySelector('[data-slot="alert-dialog-content"]')).toBeNull();

    expect(routerMock.push).not.toHaveBeenCalled();
    expect(routerMock.replace).not.toHaveBeenCalled();
  });

  it('cerrar el panel no navega: los parametros de lista de la URL siguen intactos', async () => {
    // R21 (segunda mitad) — el estado de lista vive en la cadena de consulta y el panel no la
    // toca, asi que abrir y cerrar no puede perderlo. Se comprueba en negativo sobre el router.
    const user = userEvent.setup();
    await abrirAlta(user);

    await user.click(screen.getByTestId(PRESENTATION_FORM_CANCEL_TESTID));

    await waitFor(() => expect(screen.queryByTestId(PRESENTATION_FORM_TESTID)).toBeNull());
    expect(routerMock.push).not.toHaveBeenCalled();
    expect(routerMock.replace).not.toHaveBeenCalled();
    expect(routerMock.refresh).not.toHaveBeenCalled();
    expect(createPresentationActionMock).not.toHaveBeenCalled();
  });

  it('la edicion abre el MISMO panel lateral, precargado con el nombre actual', async () => {
    // R21, R23 — el disparador de fila abre el panel controlado; sin abrirlo no hay formulario.
    const user = userEvent.setup();
    render(<FilaConPanel presentation={PRESENTACION} />);

    expect(screen.queryByTestId(PRESENTATION_FORM_TESTID)).toBeNull();

    await user.click(screen.getByTestId(ROW_EDIT_TESTID));

    await screen.findByTestId(PRESENTATION_FORM_TESTID);
    const panel = screen.getByTestId(PRESENTATION_SHEET_TESTID);
    expect(panel).toHaveAttribute('data-slot', 'sheet-content');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByTestId(PRESENTATION_FIELD_NAME_TESTID)).toHaveValue(PRESENTACION.name);
    expect(routerMock.push).not.toHaveBeenCalled();
    expect(routerMock.replace).not.toHaveBeenCalled();
  });

  it('la edicion envia el reemplazo completo con el id ligado a la operacion', async () => {
    // R23 — `updatePresentationAction.bind(null, id)`: el id viaja como primer argumento y el
    // nombre entero en el `FormData`.
    const user = userEvent.setup();
    render(<FilaConPanel presentation={PRESENTACION} />);
    await user.click(screen.getByTestId(ROW_EDIT_TESTID));
    await screen.findByTestId(PRESENTATION_FORM_TESTID);

    const campo = screen.getByTestId(PRESENTATION_FIELD_NAME_TESTID);
    await user.clear(campo);
    await user.type(campo, NOMBRE_ESCRITO);
    await user.click(screen.getByTestId(PRESENTATION_FORM_SUBMIT_TESTID));

    await waitFor(() => expect(updatePresentationActionMock).toHaveBeenCalledTimes(1));
    const [idRecibido, , datos] = updatePresentationActionMock.mock.calls[0]!;
    expect(idRecibido).toBe(PRESENTACION.id);
    expect(datos.get(PRESENTATION_NAME_FIELD)).toBe(NOMBRE_ESCRITO);
    expect(createPresentationActionMock).not.toHaveBeenCalled();
  });

  it('el formulario no captura ningun campo distinto de `name`', async () => {
    // R22 — en negativo: ni id visible, ni marcas de tiempo, ni autoria, ni nombre normalizado.
    const user = userEvent.setup();
    const formulario = await abrirAlta(user);

    const nombres = [...formulario.querySelectorAll<HTMLElement>('input, select, textarea')]
      .map((control) => control.getAttribute('name'))
      .filter((nombre): nombre is string => nombre !== null && nombre !== '');

    expect(nombres).toEqual([PRESENTATION_NAME_FIELD]);
  });

  it('un rechazo por nombre duplicado se pinta JUNTO AL CAMPO sin cerrar ni perder lo escrito', async () => {
    // R24 — el sitio lo decide el `code` estable, nunca el texto del mensaje.
    const user = userEvent.setup();
    createPresentationActionMock.mockResolvedValue({
      status: 'error',
      code: DUPLICATE_NAME_CODE,
      message: 'Ya existe una presentacion con un nombre equivalente.',
    });
    await abrirAlta(user);

    await user.type(screen.getByTestId(PRESENTATION_FIELD_NAME_TESTID), NOMBRE_ESCRITO);
    await user.click(screen.getByTestId(PRESENTATION_FORM_SUBMIT_TESTID));

    await waitFor(() => expect(createPresentationActionMock).toHaveBeenCalledTimes(1));
    const errorDelCampo = await screen.findByTestId(PRESENTATION_ERROR_NAME_TESTID);

    // El error va junto al campo, y el campo queda marcado como invalido y descrito por el.
    const campo = screen.getByTestId(PRESENTATION_FIELD_NAME_TESTID);
    expect(campo).toHaveAttribute('aria-invalid', 'true');
    expect(campo).toHaveAttribute('aria-describedby', errorDelCampo.id);
    // Y NO en la region de error del formulario.
    expect(screen.queryByTestId(PRESENTATION_FORM_ERROR_TESTID)).toBeNull();

    // El panel sigue abierto y lo escrito sigue ahi.
    expect(screen.getByTestId(PRESENTATION_FORM_TESTID)).toBeInTheDocument();
    expect(campo).toHaveValue(NOMBRE_ESCRITO);
    expect(toastExito).not.toHaveBeenCalled();
    expect(routerMock.refresh).not.toHaveBeenCalled();
  });

  it('un rechazo sin campo senalado va a la region de error del formulario', async () => {
    // R24 — `invalid_input` no identifica ningun campo: se pinta en la region `role="alert"`.
    const user = userEvent.setup();
    createPresentationActionMock.mockResolvedValue({
      status: 'error',
      code: INVALID_INPUT_CODE,
      message: 'La entrada recibida no es valida.',
    });
    await abrirAlta(user);

    await user.type(screen.getByTestId(PRESENTATION_FIELD_NAME_TESTID), NOMBRE_ESCRITO);
    await user.click(screen.getByTestId(PRESENTATION_FORM_SUBMIT_TESTID));

    await waitFor(() => expect(createPresentationActionMock).toHaveBeenCalledTimes(1));
    const region = await screen.findByTestId(PRESENTATION_FORM_ERROR_TESTID);

    expect(region).toHaveAttribute('role', 'alert');
    expect(screen.getByTestId(PRESENTATION_FORM_ERROR_CODE_TESTID)).toHaveTextContent(
      INVALID_INPUT_CODE,
    );
    // No se duplica junto al campo.
    expect(screen.queryByTestId(PRESENTATION_ERROR_NAME_TESTID)).toBeNull();

    expect(screen.getByTestId(PRESENTATION_FORM_TESTID)).toBeInTheDocument();
    expect(screen.getByTestId(PRESENTATION_FIELD_NAME_TESTID)).toHaveValue(NOMBRE_ESCRITO);
    expect(toastExito).not.toHaveBeenCalled();
  });

  it('un nombre sin ningun caracter valido no llega a la operacion y se marca en el campo', async () => {
    // R24 — la validacion previa usa el MISMO esquema del contrato publico (su `refine` rechaza
    // «---»), asi que ni se invoca la Server Action.
    const user = userEvent.setup();
    await abrirAlta(user);

    await user.type(screen.getByTestId(PRESENTATION_FIELD_NAME_TESTID), '---');
    await user.click(screen.getByTestId(PRESENTATION_FORM_SUBMIT_TESTID));

    await screen.findByTestId(PRESENTATION_ERROR_NAME_TESTID);
    expect(createPresentationActionMock).not.toHaveBeenCalled();
    expect(screen.getByTestId(PRESENTATION_FORM_TESTID)).toBeInTheDocument();
  });

  it('un alta con exito cierra el panel, avisa por toast y refresca la lista', async () => {
    // R25 — cerrar + aviso emergente + lista al dia sin recargar y sin perder los parametros.
    const user = userEvent.setup();
    await abrirAlta(user);

    await user.type(screen.getByTestId(PRESENTATION_FIELD_NAME_TESTID), NOMBRE_ESCRITO);
    await user.click(screen.getByTestId(PRESENTATION_FORM_SUBMIT_TESTID));

    await waitFor(() => expect(createPresentationActionMock).toHaveBeenCalledTimes(1));
    expect(createPresentationActionMock.mock.calls[0]![1].get(PRESENTATION_NAME_FIELD)).toBe(
      NOMBRE_ESCRITO,
    );

    await waitFor(() => expect(screen.queryByTestId(PRESENTATION_FORM_TESTID)).toBeNull());
    expect(toastExito).toHaveBeenCalledTimes(1);
    expect(routerMock.refresh).toHaveBeenCalledTimes(1);
    expect(routerMock.push).not.toHaveBeenCalled();
    expect(routerMock.replace).not.toHaveBeenCalled();
  });

  it('una edicion con exito cierra el panel, avisa por toast y refresca la lista', async () => {
    // R25 — mismo cierre para el otro modo del panel.
    const user = userEvent.setup();
    render(<FilaConPanel presentation={PRESENTACION} />);
    await user.click(screen.getByTestId(ROW_EDIT_TESTID));
    await screen.findByTestId(PRESENTATION_FORM_TESTID);

    await user.click(screen.getByTestId(PRESENTATION_FORM_SUBMIT_TESTID));

    await waitFor(() => expect(updatePresentationActionMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByTestId(PRESENTATION_FORM_TESTID)).toBeNull());
    expect(toastExito).toHaveBeenCalledTimes(1);
    expect(routerMock.refresh).toHaveBeenCalledTimes(1);
    expect(routerMock.push).not.toHaveBeenCalled();
  });

  it('el panel no monta ninguna region de avisos propia', async () => {
    // R26 — en negativo: la unica la monta el layout privado, y aqui no hay ninguna.
    const user = userEvent.setup();
    await abrirAlta(user);

    expect(document.querySelectorAll('[aria-live]')).toHaveLength(0);
  });
});
