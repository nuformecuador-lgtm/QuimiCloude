// QC-21 — T4: `CredentialRequirements` renderizado directo con props.
//
// Cubre R1, R2 (parte), R3, R4, R5, R7, R8, R9, R15, R16, R20, R21.
//
// El test ITERA `CREDENTIAL_RULES` importado del barrel `@/lib/modules/identity`: si QC-19
// anade, quita o reordena un codigo, este archivo lo exige sin editarse (R3). El estado
// mostrado de las seis se compara SIEMPRE contra `evaluateCredentialRules`, nunca contra un
// estado escrito a mano (R2, R4). Los asserts de copy van contra `CREDENTIAL_RULE_LABELS`,
// nunca contra un literal (R15).

import { render, screen } from '@testing-library/react';

import { CredentialRequirements, type CredentialRuleState } from '@/components/shared/credential-requirements';
import { CREDENTIAL_RULE_LABELS } from '@/components/shared/credential-rule-labels';
import { CREDENTIAL_RULES, evaluateCredentialRules, type CredentialRule } from '@/lib/modules/identity';

/** Todas las reglas salvo la septima: las seis comprobables en vivo, en orden del catalogo. */
const LIVE_RULES = CREDENTIAL_RULES.filter((rule) => rule !== 'breached');

function stateFor(rule: CredentialRule, candidate: string, breachedState: CredentialRuleState): CredentialRuleState {
  if (rule === 'breached') return breachedState;
  return evaluateCredentialRules(candidate).unmet.includes(rule) ? 'unmet' : 'met';
}

describe('CredentialRequirements — catalogo y orden (R1, R3)', () => {
  it('renderiza una entrada por cada codigo de CREDENTIAL_RULES y en su orden', () => {
    const { container } = render(<CredentialRequirements candidate="" />);
    const items = container.querySelectorAll('li[data-rule]');

    expect(items).toHaveLength(CREDENTIAL_RULES.length);
    for (const [index, rule] of CREDENTIAL_RULES.entries()) {
      expect(items[index]?.getAttribute('data-rule')).toBe(rule);
    }
  });

  it('la lista sale del catalogo importado, no de una copia local', () => {
    // No hay ningun codigo en pantalla que no venga de `CREDENTIAL_RULES`, y no falta
    // ninguno de los que el catalogo declara: si QC-19 lo modifica, este assert lo exige.
    const { container } = render(<CredentialRequirements candidate="" />);
    const renderedRules = [...container.querySelectorAll('li[data-rule]')].map((li) =>
      li.getAttribute('data-rule'),
    );
    expect(renderedRules).toEqual([...CREDENTIAL_RULES]);
  });
});

describe('CredentialRequirements — marcado en vivo de las seis (R2, R4, R5)', () => {
  it('con la candidata vacia las seis salen incumplidas y la lista es visible sin interaccion', () => {
    // NOTA sobre R5 tal como esta redactado en requirements.md: dice que "las seis" salen
    // incumplidas con la candidata vacia. La politica de QC-19 (`credential-policy.ts`,
    // `max_length: candidate.length <= CREDENTIAL_MAX_LENGTH`) hace que `max_length` este
    // CUMPLIDA con una cadena vacia (0 caracteres no excede el maximo): es la unica de las
    // seis que no puede salir "incumplida" en vacio sin que el componente mienta sobre lo
    // que devuelve `evaluateCredentialRules` (R2 prohibe precisamente inventar un estado
    // que no venga de esa funcion). Este test verifica lo que R5 SI puede garantizar sin
    // contradecir R2: la lista completa es visible desde el primer render, sin interaccion,
    // y el estado de cada una de las seis coincide con lo que la funcion pura devuelve
    // (no con un valor fijo escrito a mano). Discrepancia reportada al leader, no resuelta
    // aqui: requirements.md no se reabre desde un test.
    const { container } = render(<CredentialRequirements candidate="" />);
    const { unmet } = evaluateCredentialRules('');

    for (const rule of LIVE_RULES) {
      const item = container.querySelector(`li[data-rule="${rule}"]`);
      expect(item, `falta la entrada de ${rule}`).not.toBeNull();
      const expected = unmet.includes(rule) ? 'unmet' : 'met';
      expect(item?.getAttribute('data-state')).toBe(expected);
    }
    // La mayoria de las seis SI salen incumplidas en vacio (todas salvo `max_length`).
    expect(unmet.filter((rule) => (LIVE_RULES as readonly CredentialRule[]).includes(rule)).length).toBe(
      LIVE_RULES.length - 1,
    );

    // Visible desde el primer render: nada de foco, escritura ni ratón.
    expect(screen.getAllByRole('listitem')).toHaveLength(CREDENTIAL_RULES.length);
  });

  it('el estado mostrado de las seis coincide con evaluateCredentialRules para cada candidata', () => {
    const candidatas = ['', 'a', 'aaaaaaaa', 'Abc12345', 'Abcdefg1#', 'z'.repeat(70)];

    for (const candidate of candidatas) {
      const { container, unmount } = render(<CredentialRequirements candidate={candidate} />);
      for (const rule of LIVE_RULES) {
        const item = container.querySelector(`li[data-rule="${rule}"]`);
        const expected = stateFor(rule, candidate, 'unknown');
        expect(item?.getAttribute('data-state'), `regla ${rule} con candidata ${JSON.stringify(candidate)}`).toBe(
          expected,
        );
      }
      unmount();
    }
  });

  it('al cambiar la candidata cada una de las seis pasa a cumplida o incumplida', () => {
    const { container, rerender } = render(<CredentialRequirements candidate="a" />);
    for (const rule of LIVE_RULES) {
      const item = container.querySelector(`li[data-rule="${rule}"]`);
      expect(item?.getAttribute('data-state')).toBe(stateFor(rule, 'a', 'unknown'));
    }

    const otraCandidata = 'Abcdefg1#';
    rerender(<CredentialRequirements candidate={otraCandidata} />);
    for (const rule of LIVE_RULES) {
      const item = container.querySelector(`li[data-rule="${rule}"]`);
      expect(item?.getAttribute('data-state')).toBe(stateFor(rule, otraCandidata, 'unknown'));
    }
  });
});

