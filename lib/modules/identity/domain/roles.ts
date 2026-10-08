/**
 * Catalogo de roles base. Este archivo es el UNICO sitio del repo que escribe a mano los
 * literales `'Administrador'`, `'Operador'`, `'Empacador'`, `'Maestro'` y
 * `Administrador de acondicionamiento`: cualquier otro archivo que necesite nombrar uno de los
 * cinco roles importa estas constantes, nunca copia el texto.
 */
export const ROLE_ADMINISTRADOR = 'Administrador'
export const ROLE_OPERADOR = 'Operador'
export const ROLE_EMPACADOR = 'Empacador'
export const ROLE_MAESTRO = 'Maestro'
export const ROLE_ACONDICIONAMIENTO = 'Administrador de acondicionamiento'

/**
 * Los roles que el seed asegura que existan, con su descripcion. El seed crea solo los que
 * falten; ningun rol fuera de esta lista es cosa suya. Los nuevos van al final para que el
 * orden de los existentes no cambie.
 */
export const SEED_ROLES = [
  { name: ROLE_ADMINISTRADOR, description: 'Acceso total al sistema.' },
  { name: ROLE_OPERADOR, description: 'Operacion del dia a dia.' },
  { name: ROLE_EMPACADOR, description: 'Prepara los pedidos asignados y consulta los terminados.' },
  { name: ROLE_MAESTRO, description: 'Dueno de la plataforma: gestiona las empresas.' },
  { name: ROLE_ACONDICIONAMIENTO, description: 'Acondiciona los pedidos empacados de la empresa.' },
] as const
