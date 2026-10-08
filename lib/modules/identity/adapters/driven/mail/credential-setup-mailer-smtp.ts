// Adaptador driven de `CredentialSetupMailer` por SMTP con `nodemailer`. TEMPORAL: permite enviar
// el enlace con una cuenta de Gmail u Outlook mientras no hay dominio verificado para `resend`.
// Se elige con `MAIL_TRANSPORT=smtp`; el transporte por defecto sigue siendo `resend`.
//
// **UNICO archivo del repositorio que importa `nodemailer`**. Lo vigila
// `tests/guards/guard-envio-de-correo.test.ts`, igual que a `resend`: quitar este transporte es
// borrar este archivo y una rama de `lib/composition`.
//
// Sostiene las mismas tres invariantes que `credential-setup-mailer-resend.ts`:
//
//   1. **El transporte se construye DENTRO de la funcion**, con la configuracion leida en ese
//      momento (R28). Importar este modulo no lee el entorno ni abre ninguna conexion.
//   2. **No lanza nunca** (R30): un fallo del servidor SMTP es un VALOR, `'failed'`. El error se
//      MANEJA —se registra— y se COMUNICA como resultado.
//   3. **La linea de registro no lleva la URL, ni el secreto, ni el correo del destinatario**
//      (R13, R29): solo el codigo del error de `nodemailer` (`EAUTH`, `ECONNECTION`...) o su nombre.
import nodemailer from 'nodemailer';

import { readSmtpMailConfigFromEnv } from '../config/mail-config-env';
import {
  CREDENTIAL_SETUP_MAIL_BODY,
  CREDENTIAL_SETUP_MAIL_SUBJECT,
  credentialSetupLinkUrl,
} from './credential-setup-mail-content';

import type { SmtpMailConfig } from '../config/mail-config-env';

/** Prefijo estable del registro, el mismo que el del adaptador de `resend`. */
const LOG_PREFIX = '[identity]';

/**
 * La UNICA escritura a consola de este archivo. El `detalle` ya viene acotado: o el codigo/nombre
 * del error, o el mensaje de `mail-config-env.ts`, que solo nombra variables y nunca sus valores.
 */
function logMailFailure(detalle: string): void {
  console.error(
    `${LOG_PREFIX} fallo el envio (smtp) del enlace para establecer la contrasena: ${detalle}`,
  );
}

/**
 * Del error solo sale su `code` (cadena corta y estable que pone `nodemailer`) o, si no lo trae,
 * su NOMBRE. El `message` puede arrastrar la respuesta del servidor con el destinatario, asi que
 * no se registra.
 */
function errorDetail(error: unknown): string {
  if (error instanceof Error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === 'string' && /^[A-Z_]+$/.test(code) ? code : error.name;
  }
  return 'error_desconocido';
}

/**
 * Implementa `CredentialSetupMailer.sendCredentialSetupLink` (R30). Devuelve `'sent'` o
 * `'failed'` y **nunca lanza**, ni siquiera cuando falta configuracion.
 */
export async function sendCredentialSetupLink(input: {
  readonly to: string;
  readonly secret: string;
}): Promise<'sent' | 'failed'> {
  let config: SmtpMailConfig;
  try {
    config = readSmtpMailConfigFromEnv();
  } catch (error) {
    // El mensaje de `mail-config-env.ts` NOMBRA las variables que faltan y no incluye sus valores.
    logMailFailure(error instanceof Error ? error.message : 'configuracion de correo no disponible');
    return 'failed';
  }

  const url = credentialSetupLinkUrl(config.baseUrl, input.secret);

  try {
    // Dentro de la funcion, con la configuracion de ESTA invocacion (R28).
    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: { user: config.user, pass: config.pass },
    });

    await transporter.sendMail({
      from: config.from,
      to: input.to,
      subject: CREDENTIAL_SETUP_MAIL_SUBJECT,
      text: CREDENTIAL_SETUP_MAIL_BODY(url),
    });

    return 'sent';
  } catch (error) {
    logMailFailure(errorDetail(error));
    return 'failed';
  }
}
