import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CONDITIONING_WAIT_SECONDS,
  COUNTDOWN_GATED_BUTTON_TESTID,
  CountdownGatedButton,
} from '@/app/(private)/asignacion/acondicionamiento/[id]/components';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function avanzar(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

function boton() {
  return screen.getByTestId(COUNTDOWN_GATED_BUTTON_TESTID);
}

describe('CountdownGatedButton', () => {
  it('R9 R10: la espera es de 5 segundos', () => {
    expect(CONDITIONING_WAIT_SECONDS).toBe(5);
  });

  it('R9 R10: al montar está deshabilitado y la cuenta empieza en «00:05»', () => {
    render(<CountdownGatedButton label="Comenzar" />);

    expect(boton()).toBeDisabled();
    expect(boton()).toHaveTextContent('Comenzar');
    expect(screen.getByRole('timer')).toHaveTextContent('00:05');
  });

  it('R9 R10: sigue deshabilitado a los 4 s y se habilita a los 5 s, sin cuenta visible', () => {
    render(<CountdownGatedButton label="Terminar" />);

    avanzar(4000);
    expect(boton()).toBeDisabled();
    expect(screen.getByRole('timer')).toHaveTextContent('00:01');

    avanzar(1000);
    expect(boton()).toBeEnabled();
    expect(screen.queryByRole('timer')).not.toBeInTheDocument();
  });

  it('R9: sigue deshabilitado pasada la espera si `disabled`', () => {
    render(<CountdownGatedButton label="Comenzar" disabled />);

    avanzar(5000);
    expect(boton()).toBeDisabled();
  });

  it('R9 R10: una `key` nueva reinicia la cuenta en «00:05»', () => {
    const { rerender } = render(<CountdownGatedButton key="apertura-1" label="Comenzar" />);
    avanzar(5000);
    expect(boton()).toBeEnabled();

    rerender(<CountdownGatedButton key="apertura-2" label="Comenzar" />);

    expect(boton()).toBeDisabled();
    expect(screen.getByRole('timer')).toHaveTextContent('00:05');
    avanzar(5000);
    expect(boton()).toBeEnabled();
  });

  it('R11: es un botón de envío corriente, sin nada que mande la espera al servidor', () => {
    render(
      <form>
        <CountdownGatedButton label="Comenzar" />
      </form>,
    );

    expect(boton()).toHaveAttribute('type', 'submit');
    expect(boton()).not.toHaveAttribute('name');
    expect(document.querySelectorAll('input')).toHaveLength(0);
  });
});