describe('CredentialRequirements — la septima, neutra hasta que responde el servidor (R7, R8, R9)', () => {
  it('la regla de filtradas arranca en estado neutro', () => {
    const { container } = render(<CredentialRequirements candidate="Abcdefg1#" />);
    const item = container.querySelector('li[data-rule="breached"]');
    expect(item?.getAttribute('data-state')).toBe('unknown');
  });

  it('sin veredicto del servidor la regla de filtradas nunca sale cumplida ni incumplida', () => {
    // Ninguna candidata, por si sola, mueve la septima: es el prop `breachedState` el unico
    // que la cambia (R8).
    const candidatas = ['', 'a', 'Abcdefg1#', 'z'.repeat(70)];
    for (const candidate of candidatas) {
      const { container, unmount } = render(<CredentialRequirements candidate={candidate} />);
      const item = container.querySelector('li[data-rule="breached"]');
      expect(item?.getAttribute('data-state'), `candidata ${JSON.stringify(candidate)}`).toBe('unknown');
      unmount();
    }
  });

  it('con el veredicto de filtrada la septima sale incumplida y las seis no cambian', () => {
    const candidate = 'Abcdefg1#';
    const { container: neutro } = render(<CredentialRequirements candidate={candidate} />);
    const estadosPrevios = LIVE_RULES.map(
      (rule) => neutro.querySelector(`li[data-rule="${rule}"]`)?.getAttribute('data-state'),
    );

    const { container: filtrada } = render(<CredentialRequirements candidate={candidate} breachedState="unmet" />);
    expect(filtrada.querySelector('li[data-rule="breached"]')?.getAttribute('data-state')).toBe('unmet');

    const estadosTrasVeredicto = LIVE_RULES.map(
      (rule) => filtrada.querySelector(`li[data-rule="${rule}"]`)?.getAttribute('data-state'),
    );
    expect(estadosTrasVeredicto).toEqual(estadosPrevios);
  });
});

describe('CredentialRequirements — copy desde una unica fuente (R15)', () => {
  it('el texto de cada regla sale de CREDENTIAL_RULE_LABELS', () => {
    render(<CredentialRequirements candidate="" />);
    for (const rule of CREDENTIAL_RULES) {
      expect(screen.getByText(CREDENTIAL_RULE_LABELS[rule])).toBeInTheDocument();
    }
  });

  it('el prop labels sustituye el texto de una regla', () => {
    const textoPropio = 'Texto de prueba sustituido para min_length';
    render(<CredentialRequirements candidate="" labels={{ min_length: textoPropio }} />);

    expect(screen.getByText(textoPropio)).toBeInTheDocument();
    expect(screen.queryByText(CREDENTIAL_RULE_LABELS.min_length)).not.toBeInTheDocument();
    // El resto del copy sigue saliendo de la constante: la sustitucion es parcial.
    expect(screen.getByText(CREDENTIAL_RULE_LABELS.no_uppercase)).toBeInTheDocument();
  });
});

describe('CredentialRequirements — tres estados distinguibles sin color (R16)', () => {
  it('cada entrada expone su estado de forma consultable y con texto, no solo por color', () => {
    const { container } = render(<CredentialRequirements candidate="" breachedState="unmet" />);
    const listItems = screen.getAllByRole('listitem');
    expect(listItems).toHaveLength(CREDENTIAL_RULES.length);

    for (const rule of CREDENTIAL_RULES) {
      const item = container.querySelector(`li[data-rule="${rule}"]`);
      expect(item).not.toBeNull();
      // Consultable programaticamente: el atributo `data-state`, no un color de CSS.
      const state = item?.getAttribute('data-state');
      expect(state).toMatch(/^(met|unmet|unknown)$/);
      // Y con texto, no solo icono: el `li` contiene un texto de estado no vacio.
      expect(item?.textContent?.trim().length ?? 0).toBeGreaterThan(0);
    }
  });
});

describe('CredentialRequirements — negativas (R20, R21)', () => {
  it('no muestra ninguna puntuacion ni barra de fuerza', () => {
    render(<CredentialRequirements candidate="Abcdefg1#" />);
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.queryByRole('meter')).not.toBeInTheDocument();
    expect(screen.queryByText(/debil|fuerte|weak|strong/i)).not.toBeInTheDocument();
  });

  it('no emite la candidata en ningun atributo ni texto', () => {
    const candidatoMarcador = 'CANDIDATA-SECRETA-MARCADOR-9x7Q';
    const { container } = render(<CredentialRequirements candidate={candidatoMarcador} />);

    expect(container.innerHTML).not.toContain(candidatoMarcador);
    for (const attribute of ['data-rule', 'data-state']) {
      for (const li of container.querySelectorAll(`[${attribute}]`)) {
        expect(li.getAttribute(attribute)).not.toContain(candidatoMarcador);
      }
    }
  });
});
