'use server';

import { revalidatePath } from 'next/cache';

import { identity, observabilidad } from '@/lib/composition';
import { createErrorStateTranslator, type ErrorState } from '@/lib/modules/errores';
import {
  CredentialConfirmationMismatchError,
  CredentialPolicyRejectedError,
  IdentityError,
  type Actor,
  type CredentialRule,
} from '@/lib/modules/identity';
// La ruta de la pagina publica de R17, para revalidarla despues de establecer la contrasena. Ya no
// es una constante local: T19 la publico en `lib/shared/routes.ts` junto con la pagina, y es el
// mismo literal del que cuelgan los dos transportes de correo al armar la URL del enlace.
import { CREDENTIAL_SETUP_ROUTE } from '@/lib/shared/routes';

/**
 * QC-79 T18 — Las DOS Server Actions del enlace con el que una persona establece su contrasena
 * (`design.md > 5.3`). Cubre R14, R18, R30, R33 y R34.
 *
 * FORMA DE ENTRADA: las dos reciben **`FormData`** (R33), porque las dos salen de un formulario.
 * El esquema `zod` vive en el CASO DE USO (`domain/credential-setup-input.ts`) y este archivo NO
 * lo repite: extrae los campos **tal cual llegan** y deja que el dominio decida. Ni un `trim`, ni
 * una conversion, ni un valor por defecto —QC-19 R10 prohibe expresamente normalizar la
 * candidata, y un espacio al final es parte de la contrasena—.
 *
 * **ESTAS ACTIONS NO DECIDEN NADA** (R18, R23): no repiten `requirePermission`, no comparan la
 * confirmacion, no evaluan la politica y no interpretan el secreto. Traducen entrada y resultado,
 * que es todo lo que hace un adaptador driving.
 *
 * ## La asimetria del actor, que es el requisito
 *
 * - `setCredentialWithLinkAction` **NO RESUELVE ACTOR** (R18): no llama a `getSessionUser`, no
 *   llama a `getSessionContext`, no lee ninguna cookie y no lee ninguna cabecera de identidad. El
 *   UNICO credencial que acepta es el secreto del enlace, que llega en un campo OCULTO del
 *   formulario. Por eso una sesion abierta de otra persona no cambia su resultado, y por eso el
 *   caso de uso que invoca es el unico del modulo cuya firma no tiene `Actor`. **Si alguien anade
 *   aqui una lectura de sesion para «reusar el patron», convierte una pagina publica en una que
 *   depende de quien la mire.**
 * - `resendCredentialSetupLinkAction` **SI** resuelve el actor, y de LAS DOS CARAS de la sesion,
 *   exactamente como las seis de `user-actions.ts` (R14): `getSessionUser()` da el identificador y
 *   el conjunto de permisos, `getSessionContext()` da la EMPRESA. Ver `currentActor()` abajo.
 *
 * ## Errores (R34)
 *
 * La traduccion la hace el **traductor UNICO** de QC-70 (`createErrorStateTranslator`), el mismo
 * que usa `user-actions.ts`: **aqui no se escribe ninguna segunda traduccion** de error a estado
 * serializable —la guardia del catalogo da rojo si alguien declara otra—. El error inesperado
 * vuelve con su mensaje neutro y con su `reference` de QC-71, y el detalle real va al registro del
 * servidor y solo ahi. Ningun `catch` descarta un error: los dos rechazos de FORMULARIO se
 * reparten por su clase y **todo lo demas** cae en el traductor.
 *
 * Los dos rechazos de formulario —la confirmacion que no coincide y la politica de QC-19— no son
 * errores del catalogo, y eso lo decidio `design.md > 11.3`: lo que la persona necesita para
 * corregir son las REGLAS INCUMPLIDAS, y el unico hueco de `ErrorState` para datos variables es el
 * `diagnostic`, que QC-70 R29 manda al registro y prohibe serializar al navegador. Por eso son
 * VARIANTES PROPIAS del estado de formulario.
 *
 * ## El secreto no sale por aqui (R5, R13)
 *
 * Ninguno de los dos estados tiene un campo donde quepa: `SetCredentialFormState` no devuelve
 * ningun dato y `ResendLinkFormState` devuelve solo `'sent' | 'failed'`. El secreto entra por el
 * `FormData`, viaja al caso de uso y no vuelve; **este archivo no tiene ningun `console.*`** y
 * ningun mensaje de error lo nombra.
 *
 * Estas dos actions NO se reexportan desde `index.ts` (R32): el contrato del modulo solo reexporta
 * de `./domain`, y un `'use server'` en su cierre transitivo romperia a cualquier componente de
 * cliente que importe el barrel. La pagina publica de T19 las importa por su RUTA EXACTA.
 */

/**
 * Estado serializable de la pagina PUBLICA (`design.md > 5.3`, literal).
 *
 * `invalid_credential` **no es un `ErrorState`, y es una decision** (`design.md > 11.3`): los
 * codigos de `CredentialRule` son estables e independientes del idioma (QC-19 R23), no dicen nada
 * de la candidata, y la UI compone el texto con ellos. `mismatch` no lleva ningun dato: que no
 * coincidieron es todo lo que hay que decir, y un largo ya seria informacion sobre la contrasena.
 *
 * **No hay ninguna variante que devuelva datos del usuario** (R24): la pagina no muestra nombre,
 * correo, nombre de usuario, rol ni empresa en ningun instante, y aqui no existe el hueco por el
 * que podrian llegar.
 */
export type SetCredentialFormState =
  | { status: 'idle' }
  | { status: 'success' }
  | { status: 'invalid_credential'; unmet: readonly CredentialRule[] }
  | { status: 'mismatch' }
  | ErrorState;

