// `FormSheet` y `SaveButton`: el marco compartido de los formularios en panel.
//
// Sin asserts sobre literales de copy propios de una pantalla: los textos se pasan por props o
// salen de las constantes exportadas por el componente.

import { act, cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  FORM_SHEET_PENDING_LABEL,
  FORM_SHEET_SAVE_LABEL,
  FormSheet,
  type FormSheetProps,
} from '@/components/shared/form-sheet';
import { Sheet } from '@/components/ui/sheet';
import { touchTarget } from '@/lib/shared/ui/touch-target';

import { setupUser } from '../../helpers/user-event';

const TEST_IDS = {
  sheet: 'prueba-sheet',
  form: 'prueba-form',
  cancel: 'prueba-form-cancel',
  submit: 'prueba-form-submit',
  title: 'prueba-form-title',
} as const;

const SAFE_AREA_CLASS = 'pb-[env(safe-area-inset-bottom)]';

/** Envíos que se quedan en vuelo hasta `afterEach`: ninguna promesa queda colgando sin soltar. */
const enVuelo: Array<() => void> = [];

function accionEnVuelo(): (formData: FormData) => Promise<void> {
  return () =>
    new Promise<void>((resolve) => {
      enVuelo.push(resolve);
    });
}

afterEach(async () => {
  cleanup();
  for (const soltar of enVuelo.splice(0)) soltar();
  await act(async () => {});
});

type Montaje = Partial<FormSheetProps> & { readonly onOpenChange?: (open: boolean) => void };

function montar({ onOpenChange = vi.fn(), ...props }: Montaje = {}) {
  const formAction = props.formAction ?? vi.fn();
  render(
    <Sheet open onOpenChange={onOpenChange}>
      <FormSheet
        title="Título de prueba"
        description="Descripción de prueba"
        testIds={TEST_IDS}
        {...props}
        formAction={formAction}
      >
        {props.children ?? <input name="campo" defaultValue="valor" data-testid="prueba-campo" />}
      </FormSheet>
    </Sheet>,
  );
  return { formAction, onOpenChange };
}

function clasesDe(element: Element): string[] {
  return (element.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);
}

