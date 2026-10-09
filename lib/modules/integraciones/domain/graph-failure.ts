export type GraphFailure = {
  readonly kind: 'rejected' | 'unreachable';
  readonly message: string | null;
};

export const GRAPH_UNREACHABLE_MESSAGE = 'No se pudo contactar con Meta.';
export const HIDDEN_SECRET_MARK = '[oculto]';
export const META_MESSAGE_MAX_LENGTH = 500;

/**
 * El texto de Meta acaba en `last_error` y en pantalla: se tacha cualquier secreto aunque Meta no
 * suela repetirlo. Se tacha antes de recortar para que un secreto partido por el corte no quede a
 * medias a la vista.
 */
export function metaMessageOf(failure: GraphFailure, secrets: readonly string[]): string {
  if (failure.message === null || failure.message === '') return GRAPH_UNREACHABLE_MESSAGE;
  let message = failure.message;
  for (const secret of secrets) {
    if (secret !== '') message = message.split(secret).join(HIDDEN_SECRET_MARK);
  }
  return message.slice(0, META_MESSAGE_MAX_LENGTH);
}
