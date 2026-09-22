/**
 * El puerto del REGISTRO de una region de recorte que se salta. Es un puerto, y no un `console`
 * suelto, por lo mismo que `StrategyRunLog`: el dominio no conoce el mundo exterior y espiar una
 * dependencia es la unica forma de comprobarlo sin parchear la consola global.
 *
 * Forma propia y no `StrategyRunSummary`: aquella lleva una estrategia, un modo y una longitud de
 * texto que no existen en una region, y rellenarlos seria inventar datos que no describen nada.
 */
export type CropRegionSkipSummary = {
  readonly path: string;
  readonly page: number;
  readonly index: number;
  readonly cause: string;
};

export interface CropRegionLog {
  skip(summary: CropRegionSkipSummary): void;
}
