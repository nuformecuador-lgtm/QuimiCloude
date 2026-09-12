// QC-79 T16 — El transporte de BUZON de `CredentialSetupMailer` (`design.md > 9.2`).
// Habilitante de R41: sin esto no existe el E2E.
//
// El problema que resuelve, dicho entero: el camino completo de la decision cerrada 10 es «alta sin
// contrasena -> enlace -> establecerla -> entrar con ella», y el navegador de Playwright **no tiene
// buzon**. El secreto tampoco se puede recuperar de la base, porque alli solo vive su HUELLA
// (`design.md > 4.1`): si se pudiera, el diseno de seguridad estaria mal. Asi que el enlace tiene
// que salir por algun sitio, y ese sitio es un archivo JSON en disco.
//
// Las tres condiciones que hacen que esto sea una herramienta de prueba y no un agujero
// (`design.md > 9.2`):
//
//   1. **El transporte por defecto es `resend`**, el real: lo fija `DEFAULT_MAIL_TRANSPORT` en
//      `../config/mail-config-env.ts`. Sin `MAIL_TRANSPORT`, nadie escribe correos a un archivo.
//   2. **Este adaptador se NIEGA a arrancar si `NODE_ENV === 'production'`**: lanza y nombra la
//      variable. Una configuracion equivocada en produccion falla RUIDOSAMENTE, no envia en
//      silencio a un archivo del que nadie se entera.
//   3. `tests/guards/guard-envio-de-correo.test.ts` afirma las dos cosas anteriores LEYENDO el
//      codigo, para que nadie las «simplifique» despues.
//
// **No importa `resend`** (R27) ni ninguna otra libreria: `node:fs/promises` y `node:crypto`.
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { credentialSetupRoute } from '@/lib/shared/routes';

import { readCredentialSetupLinkBaseUrlFromEnv } from '../config/mail-config-env';

/**
 * Directorio donde se escribe cada mensaje. El nombre de la variable vive UNICAMENTE aqui, como
 * cadena literal en posicion de valor, igual que los de `mail-config-env.ts`.
 */
const OUTBOX_DIR_ENV_VAR_NAME = 'MAIL_OUTBOX_DIR';

/** La variable que decide si esto es produccion. Se nombra en el error de la condicion 2. */
const NODE_ENV_VAR_NAME = 'NODE_ENV';

/** El mensaje, tal y como queda escrito en el JSON. */
export type OutboxCredentialSetupMessage = {
  readonly to: string;
  readonly url: string;
  readonly writtenAt: string;
};

/**
 * Condicion 2 de `design.md > 9.2`. Se comprueba **en cada invocacion**, no al importar el modulo:
 * importar este archivo no debe fallar en ningun entorno —la guardia lo lee, la composicion lo
 * puede cablear— y lo que no puede ocurrir nunca es que un correo real acabe en un archivo.
 */
function refuseInProduction(): void {
  if (process.env[NODE_ENV_VAR_NAME] === 'production') {
    throw new Error(
      `el transporte de correo de buzon no puede usarse con ${NODE_ENV_VAR_NAME}=production: ` +
        'es una herramienta de prueba (design.md > 9.2)',
    );
  }
}

/**
 * `MAIL_OUTBOX_DIR`, leida **en la invocacion** y obligatoria. Que falte LANZA nombrandola, y eso
 * es deliberado: este transporte solo se cablea cuando alguien puso `MAIL_TRANSPORT=outbox` a
 * proposito, asi que no tener donde escribir es un error de configuracion que tiene que doler, no
 * un `'failed'` silencioso que dejaria el E2E buscando un archivo que nadie iba a escribir.
 */
function readOutboxDirFromEnv(): string {
  const raw = process.env[OUTBOX_DIR_ENV_VAR_NAME];
  if (raw === undefined || raw.trim() === '') {
    throw new Error(`falta la variable de entorno ${OUTBOX_DIR_ENV_VAR_NAME}`);
  }
  return raw;
}

/**
 * Implementa `CredentialSetupMailer.sendCredentialSetupLink` escribiendo el mensaje —**incluida la
 * URL**— como JSON en `MAIL_OUTBOX_DIR`, en vez de llamar a ningun proveedor.
 *
 * **Que se escribe y que no.** El destinatario, la URL y el instante. El asunto y el cuerpo NO:
 * son el copy provisional de la pregunta abierta 2 y viven en una sola constante cada uno, en el
 * adaptador del proveedor; copiarlos aqui crearia una segunda copia que mantener el dia de QC-72, y
 * el E2E solo necesita el enlace.
 *
 * **El nombre del archivo no lleva el secreto** (R13): lleva el instante y un identificador al
 * azar. El secreto esta dentro del JSON —tiene que estar, es el enlace—, y ese archivo solo existe
 * en el entorno de prueba que lo pidio.
 *
 * Como el del proveedor, **no lanza** por un fallo de escritura (R30): devuelve `'failed'`. Si
 * lanza es por las dos condiciones de configuracion de arriba, que son fallos del operador y no del
 * envio.
 */
export async function sendCredentialSetupLink(input: {
  readonly to: string;
  readonly secret: string;
}): Promise<'sent' | 'failed'> {
  refuseInProduction();

  const dir = readOutboxDirFromEnv();
  const baseUrl = readCredentialSetupLinkBaseUrlFromEnv();

  const message: OutboxCredentialSetupMessage = {
    to: input.to,
    // El camino, con el secreto DENTRO de el, lo compone `credentialSetupRoute` y no este
    // archivo (T19): el literal de la ruta vive en un solo sitio, y este transporte y el del
    // proveedor arman la MISMA URL porque llaman al MISMO helper. Este archivo sigue sin importar
    // nada del adaptador de `resend`, que es lo que lo mantiene libre de la libreria (R27).
    url: `${baseUrl.replace(/\/+$/, '')}${credentialSetupRoute(input.secret)}`,
    writtenAt: new Date().toISOString(),
  };

  try {
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, `credential-setup-${Date.now()}-${randomUUID()}.json`),
      `${JSON.stringify(message, null, 2)}\n`,
      'utf8',
    );
    return 'sent';
  } catch (error) {
    // Ni URL ni secreto ni destinatario en la linea (R13): solo el nombre del error de disco.
    console.error(
      `[identity] fallo al escribir el enlace en el buzon de correo: ${
        error instanceof Error ? error.name : 'error_desconocido'
      }`,
    );
    return 'failed';
  }
}
