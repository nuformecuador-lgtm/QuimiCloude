// QC-79 T13/T14 — Esquemas de entrada de las DOS operaciones nuevas (`design.md > 5.2`).
//
// Validacion con **zod en el borde** (R33): ningun dato sin validar ni tipar cruza hacia el
// dominio, y quien valida es el propio caso de uso -no la Server Action-, para que el seed, un
// test de integracion o la pantalla de manana no tengan cada uno su propia idea de que es una
// entrada valida.
//
// Dominio puro (R32): aqui solo entra `zod`. Sin `next/*`, sin `react*`, sin `@prisma/client`, sin
// `lib/shared/**`, sin adaptadores y sin el barrel del propio modulo -que crearia un ciclo-.
//
// **LO QUE NO ESTA EN ESTOS ESQUEMAS ES EL REQUISITO**, y `strictObject` hace que mandarlo FALLE
// en vez de ignorarlo en silencio:
//
//   - En `setCredentialWithLinkSchema` no hay **ningun** identificador de usuario, de empresa ni
//     de sesion, y eso es **R18 escrito en el tipo**: el UNICO credencial que acepta la operacion
//     publica es el secreto del enlace, y el ambito lo da el propio secreto, que apunta a un
//     `user_id` concreto (`design.md > 4.6`). Si el esquema admitiera un `userId`, cualquiera con
//     un enlace podria apuntarlo a otra persona.
//   - En `resendCredentialSetupLinkSchema` no hay `companyId`: el ambito del reenvio sale del
//     ACTOR y de ningun otro sitio (R15), igual que en las seis operaciones de QC-66.

import { z } from 'zod';

/**
 * Lo que manda la pagina publica de R17: el secreto que venia en la URL, la contrasena nueva y su
 * confirmacion (`design.md > 5.2`, literal).
 *
 * **Sin `trim` y sin `max` en las dos contrasenas, a proposito**: QC-19 R10 prohibe recortar o
 * normalizar la candidata -un espacio al final es parte de la contrasena- y el maximo lo pone la
 * propia politica (`max_length`, QC-19 R11), no un segundo numero escrito aqui que pudiera
 * divergir de ella. El `min(1)` no es politica: es «el campo llego vacio».
 *
 * **La confirmacion se compara en el DOMINIO, no aqui** (ver `credential-rejected.ts`): un `refine`
 * la convertiria en un fallo de `zod` indistinguible de «faltaba un campo», y R23 y
 * `design.md > 5.3` piden que la persona sepa cual de las dos cosas le paso.
 */
export const setCredentialWithLinkSchema = z.strictObject({
  secret: z.string().min(1),
  credential: z.string().min(1),
  credentialConfirmation: z.string().min(1),
});

/**
 * Lo que manda el reenvio de R14: **solo** a quien se le reenvia. La empresa la pone el actor y el
 * plazo lo pone el reloj del servidor; ninguno de los dos es una entrada del llamante.
 */
export const resendCredentialSetupLinkSchema = z.strictObject({ userId: z.string().uuid() });

export type SetCredentialWithLinkInput = z.infer<typeof setCredentialWithLinkSchema>;
export type ResendCredentialSetupLinkInput = z.infer<typeof resendCredentialSetupLinkSchema>;
