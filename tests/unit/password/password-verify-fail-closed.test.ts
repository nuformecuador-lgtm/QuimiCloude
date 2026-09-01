// T6 — La verificacion falla cerrada: un valor guardado inutilizable da `false`, nunca
// `true`, y nunca lanza (R5, `design.md > 6`).

import { createPasswordHash, verifyPasswordHash } from '@/lib/utils/password-hash';

const SECRETO = 'clave-de-prueba';

/** Hash bcrypt REAL de `SECRETO`, base de las variantes corruptas de la tabla. */
const HASH_VALIDO = '$2b$10$i0qoGwImOO0Gvo21Hl3XeO1yND1MwYxwPReQ6F9cyr4Lu92zPDJJa';

const VALORES_GUARDADOS_INVALIDOS: ReadonlyArray<readonly [string, string]> = [
  ['cadena vacia', ''],
  ['solo espacios', '     '],
  ['prefijo suelto', '$2b$'],
  ['le falta un caracter', HASH_VALIDO.slice(0, -1)],
  ['le sobra un caracter', `${HASH_VALIDO}a`],
  ['prefijo desconocido', `$9z$10$${HASH_VALIDO.slice(7)}`],
  ['texto suelto', 'esto no es un hash'],
  ['caracter fuera del alfabeto de bcrypt', `${HASH_VALIDO.slice(0, -1)}!`],
];

describe('verifyPasswordHash — fallo cerrado', () => {
  // Si la base dejara de ser un hash valido, cada variante corrupta seria invalida por
  // el motivo equivocado y la tabla no probaria nada.
  it('la base de las variantes corruptas es un hash bcrypt valido', async () => {
    expect(HASH_VALIDO).toHaveLength(60);
    expect(await verifyPasswordHash(SECRETO, HASH_VALIDO)).toBe(true);
  });

  it.each(VALORES_GUARDADOS_INVALIDOS)(
    'devuelve false y no lanza cuando el valor guardado es %s',
    async (_caso, almacenado) => {
      let lanzo = false;
      let resultado: boolean | undefined;
      try {
        resultado = await verifyPasswordHash(SECRETO, almacenado);
      } catch {
        lanzo = true;
      }

      expect(lanzo).toBe(false);
      expect(resultado).toBe(false);
    },
  );

  it.each([
    ['null', null],
    ['undefined', undefined],
  ])('devuelve false y no lanza cuando el valor guardado es %s', async (_caso, colado) => {
    let lanzo = false;
    let resultado: boolean | undefined;
    try {
      resultado = await verifyPasswordHash(SECRETO, colado as unknown as string);
    } catch {
      lanzo = true;
    }

    expect(lanzo).toBe(false);
    expect(resultado).toBe(false);
  });

  // Caso de control: sin el, una implementacion que devolviera siempre `false` pasaria
  // el archivo entero.
  it('un hash valido con su contrasena correcta sigue devolviendo true', async () => {
    const almacenado = await createPasswordHash(SECRETO);

    expect(await verifyPasswordHash(SECRETO, almacenado)).toBe(true);
  });
});
