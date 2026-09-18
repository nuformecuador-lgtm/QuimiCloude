export const MOVEMENT_REASONS = ['merma', 'rotura', 'conteo_fisico', 'error_de_carga'] as const;

export type MovementReason = (typeof MOVEMENT_REASONS)[number];
