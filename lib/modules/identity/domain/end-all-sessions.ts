// QC-23 T12 — Cerrar TODAS las sesiones de una persona (`design.md > 5.2`; R25, R26, R27, R28,
// R29, R48, R51).
//
// Es la operacion que invocaran **QC-101** (el boton del administrador) y **QC-53** (el boton del
// usuario), y la que usara **QC-89** cuando el administrador restablezca la contrasena de otro
// (`design.md > 5.4`). Aqui queda implementada y probada en el dominio, **sin ninguna Server
// Action, pagina, ruta ni componente** (R51): esa mitad es de otra ficha, a proposito.
//
// Dominio puro: sin `next/*`, sin Prisma, sin `lib/shared/**` y sin adaptadores.

import { requireActor, requirePermission, type Actor } from './actor';
import { UserNotFoundError } from './errors';
import { floorToSecond } from './session-revocation';

import type { SessionRevocationRepository } from '../ports/session-revocation-repository';

export type EndAllSessionsDeps = {
  readonly revocations: SessionRevocationRepository;
  /** Ver el comentario identico de `create-user.ts` sobre el origen de este reloj. */
  readonly now?: () => Date;
};

/**
 * Deja invalidas **todas** las sesiones vivas de la persona objetivo, incluida la que se este
 * usando si el objetivo es uno mismo (R25). El administrador **no elige dispositivo**: lo suyo es
 * siempre total, y elegir uno concreto de otra persona ni siquiera es expresable en esta firma
 * (R26) — no hay parametro donde escribirlo.
 *
 * **AUTORIZACION EN LA PRIMERA LINEA** (R27), antes de validar la entrada y antes de tocar el
 * puerto, y fallando cerrado —actor ausente, sin conjunto de permisos, con el conjunto vacio, con
 * un conjunto que no es un array o sin el codigo exigido se rechazan todos igual—:
 *
 * - Sobre **otra** persona: `usuarios.modificar`. **Y NO un permiso nuevo** `sesiones.modificar`
 *   (alternativa descartada 5): seria la cuarta enmienda al catalogo cerrado de QC-74 —tras
 *   QC-38, QC-66 y QC-86—, obligaria a migracion y seed de `role_permissions`, y no separa
 *   ninguna capacidad real: quien puede borrar a una persona y cambiarle el rol ya puede cerrarle
 *   las sesiones por esos dos caminos. Se autoriza POR PERMISO y nunca por nombre de rol (QC-66
 *   R4): «el Administrador» de la decision 17 es «quien trae `usuarios.modificar`».
 * - Sobre **uno mismo**: ningun codigo, solo `requireActor`. **Apuntarse a uno mismo NO es
 *   `self_operation`**: QC-66 lo prohibe al borrar, al cambiar el rol y al mover el estado, pero
 *   aqui es al reves —apuntarse a uno mismo ES el caso de uso de R25, «cerrar todas mis sesiones,
 *   incluida la actual»—. Tampoco aplica la guarda del ultimo administrador: cerrar sesiones no
 *   deja a ninguna empresa sin administrador.
 *
 * **El AMBITO vive en el puerto, no aqui** (`design.md > 5.2`): `stampAll` sube el sello con
 * `WHERE id = ? AND company_id = ? AND deleted_at IS NULL` y devuelve un resultado discriminado.
 * Si el filtro estuviera en el caso de uso, el proximo caso de uso podria olvidarlo — es
 * exactamente el reparto de `UserAdminRepository`. Los TRES casos —no existe, borrada
 * logicamente, de otra empresa— se traducen al MISMO `UserNotFoundError` sin distinguirlos
 * (R28), que es lo que impide usar esta operacion como oraculo de existencia sobre la empresa
 * ajena. Por eso «de otra empresa» responde no-encontrado y **no** `unauthorized`.
 *
 * **El actor entra por PARAMETRO** (R29): este caso de uso no lee cookies ni cabeceras, y la RLS
 * no cuenta como autorizacion (`docs/architecture.md > Acceso a datos y autorizacion`).
 *
 * **No emite ninguna cookie y no lee ninguna.** Si el actor se cierra las suyas, su siguiente
 * peticion no resuelve sesion y el layout privado lo manda al login: eso ya lo hace el corte 7 de
 * `resolve-session.ts`.
 *
 * Ningun codigo de error nuevo (R48): `unauthorized` y `user_not_found` ya estan en el catalogo
 * cerrado de QC-70, y ninguno de los dos sitios que lanzan escribe el texto del mensaje.
 */
export function createEndAllSessions(
  deps: EndAllSessionsDeps,
): (actor: Actor | null | undefined, targetUserId: string) => Promise<void> {
  const now = deps.now ?? (() => new Date());

  return async function endAllSessions(
    actor: Actor | null | undefined,
    targetUserId: string,
  ): Promise<void> {
    // R27 — PRIMERA LINEA. Nada por encima de estas dos, ni una validacion de entrada.
    if (targetUserId !== actor?.id) requirePermission(actor, 'usuarios.modificar');
    else requireActor(actor);

    // El sello se escribe TRUNCADO AL SEGUNDO (`design.md > 2.3`): es la granularidad con la que
    // `iat` viaja firmado, y mezclar dos granularidades convertiria el borde de R31 en un volado.
    // Quien decide el instante es el caso de uso, no la base.
    const resultado = await deps.revocations.stampAll({
      userId: targetUserId,
      // La empresa sale del ACTOR y jamas de la entrada del llamante (QC-66 R6, R14): elegir la
      // empresa del ambito seria elegir a quien se le cierran las sesiones.
      companyId: actor.companyId,
      validFrom: floorToSecond(now()),
    });

    // R28 — los tres casos, el mismo error y sin distinguirlos.
    if (resultado === 'not_found') throw new UserNotFoundError();
  };
}
