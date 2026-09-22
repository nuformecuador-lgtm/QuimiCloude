/**
 * El Route Handler del webhook: recibe cada mensaje que publica la cola y ejecuta su trabajo.
 *
 * Sin usuario delante: el unico control de entrada es la firma del cuerpo. No resuelve actor de
 * sesion, no lee cookie y no comprueba ningun permiso -eso lo hace `enqueueBatch`, no esto-.
 *
 * El orden es el contrato: leer el cuerpo crudo, verificar su firma, y solo si corresponde
 * interpretar el cuerpo con zod. Una firma que falla no produce ningun otro efecto -ni descarga, ni
 * IA, ni escritura-.
 *
 * La configuracion de segmento -`runtime` y `maxDuration`- NO vive aqui sino en `route.ts`: Next
 * la extrae del archivo de ruta analizandolo estaticamente y NO admite que se reexporte.
 */
import { documentos } from '@/lib/composition';
import { queueMessageSchema } from '@/lib/modules/documentos';

const SIGNATURE_HEADER = 'upstash-signature';

function noBody(status: number): Response {
  return new Response(null, { status });
}

export async function POST(request: Request): Promise<Response> {
  const rawBody = await request.text();
  const signature = request.headers.get(SIGNATURE_HEADER);

  const signed = await documentos.queueSignature.verify({ rawBody, signature });
  if (!signed) return noBody(401);

  let candidate: unknown;
  try {
    candidate = JSON.parse(rawBody);
  } catch {
    return noBody(400);
  }

  const parsed = queueMessageSchema.safeParse(candidate);
  if (!parsed.success) return noBody(400);

  // Sin identificador de mensaje no hay candado que reclamar: se trata igual que un cuerpo que no
  // pasa el esquema, un fallo definitivo del lado de la entrega.
  const headers = Object.fromEntries(request.headers.entries());
  const messageId = documentos.queueSignature.messageIdOf(headers);
  if (messageId === null) return noBody(400);

  const result = await documentos.runDocumentJob({
    documentFileId: parsed.data.documentFileId,
    messageId,
  });

  // La sutileza del contrato: un fallo DEFINITIVO responde 200, porque le dice a la cola que no
  // reintente. Solo el reintentable pide un 5xx.
  return noBody(result.kind === 'requeue' ? 500 : 200);
}
