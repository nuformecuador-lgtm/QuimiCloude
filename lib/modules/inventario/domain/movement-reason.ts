export const MOVEMENT_REASONS = ['merma', 'rotura', 'conteo_fisico', 'error_de_carga'] as const;

export type MovementReason = (typeof MOVEMENT_REASONS)[number];

/** Motivos que justifican subir la existencia: merma y rotura solo pueden bajarla. */
export const STOCK_INCREASE_REASONS = [
  'conteo_fisico',
  'error_de_carga',
] as const satisfies readonly MovementReason[];
