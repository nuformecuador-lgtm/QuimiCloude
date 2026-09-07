// lib/modules/unidades/ports/list-query-log.ts
/**
 * Puerto del log del campo omitido (QC-57 T7, R6, `design.md > 8`).
 *
 * **Duplicado a proposito en los cinco modulos con listado**, por el mismo motivo que
 * `domain/list-query.ts`: el dominio no puede importar `lib/shared/**`
 * (`docs/architecture.md > La regla de dependencias`, decision cerrada 13). Lo que se comparte
 * es la FORMA; la IMPLEMENTACION es UNA sola, en `lib/shared/observability/list-query-log.ts`,
 * y se ata aqui-> alli en `lib/composition/index.ts`.
 *
 * **Por que un puerto y no un `console.warn` suelto en el dominio:** el dominio no conoce el
 * mundo exterior, y -mas practico- R6 solo es testeable si el test puede ESPIAR la llamada; un
 * `console.warn` suelto se prueba parcheando la consola global, que ensucia el resto de la suite.
 *
 * **`fields` son NOMBRES DE CAMPO y nada mas.** Nunca el texto buscado ni el valor del filtro:
 * pueden ser PII y `docs/architecture.md > Anti-patrones` prohibe registrarla. La firma no
 * admite el valor, asi que registrarlo por descuido no es posible.
 */
export interface ListQueryLog {
  ignoredFields(listName: string, fields: readonly string[]): void;
}
