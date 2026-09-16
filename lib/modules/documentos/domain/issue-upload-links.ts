/**
 * El caso de uso de la EMISION DE ENLACES: por cada archivo de la tanda, una ruta dentro del bucket
 * y un enlace firmado con el que el navegador subira los bytes por su cuenta.
 *
 * LOS CUATRO PASOS, EN ESTE ORDEN, y el orden ES el requisito:
 *
 *   1. `requirePermission` — PRIMERA LINEA, antes del esquema y antes de tocar ningun puerto. Si la
 *      validacion fuera antes, un actor sin derecho a pedir nada recibiria `invalid_input` y sabria
 *      algo del sistema solo por haber preguntado mal; y si el puerto sonara antes, el rechazo ya
 *      habria dejado una firma emitida.
 *   2. El esquema de la tanda. Tambien SIN tocar ningun puerto: una tanda por encima del tope se
 *      rechaza ENTERA, y eso solo es cierto si el tope se aplica antes del primer `createSignedUpload`
 *      y no dentro del bucle que va firmando.
 *   3. Las rutas, construidas AQUI con la empresa del actor. **El cliente no propone ruta**: no hay
 *      ningun campo de entrada por el que una ruta pueda llegar hasta el puerto, asi que elegir donde
 *      se escribe —o escribir en la carpeta de otra empresa— es inexpresable, no «esta validado».
 *   4. Un enlace firmado por archivo.
 *
 * **Lo que esta operacion NO hace, y se dice porque la ausencia es el requisito:** no recibe, no lee
 * y no reenvia los BYTES de ningun PDF —viajan del navegador al bucket sin atravesar la aplicacion—;
 * no convierte nada; no devuelve ninguna URL completa de lectura; y no escribe ni lee ninguna fila.
 * No tiene por donde: sus unicas dependencias son el puerto de almacenamiento y un reloj.
 *
 * Dominio puro: solo su propio `domain/`, sus `ports/` y el tipo del reloj.
 */
import { requirePermission, type Actor, DOCUMENT_UPLOAD_PERMISSION } from './actor';
import { buildDocumentPath } from './document-path';
import { ValidationError } from './errors';
import { UPLOAD_LINK_TTL_SECONDS } from './limits';
import { issueUploadLinksSchema } from './upload-input';

import type { DocumentStorage, SignedUpload } from '../ports/document-storage';

/** Un segundo, en milisegundos: el unico factor que hace falta para pasar del TTL a una fecha. */
const MILLISECONDS_PER_SECOND = 1000;

export type IssueUploadLinksDeps = {
  /** El bucket, dicho sin nombrarlo. Es el UNICO puerto de esta operacion. */
  readonly storage: DocumentStorage;
  /**
   * El instante de emision, inyectable, con `() => new Date()` por defecto.
   *
   * No es comodidad de test: la caducidad que se devuelve se cuenta desde ESTE instante y con la
   * unica definicion del plazo que tiene el modulo, de modo que la respuesta no dependa del reloj
   * —ni del criterio— de cada adaptador.
   */
  readonly now?: () => Date;
};

/**
 * La salida: RUTAS Y ENLACES, y nada mas.
 *
 * No hay hueco donde colar el resultado de una conversion ni una URL de lectura: quien quisiera
 * devolverlos tendria que cambiar este tipo, que es justo el aviso que se busca.
 */
export type IssuedUploadBatch = { readonly uploads: readonly SignedUpload[] };

export function createIssueUploadLinks(
  deps: IssueUploadLinksDeps,
): (actor: Actor | null | undefined, input: unknown) => Promise<IssuedUploadBatch> {
  const now = deps.now ?? ((): Date => new Date());

  return async function issueUploadLinks(
    actor: Actor | null | undefined,
    input: unknown,
  ): Promise<IssuedUploadBatch> {
    // 1. Antes que nada, y sin excepcion.
    requirePermission(actor, DOCUMENT_UPLOAD_PERMISSION);

    // 2. Ningun puerto se ha tocado todavia: un rechazo aqui no deja ninguna firma emitida.
    const parsed = issueUploadLinksSchema.safeParse(input);
    if (!parsed.success) throw new ValidationError();

    // La caducidad se calcula UNA vez para toda la tanda: firmar diez archivos no puede dar diez
    // vencimientos distintos solo porque el reloj avance entre llamada y llamada.
    const expiresAt = new Date(
      now().getTime() + UPLOAD_LINK_TTL_SECONDS * MILLISECONDS_PER_SECOND,
    ).toISOString();

    // 3 y 4. Una ruta nueva por archivo, SIEMPRE bajo la empresa del actor. El nombre que mando
    // quien sube no entra en la ruta; solo sirve para que la pantalla sepa de que archivo es cada
    // enlace, y por eso ni siquiera se lee aqui.
    const uploads = await Promise.all(
      parsed.data.files.map(async (): Promise<SignedUpload> => {
        const firmado = await deps.storage.createSignedUpload(
          buildDocumentPath(actor.companyId),
          UPLOAD_LINK_TTL_SECONDS,
        );
        // La caducidad que vale es la del modulo: el adaptador entrega la firma, pero el plazo lo
        // fija la unica constante que lo declara. Asi el dato que ve quien llama no puede
        // contradecir al plazo con el que se pidio la firma.
        return { ...firmado, expiresAt };
      }),
    );

    return { uploads };
  };
}
