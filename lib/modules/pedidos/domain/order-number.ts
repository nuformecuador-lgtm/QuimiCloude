// lib/modules/pedidos/domain/order-number.ts
/** Identificador de un pedido visto DESDE FUERA de `pedidos`. */
export type OrderId = string;

/** El correlativo tal como vive en la base: el ano y la posicion dentro de ese ano
 *  (decision cerrada 9). El numero VISIBLE no se guarda: se compone con
 *  `formatOrderNumber` (R24). */
export type OrderNumber = {
  readonly year: number;
  readonly sequence: number;
};

/** UNICA definicion del formato visible del correlativo: `2026-0000001` (R24). La posicion se
 *  rellena a SIETE digitos (decision cerrada 29, 2026-09-03): techo de 9.999.999 pedidos al ano.
 *  Si algun ano lo pasara, el numero crece en vez de truncarse. No se persiste el resultado:
 *  guardar el texto formateado seria un tercer sitio donde vive el mismo dato, y el tercer sitio
 *  siempre es el que se desincroniza. */
export function formatOrderNumber({ year, sequence }: OrderNumber): string {
  return `${year}-${String(sequence).padStart(7, '0')}`;
}
