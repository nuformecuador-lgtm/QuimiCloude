// lib/modules/identity/ports/session-check-log.ts
/**
 * QC-23 T7 — El registro del servidor cuando la comprobacion de sesion NO SE PUDO HACER
 * (`design.md > 4.2`, `> 7`; R16, R17, R23).
 *
 * **Por que un puerto y no un `console.error` suelto en el dominio:** el dominio no conoce el
 * mundo exterior, y —mas practico— R17 solo es testeable si el test puede ESPIAR la llamada; un
 * `console.error` suelto se prueba parcheando la consola global, que ensucia el resto de la
 * suite. Mismo argumento, y mismo patron, que `ListQueryLog` (QC-57 R6).
 *
 * ENMIENDA A `design.md > 4.2`, ANOTADA AQUI PORQUE ES UNA DESVIACION DEL SPEC APROBADO. El
 * diseno escribio esta firma con DOS parametros —la causa y el identificador de peticion de
 * QC-71—, entrando el segundo por parametro desde el dominio. Ni ese nombre se puede escribir
 * aqui: la guardia barre el TEXTO de estos archivos, asi que este comentario tampoco lo nombra. **No se puede**: QC-71 R9 es una decision
 * cerrada con guardia propia —`tests/guards/guard-identificador-de-request.test.ts`, caso
 * «ningun domain/ ni ports/ de los modulos de negocio menciona el identificador»— y dice que el
 * identificador NO atraviesa el contrato de un modulo de negocio hacia adentro: se queda en el
 * borde y en la capa que traduce los errores. El spec de QC-23 se escribio sin verlo.
 *
 * Lo que R17 pide —«la causa en el registro del servidor JUNTO al identificador de peticion»— se
 * cumple entero, y en el unico sitio donde puede cumplirse: el **adaptador** de este puerto
 * (`adapters/driven/observability/session-check-log-console.ts`), que recibe la lectura de la
 * cabecera como parametro desde `lib/composition/index.ts` —exactamente el reparto que fijo
 * QC-71 R9 para el traductor unico de errores, «ningun puerto nuevo»— y escribe las dos cosas en
 * la misma linea. El dominio aporta la CAUSA; el adaptador, el identificador.
 *
 * **EL `diagnostic` NUNCA LLEVA EL `sid`.** Un identificador de sesion es material de
 * autenticacion: con el y la firma correcta se entra. Es el mismo criterio con el que QC-79
 * prohibio poner el secreto del enlace —o su huella— en el `diagnostic` (R13 de aquella), y el
 * mismo por el que `ListQueryLog` solo admite NOMBRES de campo y nunca el valor buscado.
 * Tampoco lleva PII: ni correo, ni nombre de usuario (`docs/architecture.md > Anti-patrones`).
 *
 * Lo registrado va al registro del SERVIDOR y solo ahi: al navegador no llega ningun detalle
 * (R17). Quien tenia sesion acaba en el login, sin mensaje y sin pantalla de error, que es lo que
 * compro la decision cerrada 13.
 *
 * Puerto PURO: sin `next/*`, sin Prisma y sin `lib/shared/**`.
 */
export interface SessionCheckLog {
  /**
   * @param diagnostic la causa, en texto. NUNCA el `sid` y nunca PII.
   *
   * Devuelve `void` y no una promesa a proposito: registrar es lo ultimo que hace un camino que
   * ya decidio cortar, y esperar a que la linea se escriba no cambiaria ninguna decision. Que el
   * registro sea el mejor esfuerzo es deliberado; que el corte ocurra, no.
   */
  log(diagnostic: string): void;
}
