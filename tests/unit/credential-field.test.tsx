// QC-21 — T5: `CredentialField` ejercitado a traves de un formulario de prueba minimo.
//
// Cubre R6, R10, R11, R12, R13, R14, R17, R18.
//
// El formulario de prueba se declara DENTRO de este archivo (`design.md > 8.2`): monta
// `<CredentialField>`, guarda en estado local lo que llega por `onOwnRulesMetChange` y lo
// aplica al `disabled` de un `<button type="submit">`. Es el cableado que QC-36 tendra que
// escribir; no se mueve a `app/` bajo ningun concepto (`design.md > 9(f)`).
//
// Interacciones con `@testing-library/user-event`, nunca `fireEvent` (precedente QC-11 T16).

import { useState } from 'react';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { CredentialField } from '@/components/shared/credential-field';
import type { CredentialRuleState } from '@/components/shared/credential-requirements';

/** Candidata que cumple las seis reglas comprobables en vivo (no la septima, que es del servidor). */
const CANDIDATA_QUE_CUMPLE_LAS_SEIS = 'Abcdefg1#';

type TestFormProps = {
  readonly breachedState?: CredentialRuleState;
  readonly onOwnRulesMetChange?: (met: boolean) => void;
};

/**
 * El formulario minimo de `design.md > 8.2`: el `disabled` del boton de envio sale SOLO de
 * `onOwnRulesMetChange`, exactamente como tendra que cablear QC-36.
 */
function TestForm({ breachedState, onOwnRulesMetChange }: TestFormProps) {
  const [ownRulesMet, setOwnRulesMet] = useState(false);

  return (
    <form aria-label="formulario de prueba">
      <CredentialField
        name="password"
        label="Contrasena nueva"
        breachedState={breachedState}
        onOwnRulesMetChange={(met) => {
          setOwnRulesMet(met);
          onOwnRulesMetChange?.(met);
        }}
      />
      <button type="submit" disabled={!ownRulesMet}>
        Enviar
      </button>
    </form>
  );
}

describe('CredentialField — el bloqueo del envio es parcial (design.md > 4)', () => {
  it('mientras falte alguna de las seis el control de envio esta deshabilitado', async () => {
    const user = userEvent.setup();
    render(<TestForm />);

    const input = screen.getByLabelText('Contrasena nueva');
    const boton = screen.getByRole('button', { name: 'Enviar' });

    expect(boton).toBeDisabled();
    await user.type(input, 'incompleta');
    expect(boton).toBeDisabled();
  });

  it('con las seis en verde el envio se habilita aunque la septima siga neutra', async () => {
    const user = userEvent.setup();
    render(<TestForm />);

    const input = screen.getByLabelText('Contrasena nueva');
    const boton = screen.getByRole('button', { name: 'Enviar' });

    await user.type(input, CANDIDATA_QUE_CUMPLE_LAS_SEIS);

    expect(boton).toBeEnabled();
    const listaSeptima = document.querySelector('li[data-rule="breached"]');
    expect(listaSeptima?.getAttribute('data-state')).toBe('unknown');
  });

  it('tras el rechazo por filtrada las seis siguen en verde y el envio sigue habilitado', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<TestForm />);

    const input = screen.getByLabelText('Contrasena nueva');
    await user.type(input, CANDIDATA_QUE_CUMPLE_LAS_SEIS);

    // El servidor rechaza la candidata: el consumidor re-renderiza con el veredicto, y el
    // usuario todavia no ha tocado el campo.
    rerender(<TestForm breachedState="unmet" />);

    const boton = screen.getByRole('button', { name: 'Enviar' });
    expect(boton).toBeEnabled();

    const septima = document.querySelector('li[data-rule="breached"]');
    expect(septima?.getAttribute('data-state')).toBe('unmet');

    const reglasLiveDeseadas = ['min_length', 'max_length', 'no_uppercase', 'no_lowercase', 'no_digit', 'no_symbol'];
    for (const rule of reglasLiveDeseadas) {
      const item = document.querySelector(`li[data-rule="${rule}"]`);
      expect(item?.getAttribute('data-state'), `regla ${rule}`).toBe('met');
    }
  });
});

