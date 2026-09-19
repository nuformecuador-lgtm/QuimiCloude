import { Client } from '@upstash/qstash';

import { readProcessingConfigFromEnv, readQstashConfigFromEnv } from '../config/processing-config-env';

import type { ProcessingQueue, QueuedMessage } from '../../../ports/processing-queue';

/**
 * Implementa el puerto `ProcessingQueue` con `Client.publishJSON` de `@upstash/qstash`. **Unico
 * archivo del repositorio, junto a `queue-signature-qstash.ts`, que importa la libreria**:
 * sustituirla es reescribir estos dos archivos, no buscarla por el arbol.
 *
 * La configuracion se lee EN CADA LLAMADA, nunca al importar el modulo, y el cliente se
 * construye dentro de la funcion: importar este archivo sin invocar `publishToQstash` no debe
 * fallar con las variables vacias.
 *
 * El tope de reintentos NUNCA es un literal aqui: sale de `ProcessingConfig.maxRetries()`, que es
 * el unico sitio que lo fija.
 */

export async function publishToQstash(message: QueuedMessage): Promise<string> {
  const qstashConfig = readQstashConfigFromEnv();
  const processingConfig = readProcessingConfigFromEnv();
  const client = new Client({ token: qstashConfig.token });

  const response = await client.publishJSON({
    url: qstashConfig.targetUrl,
    body: message,
    retries: processingConfig.maxRetries(),
  });

  return response.messageId;
}

export const processingQueueQstash: ProcessingQueue = {
  publish: publishToQstash,
};
