// lib/modules/identity/domain/company-name.ts
import { normalizeKey } from './normalize-key';

/** Forma canonica para comparar nombres de empresa: recorta, ignora mayusculas, quita acentos
 *  y quita todo lo que no sea [a-z0-9]. «QuimiCloud», «quimicloud» y «QUIMI-CLOUD» producen la
 *  misma clave. Es la UNICA definicion (R3): la columna `companies.name_normalized`, el backfill
 *  de la migracion y cualquier consumidor futuro usan esta.
 *
 *  El cuerpo vive desde QC-83 en `normalize-key.ts`, interno al modulo, porque `identity` tiene
 *  ahora dos nombres que se normalizan igual —empresa y grupo de trabajo— y dentro del MISMO
 *  modulo no hay ninguna razon para escribir dos veces la misma expresion regular
 *  (`design.md > 4` de QC-83). El comportamiento no cambia.
 *
 *  Es deliberadamente gemela de `normalizeUnitName` (`unidades`), pero se escribe propia del
 *  modulo y NO se importa de alli (`design.md > 3`): `identity` no puede depender de `unidades`
 *  sin declarar una dependencia entre modulos que no tiene ninguna otra razon de existir, y
 *  promoverla a `lib/shared/` esta prohibido para el dominio (`guard-arquitectura-modulos`,
 *  bloque 4). Duplicacion consciente y acotada. */
export function normalizeCompanyName(name: string): string {
  return normalizeKey(name);
}
