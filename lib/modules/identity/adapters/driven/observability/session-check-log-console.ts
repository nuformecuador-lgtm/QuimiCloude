// lib/modules/identity/adapters/driven/observability/session-check-log-console.ts
//
// QC-23 T10 — la UNICA implementacion de `SessionCheckLog` (`ports/session-check-log.ts`,
// `design.md > 4.2`; R16, R17, R23).
//
// **AQUI, Y SOLO AQUI, SE JUNTAN LA CAUSA Y EL IDENTIFICADOR DE PETICION.** El dominio aporta la
// causa y no sabe —ni puede saber— nada del identificador: QC-71 R9 prohibe que atraviese el
// `domain/` o los `ports/` de un modulo de negocio, y su guardia lo vigila. El reparto es el
// mismo que QC-71 fijo para el traductor unico de errores: la LECTURA de la cabecera entra por
// parametro y quien se la da es `lib/composition/index.ts`, sin ningun puerto nuevo.
//
// Escribe en el registro del SERVIDOR con `console.error`, igual que ese traductor: este
// repositorio no tiene —ni esta ficha trae— ninguna maquinaria de observabilidad mas alla de eso.
//
// **Al navegador no llega nada de esto** (R17): quien tenia sesion acaba en el login, sin mensaje
// y sin pantalla de error. Esta linea es la unica forma de distinguir, mirando los logs, un corte
// de base de un cierre de sesion.
import type { RequestIdHeaderReader } from '@/lib/modules/errores';

import type { SessionCheckLog } from '../../../ports/session-check-log';

/** Prefijo fijo de la linea, para que sea localizable con una busqueda exacta. */
const PREFIJO = 'session-check';

/**
 * El hueco cuando el identificador no llego —peticion fuera del `matcher` del middleware, o el
 * cruce roto—. Se escribe el hueco tal cual en vez de generar uno de respaldo: a diferencia del
 * `reference` de QC-71 R8, esta linea no se le devuelve a nadie que pueda citarla.
 */
const SIN_IDENTIFICADOR = 'sin-identificador';

/**
 * `escribir` es un parametro con valor por defecto para que el test pueda espiarlo sin tocar
 * `console`, igual que hace `createErrorStateTranslator`.
 */
export function createSessionCheckLogConsole(
  leerIdentificador: RequestIdHeaderReader,
  escribir: (linea: string) => void = (linea) => console.error(linea),
): SessionCheckLog {
  return {
    log(diagnostic: string): void {
      // El puerto es sincrono —registrar es lo ultimo de un camino que ya decidio cortar— y leer
      // las cabeceras de la peticion en curso es asincrono en Next 16. De ahi el `void`: la linea
      // se escribe en cuanto se resuelva, y nadie espera por ella.
      void escribirLinea(leerIdentificador, escribir, diagnostic);
    },
  };
}

async function escribirLinea(
  leerIdentificador: RequestIdHeaderReader,
  escribir: (linea: string) => void,
  diagnostic: string,
): Promise<void> {
  let identificador: string | null = null;
  try {
    identificador = await leerIdentificador();
  } catch {
    // NO es un `catch` vacio: se cae al hueco y **la linea se escribe igual**. Que la cabecera no
    // se pueda leer no puede tragarse la unica constancia de que una comprobacion de sesion
    // fallo, que es justo lo que R17 existe para impedir.
    identificador = null;
  }

  const marca = identificador !== null && identificador !== '' ? identificador : SIN_IDENTIFICADOR;
  escribir(`[${PREFIJO}] [${marca}] ${diagnostic}`);
}
