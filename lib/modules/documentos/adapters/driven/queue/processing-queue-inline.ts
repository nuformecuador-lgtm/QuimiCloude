import type { RunDocumentJobMessage, RunDocumentJobResult } from '../../../domain/run-document-job';
import type { ProcessingQueue, QueuedMessage } from '../../../ports/processing-queue';

/**
 * Implementa el puerto de la cola EJECUTANDO el trabajo en el mismo proceso, para que el recorrido
 * de extremo a extremo pueda correr sin URL publica ni credenciales de ningun servicio de cola.
 *
 * No se cablea nunca por defecto: el punto de composicion solo lo elige cuando
 * `DOCUMENTS_E2E_DOUBLES` esta puesta, y ningun archivo versionado la pone salvo la configuracion
 * de Playwright.
 *
 * **`publish` no espera al trabajo.** Devuelve el identificador del mensaje en cuanto lo genera y
 * deja el trabajo programado: si lo esperara, quien encola no llegaria a anotar el identificador
 * hasta despues de que la fila ya estuviera terminada, y la pantalla no veria nunca `queued`.
 *
 * El trabajo recibe el identificador que se devolvio, que es el mismo que quien encola anota en la
 * fila: reclamarla exige que coincidan o que no haya ninguno anotado todavia.
 *
 * Quien ejecuta el trabajo entra por PARAMETRO. Pedirselo al punto de composicion desde aqui seria
 * un adaptador driven importando la composicion, que es la flecha que el modulo no admite.
 */

/** El retardo con el que arranca el trabajo de cada archivo. */
export const INLINE_JOB_DELAY_MS = 300;

export type InlineProcessingQueueDeps = {
  readonly run: (message: RunDocumentJobMessage) => Promise<RunDocumentJobResult>;
  readonly delayMs?: number;
};

/**
 * La cadena de trabajos pendientes, de MODULO y no de instancia: los archivos de una tanda se
 * procesan de uno en uno aunque quien encola construya esta cola una vez por mensaje, que es lo
 * que hace que el sondeo vea las filas cambiar y no saltar todas a la vez.
 */
let pendientes: Promise<void> = Promise.resolve();

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function createProcessingQueueInline(deps: InlineProcessingQueueDeps): ProcessingQueue {
  const delayMs = deps.delayMs ?? INLINE_JOB_DELAY_MS;

  return {
    publish(message: QueuedMessage): Promise<string> {
      const messageId = `inline-${crypto.randomUUID()}`;

      pendientes = pendientes.then(async () => {
        await esperar(delayMs);
        try {
          await deps.run({ documentFileId: message.documentFileId, messageId });
        } catch (error) {
          // Nadie espera este trabajo: si reventara en silencio, la fila se quedaria en `queued`
          // sin ninguna pista de por que.
          console.error(
            `[documentos] el trabajo en linea de '${message.documentFileId}' reviento: ` +
              `${error instanceof Error ? error.message : String(error)}`,
          );
        }
      });

      return Promise.resolve(messageId);
    },
  };
}
