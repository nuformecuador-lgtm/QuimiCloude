// QC-79 T13 — ESTABLECER LA CONTRASENA CON EL ENLACE (`design.md > 4.6`, `> 5.2`, `> 5.3`).
//
// Cubre R18, R19, R21, R22 y R23.
//
// Dominio puro (R32): sin `next/*`, sin `react*`, sin `@prisma/client`, sin `lib/shared/**`, sin
// adaptadores y sin el barrel del propio modulo. Todo lo que hace falta -la huella del secreto, la
// lista de credenciales filtradas, el hash y la escritura atomica- entra por PUERTOS o por
// funciones inyectadas, y quien los ata es `lib/composition` y nadie mas.
//
// **ESTE ES EL UNICO CASO DE USO DEL MODULO SIN ACTOR, y no es un olvido: es R18.** No recibe
// `Actor`, no llama a `requirePermission`, no lee `next/headers`, ninguna cookie y ninguna
// cabecera. El UNICO credencial que acepta es el secreto del enlace, y por eso una sesion abierta
// de otra persona no cambia su resultado. Si alguien anade aqui un parametro de actor o una
// lectura de sesion, esta convirtiendo una pagina publica en una que depende de quien la mire.
//
// **No hay `companyId` por ningun lado, y tambien es correcto** (`design.md > 4.6`): aqui no hay
// actor del que sacarlo, y el ambito lo da el propio secreto, que apunta a un `user_id` concreto.
import {
  CredentialConfirmationMismatchError,
  CredentialPolicyRejectedError,
} from './credential-rejected';
import { setCredentialWithLinkSchema } from './credential-setup-input';
import { CredentialLinkInvalidError, ValidationError } from './errors';

import type { CredentialPolicyResult } from './credential-policy';

import type { CredentialSetupLinkRepository } from '../ports/credential-setup-link-repository';
import type { CredentialSetupSecretFactory } from '../ports/credential-setup-secret-factory';
import type { PasswordHasher } from '../ports/password-hasher';

export type SetCredentialWithLinkDeps = {
  /**
   * R23: la politica COMPLETA de QC-19 -las seis reglas propias mas la lista de filtradas-,
   * inyectada como funcion igual que en `create-user.ts`. **Es la MISMA `checkCredentialPolicy`
   * que ya cablea `lib/composition`, no una segunda**: el enlace no es una puerta lateral a la
   * politica, y dos politicas distintas seria exactamente eso.
   */
  readonly checkCredentialPolicy: (candidate: string) => Promise<CredentialPolicyResult>;
  /** QC-5 (R19): la contrasena se persiste SOLO como su hash. */
  readonly passwordHasher: PasswordHasher;
  /**
   * De esta fabrica aqui se usa **solo `digestOf`**: el secreto llega de la URL y lo que hace falta
   * es su huella para poder compararla (R9). No se genera ningun secreto en este camino.
   */
  readonly secrets: CredentialSetupSecretFactory;
  /** R19, R20, R22: consumo + credencial + activacion, en UNA escritura atomica. */
  readonly links: CredentialSetupLinkRepository;
  /**
   * El instante entra como dependencia INYECTABLE, con `() => new Date()` por defecto, para que el
   * test lo fije sin tocar el reloj global. No se lee de ninguna sesion ni de ninguna cabecera.
   */
  readonly now?: () => Date;
};

