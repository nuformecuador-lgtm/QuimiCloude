import {
  GoogleGenAI,
  createPartFromBase64,
  createPartFromText,
  createUserContent,
} from '@google/genai';
import type { Part } from '@google/genai';

import { readAiConfigFromEnv } from '../config/ai-config-env';

import type { AiDocumentPart, AiReadRequest } from '../../../ports/ai-reader';

/**
 * Implementa el puerto `AiReader` contra Gemini con `@google/genai`. **Unico archivo del
 * repositorio que importa la libreria**: sustituirla es reescribir este archivo, no buscarla
 * por el arbol.
 *
 * La configuracion se lee EN CADA LLAMADA, nunca al importar el modulo, y el cliente se
 * construye dentro de la funcion: importar este archivo sin invocar `readWithGenai` no debe
 * fallar con las variables vacias.
 *
 * Sobre el plazo: `GenerateContentConfig.httpOptions.timeout` (en milisegundos) se lo pide a
 * la libreria, y ademas se arma un `AbortSignal` propio que vence al mismo plazo. El docblock
 * de `abortSignal` en `genai.d.ts` es explicito con su limite: abortar es una operacion SOLO
 * DEL CLIENTE, no cancela la peticion en el servicio y la llamada ya se cobra igual. Por eso
 * esto deja de esperar, pero la garantia real del plazo la sigue dando el dominio que llama
 * aqui, no este adaptador.
 */

const PDF_MIME_TYPE = 'application/pdf';
const IMAGE_MIME_TYPE = 'image/png';

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

/** Traduce una parte del puerto a la parte que entiende la libreria. Sin texto propio: solo bytes. */
export function toGenaiPart(part: AiDocumentPart): Part {
  if (part.kind === 'pdf') {
    return createPartFromBase64(toBase64(part.bytes), PDF_MIME_TYPE);
  }
  return createPartFromBase64(toBase64(part.png), IMAGE_MIME_TYPE);
}

/**
 * El cuerpo de la peticion: el prompt que llega por parametro, seguido de las partes
 * traducidas. Exportada para poder probar la traduccion sin llamar a la libreria.
 */
export function buildGenaiContents(request: AiReadRequest) {
  return createUserContent([
    createPartFromText(request.prompt),
    ...request.parts.map(toGenaiPart),
  ]);
}

/** `AiReader.read`: una sola llamada, sin bucle ni reintento. */
export async function readWithGenai(request: AiReadRequest): Promise<string> {
  const config = readAiConfigFromEnv();
  const client = new GoogleGenAI({ apiKey: config.apiKey });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), request.timeoutMs);

  try {
    const response = await client.models.generateContent({
      model: config.model,
      contents: buildGenaiContents(request),
      config: {
        httpOptions: { timeout: request.timeoutMs },
        abortSignal: controller.signal,
      },
    });

    const text = response.text;
    if (text === undefined) {
      throw new Error('la lectura con Gemini no devolvio texto en la respuesta');
    }
    return text;
  } finally {
    clearTimeout(timer);
  }
}
