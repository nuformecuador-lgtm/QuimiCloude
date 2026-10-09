import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { SubmitButton } from '@/components/shared/submit-button';
import { touchTarget } from '@/lib/shared/ui/touch-target';

import { setupUser } from '../../helpers/user-event';

const TESTID = 'formulario-submit';
const LABEL = 'Entrar';
const PENDING_LABEL = 'Entrando…';

function renderInForm(action: (formData: FormData) => Promise<void>) {
  return render(
    <form action={action}>
      <SubmitButton
        label={LABEL}
        pendingLabel={PENDING_LABEL}
        testId={TESTID}
        className="w-full"
      />
    </form>,
  );
}

function classesOf(element: Element): string[] {
  return (element.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);
}

afterEach(cleanup);

describe('SubmitButton compartido', () => {
  it('R26 — en reposo: habilitado, aria-busy="false", con su etiqueta y su testId', () => {
    renderInForm(async () => {});

    const boton = screen.getByTestId(TESTID);
    expect(boton).toHaveAttribute('type', 'submit');
    expect(boton).toBeEnabled();
    expect(boton).toHaveAttribute('aria-busy', 'false');
    expect(boton).toHaveTextContent(LABEL);
  });

  it('R26 — lleva la talla tactil y las clases que se le pasan', () => {
    renderInForm(async () => {});

    const clases = classesOf(screen.getByTestId(TESTID));
    for (const clase of touchTarget.split(' ')) {
      expect(clases).toContain(clase);
    }
    expect(clases).toContain('w-full');
  });

  it('R26 — mientras el form ancestro envia: deshabilitado, aria-busy y la etiqueta de pendiente', async () => {
    let terminar!: () => void;
    const action = () =>
      new Promise<void>((resolve) => {
        terminar = resolve;
      });
    const user = setupUser();
    renderInForm(action);

    await user.click(screen.getByTestId(TESTID));

    const boton = screen.getByTestId(TESTID);
    expect(boton).toBeDisabled();
    expect(boton).toHaveAttribute('aria-busy', 'true');
    expect(boton).toHaveTextContent(PENDING_LABEL);

    await act(async () => {
      terminar();
    });

    expect(screen.getByTestId(TESTID)).toBeEnabled();
    expect(screen.getByTestId(TESTID)).toHaveAttribute('aria-busy', 'false');
    expect(screen.getByTestId(TESTID)).toHaveTextContent(LABEL);
  });
});
