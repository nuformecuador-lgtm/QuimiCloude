// QC-19 — T1 + T3: la politica de credenciales, contra un DOBLE del puerto.
//
// Sin libreria y sin red a proposito (`design.md > 10`, nivel 1): lo que se prueba aqui es
// la regla, no de donde sale la lista. La lista real la prueba
// `tests/unit/identity/breached-credential-list.test.ts`.
//
// Los valores de prueba son marcadores evidentemente ficticios: aqui no se escribe ninguna
// contrasena de verdad, ni siquiera una notoria.

import {
  CREDENTIAL_MAX_LENGTH,
  CREDENTIAL_MIN_LENGTH,
  CREDENTIAL_RULES,
  createCredentialPolicy,
  evaluateCredentialRules,
  type CredentialRule,
} from '@/lib/modules/identity';
import type { BreachedCredentialList } from '@/lib/modules/identity/ports/breached-credential-list';

/** Candidata que cumple las seis reglas propias: 8 caracteres, Aa9 y simbolo. */
const ACEPTABLE = 'Xk9#mTq2';

/** Doble del puerto: lista fija en minusculas, y registro de lo que recibio. */
function listaDoble(entradas: readonly string[]): BreachedCredentialList & {
  readonly recibido: string[];
} {
  const recibido: string[] = [];
  return {
    recibido,
    includes(candidate: string): Promise<boolean> {
      recibido.push(candidate);
      return Promise.resolve(entradas.includes(candidate));
    },
  };
}

/** Doble que nunca encuentra nada: aisla las reglas propias de la lista. */
const listaVacia = (): BreachedCredentialList => listaDoble([]);

