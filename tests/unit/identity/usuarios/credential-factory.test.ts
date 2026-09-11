// QC-66 T12 — La fabrica de la credencial inicial (`design.md > 4.2`). Cubre R15, R16, R47.
//
// El problema de probar esto es que lo que hay que afirmar -«la credencial generada cumple la
// politica»- es exactamente lo que el diseno prohibe que salga del adaptador (R16). La salida NO
// es ensanchar la superficie del modulo con un export «solo para el test»: es inyectar un
// `hasher` doble que CAPTURA la candidata que recibe. El adaptador ya la entrega al hasher en
// produccion -no puede hashear sin ella-, asi que el doble no abre ninguna puerta nueva: observa
// el unico sitio por el que la candidata ya pasaba, y solo cuando el test es quien cablea.
//
// La politica NO se dobla en el caso principal: se usa `evaluateCredentialRules`, la funcion real
// del dominio de QC-19, sobre las 1.000 candidatas capturadas. Los dobles de politica se reservan
// para los dos casos que no se pueden provocar de otra forma (el reintento y el agotamiento).

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  INITIAL_CREDENTIAL_LENGTH,
  MAX_CREDENTIAL_ATTEMPTS,
  createRandomCredentialHash,
} from '@/lib/modules/identity/adapters/driven/security/initial-credential-factory-crypto';
import { createPasswordHash } from '@/lib/modules/identity/adapters/driven/security/password-hash';
import {
  CREDENTIAL_MIN_LENGTH,
  evaluateCredentialRules,
} from '@/lib/modules/identity/domain/credential-policy';
import { CREDENTIAL_MAX_LENGTH } from '@/lib/modules/identity/domain/credentials';

import type { CredentialPolicyResult } from '@/lib/modules/identity/domain/credential-policy';
import type { PasswordHasher } from '@/lib/modules/identity/ports/password-hasher';

/** Cuantas credenciales se generan en el caso de la politica. El numero es del `tasks.md`. */
const GENERACIONES = 1_000;

/** Valor con forma de hash bcrypt que devuelve el hasher doble cuando no hace falta el real. */
const HASH_FALSO = '$2b$10$abcdefghijklmnopqrstuvwxyz0123456789./ABCDEFGHIJKLM';

/**
 * Hasher doble que CAPTURA lo que recibe. `capturadas` es la unica ventana del test a la
 * candidata, y existe solo aqui: el adaptador no la expone por ningun otro camino.
 */
function crearHasherQueCaptura(): {
  readonly hasher: PasswordHasher;
  readonly capturadas: readonly string[];
} {
  const capturadas: string[] = [];
  const hasher: PasswordHasher = {
    hash: async (entrada) => {
      capturadas.push(entrada);
      return HASH_FALSO;
    },
    verify: async () => false,
  };
  return { hasher, capturadas };
}

/** La politica que SIEMPRE acepta: para los casos donde lo que se mide es la construccion. */
const politicaQueAcepta = async (): Promise<CredentialPolicyResult> => ({ ok: true, unmet: [] });

/** Genera `cuantas` candidatas y devuelve las capturadas, en orden. */
async function generarCandidatas(cuantas: number): Promise<readonly string[]> {
  const { hasher, capturadas } = crearHasherQueCaptura();
  for (let i = 0; i < cuantas; i += 1) {
    await createRandomCredentialHash({ hasher, checkCredentialPolicy: politicaQueAcepta });
  }
  return capturadas;
}

