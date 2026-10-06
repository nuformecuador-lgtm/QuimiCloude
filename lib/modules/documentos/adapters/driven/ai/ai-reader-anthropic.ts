import Anthropic from '@anthropic-ai/sdk';

import { readAnthropicConfigFromEnv } from '../config/ai-config-env';

import type { AiDocumentPart, AiReadRequest } from '../../../ports/ai-reader';

/**
 * Implementa el puerto `AiReader` contra Claude con `@anthropic-ai/sdk`. **Unico archivo del
 * repositorio que importa la libreria**: sustituirla es reescribir este archivo, no buscarla
 * por el arbol.
 *
 * La configuracion se lee EN CADA LLAMADA, nunca al importar el modulo, y el cliente se
 * construye dentro de la funcion: importar este archivo sin invocar `readWithAnthropic` no
 * debe fallar con las variables vacias.
 *
 * El SDK reintenta dos veces por defecto; `maxRetries: 0` mantiene la promesa del puerto de
 * una sola llamada. El plazo se pide al cliente y ademas se aborta con un `AbortSignal`
 * propio, pero abortar solo deja de esperar: la garantia real del plazo la da el dominio.
 *
 * No se envian `thinking`, `temperature`, `top_p` ni prefill: varios modelos actuales los
 * rechazan con un 400.
 */

const PDF_MEDIA_TYPE = 'application/pdf';
const IMAGE_MEDIA_TYPE = 'image/png';
const MAX_TOKENS = 16000;

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

/** Traduce una parte del puerto al bloque que entiende la libreria. Sin texto propio: solo bytes. */
export function toAnthropicBlock(part: AiDocumentPart): Anthropic.ContentBlockParam {
  if (part.kind === 'pdf') {
    return {
      type: 'document',
      source: { type: 'base64', media_type: PDF_MEDIA_TYPE, data: toBase64(part.bytes) },
    };
  }
  return {
    type: 'image',
    source: { type: 'base64', media_type: IMAGE_MEDIA_TYPE, data: toBase64(part.png) },
  };
}

/**
 * El contenido del unico mensaje de usuario: los adjuntos primero y el prompt recibido por
 * parametro al final. Exportada para poder probar la traduccion sin llamar a la libreria.
 */
export function buildAnthropicContent(request: AiReadRequest): Anthropic.ContentBlockParam[] {
  return [...request.parts.map(toAnthropicBlock), { type: 'text', text: request.prompt }];
}

/**
 * El texto de la respuesta, o un error si no lo hay. Una negativa o un corte por tokens no
 * son una lectura: devolver el texto parcial haria pasar por buena una lectura incompleta.
 */
export function textFromAnthropicMessage(message: Anthropic.Message): string {
  if (message.stop_reason === 'refusal') {
    throw new Error('la lectura con Claude fue rechazada por el modelo');
  }
  if (message.stop_reason === 'max_tokens') {
    throw new Error('la lectura con Claude se corto al llegar al limite de tokens de salida');
  }

  const textos: string[] = [];
  for (const block of message.content) {
    if (block.type === 'text') textos.push(block.text);
  }
  if (textos.length === 0) {
    throw new Error('la lectura con Claude no devolvio texto en la respuesta');
  }
  return textos.join('');
}

/** `AiReader.read`: una sola llamada, sin bucle ni reintento. */
export async function readWithAnthropic(request: AiReadRequest): Promise<string> {
  const config = readAnthropicConfigFromEnv();
  const client = new Anthropic({
    apiKey: config.apiKey,
    maxRetries: 0,
    timeout: request.timeoutMs,
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), request.timeoutMs);

  try {
    const message = await client.messages.create(
      {
        model: config.model,
        max_tokens: MAX_TOKENS,
        messages: [{ role: 'user', content: buildAnthropicContent(request) }],
      },
      { signal: controller.signal },
    );
    return textFromAnthropicMessage(message);
  } finally {
    clearTimeout(timer);
  }
}
