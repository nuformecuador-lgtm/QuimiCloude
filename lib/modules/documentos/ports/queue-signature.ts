/**
 * El puerto de la FIRMA del mensaje que entrega la cola: lo que el Route Handler necesita para
 * decidir si el cuerpo que le llego es de verdad de su proveedor, dicho sin nombrarlo.
 *
 * Dos operaciones y ninguna lanza: una entrega mal firmada es un caso normal del webhook, no una
 * excepcion, y `verify` lo dice con su valor de retorno.
 */

export type SignedDelivery = {
  readonly rawBody: string;
  readonly signature: string | null;
};

export interface QueueSignature {
  /** `true` solo si la firma corresponde a ESE cuerpo. Nunca lanza por una firma mala. */
  verify(delivery: SignedDelivery): Promise<boolean>;
  /** El identificador del mensaje que trae la entrega, o `null` si no viene. */
  messageIdOf(headers: Readonly<Record<string, string>>): string | null;
}