describe('CredentialField — aviso al formulario consumidor (R10)', () => {
  it('avisa al montar y solo cuando cambia si las seis se cumplen', async () => {
    const user = userEvent.setup();
    const onOwnRulesMetChange = vi.fn();

    render(<TestForm onOwnRulesMetChange={onOwnRulesMetChange} />);

    // Al montar, con candidata vacia (false).
    expect(onOwnRulesMetChange).toHaveBeenCalledTimes(1);
    expect(onOwnRulesMetChange).toHaveBeenNthCalledWith(1, false);

    const input = screen.getByLabelText('Contrasena nueva');

    // Sigue siendo `false` mientras se escribe algo incompleto: no debe volver a avisar.
    await user.type(input, 'Abc');
    expect(onOwnRulesMetChange).toHaveBeenCalledTimes(1);

    // Al completar las seis, cambia a `true`: un aviso mas. `Abcdefg1#` cumple longitud,
    // mayuscula, minuscula, digito y simbolo.
    await user.type(input, 'defg1#');
    expect(onOwnRulesMetChange).toHaveBeenCalledTimes(2);
    expect(onOwnRulesMetChange).toHaveBeenNthCalledWith(2, true);

    // Seguir escribiendo sin cambiar el veredicto (sigue cumpliendo las seis) no dispara mas avisos.
    await user.type(input, 'X');
    expect(onOwnRulesMetChange).toHaveBeenCalledTimes(2);
  });
});

describe('CredentialField — sin red mientras se escribe (R6)', () => {
  it('escribir no dispara ninguna peticion de red', async () => {
    // `globalThis.fetch` puede no existir segun la version de Node/jsdom: se define primero
    // si hace falta, y siempre se espia, para que el assert sea el mismo en cualquier caso.
    if (typeof globalThis.fetch !== 'function') {
      globalThis.fetch = vi.fn() as unknown as typeof fetch;
    }
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      throw new Error('no deberia llamarse a fetch');
    });

    const user = userEvent.setup();
    render(<TestForm />);

    const input = screen.getByLabelText('Contrasena nueva');
    await user.type(input, CANDIDATA_QUE_CUMPLE_LAS_SEIS);

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

describe('CredentialField — el campo oculta la candidata (R17)', () => {
  it('el campo oculta la candidata y no ofrece control de mostrar u ocultar', () => {
    render(<TestForm />);

    const input = screen.getByLabelText('Contrasena nueva');
    expect(input).toHaveAttribute('type', 'password');

    // Ningun boton ni control con nombre relacionado a mostrar/ocultar.
    const botones = screen.queryAllByRole('button', { name: /mostrar|ocultar|show|hide/i });
    expect(botones).toEqual([]);
  });
});

describe('CredentialField — el veredicto del servidor solo entra por props (R14)', () => {
  it('el veredicto del servidor solo entra por props', async () => {
    // Con `breachedState="unmet"` desde el principio, sin que el componente lo haya
    // consultado el mismo: es el consumidor quien decide pasarlo.
    const conVeredicto = render(<TestForm breachedState="unmet" />);
    const septima = conVeredicto.container.querySelector('li[data-rule="breached"]');
    expect(septima?.getAttribute('data-state')).toBe('unmet');
    conVeredicto.unmount();

    // Sin ese prop, nunca sale incumplida por su cuenta, ni escribiendo.
    const user = userEvent.setup();
    const sinVeredicto = render(<TestForm />);
    const input = sinVeredicto.getByLabelText('Contrasena nueva');
    await user.type(input, CANDIDATA_QUE_CUMPLE_LAS_SEIS);
    const septimaSinVeredicto = sinVeredicto.container.querySelector('li[data-rule="breached"]');
    expect(septimaSinVeredicto?.getAttribute('data-state')).not.toBe('unmet');
  });
});

describe('CredentialField — todo el flujo corre en jsdom, sin red, sin navegador, sin base (R18)', () => {
  it('el flujo completo se ejercita en un formulario de prueba sin red ni servidor', async () => {
    // Esta suite entera corre bajo el proyecto `ui` de vitest.config.mts, entorno `jsdom`
    // (ver ese archivo): no hay navegador real, no hay conexion de red por defecto y no hay
    // base de datos involucrada en ningun punto de este test.
    expect(typeof window).toBe('object');
    expect(typeof document).toBe('object');

    const user = userEvent.setup();
    render(<TestForm />);

    const input = screen.getByLabelText('Contrasena nueva');
    const boton = screen.getByRole('button', { name: 'Enviar' });

    expect(boton).toBeDisabled();
    await user.type(input, CANDIDATA_QUE_CUMPLE_LAS_SEIS);
    expect(boton).toBeEnabled();
  });
});
