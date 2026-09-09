// lib/modules/identity/domain/work-group-name.ts
import { normalizeKey } from './normalize-key';

/** Forma canonica para comparar nombres de grupo de trabajo: recorta, ignora mayusculas, quita
 *  acentos y quita todo lo que no sea [a-z0-9]. «Turno Noche», «turno noche» y «TURNO-NOCHE»
 *  producen la misma clave. Es la UNICA definicion de «mismo nombre de grupo» (R3): la columna
 *  `work_groups.name_normalized` y cualquier consumidor futuro —QC-84 el primero— usan esta.
 *
 *  NO se reutiliza `normalizeCompanyName` para grupos, aunque hoy hagan exactamente lo mismo
 *  (`design.md > 4`): llamar «nombre de empresa» a la normalizacion del nombre de un grupo es
 *  una mentira que sobrevive anos, y el dia que una de las dos reglas cambie —un tope, un
 *  caracter admitido— no habria forma de cambiarla sin cambiar la otra. Tampoco se copia el
 *  cuerpo: las dos delegan en `normalizeKey`, interno al modulo. */
export function normalizeWorkGroupName(name: string): string {
  return normalizeKey(name);
}