describe('fabrica de la credencial inicial — construccion (R15)', () => {
  let candidatas: readonly string[] = [];

  beforeAll(async () => {
    candidatas = await generarCandidatas(GENERACIONES);
  });

  it('las 1.000 candidatas generadas cumplen la politica de composicion de QC-19', () => {
    // Ancla anti-vacuidad: si el adaptador dejara de llamar al hasher, esto se pone rojo en vez
    // de pasar en verde por una lista vacia.
    expect(candidatas).toHaveLength(GENERACIONES);

    const incumplen = candidatas
      .map((candidata) => evaluateCredentialRules(candidata))
      .filter((resultado) => !resultado.ok)
      .flatMap((resultado) => resultado.unmet);

    expect(incumplen).toEqual([]);
  });

  it('toda candidata trae al menos un caracter de cada uno de los cuatro alfabetos', () => {
    const sinMayuscula = candidatas.filter((c) => !/\p{Lu}/u.test(c));
    const sinMinuscula = candidatas.filter((c) => !/\p{Ll}/u.test(c));
    const sinDigito = candidatas.filter((c) => !/\p{Nd}/u.test(c));
    const sinSimbolo = candidatas.filter((c) => !/[^\p{L}\p{N}]/u.test(c));

    expect({
      sinMayuscula: sinMayuscula.length,
      sinMinuscula: sinMinuscula.length,
      sinDigito: sinDigito.length,
      sinSimbolo: sinSimbolo.length,
    }).toEqual({ sinMayuscula: 0, sinMinuscula: 0, sinDigito: 0, sinSimbolo: 0 });
  });

  it('el largo es 24 y esta entre el minimo y el maximo importados del dominio', () => {
    expect(INITIAL_CREDENTIAL_LENGTH).toBe(24);
    expect(INITIAL_CREDENTIAL_LENGTH).toBeGreaterThanOrEqual(CREDENTIAL_MIN_LENGTH);
    expect(INITIAL_CREDENTIAL_LENGTH).toBeLessThanOrEqual(CREDENTIAL_MAX_LENGTH);

    const largos = [...new Set(candidatas.map((candidata) => candidata.length))];
    expect(largos).toEqual([INITIAL_CREDENTIAL_LENGTH]);
  });

  it('la mezcla funciona: la posicion del primer simbolo y de la primera mayuscula varia', () => {
    // Sin Fisher-Yates, un generador que arme «Aa1!...» dejaria la primera mayuscula siempre en
    // 0 y el primer simbolo siempre en 3, y pasaria todos los casos de arriba. Este es el caso
    // que lo distingue.
    const posicionPrimerSimbolo = new Set(
      candidatas.map((candidata) => candidata.search(/[^\p{L}\p{N}]/u)),
    );
    const posicionPrimeraMayuscula = new Set(
      candidatas.map((candidata) => candidata.search(/\p{Lu}/u)),
    );

    expect(posicionPrimerSimbolo.size).toBeGreaterThan(1);
    expect(posicionPrimeraMayuscula.size).toBeGreaterThan(1);
    // Y ninguna de las dos es constante: ni el simbolo se queda en una posicion fija ni la
    // mayuscula empieza siempre en 0.
    expect([...posicionPrimerSimbolo].some((posicion) => posicion !== 3)).toBe(true);
    expect([...posicionPrimeraMayuscula].some((posicion) => posicion > 0)).toBe(true);
  });

  it('dos llamadas no producen la misma candidata', () => {
    expect(new Set(candidatas).size).toBe(GENERACIONES);
  });
});

