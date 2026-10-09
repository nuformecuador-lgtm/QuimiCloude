/** Se lee dentro de cada llamada, nunca al importar: así la composición carga sin la variable. */
const GRAPH_API_VERSION_VAR = 'WHATSAPP_GRAPH_API_VERSION';
const GRAPH_API_VERSION_SHAPE = /^v\d+\.\d+$/;

/** Los errores nombran la variable y nunca su valor. */
export function readGraphApiVersion(): string {
  const raw = process.env[GRAPH_API_VERSION_VAR];
  if (raw === undefined || raw.trim() === '') {
    throw new Error(`falta la variable de entorno ${GRAPH_API_VERSION_VAR}`);
  }
  const version = raw.trim();
  if (!GRAPH_API_VERSION_SHAPE.test(version)) {
    throw new Error(`${GRAPH_API_VERSION_VAR}: no tiene la forma v<mayor>.<menor>`);
  }
  return version;
}
