// QC-79 T15 — Adaptador driven de `CredentialSetupMailer` con `resend` (`design.md > 7.2`).
// Cubre R13, R27, R29, R30.
//
// **UNICO archivo del repositorio que importa `resend`** (R27). Lo vigila
// `tests/guards/guard-envio-de-correo.test.ts`, que recorre `lib/`, `app/`, `components/` y
// `scripts/` y se pone roja ante un segundo import. Mismo patron, y por el mismo motivo, con el
// que `@supabase/storage-js` vive solo en `recetas/adapters/driven/storage/recipe-image-supabase.ts`
// y `@tiptap/*` en los dos archivos que enumera QC-64: sustituir el proveedor es reescribir UN
// archivo y cambiar UNA linea de `lib/composition`, no buscar la libreria por todo el arbol.
//
// Tres invariantes que este archivo sostiene y que no son adorno:
//
//   1. **El cliente se construye DENTRO de la funcion**, con la clave leida en ese momento
//      (`design.md > 7.2`, R28). Construirlo al importar el modulo haria que la suite entera
//      necesitara `RESEND_API_KEY` para poder importar cualquier cosa que cuelgue de aqui.
//   2. **No lanza nunca** (R30, `ports/credential-setup-mailer.ts`): un fallo del proveedor es un
//      VALOR, `'failed'`. Esto NO es un `catch` vacio (`docs/conventions.md > Manejo de errores`):
//      el error se MANEJA —se registra— y se COMUNICA como resultado.
//   3. **La linea de registro no lleva la URL, ni el secreto, ni el correo del destinatario**
//      (R13, y `docs/architecture.md > Anti-patrones`, que prohibe registrar PII): solo el nombre
//      del error del proveedor.
import { Resend } from 'resend';

import { readResendMailConfigFromEnv } from '../config/mail-config-env';

import type { ResendMailConfig } from '../config/mail-config-env';

/**
 * ASUNTO del correo. **Copy provisional, pendiente de QC-72** (`internacionalizacion-de-textos`,
 * hoy `pending`): es la **pregunta abierta 2** de `requirements.md` —«que dice el correo»—, que
 * sigue SIN cerrar. No se inventa el copy definitivo: esto es el minimo funcional.
 *
 * Vive aqui arriba, junto al cuerpo, para que cambiarlo sea una linea y para que el dia que llegue
 * QC-72 migrarlo sea mover dos cadenas a un archivo de idioma (`design.md > 7.3`).
 *
 * Sin tildes, como el resto de los textos de cara al usuario del repo
 * (`lib/modules/errores/domain/error-catalog.ts`).
 */
const CREDENTIAL_SETUP_MAIL_SUBJECT = 'Establece la contrasena de tu cuenta';

/**
 * CUERPO del correo, con un **unico hueco: la URL** (`design.md > 7.3`). Mismo aviso que el asunto:
 * **copy provisional pendiente de QC-72**, pregunta abierta 2 de `requirements.md`.
 *
 * **No contiene ninguna contrasena** (R29) y no puede contenerla: la funcion no recibe ninguna. Lo
 * unico sensible que transporta es el enlace (R13).
 */
const CREDENTIAL_SETUP_MAIL_BODY = (url: string): string =>
  [
    'Hola:',
    '',
    'Se ha creado una cuenta para ti. Para poder entrar, establece tu contrasena en este enlace:',
    '',
    url,
    '',
    'El enlace caduca en 7 dias y solo se puede usar una vez.',
    'Si no esperabas este correo, puedes ignorarlo.',
  ].join('\n');

/**
 * Camino de la pagina publica donde la persona escribe su contrasena (`design.md > 4.4`, > 5.1).
 *
 * TODO QC-79 T19: mover a `lib/shared/routes.ts` como `CREDENTIAL_SETUP_ROUTE` y su helper. Hoy no
 * existe alli —T19 es la task que lo declara junto con la pagina— y esta task no crea constantes en
 * `lib/shared/`. Cuando exista, esta constante local y `credentialSetupLinkUrl` se borran y se
 * importa el helper. El transporte de buzon
 * (`credential-setup-mailer-outbox.ts`) tiene hoy la misma constante local, por la misma razon.
 */
