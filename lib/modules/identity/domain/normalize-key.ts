// lib/modules/identity/domain/normalize-key.ts
/** Normalizador puro e INTERNO del modulo `identity`: recorta, ignora mayusculas, quita acentos
 *  y quita todo lo que no sea [a-z0-9]. Es el cuerpo que estaba escrito en
 *  `normalizeCompanyName` (QC-47) y que ahora comparten las funciones con nombre del modulo
 *  —`normalizeCompanyName` y `normalizeWorkGroupName` (QC-83, `design.md > 4`)—.
 *
 *  NO se exporta desde `lib/modules/identity/index.ts` y no debe hacerlo: fuera del modulo nadie
 *  normaliza «una clave», se normaliza «un nombre de empresa» o «un nombre de grupo». Publicarlo
 *  invitaria a que un consumidor de otro modulo se saltase la funcion con nombre y quedase atado
 *  a una regla que puede cambiar para una de las dos y no para la otra. */
export function normalizeKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]/g, '');
}
