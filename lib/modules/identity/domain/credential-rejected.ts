// QC-79 — Los rechazos de FORMULARIO de una contrasena que escribio una persona: el de POLITICA
// (R2, R23) y, desde T13, el de la CONFIRMACION que no coincide. Los dos comparten archivo porque
// comparten el motivo de existir -no caben en el catalogo de errores de QC-70 por su R29, ver
// abajo- y el mecanismo de senalizacion; el de la confirmacion esta al final, con su porque.
//
// Dominio puro: sin `next/*`, sin `react*`, sin `@prisma/client`, sin `lib/shared/**` y sin
// adaptadores. Solo un tipo del propio `domain/` por ruta relativa.
//
// AVISO: LA LETRA DE QC-79 R34 **NO SE CUMPLE** PARA LAS DOS CLASES DE ESTE ARCHIVO.
// R34 pide que cada fallo nuevo se senale con una clase derivada de `IdentityError` cuyo `code`
// este en el catalogo cerrado de QC-70. `CredentialPolicyRejectedError` y
// `CredentialConfirmationMismatchError` **no derivan de `IdentityError` y no tienen `code`**: para
// ellas R34 no se cumple, ni por asomo ni «en espiritu». Es una **excepcion declarada**, no una
// regla cumplida, y esta escrita con nombre y archivo en `design.md > 11.3`; leela antes de
// «arreglar» esto. El porque, en dos mitades:
//
//   1. **No es un error del catalogo, y no puede serlo** (`design.md > 11.3`): lo que la persona
//      necesita para corregir son las REGLAS INCUMPLIDAS, y el unico hueco de `ErrorState` para
//      datos variables es el `diagnostic`, que **QC-70 R29** manda al registro del servidor y
//      prohibe serializar al navegador -solo `status`, `code`, `message` y `reference` cruzan-. Su
//      guardia es **QC-70 R30**, que se pone roja nombrando el archivo si alguien anade ese campo a
//      la forma serializada o lo lee desde `app/**` o `components/**`. Sin las reglas incumplidas
//      en la mano, un formulario que solo dijera «contrasena invalida» es inservible.
//   2. **Por eso el fallo de politica es una VARIANTE PROPIA del estado de formulario**
//      (`design.md > 5.3`: `{ status: 'invalid_credential'; unmet }`) y no un `ErrorState`.
//
// (Lo que **no** sostiene esta decision, y se cito mal aqui hasta hoy, es **QC-70 R31**: ese
// requisito es de no-injerencia sobre el FRONT -no toca los mensajes que la UI escribe para sus
// propias comprobaciones de formulario- y no dice nada de un rechazo de BACKEND.)
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
 * El desacuerdo de la confirmacion **no entra en el catalogo de QC-70** por el mismo motivo que el
 * rechazo por politica (`design.md > 11.3`): lo que la persona necesita para corregir son datos
 * variables del formulario, y **QC-70 R29** prohibe que el `diagnostic` -el unico hueco de
 * `ErrorState` para datos variables- se serialice hacia el navegador, con **QC-70 R30** como
 * guardia que da rojo nombrando el archivo si se anade a la forma serializada o se lee desde
 * `app/**` o `components/**`. Por eso no tiene `code` y no vive en `errors.ts` ni deriva de
 * `IdentityError` (ver la cabecera: la guardia `guard-catalogo-de-errores` exige que toda clase de
 * aquel archivo tenga su codigo en el catalogo). **Esto es la excepcion declarada a la letra de
 * QC-79 R34** descrita en la cabecera y en `design.md > 11.3`, no un cumplimiento suyo.
 *
 * Y se senala **igual que el rechazo por politica: lanzando**, y no devolviendo un
 * `'ok' | 'mismatch'`. Son la MISMA categoria de fallo -las dos son comprobaciones de formulario
 * resueltas en el backend que no entran en el catalogo- y darles dos mecanismos distintos
 * obligaria al adaptador driving a mirar en dos sitios para lo mismo: primero el valor devuelto,
 * despues el `catch`. Con las dos lanzando, la Server Action tiene **un solo** lugar donde
 * reparte, con tres ramas hermanas
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
