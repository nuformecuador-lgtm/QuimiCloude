// lib/modules/asignaciones/domain/assignment-view.ts
/**
 * QC-87 T9 — La proyeccion de SALIDA de la consulta de responsables (`design.md > 1`, `> 5`;
 * R35, R39).
 *
 * Dominio PURO: sin `zod`, sin `next/*`, sin `@prisma/client` y sin ningun otro modulo.
 *
 * **`AssignmentOrigin` es el tipo de QC-86, importado y NO redefinido.** La union discriminada
 * -`{ kind: 'direct' }` o `{ kind: 'workGroup', workGroupId, workGroupName }`- ya hace imposible en
 * TypeScript «grupo sin nombre congelado», que es literalmente lo que R35 pide cuando el origen es
 * un grupo: la referencia y el nombre congelado viajan JUNTOS o no viaja ninguno. Por eso **R35 no
 * necesita un tipo nuevo**, solo consumir el que existe (`design.md > 1`).
 */
import type { AssignmentOrigin } from './order-assignment';

/**
 * Un responsable, tal y como lo ve quien consulta un pedido (R35).
 *
 * **TRES claves y ninguna mas, y eso es el requisito (R39)**: aqui NO hay -ni puede haber- hash de
 * credencial, correo, documento, estado de cuenta ni ninguna marca de baja. Lo fija el TIPO, no una
 * promesa en un comentario: `PersonRef` trae ademas `isActive` y este tipo lo DESCARTA a proposito,
 * porque «si su cuenta esta activa» es estado de cuenta y R39 lo prohibe explicitamente.
 *
 * `displayName` viene del directorio de `identity` -ya compuesto por `buildDisplayName`, QC-84
 * R19-, nunca concatenado aqui. Si el directorio NO devuelve a esa persona, el caso de uso pone su
 * **identificador** como nombre mostrable y la fila SIGUE saliendo (`design.md > 5`): la misma
 * linea que QC-34 R44 tomo con la receta borrada.
 *
 * `origin` es el de **LA FILA**, congelado al asignar (R36): ni se deriva de la pertenencia vigente
 * al grupo, ni se sustituye por el nombre que el grupo tenga hoy.
 */
export type OrderResponsible = {
  readonly userId: string;
  readonly displayName: string;
  readonly origin: AssignmentOrigin;
};
