/**
 * El registro del trabajo que entrega la cola. Puerto GENERICO del modulo `documentos`:
 * los mismos tres metodos del logger compartido (`info`/`warn`/`error`), sin un metodo
 * por paso —el paso lo dice el mensaje de cada llamada—.
 *
 * El dominio NO importa `lib/shared/observability/logger` (lo prohibe
 * `docs/architecture.md > La regla de dependencias`): `lib/composition` cablea
 * `forModule('documentos')` directo, que cumple esta forma de manera ESTRUCTURAL.
 *
 * `LogCampos` solo admite primitivas: identificadores, codigos, conteos y causas ya
 * saneadas por quien las produce. Ninguna llamada acepta bytes, texto extraido,
 * prompts ni claves, asi que no hay forma de colarlos.
 */
export type LogCampos = {
  readonly [campo: string]: string | number | boolean | null | undefined;
};

export type DocumentJobLog = {
  readonly info: (mensaje: string, campos?: LogCampos) => void;
  readonly warn: (mensaje: string, campos?: LogCampos) => void;
  readonly error: (mensaje: string, campos?: LogCampos) => void;
};
