// lib/shared/observability/list-query-log.ts
/**
 * UNICA implementacion del puerto `ListQueryLog` de los cinco modulos con listado
 * (QC-57 T7, R6, `design.md > 8`). El puerto esta declarado cinco veces -el dominio no puede
 * importar de aqui-; la implementacion es esta y solo esta, y se ata en
 * `lib/composition/index.ts`.
 *
 * `lib/shared/**` es HOJA del grafo (`docs/architecture.md > La regla de dependencias`): este
 * archivo no importa ningun modulo ni `lib/composition`. Cumple la forma del puerto de manera
 * ESTRUCTURAL, sin importar su tipo.
 *
 * Dos reglas que no son adorno:
 *
 * 1. **Nunca el valor.** Se registra el nombre del listado y los NOMBRES de los campos omitidos,
 *    jamas el texto buscado ni el contenido del filtro: pueden ser PII y
 *    `docs/architecture.md > Anti-patrones` prohibe registrarla. La firma ni siquiera recibe el
 *    valor, asi que no hay forma de colarlo.
 * 2. **Sin campos omitidos no se emite nada.** Un aviso por cada consulta limpia es ruido, y el
 *    ruido acaba en un filtro de logs que tambien se traga el aviso que importa. R6 solo pide
 *    registrar CUANDO se omite algo.
 *
 * `console.warn` y no `console.error`: la consulta no ha fallado -R5 exige justo lo contrario-,
 * ha devuelto la lista como si no se hubiera pedido lo que no existe. Es una advertencia sobre
 * quien la llamo, no un fallo del servidor.
 */

/** Prefijo estable, para que el aviso se pueda buscar en los logs sin adivinar el texto. */
const PREFIX = '[list-query]';

export function logIgnoredListQueryFields(listName: string, fields: readonly string[]): void {
  if (fields.length === 0) return;
  console.warn(
    `${PREFIX} ${listName}: se omitieron campos no declarados: ${fields.join(', ')}`,
  );
}
