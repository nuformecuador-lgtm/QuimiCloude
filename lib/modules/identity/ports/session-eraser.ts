// lib/modules/identity/ports/session-eraser.ts
/**
 * QC-23 T7 — Retirar la cookie de sesion, visto desde el dominio (`design.md > 5.1`; R22).
 *
 * Existe porque QC-23 convierte «cerrar sesion» en una decision de negocio. Hasta hoy
 * `lib/composition` cableaba `endSession: clearSession` DIRECTO al adaptador, con este comentario
 * en `ports/session-reader.ts`: «cerrar sesion no tiene caso de uso a proposito — borrar la
 * cookie no encierra ninguna decision de negocio». **Ya no es cierto**: ahora hay que leer el
 * `sid`, registrar el cierre, purgar y DESPUES borrar la cookie, y ese orden es el requisito.
 *
 * No cambia el adaptador —lo implementa el `clearSession` que ya existe—: cambia quien lo llama.
 *
 * Una sola funcion y sin parametros, que es exactamente lo que el caso de uso necesita del
 * mundo. Puerto PURO: sin `next/*`, sin Prisma y sin `lib/shared/**`.
 */
export interface SessionEraser {
  /** Retira la cookie de sesion exactamente como se retira hoy (R22). */
  clear(): Promise<void>;
}
