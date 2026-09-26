/**
 * El logger general del servidor. UNICO archivo del repositorio que importa `pino`
 * (ver `docs/dependencias.md > pino`): sustituirla es reescribir este archivo.
 *
 * JSON a stdout, sin transporte a archivo (en serverless el disco es efimero) y sin
 * `pino-pretty` a proposito: la misma linea greppable en local y en Vercel.
 *
 * `lib/shared/**` es HOJA del grafo (`docs/architecture.md > La regla de dependencias`):
 * este archivo no importa ningun modulo ni `lib/composition`. Los modulos lo consumen
 * desde sus adaptadores driven/driving (que SI pueden importar `lib/shared/**`); el
 * dominio NUNCA lo importa directo —recibe puertos estrechos, como `StrategyRunLog`—.
 *
 * SEGURIDAD DE LO QUE SE REGISTRA (decision del humano, 2026-09-25): la firma ni
 * siquiera acepta el dato sensible. `LogFields` solo admite primitivas y cada llamante
 * documenta que pasa identificadores, codigos, conteos y duraciones —jamas bytes,
 * textos extraidos, prompts, claves ni valores introducidos por quien usa la app
 * (`docs/architecture.md > Anti-patrones` prohibe registrar PII).
 */
import pino from 'pino';

/** Lo unico que viaja como campo estructurado: primitivas. Sin objetos ni errores crudos. */
export type LogFields = {
  readonly [campo: string]: string | number | boolean | null | undefined;
};

export type SharedLogger = {
  readonly info: (mensaje: string, campos?: LogFields) => void;
  readonly warn: (mensaje: string, campos?: LogFields) => void;
  readonly error: (mensaje: string, campos?: LogFields) => void;
};

const raiz = pino({ level: 'info' });

/**
 * Un logger hijo por modulo, con su nombre como campo fijo para filtrar.
 * El `modulo` es el nombre del modulo (`documentos`, `identity`...), no texto libre.
 */
export function forModule(modulo: string): SharedLogger {
  const hijo = raiz.child({ modulo });
  return {
    info: (mensaje, campos) => {
      hijo.info(campos ?? {}, mensaje);
    },
    warn: (mensaje, campos) => {
      hijo.warn(campos ?? {}, mensaje);
    },
    error: (mensaje, campos) => {
      hijo.error(campos ?? {}, mensaje);
    },
  };
}
