// lib/modules/unidades/adapters/driven/persistence/list-query-sql.ts
/**
 * Traduccion del contrato generico de consulta (`domain/list-query.ts`) a lo que Prisma
 * entiende (QC-57 T19). Vive en `adapters/driven/` porque es EXACTAMENTE lo que el dominio no
 * puede saber: `contains` es vocabulario de la base.
 *
 * **Replicado a proposito desde `inventario`**, igual que `domain/list-query.ts` y que las
 * cuatro `normalize*Name`: de otro modulo solo se importa su CONTRATO, y esto es detalle de
 * persistencia (`docs/architecture.md > La regla de dependencias`). Aqui se replica SOLO la
 * busqueda: `UNIT_QUERYABLE` no declara ni un filtro -son cinco unidades sembradas y la pantalla
 * no ofrece ninguno-, asi que las cuatro condiciones de filtro no tendrian ninguna columna que
 * traducir y copiarlas seria codigo muerto. El dia que `units` declare un filtro, se replica
 * entonces el helper que le corresponda, con el mismo cuerpo que en `inventario`.
 */

/**
 * Termino de busqueda -> condicion contra la columna normalizada (R16, R18, R19). El termino se
 * normaliza con la MISMA funcion que escribio la columna -la que se pasa por parametro-: es lo
 * que hace que buscar "mililitro" encuentre "MILI-LITRO" y que buscar y comparar dejen de
 * discrepar. Sin `mode: 'insensitive'`: la columna ya viene sin acentos ni mayusculas.
 *
 * Un termino que se normaliza a vacio -solo espacios, o solo signos- es AUSENCIA de busqueda
 * (R20): `contains: ''` casaria con todo, que es lo mismo, pero devolver `null` deja el `where`
 * limpio.
 */
export function normalizedSearchCondition(
  search: string,
  normalize: (value: string) => string,
): { contains: string } | null {
  const normalized = normalize(search);
  return normalized === '' ? null : { contains: normalized };
}
