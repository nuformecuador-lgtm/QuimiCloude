import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CountdownTimer } from '@/components/shared/countdown-timer';

/**
 * `countdown-timer.tsx`: el resto se afirma contra el reloj falso de Vitest, nunca contra
 * `setTimeout` reales, porque el propio componente compara contra `Date.now()` y una espera real
 * haria el test lento y dependiente de la maquina que lo corre.
 */

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

describe('CountdownTimer · formato', () => {
  it('pinta minutos y segundos con dos digitos cada uno', () => {
    render(<CountdownTimer minutes={1} seconds={5} onEnd={vi.fn()} />);

    expect(screen.getByTestId('countdown-timer')).toHaveTextContent('01:05');
  });

  it('los segundos que exceden 59 pasan a minutos', () => {
    render(<CountdownTimer minutes={1} seconds={75} onEnd={vi.fn()} />);

    expect(screen.getByTestId('countdown-timer')).toHaveTextContent('02:15');
  });

  it('el total se limita a 99:59 aunque las props pidan mas', () => {
    render(<CountdownTimer minutes={500} seconds={999} onEnd={vi.fn()} />);

    expect(screen.getByTestId('countdown-timer')).toHaveTextContent('99:59');
  });

  it('expone role="timer" con el tiempo restante en el nombre accesible', () => {
    render(<CountdownTimer minutes={0} seconds={30} onEnd={vi.fn()} />);

    const cronometro = screen.getByRole('timer');
    expect(cronometro).toHaveAccessibleName('Tiempo restante: 00:30');
  });
});

describe('CountdownTimer · estilo', () => {
  it('usa solo tokens del tema, con digitos tabulares', () => {
    render(<CountdownTimer minutes={0} seconds={30} onEnd={vi.fn()} />);

    const cronometro = screen.getByTestId('countdown-timer');
    expect(cronometro).toHaveClass('tabular-nums');
    expect(cronometro).toHaveClass('text-foreground');
    expect(cronometro).not.toHaveClass('text-destructive');
  });

  it('con pocos segundos restantes pasa al tono de aviso del tema', () => {
    render(<CountdownTimer minutes={0} seconds={5} onEnd={vi.fn()} />);

    expect(screen.getByTestId('countdown-timer')).toHaveClass('text-destructive');
  });

  it('el `className` del consumidor se combina con el del componente, sin perder el propio', () => {
    render(<CountdownTimer minutes={0} seconds={30} onEnd={vi.fn()} className="text-lg" />);

    const cronometro = screen.getByTestId('countdown-timer');
    expect(cronometro).toHaveClass('text-lg');
    expect(cronometro).toHaveClass('tabular-nums');
  });
});

describe('CountdownTimer · cuenta atras', () => {
  it('cuenta hacia atras cada segundo tras montarse', () => {
    render(<CountdownTimer minutes={0} seconds={3} onEnd={vi.fn()} />);
    expect(screen.getByTestId('countdown-timer')).toHaveTextContent('00:03');

    avanzar(1000);
    expect(screen.getByTestId('countdown-timer')).toHaveTextContent('00:02');

    avanzar(1000);
    expect(screen.getByTestId('countdown-timer')).toHaveTextContent('00:01');
  });

  it('llega a 00:00 y llama a onEnd exactamente una vez', () => {
    const onEnd = vi.fn();
    render(<CountdownTimer minutes={0} seconds={2} onEnd={onEnd} />);

    avanzar(2000);
    expect(screen.getByTestId('countdown-timer')).toHaveTextContent('00:00');
    expect(onEnd).toHaveBeenCalledTimes(1);

    // Se queda en 00:00 y no vuelve a llamar aunque siga corriendo el reloj.
    avanzar(5000);
    expect(screen.getByTestId('countdown-timer')).toHaveTextContent('00:00');
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it('con total inicial 0 llama a onEnd una vez al montarse', () => {
    const onEnd = vi.fn();
    render(<CountdownTimer minutes={0} seconds={0} onEnd={onEnd} />);

    expect(screen.getByTestId('countdown-timer')).toHaveTextContent('00:00');
    expect(onEnd).toHaveBeenCalledTimes(1);

    avanzar(5000);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it('un onEnd con identidad nueva en cada render no reinicia el conteo', () => {
    const primerOnEnd = vi.fn();
    const { rerender } = render(<CountdownTimer minutes={0} seconds={5} onEnd={primerOnEnd} />);

    avanzar(2000);
    expect(screen.getByTestId('countdown-timer')).toHaveTextContent('00:03');

    // Misma duracion, pero una funcion NUEVA en cada rerender -como la arrow function inline
    // que un padre real volveria a crear en cada uno de sus renders.
    const segundoOnEnd = vi.fn();
    rerender(<CountdownTimer minutes={0} seconds={5} onEnd={segundoOnEnd} />);
    expect(screen.getByTestId('countdown-timer')).toHaveTextContent('00:03');

    avanzar(3000);
    expect(screen.getByTestId('countdown-timer')).toHaveTextContent('00:00');
    expect(segundoOnEnd).toHaveBeenCalledTimes(1);
    expect(primerOnEnd).not.toHaveBeenCalled();
  });

  it('el conteo se reinicia cuando cambian minutes o seconds', () => {
    const onEnd = vi.fn();
    const { rerender } = render(<CountdownTimer minutes={0} seconds={5} onEnd={onEnd} />);

    avanzar(3000);
    expect(screen.getByTestId('countdown-timer')).toHaveTextContent('00:02');

    rerender(<CountdownTimer minutes={1} seconds={0} onEnd={onEnd} />);
    expect(screen.getByTestId('countdown-timer')).toHaveTextContent('01:00');

    avanzar(1000);
    expect(screen.getByTestId('countdown-timer')).toHaveTextContent('00:59');
  });

  it('limpia el intervalo al desmontarse y no llama a onEnd despues', () => {
    const onEnd = vi.fn();
    const { unmount } = render(<CountdownTimer minutes={0} seconds={2} onEnd={onEnd} />);

    avanzar(1000);
    unmount();
    avanzar(5000);

    expect(onEnd).not.toHaveBeenCalled();
  });
});
