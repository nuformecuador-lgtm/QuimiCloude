// lib/modules/identity/domain/company-name.ts
/** Forma canonica para comparar nombres de empresa: recorta, ignora mayusculas, quita acentos
 *  y quita todo lo que no sea [a-z0-9]. «QuimiCloud», «quimicloud» y «QUIMI-CLOUD» producen la
 *  misma clave. Es la UNICA definicion (R3): la columna `companies.name_normalized`, el backfill
 *  de la migracion y cualquier consumidor futuro usan esta.
 *
 *  Es deliberadamente gemela de `normalizeUnitName` (`unidades`), pero se escribe propia del
 *  modulo y NO se importa de alli (`design.md > 3`): `identity` no puede depender de `unidades`
 *  sin declarar una dependencia entre modulos que no tiene ninguna otra razon de existir, y
 *  promoverla a `lib/shared/` esta prohibido para el dominio (`guard-arquitectura-modulos`,
 *  bloque 4). Duplicacion consciente y acotada. */
export function normalizeCompanyName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]/g, '');
}
