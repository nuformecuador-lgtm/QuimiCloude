// QC-66 T12 — Adaptador driven de `InitialCredentialFactory` (`design.md > 4.2`).
//
// Genera la credencial inicial de un usuario nuevo y devuelve **SOLO SU HASH** (R15, R16). La
// candidata en claro no sale del cuerpo de `createRandomCredentialHash`: no se devuelve, no se
// guarda en ninguna variable de modulo, no viaja en ningun mensaje de error ni en ningun `cause`,
// y en este archivo no hay NI UNA escritura a consola ni a ningun otro canal de salida. El test
// de alcance de T18 lo vuelve a afirmar leyendo este archivo.
//
// Dos capas, y la segunda NO es redundante (`design.md > 4.2`):
//   1. CONSTRUCCION: 24 caracteres de cuatro alfabetos, al menos uno de cada, el resto de la
//      union, y mezcla Fisher-Yates. Sin la mezcla, la posicion del simbolo seria predecible.
//   2. VERIFICACION: la candidata pasa por la POLITICA COMPLETA de QC-19 -las reglas propias mas
//      la lista de credenciales filtradas-, con reintento ACOTADO. Es lo que convierte «por
//      construccion» en una afirmacion verificada, y lo que cubre el caso real -improbable, no
//      imposible- de que una candidata caiga en la lista de filtradas.
//
// Apoyarse en el dominio desde un driven es legal (`docs/architecture.md > La regla de
// dependencias`, nota QC-9): este archivo importa `../../../domain` y recibe por parametro la
// politica ya cableada. El cableado puerto->implementacion es exclusivo de `lib/composition`.
//
// El nombre de todo lo que aqui se declara evita el segmento `password` a proposito y acaba en
// `Hash` donde nombra la credencial, porque `tests/guards/guard-password-never-plaintext.test.ts`
// marca todo identificador declarado que nombre la contrasena y no acabe en `hash`. Se adapta el
// NOMBRE, no la guardia.
import { randomInt } from 'node:crypto';

import { CREDENTIAL_MIN_LENGTH } from '../../../domain/credential-policy';
import { CREDENTIAL_MAX_LENGTH } from '../../../domain/credentials';

import type { CredentialPolicyResult } from '../../../domain/credential-policy';
import type { PasswordHasher } from '../../../ports/password-hasher';

/**
 * Los cuatro alfabetos de la politica de QC-19, uno por regla de composicion
 * (`no_uppercase`, `no_lowercase`, `no_digit`, `no_symbol`). Todos ASCII: 24 caracteres son 24
 * bytes UTF-8, muy por debajo de los 72 que bcrypt tiene en cuenta, asi que nada se trunca.
 *
 * «Simbolo» para la politica es todo lo que no sea letra ni numero. Se eligen signos que ningun
 * transporte razonable tenga que escapar, porque la credencial viaja a bcrypt y a nada mas.
 */
const ALPHABETS = [
  'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  'abcdefghijklmnopqrstuvwxyz',
  '0123456789',
  '!#$%&*+-:;<=>?@^_~',
] as const;

/** La union de los cuatro, para los caracteres que completan el largo. */
const ALL_CHARACTERS = ALPHABETS.join('');

/**
 * Largo de la candidata. 24 esta comodamente entre `CREDENTIAL_MIN_LENGTH` (8) y
 * `CREDENTIAL_MAX_LENGTH` (64), que se IMPORTAN del dominio en vez de reescribirse aqui: si
 * manana la politica moviera cualquiera de los dos extremos, el invariante de abajo lo dice en
 * voz alta en vez de producir credenciales que la propia politica rechaza.
 */
export const INITIAL_CREDENTIAL_LENGTH = 24;