describe('fabrica de la credencial inicial — solo sale el hash (R16)', () => {
  it('devuelve un hash bcrypt del hasher cableado y NO la candidata', async () => {
    // Aqui el hasher es el REAL (bcrypt, QC-5): lo que se afirma es que el valor devuelto es el
    // hash que produce el hasher cableado, no una cadena con forma de hash inventada por el test.
    const capturadas: string[] = [];
    const hasher: PasswordHasher = {
      hash: async (entrada) => {
        capturadas.push(entrada);
        return createPasswordHash(entrada);
      },
      verify: async () => false,
    };

    const devuelto = await createRandomCredentialHash({
      hasher,
      checkCredentialPolicy: politicaQueAcepta,
    });

    expect(capturadas).toHaveLength(1);
    const candidata = capturadas[0];

    expect(devuelto).toMatch(/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/);
    expect(devuelto).not.toBe(candidata);
    expect(devuelto).not.toContain(candidata);
    // Ni un fragmento: el hash no puede contener ni los primeros caracteres de la candidata.
    expect(devuelto).not.toContain(candidata.slice(0, 6));
  });

  it('el archivo del adaptador no tiene ningun console.*', () => {
    const aqui = dirname(fileURLToPath(import.meta.url));
    const adaptador = join(
      aqui,
      '..',
      '..',
      '..',
      '..',
      'lib/modules/identity/adapters/driven/security/initial-credential-factory-crypto.ts',
    );
    const fuente = readFileSync(adaptador, 'utf8');

    expect(fuente.length).toBeGreaterThan(0);
    expect(fuente).not.toMatch(/console\s*\./);
    expect(fuente).not.toMatch(/process\s*\.\s*(stdout|stderr)/);
  });
});

describe('fabrica de la credencial inicial — la verificacion contra la politica (R15, R16)', () => {
  it('reintenta un numero acotado de veces y acaba devolviendo el hash', async () => {
    const { hasher, capturadas } = crearHasherQueCaptura();
    const rechazadas: string[] = [];
    let llamadas = 0;
    const politicaQueRechazaTresVeces = async (
      candidata: string,
    ): Promise<CredentialPolicyResult> => {
      llamadas += 1;
      if (llamadas <= 3) {
        rechazadas.push(candidata);
        return { ok: false, unmet: ['breached'] };
      }
      return { ok: true, unmet: [] };
    };

    const devuelto = await createRandomCredentialHash({
      hasher,
      checkCredentialPolicy: politicaQueRechazaTresVeces,
    });

    expect(devuelto).toBe(HASH_FALSO);
    expect(llamadas).toBe(4);
    // Una sola credencial hasheada: las tres rechazadas se descartan SIN hashear.
    expect(capturadas).toHaveLength(1);
    expect(rechazadas).toHaveLength(3);
    expect(rechazadas).not.toContain(capturadas[0]);
  });

  it('si la politica rechaza siempre, lanza nombrando las reglas y sin hashear nada', async () => {
    const { hasher, capturadas } = crearHasherQueCaptura();
    const rechazadas: string[] = [];
    const politicaQueRechazaSiempre = async (
      candidata: string,
    ): Promise<CredentialPolicyResult> => {
      rechazadas.push(candidata);
      return { ok: false, unmet: ['breached', 'no_symbol'] };
    };

    const fallo = await createRandomCredentialHash({
      hasher,
      checkCredentialPolicy: politicaQueRechazaSiempre,
    }).then(
      () => null,
      (error: unknown) => error,
    );

    expect(fallo).toBeInstanceOf(Error);
    const error = fallo as Error;

    // El reintento esta ACOTADO: ni un bucle infinito ni un solo intento.
    expect(rechazadas).toHaveLength(MAX_CREDENTIAL_ATTEMPTS);
    expect(MAX_CREDENTIAL_ATTEMPTS).toBeGreaterThan(1);
    // No se hashea nada: no existe ningun hash de una credencial que la politica rechazo.
    expect(capturadas).toEqual([]);

    // SI nombra las reglas incumplidas...
    expect(error.message).toContain('breached');
    expect(error.message).toContain('no_symbol');

    // ...y NO contiene ninguna candidata, ni en el mensaje ni en el `cause` serializado.
    const serializado = JSON.stringify({
      message: error.message,
      stack: error.stack,
      cause: error.cause === undefined ? null : String(error.cause),
    });
    for (const candidata of rechazadas) {
      expect(error.message).not.toContain(candidata);
      expect(serializado).not.toContain(candidata);
      // Ni un fragmento suyo: seis caracteres seguidos de una candidata ya serian una fuga.
      expect(serializado).not.toContain(candidata.slice(0, 6));
    }
  });
});
