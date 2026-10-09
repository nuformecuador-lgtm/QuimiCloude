import type { GraphFailure } from '../domain/graph-failure';

export type GraphPhoneNumber = {
  readonly displayPhoneNumber: string;
  readonly verifiedName: string;
};

export type GraphProbeResult =
  | { readonly ok: true; readonly phone: GraphPhoneNumber }
  | ({ readonly ok: false } & GraphFailure);

/** Un fallo de Meta o de red es un resultado, no una excepción: el caso de uso decide qué guardar. */
export interface WhatsappGraphClient {
  fetchPhoneNumber(input: {
    readonly phoneNumberId: string;
    readonly accessToken: string;
  }): Promise<GraphProbeResult>;
}