describe('politica de credenciales — reglas propias (R1-R13)', () => {
  it('una candidata aceptable devuelve ok y ninguna regla incumplida', async () => {
    const policy = createCredentialPolicy({ breached: listaVacia() });

    await expect(policy(ACEPTABLE)).resolves.toEqual({ ok: true, unmet: [] });
  });

  it('una candidata rechazada dice que reglas incumple, no un generico', async () => {
    const policy = createCredentialPolicy({ breached: listaVacia() });

    const result = await policy('aaaaaaa');

    expect(result.ok).toBe(false);
    // El detalle es la razon de ser de R1: nunca un "invalida" sin decir que falta.
    expect(result.unmet.length).toBeGreaterThan(0);
    expect(result.unmet).toContain('min_length');
    expect(result.unmet).toContain('no_uppercase');
  });

  it('menos de 8 caracteres incumple min_length', () => {
    expect(CREDENTIAL_MIN_LENGTH).toBe(8);

    const corta = 'Xk9#mTq' // 7 caracteres: solo le falta longitud;
    expect(corta).toHaveLength(CREDENTIAL_MIN_LENGTH - 1);

    const result = evaluateCredentialRules(corta);
    expect(result.ok).toBe(false);
    expect(result.unmet).toEqual(['min_length']);
    // Justo en el limite ya cumple: 8 es el minimo, no el primer valor rechazado.
    expect(evaluateCredentialRules(ACEPTABLE).unmet).not.toContain('min_length');
  });

  it('sin mayuscula incumple no_uppercase, y la Ñ cuenta como mayuscula', () => {
    expect(evaluateCredentialRules('xk9#mtq2').unmet).toEqual(['no_uppercase']);
    // Por categoria Unicode y no por [A-Z]: con una lista ASCII, `Ñ` no contaria (design.md > 3).
    expect(evaluateCredentialRules('Ñk9#mtq2')).toEqual({ ok: true, unmet: [] });
  });

  it('sin minuscula incumple no_lowercase, y la ñ cuenta como minuscula', () => {
    expect(evaluateCredentialRules('XK9#MTQ2').unmet).toEqual(['no_lowercase']);
    // Y `ñ` es minuscula, no simbolo: por eso hace falta el `#` para cumplir no_symbol.
    expect(evaluateCredentialRules('XK9#MTñ2')).toEqual({ ok: true, unmet: [] });
    expect(evaluateCredentialRules('XK9MTñ2Z').unmet).toEqual(['no_symbol']);
  });

  it('sin digito incumple no_digit', () => {
    expect(evaluateCredentialRules('Xkq#mTqz').unmet).toEqual(['no_digit']);
    expect(evaluateCredentialRules(ACEPTABLE).unmet).not.toContain('no_digit');
  });

  it('sin simbolo incumple no_symbol, y el espacio cuenta como simbolo', () => {
    expect(evaluateCredentialRules('Xk9mTq2z').unmet).toEqual(['no_symbol']);
    // El espacio no es letra ni numero: es simbolo (R6, decision de la pregunta abierta 1).
    expect(evaluateCredentialRules('Xk9 mTq2')).toEqual({ ok: true, unmet: [] });
  });

  it('devuelve todas las reglas incumplidas, no solo la primera', () => {
    const result = evaluateCredentialRules('aaa');

    expect(result.ok).toBe(false);
    expect(result.unmet).toEqual(['min_length', 'no_uppercase', 'no_digit', 'no_symbol']);
  });

  it('el orden de las reglas incumplidas es el de CREDENTIAL_RULES', async () => {
    const largaYFiltrada = 'a'.repeat(CREDENTIAL_MAX_LENGTH + 1);
    const policy = createCredentialPolicy({ breached: listaDoble([largaYFiltrada]) });

    const result = await policy(largaYFiltrada);

    expect(result.unmet).toEqual(['max_length', 'no_uppercase', 'no_digit', 'no_symbol', 'breached']);
    // No es una coincidencia de esta entrada: los indices en el catalogo son crecientes.
    const indices = result.unmet.map((rule) => CREDENTIAL_RULES.indexOf(rule));
    expect(indices).toEqual([...indices].sort((a, b) => a - b));
  });

  it('una candidata aceptable devuelve unmet vacio', () => {
    const result = evaluateCredentialRules(ACEPTABLE);

    expect(result.ok).toBe(true);
    expect(result.unmet).toEqual([]);
    expect(result.unmet).toHaveLength(0);
  });

  it("no recorta espacios: ' Abc12! ' cuenta 8 caracteres y tiene simbolo", () => {
    const conEspacios = ' Abc12! ';

    expect(conEspacios).toHaveLength(8);
    // Si alguien colara un `trim()`, quedarian 6 caracteres y saltaria `min_length` (R10).
    expect(evaluateCredentialRules(conEspacios)).toEqual({ ok: true, unmet: [] });
    // Y el espacio por si solo ya cumple no_symbol.
    expect(evaluateCredentialRules('Abc12 De').unmet).toEqual([]);
  });

  it('mas de CREDENTIAL_MAX_LENGTH caracteres incumple max_length', () => {
    const relleno = 'z'.repeat(CREDENTIAL_MAX_LENGTH - ACEPTABLE.length);

    expect(evaluateCredentialRules(`${ACEPTABLE}${relleno}`).unmet).toEqual([]);
    expect(evaluateCredentialRules(`${ACEPTABLE}${relleno}z`).unmet).toEqual(['max_length']);
  });

  it('dos evaluaciones de la misma candidata devuelven el mismo resultado', async () => {
    expect(evaluateCredentialRules('aaa')).toEqual(evaluateCredentialRules('aaa'));
    expect(evaluateCredentialRules(ACEPTABLE)).toEqual(evaluateCredentialRules(ACEPTABLE));

    const policy = createCredentialPolicy({ breached: listaDoble([ACEPTABLE.toLowerCase()]) });
    expect(await policy(ACEPTABLE)).toEqual(await policy(ACEPTABLE));
  });

  it('las reglas de longitud y composicion se evaluan sin puerto alguno', () => {
    // Se llama sin dependencia ninguna: si el dominio necesitara la lista para esto,
    // esta linea ni compilaria (R13).
    const result = evaluateCredentialRules('aaa');

    expect(result).not.toBeInstanceOf(Promise);
    expect(typeof result).toBe('object');
    expect(Object.keys(result).sort()).toEqual(['ok', 'unmet']);
    expect(result.unmet).toEqual(['min_length', 'no_uppercase', 'no_digit', 'no_symbol']);
  });
});

