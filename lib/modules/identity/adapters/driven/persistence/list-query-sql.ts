// lib/modules/identity/adapters/driven/persistence/list-query-sql.ts
/**
 * QC-66 T13 — Traduccion del contrato generico de consulta (`domain/list-query.ts`) a lo que Prisma
 * entiende, para el listado de USUARIOS (R28, R29; QC-57 R12). Vive en `adapters/driven/` porque es
 * EXACTAMENTE lo que el dominio no puede saber: `in` y `contains`/`mode` son vocabulario de la base.
 *
 * **Replicado a proposito** desde `proveedores` y `unidades`, igual que `domain/list-query.ts` y
 * `domain/page.ts`: de otro modulo solo se importa su CONTRATO, nunca una ruta profunda
 * (`docs/architecture.md > La regla de dependencias`), y esto es detalle de persistencia. Se replican
 * SOLO las dos condiciones que `USER_QUERYABLE` necesita —un filtro `select` (el estado de cuenta) y
 * la busqueda—; `numberRange` y `dateRange` no tendrian hoy ninguna columna declarada que traducir y
 * copiarlas seria codigo muerto. El dia que el listado declare un filtro de rango, se replica
 * entonces el helper que le corresponda, con el mismo cuerpo que en `proveedores`.
 *
 * Las funciones son PURAS y devuelven objetos planos; no tocan el cliente Prisma.
 */

/**
 * Condicion de pertenencia a un conjunto cerrado de valores. La lista se COPIA a un array mutable
 * porque el tipo `in` de Prisma lo exige; el contrato de entrada sigue siendo `readonly` y esta copia
 * no lo modifica. Generica en `T` —y no fijada a `string`— para que el llamante pueda pasar la union
 * cerrada de la columna (aqui `UserAccountStatus`) y Prisma acepte el `in` sin ningun `as`.
 */
export type SelectCondition<T extends string> = { in: T[] };

/** Condicion de subcadena INSENSIBLE a mayusculas sobre una columna en crudo. */
export type InsensitiveContainsCondition = { contains: string; mode: 'insensitive' };

/**
 * `select` con lista VACIA es filtro AUSENTE, no «ningun resultado» (`proveedores/…/list-query-sql.ts`,
 * `design.md > 3.3` de QC-57): una lista vacia es «no he elegido nada», y devolver cero filas por eso
 * seria la trampa hermana de la que QC-57 R5 evita. Aqui ademas es el resultado normal de haber
 * descartado valores que no son estados de cuenta (R29): quien filtra por algo que no existe recibe
 * su ambito completo, no una consulta rota.
 */
export function selectCondition<T extends string>(values: readonly T[]): SelectCondition<T> | null {
  return values.length === 0 ? null : { in: [...values] };
}

/**
 * Termino de BUSQUEDA (R28) -> condicion de subcadena insensible a mayusculas.
 *
 * **Aqui no se normaliza con ninguna funcion del dominio, y es la diferencia con `proveedores` y
 * `unidades`**: `users` no tiene ninguna columna normalizada. Los tres indices unicos de QC-47
 * aplican `lower(...)` **en el indice**, no en una columna materializada, asi que lo coherente con la
 * base es pedirle a Postgres la comparacion insensible (`ILIKE`) en vez de inventar aqui una
 * normalizacion que ninguna columna respalda.
 *
 * Un termino que queda vacio al recortar espacios es AUSENCIA de busqueda (QC-57 R20):
 * `contains: ''` casaria con todo, que es lo mismo, pero devolver `null` deja el `where` limpio.
 */
export function insensitiveContainsCondition(value: string): InsensitiveContainsCondition | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : { contains: trimmed, mode: 'insensitive' };
}
