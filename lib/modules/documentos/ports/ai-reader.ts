/**
 * El puerto de la lectura con IA: mandar un prompt y unas partes ya preparadas, y recibir el texto
 * que la IA escribio.
 *
 * El puerto NO conoce modos: quien decide si lo que se manda es el PDF entero o sus paginas ya
 * rasterizadas es el caso de uso, que es quien conoce el `PdfConverter`. Aqui solo llegan partes ya
 * resueltas.
 *
 * `timeoutMs` viaja en la peticion para que el adaptador pueda ABORTAR la llamada de verdad; no
 * sustituye al plazo que ya impone el dominio, que es quien decide cuanto tiempo espera el
 * llamante independientemente de si el adaptador logra abortar o no.
 */

export type AiDocumentPart =
  | { readonly kind: 'pdf'; readonly bytes: Uint8Array }
  | { readonly kind: 'image'; readonly png: Uint8Array; readonly pageNumber: number };

export type AiReadRequest = {
  readonly prompt: string;
  readonly parts: readonly AiDocumentPart[];
  readonly timeoutMs: number;
};

export interface AiReader {
  /** Devuelve el texto que la IA escribio, tal cual. Lanza si no puede. */
  read(request: AiReadRequest): Promise<string>;
}
