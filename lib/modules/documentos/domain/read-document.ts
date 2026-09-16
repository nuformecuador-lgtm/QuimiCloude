/**
 * Los dos casos de uso de LECTURA: firmar un enlace de lectura de una ruta, y descargar sus bytes.
 *
 * **Por que existen, si el puerto ya sabe hacer las dos cosas.** Porque el puerto, a pelo, no
 * comprueba de quien es el archivo. La ruta de una lectura SI llega de fuera —al contrario que la de
 * la subida, que la construye el servidor—, asi que sin una pieza que decida antes, conocer el
 * identificador de otra empresa bastaria para leer su archivo: no hay ninguna fila en la base que
 * filtrar, y el aislamiento entre empresas ES la ruta.
 *
 * **La comprobacion no es saltable**, y esa es la propiedad que se busca: lo que se publica por el
 * contrato del modulo son ESTOS casos de uso, no las funciones del puerto, y la fachada cableada
 * expone lo mismo. Quien quiera leer pasa por aqui.
 *
 * LOS DOS PASOS, EN ESTE ORDEN:
 *
 *   1. La ruta cae bajo la empresa del actor. Si no, `UnauthorizedError` **ANTES de tocar el
 *      puerto**. Por eso el rechazo no puede revelar si el archivo existe: no se ha preguntado. El
 *      mismo error, la misma frase y el mismo codigo para «no es de tu empresa» y para «no existe»,
 *      porque desde fuera los dos casos son literalmente la misma ejecucion.
 *   2. Solo entonces, el puerto.
 *
 * **Que NO se comprueba aqui, y es deliberado: ningun permiso.** La frontera por permiso de este
 * modulo es la operacion que EMITE los enlaces de subida, que es la que un actor pide para escribir.
 * Exigir ademas un permiso de escritura para leer seria una regla que nadie ha decidido, y una regla
 * inventada es tan mal trabajo como una que falta. Lo que si se exige, y sin excepcion, es la
 * empresa.
 *
 * **Falla cerrado.** Actor ausente, actor sin empresa o empresa que no es una cadena se rechazan
 * igual que una ruta ajena: sin empresa conocida no hay ninguna ruta que pueda estar «dentro» de
 * ella.
 *
 * El actor entra por PARAMETRO: este dominio no lee sesion, cookie ni cabecera.
 *
 * Dominio puro: solo su propio `domain/` y sus `ports/`.
 */
import { isPathInCompany } from './document-path';
import { UnauthorizedError } from './errors';
import { READ_LINK_TTL_SECONDS } from './limits';

import type { Actor } from './actor';
import type { DocumentStorage } from '../ports/document-storage';

export type ReadDocumentDeps = {
  /** El bucket, dicho sin nombrarlo. Es el UNICO puerto de las dos operaciones. */
  readonly storage: DocumentStorage;
};

/**
 * La unica guardia de las dos operaciones, escrita una sola vez: dos copias podrian diverger y una
 * de las dos lecturas quedaria abierta sin que nada avisara.
 *
 * El error va SIN diagnostico a proposito: cualquier dato de la ruta en el mensaje empezaria a
 * contar lo que este rechazo existe para no contar.
 */
function assertPathInActorCompany(actor: Actor | null | undefined, path: string): void {
  const companyId = typeof actor?.companyId === 'string' ? actor.companyId : '';
  if (typeof path !== 'string' || !isPathInCompany(path, companyId)) {
    throw new UnauthorizedError();
  }
}

/**
 * Firma la LECTURA de una ruta de la empresa del actor y devuelve la URL firmada.
 *
 * El plazo no lo elige quien llama: sale de la definicion unica del modulo y viaja al puerto, que es
 * donde el servicio si lo aplica. Un plazo por parametro seria un enlace de lectura con la vida que
 * pidiera el llamante.
 *
 * La URL se devuelve y no se persiste en ninguna parte: caduca sola.
 */
export function createIssueReadLink(
  deps: ReadDocumentDeps,
): (actor: Actor | null | undefined, path: string) => Promise<string> {
  return async function issueReadLink(
    actor: Actor | null | undefined,
    path: string,
  ): Promise<string> {
    assertPathInActorCompany(actor, path);
    return deps.storage.createSignedReadUrl(path, READ_LINK_TTL_SECONDS);
  };
}

/**
 * Descarga los BYTES de una ruta de la empresa del actor, que es lo que come la conversion.
 *
 * Misma guardia y en el mismo sitio que la firma de lectura: descargar sin comprobar la empresa
 * seria el mismo agujero por otra puerta.
 */
export function createDownloadDocument(
  deps: ReadDocumentDeps,
): (actor: Actor | null | undefined, path: string) => Promise<Uint8Array> {
  return async function downloadDocument(
    actor: Actor | null | undefined,
    path: string,
  ): Promise<Uint8Array> {
    assertPathInActorCompany(actor, path);
    return deps.storage.download(path);
  };
}