describe('FormSheet', () => {
  it('R6 — compone cabecera, cuerpo con scroll y pie fijo con cancelar y guardar dentro del form', () => {
    montar();

    const panel = screen.getByTestId(TEST_IDS.sheet);
    expect(clasesDe(panel)).toContain(SAFE_AREA_CLASS);
    expect(panel).toHaveAttribute('data-side', 'right');

    const form = screen.getByTestId(TEST_IDS.form);
    expect(form.tagName).toBe('FORM');
    expect(panel).toContainElement(form);

    expect(within(form).getByRole('heading', { name: 'Título de prueba' })).toBeInTheDocument();
    expect(within(form).getByText('Descripción de prueba')).toBeInTheDocument();

    const cuerpo = screen.getByTestId('prueba-campo').parentElement;
    expect(cuerpo).not.toBeNull();
    expect(clasesDe(cuerpo!)).toContain('overflow-y-auto');

    const pie = form.querySelector('[data-slot="sheet-footer"]');
    expect(pie).not.toBeNull();
    expect(pie).toContainElement(screen.getByTestId(TEST_IDS.cancel));
    expect(pie).toContainElement(screen.getByTestId(TEST_IDS.submit));
    expect(screen.getByTestId(TEST_IDS.submit)).toHaveAttribute('type', 'submit');
    expect(screen.getByTestId(TEST_IDS.submit)).toHaveTextContent(FORM_SHEET_SAVE_LABEL);
  });

  it('R7 — «Cancelar» cierra el panel sin enviar el formulario', async () => {
    const user = setupUser();
    const { formAction, onOpenChange } = montar();

    const cancelar = screen.getByTestId(TEST_IDS.cancel);
    expect(cancelar).toHaveAttribute('type', 'button');
    await user.click(cancelar);

    expect(onOpenChange).toHaveBeenCalledWith(false, expect.anything());
    expect(formAction).not.toHaveBeenCalled();
  });

  it('R8 — mientras el form envía, guardar queda deshabilitado, con aria-busy y el texto de pendiente', async () => {
    const user = setupUser();
    const action = vi.fn(accionEnVuelo());
    montar({ formAction: action });

    const guardar = screen.getByTestId(TEST_IDS.submit);
    expect(guardar).toBeEnabled();
    expect(guardar).toHaveAttribute('aria-busy', 'false');

    await user.click(guardar);

    expect(action).toHaveBeenCalledTimes(1);
    expect(action.mock.calls[0]?.[0].get('campo')).toBe('valor');
    const enviando = screen.getByTestId(TEST_IDS.submit);
    expect(enviando).toBeDisabled();
    expect(enviando).toHaveAttribute('aria-busy', 'true');
    expect(enviando).toHaveTextContent(FORM_SHEET_PENDING_LABEL);

    await act(async () => {
      for (const soltar of enVuelo.splice(0)) soltar();
    });

    const libre = screen.getByTestId(TEST_IDS.submit);
    expect(libre).toBeEnabled();
    expect(libre).toHaveAttribute('aria-busy', 'false');
    expect(libre).toHaveTextContent(FORM_SHEET_SAVE_LABEL);
  });

  it('R8 — los textos de guardar, pendiente y cancelar se pasan por props', async () => {
    const user = setupUser();
    montar({
      formAction: accionEnVuelo(),
      saveLabel: 'Enviar',
      pendingLabel: 'Enviando…',
      cancelLabel: 'Volver',
    });

    expect(screen.getByTestId(TEST_IDS.cancel)).toHaveTextContent('Volver');
    expect(screen.getByTestId(TEST_IDS.submit)).toHaveTextContent('Enviar');

    await user.click(screen.getByTestId(TEST_IDS.submit));

    expect(screen.getByTestId(TEST_IDS.submit)).toHaveTextContent('Enviando…');
  });

  it('R9 — con `busy`, guardar se trata como envío en curso', () => {
    montar({ busy: true });

    const guardar = screen.getByTestId(TEST_IDS.submit);
    expect(guardar).toBeDisabled();
    expect(guardar).toHaveAttribute('aria-busy', 'true');
    expect(guardar).toHaveTextContent(FORM_SHEET_PENDING_LABEL);
  });

  it('R9 — con `canSave = false`, guardar queda deshabilitado sin texto de pendiente', () => {
    montar({ canSave: false });

    const guardar = screen.getByTestId(TEST_IDS.submit);
    expect(guardar).toBeDisabled();
    expect(guardar).toHaveAttribute('aria-busy', 'false');
    expect(guardar).toHaveTextContent(FORM_SHEET_SAVE_LABEL);
  });

  it('R9 — con `disabled`, guardar queda deshabilitado', () => {
    montar({ disabled: true });

    const guardar = screen.getByTestId(TEST_IDS.submit);
    expect(guardar).toBeDisabled();
    expect(guardar).toHaveAttribute('aria-busy', 'false');
    expect(guardar).toHaveTextContent(FORM_SHEET_SAVE_LABEL);
  });

  it('R9 — la envoltura del pie, la talla táctil, `noValidate` y los slots de cabecera van por props', () => {
    montar({
      footerWrapperClassName: 'flex flex-row flex-wrap items-center justify-end gap-2',
      cancelTouch: 'prop',
      saveTouch: 'class',
      noValidate: true,
      minScreenWidth: 70,
      bodyClassName: 'flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-4',
      beforeHeader: <div data-testid="prueba-antes-cabecera" />,
      headerExtra: <div data-testid="prueba-extra-cabecera" />,
    });

    const cancelar = screen.getByTestId(TEST_IDS.cancel);
    const guardar = screen.getByTestId(TEST_IDS.submit);
    const envoltura = cancelar.parentElement;
    expect(envoltura?.tagName).toBe('DIV');
    expect(clasesDe(envoltura!)).toEqual(
      'flex flex-row flex-wrap items-center justify-end gap-2'.split(' '),
    );
    expect(envoltura).toContainElement(guardar);
    expect(envoltura?.parentElement).toHaveAttribute('data-slot', 'sheet-footer');

    for (const clase of touchTarget.split(' ')) {
      expect(clasesDe(cancelar)).toContain(clase);
      expect(clasesDe(guardar)).toContain(clase);
    }

    expect(screen.getByTestId(TEST_IDS.form)).toHaveAttribute('novalidate');
    expect(screen.getByTestId(TEST_IDS.sheet).style.minWidth).toBe('70vw');
    expect(clasesDe(screen.getByTestId('prueba-campo').parentElement!)).toContain('gap-6');

    const cabecera = screen.getByTestId(TEST_IDS.form).querySelector('[data-slot="sheet-header"]');
    expect(cabecera).toContainElement(screen.getByTestId('prueba-extra-cabecera'));
    expect(cabecera?.previousElementSibling).toBe(screen.getByTestId('prueba-antes-cabecera'));
  });

  it('R9 — sin envoltura, cancelar y guardar son hijos directos del pie', () => {
    montar();

    const pie = screen.getByTestId(TEST_IDS.cancel).parentElement;
    expect(pie).toHaveAttribute('data-slot', 'sheet-footer');
    expect(screen.getByTestId(TEST_IDS.submit).parentElement).toBe(pie);
    expect(screen.getByTestId(TEST_IDS.form)).not.toHaveAttribute('novalidate');
  });

  it('R10 — los data-testid del panel, form, título, cancelar y guardar, y los data-* extra, llegan por props', () => {
    montar({ sheetData: { 'data-mode': 'edit', 'data-entity-id': 'abc' } });

    const panel = screen.getByTestId(TEST_IDS.sheet);
    expect(panel).toHaveAttribute('data-mode', 'edit');
    expect(panel).toHaveAttribute('data-entity-id', 'abc');
    expect(panel).toContainElement(screen.getByTestId(TEST_IDS.form));
    expect(screen.getByTestId(TEST_IDS.title)).toHaveTextContent('Título de prueba');
    expect(screen.getByTestId(TEST_IDS.cancel)).toBeInTheDocument();
    expect(screen.getByTestId(TEST_IDS.submit)).toBeInTheDocument();
  });
});
