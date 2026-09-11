// QC-79 T9 — La fabrica del secreto del enlace (`design.md > 4.2`). Cubre R9 y R10.
//
// Lo que hay que demostrar aqui son dos propiedades del valor, no un camino de codigo: que lleva
// **256 bits exactos** de un generador criptografico (R10) y que lo que se persistiria es una
// huella irreversible y **no** el secreto (R9).
//
// La entropia se comprueba DECODIFICANDO el secreto -32 bytes es 32 bytes, lo diga quien lo diga-
// en vez de espiar `randomBytes`: un espia probaria que se llamo a una funcion; decodificar prueba
// el tamano del valor que sale, que es la afirmacion de R10.
//
// Ninguna contrasena real ni ficticia aparece en este archivo: aqui no hay contrasenas, hay
// secretos de enlace.

import {
  CREDENTIAL_SETUP_SECRET_BYTES,
  CREDENTIAL_SETUP_SECRET_LENGTH,
  createCredentialSetupSecret,
  digestOfCredentialSetupSecret,
} from '@/lib/modules/identity/adapters/driven/security/credential-setup-secret-crypto';

import type { CredentialSetupSecretFactory } from '@/lib/modules/identity/ports/credential-setup-secret-factory';

/** El alfabeto de base64url, sin relleno: lo unico que puede aparecer en el camino de una URL. */
const BASE64URL = /^[A-Za-z0-9_-]+$/;

/** 64 caracteres hexadecimales en minuscula: la forma de un SHA-256 de `digest('hex')`. */
const SHA256_HEX = /^[0-9a-f]{64}$/;

/** Cuantos secretos se generan para el caso de la unicidad. */
const GENERACIONES = 1_000;

describe('la fabrica del secreto — entropia y forma (R10)', () => {
  it('el secreto lleva 32 bytes, que son 256 bits exactos', () => {
    expect(CREDENTIAL_SETUP_SECRET_BYTES).toBe(32);

    const { secret } = createCredentialSetupSecret();

    expect(Buffer.from(secret, 'base64url')).toHaveLength(32);
  });

  it('el secreto son 43 caracteres de base64url, seguros en una URL sin escapar nada', () => {
    expect(CREDENTIAL_SETUP_SECRET_LENGTH).toBe(43);

    const { secret } = createCredentialSetupSecret();

    expect(secret).toHaveLength(CREDENTIAL_SETUP_SECRET_LENGTH);
    expect(secret).toMatch(BASE64URL);
    // base64 normal traeria estos tres; base64url, ninguno.
    expect(secret).not.toContain('+');
    expect(secret).not.toContain('/');
    expect(secret).not.toContain('=');
  });

  it('dos llamadas consecutivas producen secretos distintos', () => {
    const primero = createCredentialSetupSecret();
    const segundo = createCredentialSetupSecret();

    expect(segundo.secret).not.toBe(primero.secret);
    expect(segundo.digest).not.toBe(primero.digest);
  });

  it('mil secretos seguidos son mil valores distintos', () => {
    const vistos = new Set<string>();
    for (let i = 0; i < GENERACIONES; i += 1) vistos.add(createCredentialSetupSecret().secret);

    expect(vistos.size).toBe(GENERACIONES);
  });

  it('el secreto no se deriva de nada: la fabrica no recibe ningun dato', () => {
    // R10 en la firma. Si manana alguien le anadiera el identificador o el correo del usuario, esto
    // deja de compilar antes de que ningun humano lo revise.
    expect(createCredentialSetupSecret).toHaveLength(0);
  });
});

describe('la fabrica del secreto — la huella (R9)', () => {
  it('la huella es un SHA-256 en hexadecimal, de 64 caracteres', () => {
    const { digest } = createCredentialSetupSecret();

    expect(digest).toMatch(SHA256_HEX);
  });

  it('la huella es reproducible: el mismo secreto da siempre la misma huella', () => {
    const { secret, digest } = createCredentialSetupSecret();

    expect(digestOfCredentialSetupSecret(secret)).toBe(digest);
    expect(digestOfCredentialSetupSecret(secret)).toBe(digestOfCredentialSetupSecret(secret));
  });

  it('es determinista a proposito: eso es lo que permite buscarla por el indice unico', () => {
    // Valor fijo -no un secreto generado- contrastado contra el SHA-256 conocido de la cadena.
    expect(digestOfCredentialSetupSecret('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('el SECRETO no aparece dentro de la huella, ni entero ni por fragmentos', () => {
    const { secret, digest } = createCredentialSetupSecret();

    expect(digest).not.toContain(secret);
    // Ni un prefijo reconocible: la huella no es una codificacion del secreto.
    expect(digest).not.toContain(secret.slice(0, 8));
    // Y quien solo tiene la huella no puede distinguirla del secreto de otro: son espacios
    // distintos. 64 hex frente a 43 base64url.
    expect(digest.length).not.toBe(secret.length);
  });

  it('secretos distintos dan huellas distintas', () => {
    const huellas = new Set<string>();
    for (let i = 0; i < GENERACIONES; i += 1) huellas.add(createCredentialSetupSecret().digest);

    expect(huellas.size).toBe(GENERACIONES);
  });
});

describe('la fabrica del secreto — cumple el puerto', () => {
  it('la funcion encaja en `CredentialSetupSecretFactory` sin adaptacion ninguna', () => {
    // Es lo que `lib/composition` hara en T17: atar el puerto a esta funcion. Si la forma del
    // retorno cambiara, este cableado deja de compilar.
    const factory: CredentialSetupSecretFactory = { create: createCredentialSetupSecret };

    const emitido = factory.create();

    expect(emitido.secret).toMatch(BASE64URL);
    expect(emitido.digest).toMatch(SHA256_HEX);
  });
});