/**
 * Establece la contrasena de una cuenta `pending` usando el secreto que llego por el correo.
 *
 * ## El orden, que es el requisito
 *
 *   1. **`zod`** sobre la entrada (R33). Aqui **no** hay permiso que comprobar antes, a diferencia
 *      de los casos de uso con actor: R18 dice que esta operacion no exige ninguno.
 *   2. **La confirmacion**, que es puro papel y no cuesta ninguna IO. Va antes que la politica a
 *      proposito: decirle a alguien que su contrasena es debil cuando lo que hizo fue teclear mal
 *      la confirmacion es ruido, y ademas la politica consulta la lista de filtradas, que es una
 *      llamada que no hace falta pagar para saber que las dos cajas no coinciden.
 *   3. **La politica COMPLETA de QC-19, ANTES de escribir nada** (R23). Si la rechaza se lanza con
 *      las reglas incumplidas y **no se modifica ninguna fila**: no se llega a llamar a
 *      `applyCredentialAndActivate`, asi que **el enlace SIGUE VIVO** y la persona puede volver a
 *      intentarlo con otra contrasena. Es la mitad que hace cierta la frase «el enlace NO DEBE ser
 *      una puerta lateral a la politica».
 *   4. **El hash** (QC-5) y la escritura atomica de `design.md > 4.6`.
 *
 * ## Lo que NO se toca
 *
 * **La marca de cambio de credencial (`must_change_credential`) no se modifica** — R21, y la
 * pregunta abierta **P3** de `requirements.md`. P3 propone bajarla, porque la contrasena la eligio
 * la propia persona y nadie mas la conoce; **mientras P3 siga abierta manda R21** (regla 6 de
 * `CLAUDE.md`: no se rellena una decision con un supuesto) y la marca se queda exactamente como
 * nacio. Hoy su consecuencia es nula medible: ningun archivo de `lib/`, `app/` ni `middleware.ts`
 * la lee. Que no se toque no es una omision de este archivo: el puerto
 * `applyCredentialAndActivate` **no tiene ningun parametro** con el que escribirla, asi que cerrar
 * P3 sera anadir esa columna a la misma escritura de § 4.6 y un caso de test, sin migracion. **No
 * la bajes aqui sin cerrar P3 antes.**
 *
 * ## El secreto y la contrasena no salen de aqui (R5, R13)
 *
 * El caso de uso devuelve `void` -no hay nada que devolver, y sin campos no hay hueco donde colar
 * ninguno de los dos (`design.md > 4.7` punto 2)-, ningun error lleva el secreto ni un fragmento
 * suyo, y en este archivo no hay -ni puede haber- ninguna escritura a la consola.
 */
export function createSetCredentialWithLink(
  deps: SetCredentialWithLinkDeps,
): (input: unknown) => Promise<void> {
  const now = deps.now ?? ((): Date => new Date());

  return async function setCredentialWithLink(input: unknown): Promise<void> {
    const parsed = setCredentialWithLinkSchema.safeParse(input);
    if (!parsed.success) throw new ValidationError();

    const { secret, credential, credentialConfirmation } = parsed.data;

    // Comparacion exacta y sin normalizar ninguna de las dos (QC-19 R10): si la persona escribio un
    // espacio al final en una caja y no en la otra, no coinciden, porque ese espacio es parte de la
    // contrasena que se iba a guardar.
    if (credential !== credentialConfirmation) throw new CredentialConfirmationMismatchError();

    const politica = await deps.checkCredentialPolicy(credential);
    // R23: ninguna fila se modifica y el enlace sigue vivo. `unmet` son codigos del catalogo de
    // QC-19, estables e independientes del idioma; nunca la candidata ni un fragmento suyo.
    if (!politica.ok) throw new CredentialPolicyRejectedError(politica.unmet);

    const credentialHash = await deps.passwordHasher.hash(credential);

    // El secreto no cruza el puerto de persistencia en ningun caso (R9, R13): lo que viaja es su
    // huella, que es lo unico que hay en la base.
    const resultado = await deps.links.applyCredentialAndActivate({
      digest: deps.secrets.digestOf(secret),
      credentialHash,
      now: now(),
    });

    // R22 — **LOS SEIS CASOS, EL MISMO ERROR.** El enlace no existe, caduco, ya se consumio, lo
    // sustituyo un reenvio, la cuenta esta borrada o la cuenta ya no esta en `pending`: el puerto
    // devuelve `'invalid'` para los seis -no tiene otra cosa que devolver, y eso es deliberado
    // (`design.md > 4.8`)- y aqui se lanza UNA sola clase, con UN solo `code` y UN solo mensaje.
    // Distinguirlos convertiria el enlace en un oraculo: probando secretos se sabria si existen y,
    // sabiendo uno viejo, si la cuenta ya se activo. **Sin `diagnostic`**: lo unico que se podria
    // poner aqui es el secreto o su huella, y R13 lo prohibe.
    if (resultado === 'invalid') throw new CredentialLinkInvalidError();
  };
}
