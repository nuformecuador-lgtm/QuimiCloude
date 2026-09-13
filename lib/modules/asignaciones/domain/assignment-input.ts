/**
 * QC-87 T6 — El BORDE de `asignaciones`: los TRES esquemas de entrada de las operaciones de
 * escritura (`design.md > 1` y `> 7`).
 *
 * Validacion con **zod en el borde** (R42): ningun dato sin validar ni tipar cruza hacia el caso de
 * uso, y la Server Action y —manana— el formulario de QC-102 validan con el MISMO esquema, porque
 * vive en `domain/` y lo reexporta el contrato del modulo. El rechazo ocurre **sin tocar ningun
 * puerto**, y el caso de uso lo traduce a `ValidationError` (`invalid_input`).
 *
 * Nombres en INGLES —archivo, simbolos y campos— (R44): son los mismos que la Server Action lee del
 * `FormData` (`orderId`, `userIds`, `workGroupIds`, `userId`, `workGroupId`).
 *
 * La CONSULTA no tiene esquema aqui a proposito: recibe `orderId` ya tipado y no viene de un
 * `<form>` (R41).
 *
 * **LO QUE NO ESTA EN ESTOS ESQUEMAS ES EL REQUISITO**, y `strictObject` hace que mandarlo FALLE en
 * vez de ignorarlo en silencio:
 *
 *   - `companyId` — **R5**: la empresa de cada fila sale DEL ACTOR y de ningun otro sitio. No hay
 *     forma de escribir una asignacion en una empresa distinta.
 *   - `origin`, `workGroupName` — **R28**: el origen y el nombre congelado los pone el caso de uso
 *     en la misma escritura que crea la fila; que entraran por el borde permitiria congelar un
 *     nombre que el grupo nunca tuvo.
 *   - `now` — **R21**: el instante entra por parametro del caso de uso, no por la entrada del
 *     llamante, que si no podria elegir que miembros le parecen `active`.
 *   - **cualquier lista en el desasignar** — **R31**: ver abajo.
 *
 * Dominio puro: el unico import es `zod`. Nada de `next/*`, `@prisma/client` ni adaptadores.
 */

import { z } from 'zod';

/** Lo que viaja como identificador es un UUID de la base. Misma forma que `identity`. */
const idSchema = z.string().uuid();

/**
 * Una lista de identificadores **sin repetir**. El duplicado se RECHAZA en vez de deduplicarse en
 * silencio: `['a', 'a']` mandado por quien llama es una entrada mal construida, y tragarla dejaria
 * que el conteo de personas anadidas (R16) no correspondiera a lo pedido. La deduplicacion que SI
 * hace el sistema es otra cosa y vive en el caso de uso: la de la misma persona llegando por dos
 * CAMINOS distintos —suelta y por grupo— (R24).
 *
 * La lista puede venir VACIA: `formData.getAll('workGroupIds')` de un formulario donde no se marco
 * ningun grupo devuelve `[]`, y eso es legitimo mientras la otra lista traiga algo. Lo que no se
 * admite es que falten las dos (ver `assignResponsiblesSchema`) ni que la clave no venga.
 */
const uniqueIdListSchema = z
  .array(idSchema)
  .refine((ids) => new Set(ids).size === ids.length, {
    message: 'la lista no admite identificadores repetidos',
  });

/**
 * Asignar responsables (R14, R24, R42): el pedido, las personas sueltas y los grupos, en UNA sola
 * operacion. Las dos listas son OBLIGATORIAS —una lista ausente es entrada invalida, R42— y al
 * menos una de las dos tiene que traer algo: una operacion sin ninguna persona y sin ningun grupo
 * no es «asignar cero», es una peticion mal formada, y pasarla adelante gastaria una transaccion
 * para no hacer nada.
 *
 * La comprobacion va en el OBJETO y no en cada lista porque la condicion es conjunta: cual de las
 * dos trae el contenido da igual.
 */
export const assignResponsiblesSchema = z
  .strictObject({
    orderId: idSchema,
    userIds: uniqueIdListSchema,
    workGroupIds: uniqueIdListSchema,
  })
  .refine((input) => input.userIds.length > 0 || input.workGroupIds.length > 0, {
    message: 'hay que indicar al menos una persona o un grupo',
  });

/**
 * Quitar un grupo del pedido (R32): el pedido y **un** grupo. No admite lista de grupos por el
 * mismo motivo que R31 aplica a las personas —cada quitada es su propia operacion, con su propio
 * resultado de cuantas filas se fueron—.
 */
export const removeWorkGroupFromOrderSchema = z.strictObject({
  orderId: idSchema,
  workGroupId: idSchema,
});

/**
 * Desasignar a UNA persona (R29, R31). `userId` en singular y **no** una lista: R31 exige que la
 * entrada NO PUEDA EXPRESAR un borrado de varias filas ni de todas las de un pedido. Con
 * `strictObject`, mandar `userIds` no se descarta en silencio: **falla**, que es lo que R31 pide
 * poder demostrar.
 */
export const unassignResponsibleSchema = z.strictObject({
  orderId: idSchema,
  userId: idSchema,
});

export type AssignResponsiblesInput = z.infer<typeof assignResponsiblesSchema>;
export type RemoveWorkGroupFromOrderInput = z.infer<typeof removeWorkGroupFromOrderSchema>;
export type UnassignResponsibleInput = z.infer<typeof unassignResponsibleSchema>;
