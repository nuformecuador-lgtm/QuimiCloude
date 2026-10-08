// Contenido del correo del enlace para establecer la contrasena (QC-79, `design.md > 7.3`).
//
// Vive aparte de los adaptadores para que los transportes que hablan con un proveedor (`resend` y
// `smtp`) envien EXACTAMENTE el mismo asunto, el mismo cuerpo y la misma URL. Este archivo no
// importa ninguna libreria de correo ni lee el entorno: solo compone cadenas.
import { credentialSetupRoute } from '@/lib/shared/routes';

/**
 * ASUNTO del correo. **Copy provisional, pendiente de QC-72** (`internacionalizacion-de-textos`,
 * hoy `pending`): es la **pregunta abierta 2** de `requirements.md` —«que dice el correo»—, que
 * sigue SIN cerrar. No se inventa el copy definitivo: esto es el minimo funcional.
 *
 * Vive aqui, junto al cuerpo, para que cambiarlo sea una linea y para que el dia que llegue
 * QC-72 migrarlo sea mover dos cadenas a un archivo de idioma (`design.md > 7.3`).
 *
 * Sin tildes, como el resto de los textos de cara al usuario del repo
 * (`lib/modules/errores/domain/error-catalog.ts`).
 */
export const CREDENTIAL_SETUP_MAIL_SUBJECT = 'Establece la contrasena de tu cuenta';

/**
 * CUERPO del correo, con un **unico hueco: la URL** (`design.md > 7.3`). Mismo aviso que el asunto:
 * **copy provisional pendiente de QC-72**, pregunta abierta 2 de `requirements.md`.
 *
 * **No contiene ninguna contrasena** (R29) y no puede contenerla: la funcion no recibe ninguna. Lo
 * unico sensible que transporta es el enlace (R13).
 */
export const CREDENTIAL_SETUP_MAIL_BODY = (url: string): string =>
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
 * La URL del enlace: base de configuracion + el camino que compone `credentialSetupRoute`, con
 * **el secreto EN EL CAMINO** y nunca en la cadena de consulta (`design.md > 4.4`). En el camino
 * no lo escriben como un parametro mas los registros de acceso de la mayoria de los
 * intermediarios, y base64url no necesita escapado.
 *
 * El literal de la ruta vive en `lib/shared/routes.ts` (T19). Lo unico que se hace aqui es pegarle
 * delante la base, que sale de la configuracion (R28).
 *
 * La barra final de la base se recorta para no producir `//establecer-contrasena/...`.
 */
export function credentialSetupLinkUrl(baseUrl: string, secret: string): string {
  return `${baseUrl.replace(/\/+$/, '')}${credentialSetupRoute(secret)}`;
}
