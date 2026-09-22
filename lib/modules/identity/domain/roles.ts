/**
 * Catalogo de roles base. Este archivo es el UNICO sitio del repo que escribe a mano los
 * literales `'Administrador'`, `'Operador'` y `'Empacador'`: cualquier otro archivo que
 * necesite nombrar uno de los tres roles importa estas constantes, nunca copia el texto.
 */
export const ROLE_ADMINISTRADOR = 'Administrador'
export const ROLE_OPERADOR = 'Operador'
export const ROLE_EMPACADOR = 'Empacador'

/**
 * Los tres roles que el seed asegura que existan, con su descripcion. El seed crea solo
 * los que falten; ningun rol fuera de esta lista es cosa suya.
 */
export const SEED_ROLES = [
  { name: ROLE_ADMINISTRADOR, description: 'Acceso total al sistema.' },
  { name: ROLE_OPERADOR, description: 'Operacion del dia a dia.' },
  { name: ROLE_EMPACADOR, description: 'Prepara los pedidos asignados y consulta los terminados.' },
] as const
