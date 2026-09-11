// QC-79 — Los rechazos de FORMULARIO de una contrasena que escribio una persona: el de POLITICA
// (R2, R23) y, desde T13, el de la CONFIRMACION que no coincide. Los dos comparten archivo porque
// comparten el motivo de existir -son lo que QC-70 R31 deja FUERA del catalogo de errores- y el
// mecanismo de senalizacion; el de la confirmacion esta al final, con su porque.
//
// Dominio puro: sin `next/*`, sin `react*`, sin `@prisma/client`, sin `lib/shared/**` y sin
// adaptadores. Solo un tipo del propio `domain/` por ruta relativa.
//
// POR QUE ESTO NO VIVE EN `domain/errors.ts` Y NO DERIVA DE `IdentityError`, que es lo que R34
// pediria para «cada fallo nuevo». Las dos mitades de la respuesta estan escritas en el diseno:
//
//   1. **No es un error del catalogo, y no puede serlo** (`design.md > 11.3`): lo que la persona
//      necesita para corregir son las REGLAS INCUMPLIDAS, y el unico hueco de `ErrorState` para
//      datos variables es el `diagnostic`, que QC-70 R29 manda al registro del servidor y prohibe
//      serializar al navegador -con su guardia poniendose roja si alguien lo lee desde `app/**`-.
//      Un formulario que solo dijera «contrasena invalida» es inservible.
//   2. **Por eso el fallo de politica es una VARIANTE PROPIA del estado de formulario**
//      (`design.md > 5.3`: `{ status: 'invalid_credential'; unmet }`) y no un `ErrorState`, que es
//      ademas lo que QC-70 R31 deja explicitamente fuera del catalogo: las comprobaciones de
//      formulario no entran en el.
//
// Y por eso tampoco entra en `errors.ts`: la guardia `guard-catalogo-de-errores` exige que **toda**
// clase de ese archivo derive de la base del modulo (caso 4) y que todo `readonly code` que declare
// este en el catalogo (caso 1). Meterla ahi obligaria a inventarle un codigo de catalogo que el
// diseno descarto por escrito. Se respeta la regla en vez de aflojar la guardia.
//
// Los codigos de `CredentialRule` son estables e independientes del idioma (QC-19 R23): cruzan al
// navegador sin decir nada de la candidata, y la UI compone el texto. **Nunca viaja aqui la
// contrasena ni un fragmento suyo** (QC-19 R24, QC-79 R5).

import type { CredentialRule } from './credential-policy';

/**
 * La politica de QC-19 rechazo la contrasena. Se lanza **antes de escribir nada** (R2): cuando esto
 * llega, no se creo ninguna fila, no se emitio ningun enlace y no se envio ningun correo; y en el
 * caso de uso publico de R23, el enlace **sigue vivo** para volver a intentarlo.
 */
export class CredentialPolicyRejectedError extends Error {
  /** Los codigos del catalogo de QC-19 que la candidata no cumple, en el orden estable de R8. */
  readonly unmet: readonly CredentialRule[];

  constructor(unmet: readonly CredentialRule[]) {
    // El texto es fijo y no se pasa desde fuera, mismo criterio que QC-70 R24 con el catalogo: la
    // frase que ve una persona la compone la UI a partir de `unmet`, no este mensaje.
    super('la contrasena no cumple la politica de credenciales');
    this.unmet = unmet;
    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * QC-79 T13 — LA CONFIRMACION NO COINCIDE CON LA CONTRASENA (`design.md > 5.2`, `> 5.3`).
 *
 * ## Por que esta clase, y no un valor de retorno
 *
 * El desacuerdo de la confirmacion **no es un error del catalogo de QC-70**: R31 de esa ficha deja
 * las comprobaciones de formulario explicitamente fuera, asi que no tiene -ni puede tener- un
 * `code`, y por eso no vive en `errors.ts` ni deriva de `IdentityError` (ver la cabecera de este
 * archivo: la guardia `guard-catalogo-de-errores` exige que toda clase de aquel archivo tenga su
 * codigo en el catalogo).
 *
 * Y se senala **igual que el rechazo por politica: lanzando**, y no devolviendo un
 * `'ok' | 'mismatch'`. Son la MISMA categoria de fallo -las dos son comprobaciones de formulario
 * que no entran en el catalogo- y darles dos mecanismos distintos obligaria al adaptador driving a
 * mirar en dos sitios para lo mismo: primero el valor devuelto, despues el `catch`. Con las dos
 * lanzando, la Server Action tiene **un solo** lugar donde reparte, con tres ramas hermanas
 * -`CredentialConfirmationMismatchError` -> `{ status: 'mismatch' }`,
 * `CredentialPolicyRejectedError` -> `{ status: 'invalid_credential', unmet }`, e `IdentityError`
 * -> el traductor unico de QC-70-, y el caso de uso puede devolver `void`: sin ningun campo en el
 * retorno no hay hueco donde colar el secreto ni la contrasena (`design.md > 4.7` punto 2, R5).
 *
 * ## Lo que esta clase NO lleva
 *
 * **Ni la contrasena, ni la confirmacion, ni un fragmento de ninguna de las dos, ni sus largos**
 * (R5, QC-19 R24): un largo es informacion sobre la contrasena y no ayuda a nadie a corregir. Que
 * no coincidieron es todo lo que hay que decir.
 */
export class CredentialConfirmationMismatchError extends Error {
  constructor() {
    // Texto fijo y no pasado desde fuera, mismo criterio que arriba: la frase que ve una persona
    // la compone la UI a partir del `status`, no este mensaje.
    super('la confirmacion no coincide con la contrasena');
    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