/**
 * Estado serializable del REENVIO (`design.md > 5.3`, literal).
 *
 * `mail` distingue `'sent'` de `'failed'`, y distinguirlos **es** R30: con `'failed'` el enlace
 * quedo emitido y vivo pero el correo no salio, y QC-67 puede decirlo y ofrecer reenviar otra vez.
 * No lleva el correo del destinatario: es PII y quien reenvia ya lo ve en el listado.
 */
export type ResendLinkFormState =
  | { status: 'idle' }
  | { status: 'success'; mail: 'sent' | 'failed' }
  | ErrorState;

// NO se exporta ninguna constante `INITIAL_STATE`: un archivo con `'use server'` solo puede
// exportar funciones async (restriccion real de Next.js), asi que quien las consuma (T19)
// construye el literal `{ status: 'idle' }` con los tipos de arriba.

/**
 * El traductor UNICO de QC-70, parametrizado con la clase base de este modulo (R10 de aquella
 * ficha). Es la MISMA fabrica que usa `user-actions.ts`: no hay una segunda traduccion escrita a
 * mano en ningun sitio, y la guardia del catalogo da rojo si alguien vuelve a declarar una.
 */
const toErrorState = createErrorStateTranslator(IdentityError, observabilidad.readRequestIdHeader);

/**
 * El actor del REENVIO, resuelto de LAS DOS CARAS de la sesion del servidor (R14), byte a byte
 * como `currentActor()` de `user-actions.ts` y de `unidades/adapters/driving/unit-actions.ts`:
 * `getSessionUser()` da el id y el conjunto de permisos, `getSessionContext()` da la EMPRESA. La
 * empresa sale del contexto de sesion y **NUNCA** de la entrada del llamante (R15).
 *
 * **Falla cerrado**: si falta CUALQUIERA de las dos, el actor es `null` —no se adivina y no se
 * rellena—, y con actor `null` `requirePermission` rechaza en la primera linea del caso de uso,
 * antes de validar la entrada, antes de fabricar ningun secreto y antes de tocar ningun puerto.
 *
 * **Esta funcion NO la usa la action publica**, y esa ausencia es R18.
 */
async function currentActor(): Promise<Actor | null> {
  const [sessionUser, sessionContext] = await Promise.all([
    identity.getSessionUser(),
    identity.getSessionContext(),
  ]);
  if (sessionUser === null || sessionContext === null) return null;
  return {
    id: sessionUser.id,
    companyId: sessionContext.companyId,
    permissions: sessionUser.permissions,
  };
}

/**
 * ESTABLECER LA CONTRASENA CON EL ENLACE (R17, R18, R19, R23, R33). **Publica: sin sesion.**
 *
 * Los tres campos viajan **TAL CUAL** los entrega `FormData`: el secreto del campo oculto que
 * escribio la pagina con el segmento de la URL, la contrasena y su confirmacion. Si una clave
 * falta, `get` devuelve `null` y el candidato lleva `null`; quien lo rechaza es
 * `setCredentialWithLinkSchema` (`min(1)`), no esta action.
 *
 * `revalidatePath` es de **su propia ruta y de ninguna otra** (`design.md > 5.3`): esta ficha no
 * crea ninguna otra pantalla —la de usuarios es QC-67— y revalidar una ruta que no existe seria
 * inventarla (regla 6 de `CLAUDE.md`).
 */
export async function setCredentialWithLinkAction(
  _prevState: SetCredentialFormState,
  formData: FormData,
): Promise<SetCredentialFormState> {
  try {
    await identity.setCredentialWithLink({
      secret: formData.get('secret'),
      credential: formData.get('credential'),
      credentialConfirmation: formData.get('credentialConfirmation'),
    });
    revalidatePath(CREDENTIAL_SETUP_ROUTE);
    return { status: 'success' };
  } catch (error) {
    // Las tres ramas hermanas de `credential-rejected.ts`: los dos rechazos de FORMULARIO por su
    // clase, y **todo lo demas** —incluida la respuesta unica e indistinguible de los seis casos
    // de R22— por el traductor unico. Ningun error se descarta y ninguno se traduce dos veces.
    if (error instanceof CredentialConfirmationMismatchError) return { status: 'mismatch' };
    if (error instanceof CredentialPolicyRejectedError) {
      return { status: 'invalid_credential', unmet: error.unmet };
    }
    return toErrorState(error);
  }
}

/**
 * REENVIAR EL ENLACE (R14, R15, R16, R30). Exige `usuarios.modificar`, y quien lo exige es el
 * caso de uso en su primera linea: esta action no lo repite.
 *
 * El identificador del usuario objetivo viaja como campo del formulario y se pasa **sin juzgarlo**
 * —igual que `readTargetId` en `user-actions.ts`—: un `userId` ausente llega como `null` y el
 * dominio responde `invalid_input`. Decidir aqui otra cosa seria decidir en el borde.
 *
 * **Sin `revalidatePath`**: el reenvio no cambia nada que se vea en la pagina publica, y la
 * pantalla que lo ofrecera es la de QC-67, que todavia no existe. Quien decida que revalida es
 * QC-67.
 */
export async function resendCredentialSetupLinkAction(
  _prevState: ResendLinkFormState,
  formData: FormData,
): Promise<ResendLinkFormState> {
  const actor = await currentActor();

  try {
    const { mail } = await identity.issueCredentialSetupLink(actor, {
      userId: formData.get('userId'),
    });
    return { status: 'success', mail };
  } catch (error) {
    return toErrorState(error);
  }
}