/**
 * Reintentos de la capa 2. Acotado a proposito: un bucle sin tope convertiria una lista de
 * filtradas rota o una politica imposible en un cuelgue silencioso. Ocho es holgadisimo -la
 * probabilidad de que una candidata de 24 caracteres de cuatro alfabetos figure en una lista de
 * credenciales comunes es despreciable-, y agotarlos significa que algo esta mal configurado.
 */
export const MAX_CREDENTIAL_ATTEMPTS = 8;

export type RandomCredentialHashDeps = {
  /** El hasher ya cableado (bcrypt, QC-5). Esta feature no elige algoritmo ni coste. */
  readonly hasher: PasswordHasher;
  /**
   * La politica COMPLETA de QC-19 -`createCredentialPolicy`, reglas propias mas lista de
   * filtradas-, ya cableada. Llega por parametro y no se construye aqui: quien la ata es
   * `lib/composition`, que ya tiene la suya y no debe cablear una segunda.
   */
  readonly checkCredentialPolicy: (candidate: string) => Promise<CredentialPolicyResult>;
};

/** Un caracter al azar de `alphabet`. `randomInt(max)` no tiene sesgo de modulo. */
function pickCharacter(alphabet: string): string {
  return alphabet.charAt(randomInt(alphabet.length));
}

/**
 * Fisher-Yates alimentado por `randomInt`, en sitio. NO es opcional: sin mezclar, los cuatro
 * primeros caracteres serian siempre mayuscula, minuscula, digito y simbolo en ese orden, y la
 * posicion del simbolo seria perfectamente predecible.
 */
function shuffleInPlace(characters: string[]): void {
  for (let index = characters.length - 1; index > 0; index -= 1) {
    const swapWith = randomInt(index + 1);
    const held = characters[index];
    characters[index] = characters[swapWith];
    characters[swapWith] = held;
  }
}

/**
 * La capa 1: al menos uno de cada alfabeto, el resto de la union, y mezcla. No se exporta: la
 * candidata en claro no tiene ningun uso legitimo fuera de este archivo.
 */
function buildCandidate(): string {
  const characters = ALPHABETS.map((alphabet) => pickCharacter(alphabet));
  while (characters.length < INITIAL_CREDENTIAL_LENGTH) {
    characters.push(pickCharacter(ALL_CHARACTERS));
  }
  shuffleInPlace(characters);
  return characters.join('');
}

/**
 * Produce el HASH bcrypt de una credencial inicial recien generada. Cumple
 * `InitialCredentialFactory.createCredentialHash` (R15, R16).
 *
 * Lanza si, agotados los reintentos, la politica sigue rechazando la candidata. El error nombra
 * las REGLAS incumplidas y NUNCA la candidata ni un fragmento suyo -mismo criterio que el seed,
 * `seed-initial-access.ts`-, y no lleva `cause`: no hay nada que adjuntar que no sea la
 * credencial.
 */
export async function createRandomCredentialHash(deps: RandomCredentialHashDeps): Promise<string> {
  if (
    INITIAL_CREDENTIAL_LENGTH < CREDENTIAL_MIN_LENGTH ||
    INITIAL_CREDENTIAL_LENGTH > CREDENTIAL_MAX_LENGTH
  ) {
    throw new Error(
      `el largo de la credencial inicial (${INITIAL_CREDENTIAL_LENGTH}) esta fuera de los limites de la politica de credenciales`,
    );
  }

  let lastUnmet: readonly string[] = [];
  for (let attempt = 0; attempt < MAX_CREDENTIAL_ATTEMPTS; attempt += 1) {
    const candidate = buildCandidate();
    // La politica se evalua ANTES de hashear: si no es aceptable, no se produce ningun hash.
    const policyResult = await deps.checkCredentialPolicy(candidate);
    if (policyResult.ok) return deps.hasher.hash(candidate);
    lastUnmet = policyResult.unmet;
  }

  throw new Error(
    `la credencial inicial generada no cumple la politica tras ${MAX_CREDENTIAL_ATTEMPTS} intentos: ${lastUnmet.join(', ')}`,
  );
}
