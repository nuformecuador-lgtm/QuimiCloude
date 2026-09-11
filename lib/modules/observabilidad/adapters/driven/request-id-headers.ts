// QC-71 T7 — la LECTURA de la cabecera del identificador, del lado del servidor Node.
//
// Vive en un adaptador DRIVEN y no dentro del traductor porque `next/headers` es
// infraestructura: el traductor esta en `lib/modules/errores/domain/**` y
// `docs/architecture.md > La regla de dependencias` prohibe `next/*` ahi (lo vigila
// `guard-arquitectura-modulos`). El traductor recibe esta funcion como parametro y
// `lib/composition/index.ts` es quien se la da: ningun puerto nuevo (R9, decision 3 de T1).
//
// **Este archivo NO entra en el cierre de imports del borde (R3).** El barrel del modulo solo
// reexporta `./domain`, asi que `lib/composition/edge.ts` —y con el `middleware.ts`— llega a
// `newRequestId` sin arrastrar `next/headers`. `guard-middleware-edge` lo sigue demostrando.
import { headers } from 'next/headers';

import { REQUEST_ID_HEADER } from '@/lib/modules/observabilidad';

/**
 * El identificador que el middleware escribio en la cabecera de **peticion** (R4, R7), o `null`
 * si no llego —peticion fuera del `matcher`, o el cruce roto—. Quien decide que hacer con el
 * `null` es el traductor, que genera el respaldo y lo deja escrito en la linea (R8).
 *
 * `headers()` es asincrono en Next 16, y de ahi viene que el traductor entero lo sea.
 */
export async function readRequestIdHeader(): Promise<string | null> {
  return (await headers()).get(REQUEST_ID_HEADER);
}
