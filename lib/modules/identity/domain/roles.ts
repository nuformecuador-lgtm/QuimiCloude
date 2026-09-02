/**
 * Catalogo de roles base (`design.md > 5.1`, decision 2026-09-01 «cuales son los roles
 * base»). Este archivo es el UNICO sitio del repo que escribe a mano los literales
 * `'Administrador'` y `'Operador'`: cualquier otro archivo que necesite nombrar uno de
 * los dos roles importa estas constantes, nunca copia el texto (R2, R3).
 */
export const ROLE_ADMINISTRADOR = 'Administrador'
export const ROLE_OPERADOR = 'Operador'

/**
 * Los dos roles que el seed asegura que existan, con su descripcion (R2). El seed crea
 * solo los que falten (`design.md > 5.2`); ningun rol fuera de esta lista es cosa suya (R3).
 */
export const SEED_ROLES = [
  { name: ROLE_ADMINISTRADOR, description: 'Acceso total al sistema.' },
  { name: ROLE_OPERADOR, description: 'Operacion del dia a dia.' },
] as const
