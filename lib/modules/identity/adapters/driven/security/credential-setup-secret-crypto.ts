// QC-79 T9 — Adaptador driven de `CredentialSetupSecretFactory` (`design.md > 4.2`, `> 4.3`).
// Cubre R9 y R10.
//
// Dos funciones y nada mas: generar el secreto con su huella, y calcular la huella de un secreto
// que llega de fuera. Ninguna escritura a consola ni a ningun otro canal de salida en todo el
// archivo: el secreto sale por el `return` y por ningun otro sitio (R13).
//
// POR QUE SHA-256 Y NO BCRYPT, que es lo que el repo usa para contrasenas (`design.md > 4.1`):
//   1. El coste de bcrypt existe para secretos de BAJA entropia. Una contrasena humana tiene ~30
//      bits y hay que encarecer cada intento; esto tiene 256 bits de un CSPRNG, no hay diccionario
//      que probar y ralentizar la comprobacion no aporta nada.
//   2. bcrypt lleva sal por fila, asi que su huella NO es determinista y no se puede BUSCAR.
//      Validar un enlace obligaria a leer todas las filas vivas y ejecutar un bcrypt contra cada
//      una: O(n) operaciones caras por peticion, o sea una denegacion de servicio servida en
//      bandeja. Con SHA-256 la comprobacion es UNA busqueda por indice unico.
//
// Los nombres de este archivo evitan a proposito el segmento `password` -y tampoco dicen `token` a
// secas-: `secret` para el valor que viaja, `digest` para lo unico que se persiste
// (`tests/guards/guard-password-never-plaintext.test.ts`). Se adapta el NOMBRE, no la guardia.
import { createHash, randomBytes } from 'node:crypto';

/**
 * Bytes de entropia del secreto. **32 bytes = 256 bits exactos** (R10).
 *
 * `randomBytes` de `node:crypto` es el CSPRNG del runtime. NO `Math.random` -que no es
 * criptografico-, NO `randomUUID` -122 bits utiles-, y NO nada derivado del identificador del
 * usuario, de su correo ni de ningun instante: un secreto predecible a partir de datos que el
 * atacante ya conoce no es un secreto.
 */
export const CREDENTIAL_SETUP_SECRET_BYTES = 32;

/**
 * Largo del secreto ya codificado: `ceil(32 / 3) * 4` = 44 caracteres de base64, menos el relleno
 * `=` que base64url no escribe, son **43**. Se declara para que el invariante se pueda afirmar sin
 * repetir la cuenta en el test.
 */
export const CREDENTIAL_SETUP_SECRET_LENGTH = 43;

/**
 * La huella de un secreto: SHA-256 en hexadecimal, 64 caracteres (`design.md > 4.1`).
 *
 * Es lo UNICO que llega a la base (R9). Es determinista a proposito -ver arriba-: por eso se puede
 * buscar por el indice unico de `token_digest` y por eso la comprobacion de `design.md > 4.6` es
 * una igualdad sobre columna indexada y no un recorrido en memoria.
 *
 * Se exporta aparte de `createCredentialSetupSecret` porque el camino de USO necesita justo esto y
 * nada mas: convertir el secreto que llego por la URL en la huella con la que el `UPDATE`
 * condicional decide. El secreto no cruza el puerto de persistencia en ningun caso.
 */
export function digestOfCredentialSetupSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

/**
 * Un secreto nuevo y su huella. Cumple `CredentialSetupSecretFactory.create` (R9, R10).
 *
 * **base64url y no hexadecimal ni base64 normal**: el secreto viaja en el CAMINO de la URL
 * (`design.md > 4.4`), y base64url usa solo `A-Z a-z 0-9 - _`, que no hay que escapar. base64
 * normal traeria `+`, `/` y `=`; hexadecimal seria el doble de largo para la misma entropia.
 */
export function createCredentialSetupSecret(): { readonly secret: string; readonly digest: string } {
  const secret = randomBytes(CREDENTIAL_SETUP_SECRET_BYTES).toString('base64url');
  return { secret, digest: digestOfCredentialSetupSecret(secret) };
}
