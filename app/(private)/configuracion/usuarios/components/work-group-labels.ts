import type { UsuariosTab } from './usuarios-tabs';

/**
 * Copy e identificadores de la pestana de grupos que **no necesitan JSX** (R41;
 * `design.md > 2.1`).
 *
 * **Ningun test afirma sobre estos textos**: los controles se localizan por rol ARIA o por
 * `data-testid`, y cuando un test necesita el texto lo toma **de estas constantes exportadas**,
 * nunca de un literal copiado. Es el hermano de `user-labels.ts` y sigue su mismo criterio: las
 * claves salen del contrato —aqui, de `USUARIOS_TABS`—; los textos son de esta capa.
 *
 * **Nace con lo que el conmutador necesita** (T2) y crece con las tandas siguientes: la tabla, el
 * panel, los miembros y el borrado anadiran aqui su copy en vez de escribirlo suelto.
 */

/**
 * Como se lee cada pestana (R1). Exhaustivo POR TIPO: si manana apareciera una tercera pestana,
 * este archivo dejaria de compilar en vez de pintar el valor crudo del parametro.
 */
export const USUARIOS_TAB_LABELS: Readonly<Record<UsuariosTab, string>> = {
  personas: 'Personas',
  grupos: 'Grupos',
};

/** Nombre accesible del conmutador entero, para que el `tablist` no llegue anonimo (R40). */
export const USUARIOS_TABS_LABEL = 'Secciones de la pantalla de usuarios';

/**
 * `data-testid` de la seccion de grupos: la region que la pagina monta cuando la pestana vigente
 * es la de grupos, y dentro de la cual viven el esqueleto, el vacio, el error y la tabla. Vive
 * aqui —y no en la seccion— para que la pagina y sus tests lo compartan sin escribirlo a mano y
 * para que un Server Component pueda usarlo sin importar un modulo de cliente (R41).
 */
export const WORK_GROUP_SECTION_TESTID = 'work-group-section';

/**
 * Como se lee la UNICA columna de datos de la lista de grupos, mas la de acciones (R12).
 *
 * **Una sola columna de datos, y no es un recorte**: `WorkGroupRow` tiene exactamente `id` y
 * `name`, asi que el nombre es literalmente todo lo que la fila trae. **Aqui no hay etiqueta de
 * «miembros»** —ni visibles ni total— porque ese dato no es alcanzable desde el frontend y es de
 * **QC-100** (decision cerrada 5).
 */
export const WORK_GROUP_NAME_COLUMN_LABEL = 'Nombre';
export const WORK_GROUP_ACTIONS_COLUMN_LABEL = 'Acciones';

/**
 * Nombre accesible de cada accion de fila (R40, R41): la etiqueta NOMBRA al grupo, de modo que
 * quien usa lector de pantalla oye sobre cual va a actuar en vez de oir «editar» tres veces.
 *
 * Son funciones y no plantillas sueltas por el mismo motivo que `editUserLabel`: el dia que haya
 * i18n, el texto se sustituye en un solo sitio.
 */
export function editWorkGroupLabel(name: string): string {
  return `Abrir el grupo ${name}`;
}

export function deleteWorkGroupLabel(name: string): string {
  return `Eliminar el grupo ${name}`;
}