describe('politica de credenciales — la lista, por el puerto (R7, R14, R15)', () => {
  it('una candidata de la lista incumple breached aunque cumpla todo lo demas', async () => {
    const policy = createCredentialPolicy({ breached: listaDoble([ACEPTABLE.toLowerCase()]) });

    const result = await policy(ACEPTABLE);

    expect(result.ok).toBe(false);
    expect(result.unmet).toEqual(['breached']);
  });

  it('la comparacion con la lista no distingue mayusculas', async () => {
    const lista = listaDoble([ACEPTABLE.toLowerCase()]);
    const policy = createCredentialPolicy({ breached: lista });

    // La lista solo tiene la forma en minusculas y la candidata llega con mayusculas.
    await expect(policy(ACEPTABLE)).resolves.toEqual({ ok: false, unmet: ['breached'] });
    expect(lista.recibido).toEqual([ACEPTABLE.toLowerCase()]);
  });

  it('la lista se consulta por el puerto: con un doble que devuelve true, la candidata queda breached', async () => {
    const siempreEncuentra: BreachedCredentialList = { includes: () => Promise.resolve(true) };
    const nuncaEncuentra: BreachedCredentialList = { includes: () => Promise.resolve(false) };

    await expect(
      createCredentialPolicy({ breached: siempreEncuentra })(ACEPTABLE),
    ).resolves.toEqual({ ok: false, unmet: ['breached'] });
    await expect(createCredentialPolicy({ breached: nuncaEncuentra })(ACEPTABLE)).resolves.toEqual({
      ok: true,
      unmet: [],
    });
  });

  it('si el puerto lanza, el error se propaga y no se devuelve un resultado aceptable', async () => {
    const rota: BreachedCredentialList = {
      includes: () => Promise.reject(new Error('la lista no carga')),
    };
    const policy = createCredentialPolicy({ breached: rota });

    // Fail-loud, no fail-open (R15): ni `ok: true` ni un `breached` inventado.
    await expect(policy(ACEPTABLE)).rejects.toThrow(
      'fallo la consulta de la lista de credenciales filtradas',
    );

    const capturado = await policy(ACEPTABLE).catch((error: unknown) => error);
    expect(capturado).toBeInstanceOf(Error);
    expect((capturado as Error).message).not.toContain(ACEPTABLE);
    expect((capturado as Error).message).not.toContain(ACEPTABLE.toLowerCase());
  });
});

describe('politica de credenciales — el resultado no filtra la candidata (R24)', () => {
  it('el resultado no contiene la candidata ni un fragmento', async () => {
    const casos: ReadonlyArray<readonly [string, readonly CredentialRule[]]> = [
      ['aaaaaaa', ['min_length', 'no_uppercase', 'no_digit', 'no_symbol']],
      [ACEPTABLE, ['breached']],
    ];

    for (const [candidate, esperado] of casos) {
      const policy = createCredentialPolicy({ breached: listaDoble([ACEPTABLE.toLowerCase()]) });
      const result = await policy(candidate);
      expect(result.unmet).toEqual(esperado);

      const serializado = JSON.stringify(result);
      expect(serializado).not.toContain(candidate);
      // Ni la candidata entera ni ningun fragmento suyo de 3 o mas caracteres.
      for (let inicio = 0; inicio + 3 <= candidate.length; inicio += 1) {
        const fragmento = candidate.slice(inicio, inicio + 3);
        expect(serializado, `fragmento filtrado: ${inicio}`).not.toContain(fragmento);
      }
    }
  });
});
