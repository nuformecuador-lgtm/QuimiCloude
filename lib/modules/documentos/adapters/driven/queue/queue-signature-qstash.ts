import { Receiver } from '@upstash/qstash';

import { readQstashConfigFromEnv } from '../config/processing-config-env';

import type { QueueSignature, SignedDelivery } from '../../../ports/queue-signature';

/**
 * Implementa el puerto `QueueSignature` con `Receiver` de `@upstash/qstash`. **Unico archivo del
 * repositorio, junto a `processing-queue-qstash.ts`, que importa la libreria**: sustituirla es
 * reescribir estos dos archivos, no buscarla por el arbol.
 *
 * Las claves se leen EN CADA LLAMADA, nunca al importar el modulo, y el `Receiver` se construye
 * dentro de la funcion: importar este archivo sin invocar `verifyQstashSignature` no debe fallar
 * con las variables vacias.
 *
 * `Receiver.verify` LANZA (`SignatureError`) cuando la firma no corresponde al cuerpo; el puerto
 * promete que `verify` nunca lanza, asi que aqui se captura y se devuelve `false`.
 */

/**
 * El nombre de esta cabecera no esta verificado contra el SDK instalado: el paquete nunca la lee,
 * asi que no hay tipo ni constante propia de la libreria de donde confirmarlo. Si el proveedor
 * usara otro nombre, `messageIdOf` simplemente devuelve `null`.
 */
export const QSTASH_MESSAGE_ID_HEADER = 'upstash-message-id';

function findHeaderCaseInsensitive(
  headers: Readonly<Record<string, string>>,
  name: string,
): string | null {
  const lowerName = name.toLowerCase();
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === lowerName) return headers[key] ?? null;
  }
  return null;
}

export async function verifyQstashSignature(delivery: SignedDelivery): Promise<boolean> {
  if (delivery.signature === null) return false;

  const config = readQstashConfigFromEnv();
  const receiver = new Receiver({
    currentSigningKey: config.currentSigningKey,
    nextSigningKey: config.nextSigningKey,
  });

  try {
    return await receiver.verify({ signature: delivery.signature, body: delivery.rawBody });
  } catch {
    return false;
  }
}

export function qstashMessageIdOf(headers: Readonly<Record<string, string>>): string | null {
  return findHeaderCaseInsensitive(headers, QSTASH_MESSAGE_ID_HEADER);
}

export const queueSignatureQstash: QueueSignature = {
  verify: verifyQstashSignature,
  messageIdOf: qstashMessageIdOf,
};