const CREDENTIAL_SETUP_ROUTE = '/establecer-contrasena';

/** Prefijo estable del registro, para poder buscar la linea en los logs sin adivinar el texto. */
const LOG_PREFIX = '[identity]';

/**
 * La URL del enlace: base de configuracion + camino + **el secreto EN EL CAMINO**, nunca en la
 * cadena de consulta (`design.md > 4.4`). En el camino no lo escriben los registros de acceso de
 * la mayoria de los intermediarios como un parametro mas, y base64url no necesita escapado.
 *
 * La barra final de la base se recorta para no producir `//establecer-contrasena/...`.
 */
function credentialSetupLinkUrl(baseUrl: string, secret: string): string {
  return `${baseUrl.replace(/\/+$/, '')}${CREDENTIAL_SETUP_ROUTE}/${secret}`;
}

/**
 * La UNICA escritura a consola de este archivo. Recibe un `detalle` que **ya viene acotado** por
 * quien la llama: o el nombre del error del proveedor, o el mensaje que compone
 * `mail-config-env.ts` —que solo nombra variables de entorno y nunca incluye ningun valor—.
 *
 * Ni la URL, ni el secreto, ni la direccion del destinatario entran por esta firma: no hay
 * parametro por el que colarlos (R13, R29).
 */
function logMailFailure(detalle: string): void {
  console.error(`${LOG_PREFIX} fallo el envio del enlace para establecer la contrasena: ${detalle}`);
}

/**
 * Implementa `CredentialSetupMailer.sendCredentialSetupLink` (R30).
 *
 * Devuelve `'sent'` o `'failed'` y **nunca lanza**, ni siquiera cuando falta configuracion: si
 * lanzara, una caida del proveedor —o una variable sin rellenar— tumbaria el alta y dejaria al
 * administrador sin poder dar de alta a nadie, que es justo lo que la decision cerrada 7 evita.
 *
 * La configuracion se lee **en la invocacion** (R28) y su fallo se registra aparte, porque es el
 * unico caso en el que el mensaje del error SI aporta —nombra la variable que falta (R28)— y en el
 * que por construccion no puede llevar ningun valor.
 */
export async function sendCredentialSetupLink(input: {
  readonly to: string;
  readonly secret: string;
}): Promise<'sent' | 'failed'> {
  let config: ResendMailConfig;
  try {
    config = readResendMailConfigFromEnv();
  } catch (error) {
    // R28: el mensaje de `mail-config-env.ts` NOMBRA las variables que faltan y no incluye
    // ninguno de sus valores. Es el unico mensaje de error que se registra entero, y se registra
    // precisamente porque sin el nadie sabria que falta.
    logMailFailure(error instanceof Error ? error.message : 'configuracion de correo no disponible');
    return 'failed';
  }

  const url = credentialSetupLinkUrl(config.baseUrl, input.secret);

  try {
    // Dentro de la funcion, con la clave de ESTA invocacion (R28, `design.md > 7.2`).
    const client = new Resend(config.apiKey);

    const { error } = await client.emails.send({
      from: config.from,
      to: input.to,
      subject: CREDENTIAL_SETUP_MAIL_SUBJECT,
      text: CREDENTIAL_SETUP_MAIL_BODY(url),
    });

    if (error !== null) {
      // Solo el NOMBRE del codigo de error del proveedor. Su `message` puede arrastrar la
      // peticion —y con ella el destinatario o la URL—, asi que no se registra.
      logMailFailure(error.name);
      return 'failed';
    }

    return 'sent';
  } catch (error) {
    // Igual que arriba: del error inesperado solo se registra su NOMBRE. El `message` de un fallo
    // de red o de serializacion puede contener el cuerpo de la peticion, o sea la URL y con ella
    // el secreto (R13).
    logMailFailure(error instanceof Error ? error.name : 'error_desconocido');
    return 'failed';
  }
}
