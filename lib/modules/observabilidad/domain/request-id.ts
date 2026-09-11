// QC-71 T2 — el identificador de peticion: como se genera y como se llama (`design.md > 1`).
//
// **Este archivo no tiene ni un `import`, y eso es una restriccion dura, no un gusto (R2, R3).**
// `crypto.randomUUID()` es un GLOBAL del runtime del borde y de Node >= 19, asi que no hace
// falta traer `node:crypto` —que el borde ni siquiera tiene— ni ninguna libreria de UUID. El
// cierre de imports desde `middleware.ts` alcanza este archivo, y `guard-middleware-edge`
// prohibe ahi `node:crypto`, `crypto`, `@prisma/client` y `next/headers`: un solo `import` de
// criptografia aqui pondria esa guardia en rojo y dejaria al middleware sin cargar en
// produccion. Si algun dia hace falta algo mas que un UUID, la pieza nueva va en un adaptador,
// no aqui.
//
// Vive en `domain/` porque es una REGLA —que haya un identificador por peticion y como se
// llama la cabecera que lo lleva—, no un detalle de infraestructura. El unico que lo llama en
// el borde es el adaptador driving del middleware, a traves de `lib/composition/edge.ts`.

/** Nombre de la cabecera de **peticion** por la que viaja el identificador (R4). */
export const REQUEST_ID_HEADER = 'x-request-id';

/**
 * Un identificador nuevo para una peticion, en formato UUID canonico de 36 caracteres (R1, R2).
 *
 * Dos llamadas seguidas nunca devuelven lo mismo: es lo que permite encontrar en los registros
 * la peticion concreta que fallo y no otra parecida.
 */
export function newRequestId(): string {
  return crypto.randomUUID();
}
