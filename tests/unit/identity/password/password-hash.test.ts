// T5 — Comportamiento del util de contrasenas (R1, R2, R3, R4, R6, R7, R8, R9).

import {
  BCRYPT_MAX_INPUT_BYTES,
  BCRYPT_ROUNDS,
  createPasswordHash,
  verifyPasswordHash,
} from '@/lib/utils/password-hash';

/** Formato estandar de bcrypt: `$2<letra>$<coste>$` + 53 caracteres del alfabeto de bcrypt. */
const BCRYPT_FORMAT = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;

const SECRETO = 'clave-de-prueba';

describe('createPasswordHash / verifyPasswordHash', () => {
  it('el valor guardado no contiene la contrasena en claro', async () => {
    const almacenado = await createPasswordHash(SECRETO);

    expect(almacenado).not.toContain(SECRETO);
    expect(almacenado.startsWith('$2')).toBe(true);
  });

  it('dos transformaciones de la misma contrasena dan valores distintos, y las dos verifican correctamente', async () => {
    const primero = await createPasswordHash(SECRETO);
    const segundo = await createPasswordHash(SECRETO);

    expect(primero).not.toBe(segundo);
    // Sin este segundo assert, una funcion rota que devolviera basura distinta cada vez pasaria.
    expect(await verifyPasswordHash(SECRETO, primero)).toBe(true);
    expect(await verifyPasswordHash(SECRETO, segundo)).toBe(true);
  });

  it('verifica la contrasena correcta', async () => {
    for (const entrada of [SECRETO, ' clave con espacios ', 'contraseña con acentós']) {
      const almacenado = await createPasswordHash(entrada);
      expect(await verifyPasswordHash(entrada, almacenado), entrada).toBe(true);
    }
  });

  it('rechaza la contrasena incorrecta', async () => {
    const almacenado = await createPasswordHash('Secreto-1234');

    const incorrectas = {
      'difiere en el primer caracter': 'secreto-1234'.replace('s', 'X'),
      'difiere en el ultimo caracter': 'Secreto-1235',
      'difiere solo en mayusculas': 'secreto-1234',
      'difiere por longitud': 'Secreto-12345',
    };

    for (const [caso, intento] of Object.entries(incorrectas)) {
      expect(await verifyPasswordHash(intento, almacenado), caso).toBe(false);
    }
  });

  it('el valor guardado declara 10 rondas', async () => {
    const almacenado = await createPasswordHash(SECRETO);
    const coste = Number(almacenado.split('$')[2]);

    expect(coste).toBe(BCRYPT_ROUNDS);
    expect(BCRYPT_ROUNDS).toBe(10);
  });

  it('el valor guardado son 60 caracteres ASCII con formato bcrypt', async () => {
    const almacenado = await createPasswordHash(SECRETO);

    expect(almacenado).toHaveLength(60);
    expect(almacenado).toMatch(BCRYPT_FORMAT);
    expect(almacenado).toMatch(/^[\x20-\x7e]+$/);
  });

  it('rechaza una contrasena de mas de 72 bytes UTF-8', async () => {
    const setentaYTresAscii = 'a'.repeat(BCRYPT_MAX_INPUT_BYTES + 1);
    expect(Buffer.byteLength(setentaYTresAscii, 'utf8')).toBe(73);
    await expect(createPasswordHash(setentaYTresAscii)).rejects.toThrow();

    // 40 caracteres, 80 bytes: es el caso que distingue bytes de `length`.
    const cuarentaAcentuados = 'á'.repeat(40);
    expect(cuarentaAcentuados).toHaveLength(40);
    expect(Buffer.byteLength(cuarentaAcentuados, 'utf8')).toBe(80);
    await expect(createPasswordHash(cuarentaAcentuados)).rejects.toThrow();

    // Y el limite exacto si pasa: 72 bytes no se rechazan.
    const setentaYDosBytes = 'a'.repeat(BCRYPT_MAX_INPUT_BYTES);
    expect(Buffer.byteLength(setentaYDosBytes, 'utf8')).toBe(BCRYPT_MAX_INPUT_BYTES);
    const almacenado = await createPasswordHash(setentaYDosBytes);
    expect(await verifyPasswordHash(setentaYDosBytes, almacenado)).toBe(true);
  });

  it('el error de longitud no incluye la contrasena en su mensaje', async () => {
    const demasiadoLarga = `secreto-irrepetible-${'z'.repeat(60)}`;

    await expect(createPasswordHash(demasiadoLarga)).rejects.toThrow(
      expect.objectContaining({
        message: expect.not.stringContaining('secreto-irrepetible'),
      }),
    );
  });
});
